using System;
using System.Globalization;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Result of Transfer In Stock Entry sync from ERPNext get_material_transfer_stock_entries.
/// </summary>
public class TransferInSyncResult
{
    public bool Success { get; set; }
    public int TotalFetched { get; set; }
    public int EntriesInserted { get; set; }
    public int EntriesUpdated { get; set; }
    public int ItemsInserted { get; set; }
    public List<string> Errors { get; set; } = new();
}

/// <summary>
/// Syncs Transfer In from ERPNext get_material_transfer_stock_entries into tabTransferIn and tabTransferInItem (same tables used by mobile/API).
/// Uses warehouse code fields (from_showroom, to_warehouse). Drops legacy tabTransferInStockEntry/tabTransferInStockEntryItem if they exist.
/// </summary>
public static class TransferInSyncFromErpNextService
{
    public static async Task<TransferInSyncResult> SyncTransferInFromErpNextAsync(WmsSettings settings)
    {
        var result = new TransferInSyncResult { Success = false, Errors = new List<string>() };
        ErrorLogService.LogInfo("Transfer In sync from ERPNext started (tabTransferIn / tabTransferInItem).");

        try
        {
            ErrorLogService.LogInfo("TransferInSyncFromErpNextService: Step 1 - Dropping legacy tabTransferInStockEntry tables if they exist.");
            await DatabaseService.DropTabTransferInStockEntryTablesIfExistAsync(settings);

            var connectionString = DatabaseService.BuildConnectionString(settings);
            var dbName = settings.DatabaseName ?? "(null)";
            ErrorLogService.LogInfo($"TransferInSyncFromErpNextService: Step 2 - Connecting to database: {dbName}, host: {settings.DatabaseHost}");
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();
            ErrorLogService.LogInfo($"TransferInSyncFromErpNextService: Step 3 - Connection opened. Database: {connection.Database}");

            var endpoints = GetEndpoints(settings);
            if (endpoints.Count == 0)
            {
                ErrorLogService.LogInfo("TransferInSyncFromErpNextService: No sync endpoints configured for Transfer In. Sync skipped.");
                result.Success = true;
                return result;
            }
            ErrorLogService.LogInfo($"TransferInSyncFromErpNextService: Step 4 - Using {endpoints.Count} endpoint(s) for Transfer In.");

            var allEntries = new List<ErpNextTransferInStockEntryDto>();
            foreach (var (epName, epUrl, epKey) in endpoints)
            {
                var list = await ErpNextWmsSyncApiService.FetchTransferInStockEntriesFromErpNextAsync(settings, epUrl, epKey, epName);
                if (list != null)
                {
                    allEntries.AddRange(list);
                    ErrorLogService.LogInfo($"TransferInSyncFromErpNextService: Endpoint [{epName}] returned {list.Count} raw entry(ies).");
                }
            }
            ErrorLogService.LogInfo($"TransferInSyncFromErpNextService: Step 5 - Total raw entries from API: {allEntries.Count}");

            var byStockEntryNo = new Dictionary<string, ErpNextTransferInStockEntryDto>(StringComparer.OrdinalIgnoreCase);
            foreach (var entry in allEntries)
            {
                var no = (entry.StockEntryNo ?? "").Trim();
                if (string.IsNullOrWhiteSpace(no))
                {
                    ErrorLogService.LogInfo("TransferInSyncFromErpNextService: Skipping entry with empty stock_entry_no.");
                    continue;
                }
                if (!byStockEntryNo.ContainsKey(no))
                    byStockEntryNo[no] = entry;
            }

            result.TotalFetched = byStockEntryNo.Count;
            ErrorLogService.LogInfo($"TransferInSyncFromErpNextService: Step 6 - After dedupe: {result.TotalFetched} unique Transfer In(s) to sync. Keys: [{string.Join(", ", byStockEntryNo.Keys)}]");

            var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);

            foreach (var kv in byStockEntryNo)
            {
                var entry = kv.Value;
                var stockEntryNo = kv.Key;
                try
                {
                    ErrorLogService.LogInfo($"TransferInSyncFromErpNextService: --- Processing entry: {stockEntryNo} ---");
                    var trans = await connection.BeginTransactionAsync();
                    await using var transaction = trans is MySqlTransaction mt ? mt : throw new InvalidOperationException("BeginTransactionAsync did not return MySqlTransaction");

                    DateTime? postingDate = ParseDate(entry.PostingDate);
                    if (!postingDate.HasValue)
                    {
                        postingDate = DateTime.UtcNow.Date;
                        ErrorLogService.LogInfo($"Transfer In {stockEntryNo}: Missing posting_date; using fallback {postingDate:yyyy-MM-dd}.");
                    }

                    var fromShowroom = (entry.FromWarehouseCode ?? "").Trim();
                    if (string.IsNullOrWhiteSpace(fromShowroom)) fromShowroom = "Unknown";

                    // To Warehouse = receiving warehouse (custom_receiving_warehouse), e.g. "Main Warehouse - MAATC" -> WH-MAIN; fallback to to_warehouse_code (e.g. INTRANS for Add to Transit)
                    var receivingNameOrCode = (entry.CustomReceivingWarehouse ?? entry.CustomReceivingWarehouseCode ?? "").Trim();
                    var toWarehouse = !string.IsNullOrWhiteSpace(receivingNameOrCode)
                        ? WarehouseDataService.ResolveToCode(receivingNameOrCode, warehouses)
                        : (entry.ToWarehouseCode ?? "").Trim();
                    if (string.IsNullOrWhiteSpace(toWarehouse)) toWarehouse = "Unknown";

                    var status = entry.Docstatus == 1 ? "Submitted" : "Draft";
                    var owner = (entry.Owner ?? "SYSTEM").Trim();
                    if (string.IsNullOrWhiteSpace(owner)) owner = "SYSTEM";

                    var items = (entry.Items ?? entry.ItemDetails) ?? new List<ErpNextTransferInStockEntryItemDto>();
                    double totalQty = 0;
                    foreach (var it in items)
                        totalQty += it.Qty;

                    var headerSql = @"INSERT INTO tabTransferIn 
                        (title, status, from_showroom, to_warehouse, transfer_date, expected_arrival_date, prepared_by, total_qty, created_at, updated_at)
                        VALUES (@title, @status, @fromShowroom, @toWarehouse, @transferDate, NULL, @preparedBy, @totalQty, NOW(), NOW())
                        ON DUPLICATE KEY UPDATE
                            status = VALUES(status),
                            from_showroom = VALUES(from_showroom),
                            to_warehouse = VALUES(to_warehouse),
                            transfer_date = VALUES(transfer_date),
                            prepared_by = VALUES(prepared_by),
                            total_qty = VALUES(total_qty),
                            updated_at = NOW()";

                    await using (var cmd = new MySqlCommand(headerSql, connection, transaction))
                    {
                        cmd.Parameters.AddWithValue("@title", stockEntryNo);
                        cmd.Parameters.AddWithValue("@status", status);
                        cmd.Parameters.AddWithValue("@fromShowroom", fromShowroom);
                        cmd.Parameters.AddWithValue("@toWarehouse", toWarehouse);
                        cmd.Parameters.AddWithValue("@transferDate", postingDate.Value);
                        cmd.Parameters.AddWithValue("@preparedBy", owner);
                        cmd.Parameters.AddWithValue("@totalQty", totalQty);
                        var rows = await cmd.ExecuteNonQueryAsync();
                        ErrorLogService.LogInfo($"TransferInSyncFromErpNextService: tabTransferIn INSERT/UPDATE for {stockEntryNo} affected rows: {rows} (1=inserted, 2=updated).");
                        if (rows == 1) result.EntriesInserted++;
                        else if (rows == 2) result.EntriesUpdated++;
                    }

                    await using (var delCmd = new MySqlCommand("DELETE FROM tabTransferInItem WHERE parent_title = @title", connection, transaction))
                    {
                        delCmd.Parameters.AddWithValue("@title", stockEntryNo);
                        var deleted = await delCmd.ExecuteNonQueryAsync();
                        ErrorLogService.LogInfo($"TransferInSyncFromErpNextService: DELETE old tabTransferInItem for {stockEntryNo} deleted rows: {deleted}.");
                    }

                    if (items.Count == 0)
                        ErrorLogService.LogInfo($"TransferInSyncFromErpNextService: Entry {stockEntryNo} has 0 items from API (Items is null or empty).");
                    else
                        ErrorLogService.LogInfo($"TransferInSyncFromErpNextService: Entry {stockEntryNo}: inserting {items.Count} item(s) into tabTransferInItem.");

                    var itemSql = @"INSERT INTO tabTransferInItem 
                        (parent_title, item_code, qty, carton_id, received_qty, created_at, updated_at)
                        VALUES (@parent, @itemCode, @qty, NULL, 0, NOW(), NOW())";
                    foreach (var it in items)
                    {
                        var itemCode = (it.ItemCode ?? "").Trim();
                        if (string.IsNullOrWhiteSpace(itemCode))
                        {
                            ErrorLogService.LogInfo($"TransferInSyncFromErpNextService: Skipping item with empty item_code in entry {stockEntryNo}.");
                            continue;
                        }

                        try
                        {
                            ErrorLogService.LogInfo($"TransferInSyncFromErpNextService: Inserting tabTransferInItem: parent={stockEntryNo}, item_code={itemCode}, qty={it.Qty}.");
                            await using var itemCmd = new MySqlCommand(itemSql, connection, transaction);
                            itemCmd.Parameters.AddWithValue("@parent", stockEntryNo);
                            itemCmd.Parameters.AddWithValue("@itemCode", itemCode);
                            itemCmd.Parameters.AddWithValue("@qty", it.Qty);
                            var itemRows = await itemCmd.ExecuteNonQueryAsync();
                            ErrorLogService.LogInfo($"TransferInSyncFromErpNextService: Item INSERT for {itemCode} affected rows: {itemRows}.");
                            result.ItemsInserted++;
                        }
                        catch (Exception itemEx)
                        {
                            var err = $"Transfer In {stockEntryNo} item {itemCode}: {itemEx.Message}";
                            result.Errors.Add(err);
                            ErrorLogService.LogError(err, itemEx);
                            await transaction.RollbackAsync();
                            throw;
                        }
                    }

                    ErrorLogService.LogInfo($"TransferInSyncFromErpNextService: Committing transaction for {stockEntryNo}.");
                    await transaction.CommitAsync();
                    ErrorLogService.LogInfo($"TransferInSyncFromErpNextService: Transaction committed for {stockEntryNo}.");

                    await using (var countCmd = new MySqlCommand("SELECT COUNT(*) FROM tabTransferInItem WHERE parent_title = @title", connection))
                    {
                        countCmd.Parameters.AddWithValue("@title", stockEntryNo);
                        var count = Convert.ToInt32(await countCmd.ExecuteScalarAsync(), System.Globalization.CultureInfo.InvariantCulture);
                        ErrorLogService.LogInfo($"TransferInSyncFromErpNextService: Verification tabTransferInItem count for {stockEntryNo} => {count} row(s).");
                    }
                }
                catch (Exception ex)
                {
                    var err = $"Transfer In {stockEntryNo}: {ex.Message}";
                    result.Errors.Add(err);
                    ErrorLogService.LogError(err, ex);
                }
            }

            result.Success = true;
            ErrorLogService.LogInfo($"Transfer In sync from ERPNext completed. Fetched: {result.TotalFetched}, entries inserted: {result.EntriesInserted}, updated: {result.EntriesUpdated}, items: {result.ItemsInserted}, errors: {result.Errors.Count}");
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Errors.Add(ex.Message);
            ErrorLogService.LogError("TransferInSyncFromErpNextService: Error syncing Transfer In from ERPNext", ex);
        }

        return result;
    }

    private static List<(string Name, string BaseUrl, string ApiKey)> GetEndpoints(WmsSettings settings)
    {
        var list = new List<(string, string, string)>();
        if (settings.SyncEndpoints != null && settings.SyncEndpoints.Count > 0)
        {
            foreach (var ep in settings.SyncEndpoints.Where(e => e.Enabled && !string.IsNullOrWhiteSpace(e.BaseUrl) && !string.IsNullOrWhiteSpace(e.ApiKey) &&
                (string.Equals(e.SyncType, SyncTypeNames.All, StringComparison.OrdinalIgnoreCase) || string.Equals(e.SyncType, SyncTypeNames.TransferIn, StringComparison.OrdinalIgnoreCase))))
            {
                list.Add((ep.Name, ep.BaseUrl.Trim(), ep.ApiKey));
            }
        }
        if (list.Count == 0 && (settings.SyncEndpoints == null || settings.SyncEndpoints.Count == 0))
        {
            var url = !string.IsNullOrWhiteSpace(settings.ErpNextApiUrl) ? settings.ErpNextApiUrl : settings.ApiEndpointUrl;
            var key = !string.IsNullOrWhiteSpace(settings.ErpNextApiKey) ? settings.ErpNextApiKey : settings.ApiKey;
            if (!string.IsNullOrWhiteSpace(url) && !string.IsNullOrWhiteSpace(key))
                list.Add(("Default", url.Trim(), key));
        }
        return list;
    }

    private static DateTime? ParseDate(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var trimmed = s.Trim();
        if (DateTime.TryParse(trimmed, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
            return d;
        if (DateTime.TryParse(trimmed, out d))
            return d;
        return null;
    }
}
