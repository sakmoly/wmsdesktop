using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Result of Transfer Order sync from ERPNext get_tos_for_wms
/// </summary>
public class TransferOrderSyncResult
{
    public bool Success { get; set; }
    public int TotalFetched { get; set; }
    public int TosInserted { get; set; }
    public int TosUpdated { get; set; }
    public int ItemsInserted { get; set; }
    public List<string> Errors { get; set; } = new();
}

/// <summary>
/// Syncs Transfer Orders from ERPNext get_tos_for_wms to tabTransferOrder and tabTransferOrderItem.
/// Uses same endpoint resolution as warehouse sync.
/// </summary>
public static class TransferOrderSyncFromErpNextService
{
    public static async Task<TransferOrderSyncResult> SyncTransferOrdersFromErpNextAsync(WmsSettings settings)
    {
        var result = new TransferOrderSyncResult { Success = false, Errors = new List<string>() };
        ErrorLogService.LogInfo("Transfer Order sync from ERPNext started.");

        try
        {
            await DatabaseService.EnsureTabTransferOrderTablesExistAsync(settings);

            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var endpoints = GetEndpoints(settings);
            if (endpoints.Count == 0)
            {
                ErrorLogService.LogInfo("TransferOrderSyncFromErpNextService: No sync endpoints configured. Sync skipped.");
                result.Success = true;
                return result;
            }

            var allTos = new List<ErpNextToDto>();
            foreach (var (epName, epUrl, epKey) in endpoints)
            {
                var list = await ErpNextWmsSyncApiService.FetchTransferOrdersFromErpNextAsync(settings, epUrl, epKey, epName);
                if (list != null)
                    allTos.AddRange(list);
            }

            var byTitle = new Dictionary<string, ErpNextToDto>(StringComparer.OrdinalIgnoreCase);
            foreach (var to in allTos)
            {
                var title = (to.TransferOrder ?? to.Name ?? "").Trim();
                if (string.IsNullOrWhiteSpace(title)) continue;
                if (!byTitle.ContainsKey(title))
                    byTitle[title] = to;
            }

            result.TotalFetched = byTitle.Count;
            ErrorLogService.LogInfo($"TransferOrderSyncFromErpNextService: Syncing {result.TotalFetched} TO(s) with items.");

            foreach (var kv in byTitle)
            {
                var to = kv.Value;
                var title = kv.Key;
                try
                {
                    DateTime? requiredDate = ParseDate(to.RequiredDate);
                    double totalAllocated = to.TotalAllocatedQty;
                    var items = to.Items ?? to.ItemDetails ?? new List<ErpNextToItemDto>();
                    if (totalAllocated == 0 && items.Count > 0)
                        totalAllocated = items.Sum(i => i.AllocatedQty);

                    var wmsExportStatus = to.WmsExportStatus ?? "Pending";
                    var toSql = @"INSERT INTO tabTransferOrder 
                        (title, status, advance_shipping_notice, from_warehouse, wms_export_status, prepared_by, required_date, total_allocated_qty, updated_at)
                        VALUES (@title, @status, @asn, @fromWh, @wmsExportStatus, @preparedBy, @requiredDate, @totalQty, CURRENT_TIMESTAMP)
                        ON DUPLICATE KEY UPDATE
                            status = VALUES(status),
                            advance_shipping_notice = VALUES(advance_shipping_notice),
                            from_warehouse = VALUES(from_warehouse),
                            wms_export_status = VALUES(wms_export_status),
                            prepared_by = VALUES(prepared_by),
                            required_date = VALUES(required_date),
                            total_allocated_qty = VALUES(total_allocated_qty),
                            updated_at = CURRENT_TIMESTAMP";

                    await using (var cmd = new MySqlCommand(toSql, connection))
                    {
                        cmd.Parameters.AddWithValue("@title", title);
                        cmd.Parameters.AddWithValue("@status", to.Status ?? "Draft");
                        cmd.Parameters.AddWithValue("@asn", to.AsnNo ?? to.Asn ?? "");
                        cmd.Parameters.AddWithValue("@fromWh", (to.FromWarehouseCode ?? to.FromWarehouse ?? "").Trim());
                        cmd.Parameters.AddWithValue("@wmsExportStatus", wmsExportStatus);
                        cmd.Parameters.AddWithValue("@preparedBy", to.PreparedBy ?? "");
                        cmd.Parameters.AddWithValue("@requiredDate", requiredDate ?? (object)DBNull.Value);
                        cmd.Parameters.AddWithValue("@totalQty", totalAllocated);
                        var rows = await cmd.ExecuteNonQueryAsync();
                        if (rows == 1) result.TosInserted++;
                        else if (rows == 2) result.TosUpdated++;
                    }

                    await using (var delCmd = new MySqlCommand("DELETE FROM tabTransferOrderItem WHERE parent_title = @title", connection))
                    {
                        delCmd.Parameters.AddWithValue("@title", title);
                        await delCmd.ExecuteNonQueryAsync();
                    }

                    var itemSql = @"INSERT INTO tabTransferOrderItem 
                        (parent_title, store, item_code, allocated_qty, sorted_qty, packed_qty, pending_qty, remarks)
                        VALUES (@parent, @store, @itemCode, @allocated, @sorted, @packed, @pending, @remarks)";
                    foreach (var it in items)
                    {
                        var itemCode = (it.ItemCode ?? "").Trim();
                        var store = (it.Store ?? it.Warehouse ?? it.TargetWarehouse ?? "").Trim();
                        if (string.IsNullOrWhiteSpace(store)) store = "Default";
                        if (string.IsNullOrWhiteSpace(itemCode)) continue;
                        double pending = it.PendingQty;
                        if (pending == 0)
                            pending = it.AllocatedQty - it.SortedQty - it.PackedQty;
                        if (pending < 0) pending = 0;

                        await using var itemCmd = new MySqlCommand(itemSql, connection);
                        itemCmd.Parameters.AddWithValue("@parent", title);
                        itemCmd.Parameters.AddWithValue("@store", store);
                        itemCmd.Parameters.AddWithValue("@itemCode", itemCode);
                        itemCmd.Parameters.AddWithValue("@allocated", it.AllocatedQty);
                        itemCmd.Parameters.AddWithValue("@sorted", it.SortedQty);
                        itemCmd.Parameters.AddWithValue("@packed", it.PackedQty);
                        itemCmd.Parameters.AddWithValue("@pending", pending);
                        itemCmd.Parameters.AddWithValue("@remarks", (object?)it.Remarks ?? DBNull.Value);
                        await itemCmd.ExecuteNonQueryAsync();
                        result.ItemsInserted++;
                    }
                }
                catch (Exception ex)
                {
                    var err = $"TO {title}: {ex.Message}";
                    result.Errors.Add(err);
                    ErrorLogService.LogError(err, ex);
                }
            }

            result.Success = true;
            ErrorLogService.LogInfo($"Transfer Order sync from ERPNext completed. Fetched: {result.TotalFetched}, TOs inserted: {result.TosInserted}, updated: {result.TosUpdated}, items: {result.ItemsInserted}, errors: {result.Errors.Count}");

            var toNamesJustSynced = byTitle.Keys.ToList();
            if (toNamesJustSynced.Count > 0 && endpoints.Count > 0)
            {
                var (_, pushBaseUrl, pushApiKey) = endpoints[0];
                var wmsRef = ErpNextWmsSyncApiService.GenerateWmsRef();
                var updated = 0;
                foreach (var toTitle in toNamesJustSynced)
                {
                    var (pushSuccess, pushError) = await ErpNextWmsSyncApiService.UpdateTransferOrderWmsStatusAsync(settings, toTitle, "Exported", wmsRef, null, pushBaseUrl, pushApiKey);
                    if (pushSuccess)
                    {
                        updated++;
                        await TransferOrderDataService.SetTransferOrderWmsExportStatusAsync(settings, toTitle, "Exported");
                    }
                    else
                        ErrorLogService.LogError($"TransferOrderSyncFromErpNextService: Failed to post TO {toTitle} status to ERPNext: {pushError}", null);
                }
                ErrorLogService.LogInfo($"TransferOrderSyncFromErpNextService: TO status posted to ERPNext: {updated}/{toNamesJustSynced.Count} updated (update_transfer_order_wms_status per TO)");
            }
            else if (toNamesJustSynced.Count > 0 && endpoints.Count == 0)
                ErrorLogService.LogInfo("TransferOrderSyncFromErpNextService: Skipped posting TO status to ERPNext (no endpoints; cannot determine push URL)");
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Errors.Add(ex.Message);
            ErrorLogService.LogError("TransferOrderSyncFromErpNextService: Error syncing TOs from ERPNext", ex);
        }

        return result;
    }

    private static List<(string Name, string BaseUrl, string ApiKey)> GetEndpoints(WmsSettings settings)
    {
        var list = new List<(string, string, string)>();
        if (settings.SyncEndpoints != null && settings.SyncEndpoints.Count > 0)
        {
            foreach (var ep in settings.SyncEndpoints.Where(e => e.Enabled && !string.IsNullOrWhiteSpace(e.BaseUrl) && !string.IsNullOrWhiteSpace(e.ApiKey) &&
                (string.Equals(e.SyncType, SyncTypeNames.All, StringComparison.OrdinalIgnoreCase) || string.Equals(e.SyncType, SyncTypeNames.TransferOrder, StringComparison.OrdinalIgnoreCase))))
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
        return DateTime.TryParse(s, out var d) ? d : null;
    }
}
