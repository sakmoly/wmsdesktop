using System;
using System.Globalization;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Result of Material Request sync from ERPNext get_material_transfer_requests
/// </summary>
public class MaterialRequestSyncResult
{
    public bool Success { get; set; }
    public int TotalFetched { get; set; }
    public int MrsInserted { get; set; }
    public int MrsUpdated { get; set; }
    public int ItemsInserted { get; set; }
    public List<string> Errors { get; set; } = new();
}

/// <summary>
/// Syncs Material Requests from ERPNext get_material_transfer_requests to tabMaterialRequest and tabMaterialRequestItem.
/// Uses endpoints with SyncType = Material Request or All; BaseUrl can be the full API URL (with query params).
/// </summary>
public static class MaterialRequestSyncFromErpNextService
{
    public static async Task<MaterialRequestSyncResult> SyncMaterialRequestsFromErpNextAsync(WmsSettings settings)
    {
        var result = new MaterialRequestSyncResult { Success = false, Errors = new List<string>() };
        ErrorLogService.LogInfo("Material Request sync from ERPNext started.");

        try
        {
            await DatabaseService.EnsureTabMaterialRequestTablesExistAsync(settings);

            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var endpoints = GetEndpoints(settings);
            if (endpoints.Count == 0)
            {
                ErrorLogService.LogInfo("MaterialRequestSyncFromErpNextService: No sync endpoints configured for Material Request. Sync skipped.");
                result.Success = true;
                return result;
            }

            var allMrs = new List<ErpNextMaterialRequestDto>();
            foreach (var (epName, epUrl, epKey) in endpoints)
            {
                var list = await ErpNextWmsSyncApiService.FetchMaterialRequestsFromErpNextAsync(settings, epUrl, epKey, epName);
                if (list != null)
                    allMrs.AddRange(list);
            }

            var byTitle = new Dictionary<string, ErpNextMaterialRequestDto>(StringComparer.OrdinalIgnoreCase);
            foreach (var mr in allMrs)
            {
                var title = (mr.MaterialRequestNo ?? mr.MaterialRequest ?? mr.Title ?? mr.Name ?? "").Trim();
                if (string.IsNullOrWhiteSpace(title))
                {
                    ErrorLogService.LogInfo($"MaterialRequestSyncFromErpNextService: Skipping MR with empty name (MaterialRequestNo={mr.MaterialRequestNo}, Name={mr.Name}, Title={mr.Title}).");
                    continue;
                }
                if (!byTitle.ContainsKey(title))
                    byTitle[title] = mr;
            }

            result.TotalFetched = byTitle.Count;
            ErrorLogService.LogInfo($"MaterialRequestSyncFromErpNextService: Syncing {result.TotalFetched} Material Request(s) with items.");

            foreach (var kv in byTitle)
            {
                var mr = kv.Value;
                var title = kv.Key;
                try
                {
                    DateTime? requestedDate = ParseDate(mr.RequestedDate) ?? ParseDate(mr.RequiredDate);
                    DateTime? requiredDate = ParseDate(mr.RequiredDate);
                    if (!requestedDate.HasValue)
                    {
                        requestedDate = DateTime.UtcNow.Date;
                        ErrorLogService.LogInfo($"Material Request {title}: Missing requested_date from API; using fallback {requestedDate:yyyy-MM-dd}.");
                    }

                    double totalRequested = mr.TotalRequestedQty;
                    var items = mr.Items ?? new List<ErpNextMaterialRequestItemDto>();
                    if (totalRequested == 0 && items.Count > 0)
                        totalRequested = items.Sum(i => i.RequestedQty > 0 ? i.RequestedQty : i.Qty);

                    var validItemLineCount = items.Count(i => !string.IsNullOrWhiteSpace((i.ItemCode ?? "").Trim()));
                    if (validItemLineCount == 0)
                    {
                        ErrorLogService.LogInfo(
                            $"MaterialRequestSyncFromErpNextService: Skipping MR {title}: ERP payload has no item lines (include_items missing or empty). Desktop DB not updated.");
                        continue;
                    }

                    // Preserve local picked quantities: ERPNext often has picked_qty=0; WMS picking is local. Read existing before delete.
                    var existingItems = await GetExistingMaterialRequestItemsAsync(connection, title);
                    double totalPicked = mr.TotalPickedQty;
                    if (items.Count > 0)
                    {
                        var fromApi = items.Sum(i => i.PickedQty);
                        var fromLocal = existingItems.Values.Sum(x => x.PickedQty);
                        totalPicked = Math.Max(fromApi, fromLocal);
                        if (totalPicked == 0) totalPicked = fromApi;
                    }

                    var toShowroom = (mr.ToWarehouseName ?? mr.ToShowroom ?? mr.ToWarehouse ?? "").Trim();
                    var fromWarehouse = (mr.FromWarehouseCode ?? mr.FromWarehouse ?? mr.FromWarehouseName ?? "").Trim();
                    var requestedBy = (mr.RequestedBy ?? "").Trim();
                    if (string.IsNullOrWhiteSpace(requestedBy)) requestedBy = "Unknown";

                    // ERPNext uses "Pending" for submitted MRs (awaiting fulfillment). WMS/mobile expect "Submitted" to allow Start Picking.
                    var normalizedErpStatus = NormalizeMaterialRequestStatus(mr.Status);
                    var existingHeaderStatus = await GetExistingMaterialRequestStatusAsync(connection, title);
                    var status = ShouldPreserveLocalMaterialRequestHeaderStatus(existingHeaderStatus)
                        ? existingHeaderStatus!.Trim()
                        : normalizedErpStatus;
                    if (ShouldPreserveLocalMaterialRequestHeaderStatus(existingHeaderStatus) &&
                        !string.Equals(existingHeaderStatus, normalizedErpStatus, StringComparison.OrdinalIgnoreCase))
                    {
                        ErrorLogService.LogInfo(
                            $"MaterialRequestSyncFromErpNextService: MR {title}: keeping WMS header status \"{existingHeaderStatus}\" (ERP reported \"{mr.Status}\" → \"{normalizedErpStatus}\").");
                    }

                    var mrSql = @"INSERT INTO tabMaterialRequest 
                        (title, status, from_warehouse, to_showroom, requested_date, required_date, requested_by, total_requested_qty, total_picked_qty, updated_at)
                        VALUES (@title, @status, @fromWh, @toShowroom, @requestedDate, @requiredDate, @requestedBy, @totalRequested, @totalPicked, CURRENT_TIMESTAMP)
                        ON DUPLICATE KEY UPDATE
                            status = VALUES(status),
                            from_warehouse = VALUES(from_warehouse),
                            to_showroom = VALUES(to_showroom),
                            requested_date = VALUES(requested_date),
                            required_date = VALUES(required_date),
                            requested_by = VALUES(requested_by),
                            total_requested_qty = VALUES(total_requested_qty),
                            total_picked_qty = VALUES(total_picked_qty),
                            updated_at = CURRENT_TIMESTAMP";

                    await using (var cmd = new MySqlCommand(mrSql, connection))
                    {
                        cmd.Parameters.AddWithValue("@title", title);
                        cmd.Parameters.AddWithValue("@status", status);
                        cmd.Parameters.AddWithValue("@fromWh", fromWarehouse);
                        cmd.Parameters.AddWithValue("@toShowroom", string.IsNullOrEmpty(toShowroom) ? (object)DBNull.Value : toShowroom);
                        cmd.Parameters.AddWithValue("@requestedDate", requestedDate.Value);
                        cmd.Parameters.AddWithValue("@requiredDate", requiredDate ?? (object)DBNull.Value);
                        cmd.Parameters.AddWithValue("@requestedBy", requestedBy);
                        cmd.Parameters.AddWithValue("@totalRequested", totalRequested);
                        cmd.Parameters.AddWithValue("@totalPicked", totalPicked);
                        var rows = await cmd.ExecuteNonQueryAsync();
                        if (rows == 1) result.MrsInserted++;
                        else if (rows == 2) result.MrsUpdated++;
                    }

                    await using (var delCmd = new MySqlCommand("DELETE FROM tabMaterialRequestItem WHERE parent_title = @title", connection))
                    {
                        delCmd.Parameters.AddWithValue("@title", title);
                        await delCmd.ExecuteNonQueryAsync();
                    }

                    var mrItems = items;
                    if (mrItems.Count == 0)
                        ErrorLogService.LogInfo($"MaterialRequestSyncFromErpNextService: MR {title} has 0 items from API (Items is null or empty).");
                    else
                        ErrorLogService.LogInfo($"MaterialRequestSyncFromErpNextService: MR {title}: inserting {mrItems.Count} item(s) (preserving local picked qty where higher).");

                    var itemSql = @"INSERT INTO tabMaterialRequestItem 
                        (parent_title, item_code, requested_qty, picked_qty, status)
                        VALUES (@parent, @itemCode, @requestedQty, @pickedQty, @status)";
                    double sumPicked = 0;
                    foreach (var it in mrItems)
                    {
                        var itemCode = (it.ItemCode ?? "").Trim();
                        if (string.IsNullOrWhiteSpace(itemCode))
                        {
                            ErrorLogService.LogInfo($"MaterialRequestSyncFromErpNextService: Skipping item with empty item_code in MR {title}.");
                            continue;
                        }
                        double requestedQty = it.RequestedQty > 0 ? it.RequestedQty : it.Qty;
                        double apiPicked = it.PickedQty;
                        existingItems.TryGetValue(itemCode, out var existing);
                        double pickedQtyToWrite = Math.Max(existing.PickedQty, apiPicked);
                        string statusToWrite = pickedQtyToWrite >= requestedQty && requestedQty > 0 ? "Picked" : (pickedQtyToWrite > 0 ? "In Progress" : "Pending");
                        if (existing.Status != null && (existing.Status.Equals("Picked", StringComparison.OrdinalIgnoreCase) || existing.Status.Equals("In Progress", StringComparison.OrdinalIgnoreCase)) && pickedQtyToWrite == existing.PickedQty)
                            statusToWrite = existing.Status;
                        sumPicked += pickedQtyToWrite;
                        try
                        {
                            await using var itemCmd = new MySqlCommand(itemSql, connection);
                            itemCmd.Parameters.AddWithValue("@parent", title);
                            itemCmd.Parameters.AddWithValue("@itemCode", itemCode);
                            itemCmd.Parameters.AddWithValue("@requestedQty", requestedQty);
                            itemCmd.Parameters.AddWithValue("@pickedQty", pickedQtyToWrite);
                            itemCmd.Parameters.AddWithValue("@status", statusToWrite);
                            await itemCmd.ExecuteNonQueryAsync();
                            result.ItemsInserted++;
                        }
                        catch (Exception itemEx)
                        {
                            var err = $"Material Request {title} item {itemCode}: {itemEx.Message}";
                            result.Errors.Add(err);
                            ErrorLogService.LogError(err, itemEx);
                        }
                    }

                    if (sumPicked > totalPicked)
                    {
                        totalPicked = sumPicked;
                        await using (var updCmd = new MySqlCommand("UPDATE tabMaterialRequest SET total_picked_qty = @qty, updated_at = CURRENT_TIMESTAMP WHERE title = @title", connection))
                        {
                            updCmd.Parameters.AddWithValue("@qty", totalPicked);
                            updCmd.Parameters.AddWithValue("@title", title);
                            await updCmd.ExecuteNonQueryAsync();
                        }
                    }
                }
                catch (Exception ex)
                {
                    var err = $"Material Request {title}: {ex.Message}";
                    result.Errors.Add(err);
                    ErrorLogService.LogError(err, ex);
                }
            }

            result.Success = true;
            ErrorLogService.LogInfo($"Material Request sync from ERPNext completed. Fetched: {result.TotalFetched}, MRs inserted: {result.MrsInserted}, updated: {result.MrsUpdated}, items: {result.ItemsInserted}, errors: {result.Errors.Count}");
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Errors.Add(ex.Message);
            ErrorLogService.LogError("MaterialRequestSyncFromErpNextService: Error syncing Material Requests from ERPNext", ex);
        }

        return result;
    }

    private static List<(string Name, string BaseUrl, string ApiKey)> GetEndpoints(WmsSettings settings)
    {
        var list = new List<(string, string, string)>();
        if (settings.SyncEndpoints != null && settings.SyncEndpoints.Count > 0)
        {
            foreach (var ep in settings.SyncEndpoints.Where(e => e.Enabled && !string.IsNullOrWhiteSpace(e.BaseUrl) && !string.IsNullOrWhiteSpace(e.ApiKey) &&
                (string.Equals(e.SyncType, SyncTypeNames.All, StringComparison.OrdinalIgnoreCase) || string.Equals(e.SyncType, SyncTypeNames.MaterialRequest, StringComparison.OrdinalIgnoreCase))))
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

    /// <summary>
    /// Map ERPNext Material Request status to WMS status. ERPNext uses "Pending" for submitted docs (ready for fulfillment);
    /// WMS and mobile app use "Submitted" to enable Start Picking.
    /// </summary>
    private static string NormalizeMaterialRequestStatus(string? erpStatus)
    {
        var s = (erpStatus ?? "Draft").Trim();
        return string.Equals(s, "Pending", StringComparison.OrdinalIgnoreCase) ? "Submitted" : s;
    }

    /// <summary>WMS/mobile can move an MR past ERP's document status. ERP pull must not downgrade the header.</summary>
    private static readonly HashSet<string> PreservedMaterialRequestHeaderStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "In Progress", "Picked", "Dispatched", "Completed", "Cancelled",
    };

    private static bool ShouldPreserveLocalMaterialRequestHeaderStatus(string? existingStatus) =>
        !string.IsNullOrWhiteSpace(existingStatus) &&
        PreservedMaterialRequestHeaderStatuses.Contains(existingStatus.Trim());

    private static async Task<string?> GetExistingMaterialRequestStatusAsync(MySqlConnection connection, string title)
    {
        const string sql = "SELECT status FROM tabMaterialRequest WHERE title = @t LIMIT 1";
        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@t", title);
        var o = await cmd.ExecuteScalarAsync();
        if (o == null || o is DBNull) return null;
        return Convert.ToString(o);
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

    /// <summary>
    /// Load existing item picked_qty and status from tabMaterialRequestItem for a MR so we can preserve
    /// local WMS picking when sync overwrites with ERPNext (which often has picked_qty=0).
    /// </summary>
    private static async Task<Dictionary<string, (double PickedQty, string? Status)>> GetExistingMaterialRequestItemsAsync(MySqlConnection connection, string parentTitle)
    {
        var dict = new Dictionary<string, (double PickedQty, string? Status)>(StringComparer.OrdinalIgnoreCase);
        const string sql = "SELECT item_code, picked_qty, status FROM tabMaterialRequestItem WHERE parent_title = @title";
        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@title", parentTitle);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var itemCode = reader.GetString(0);
            var pickedQty = Convert.ToDouble(reader.GetDecimal(1));
            var status = reader.IsDBNull(2) ? null : reader.GetString(2);
            dict[itemCode] = (pickedQty, status);
        }
        return dict;
    }
}
