using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Result of warehouse sync from ERPNext (warehouses + WMS Bin Location rows).
/// </summary>
public class WarehouseSyncResult
{
    public bool Success { get; set; }
    public int TotalFetched { get; set; }
    public int Inserted { get; set; }
    public int Updated { get; set; }
    public List<string> Errors { get; set; } = new();

    /// <summary>Distinct locations upserted into tabLocation (from list_locations / WMS Bin Location).</summary>
    public int BinLocationsTotalFetched { get; set; }
    public int BinLocationsInserted { get; set; }
    public int BinLocationsUpdated { get; set; }
    /// <summary>MySQL can report 0 affected rows when ON DUPLICATE KEY UPDATE makes no data change.</summary>
    public int BinLocationsUnchanged { get; set; }
    /// <summary>No warehouse on API row and no default/first warehouse to use.</summary>
    public int BinLocationsSkipped { get; set; }
}

/// <summary>
/// Syncs warehouses from ERPNext to tabWarehouse, then locations to tabLocation.
/// </summary>
public static class WarehouseSyncService
{
    public static async Task<WarehouseSyncResult> SyncWarehousesFromErpNextAsync(WmsSettings settings)
    {
        var result = new WarehouseSyncResult
        {
            Success = false,
            TotalFetched = 0,
            Inserted = 0,
            Updated = 0,
            Errors = new List<string>()
        };

        ErrorLogService.LogInfo("Warehouse sync started.");

        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Same endpoint list as item sync
            var endpoints = new List<(string Name, string BaseUrl, string ApiKey)>();
            if (settings.SyncEndpoints != null && settings.SyncEndpoints.Count > 0)
            {
                foreach (var ep in settings.SyncEndpoints.Where(e => e.Enabled && !string.IsNullOrWhiteSpace(e.BaseUrl) && !string.IsNullOrWhiteSpace(e.ApiKey) &&
                    (string.Equals(e.SyncType, SyncTypeNames.All, StringComparison.OrdinalIgnoreCase) || string.Equals(e.SyncType, SyncTypeNames.Warehouse, StringComparison.OrdinalIgnoreCase))))
                {
                    endpoints.Add((ep.Name, ep.BaseUrl.Trim(), ep.ApiKey));
                }
            }
            // Only use default URL when no sync endpoints are configured at all. If user has endpoints but disabled or wrong type, do not fall back.
            if (endpoints.Count == 0 && (settings.SyncEndpoints == null || settings.SyncEndpoints.Count == 0))
            {
                var url = !string.IsNullOrWhiteSpace(settings.ErpNextApiUrl) ? settings.ErpNextApiUrl : settings.ApiEndpointUrl;
                var key = !string.IsNullOrWhiteSpace(settings.ErpNextApiKey) ? settings.ErpNextApiKey : settings.ApiKey;
                if (!string.IsNullOrWhiteSpace(url) && !string.IsNullOrWhiteSpace(key))
                    endpoints.Add(("Default", url.Trim(), key));
            }

            if (endpoints.Count == 0)
            {
                ErrorLogService.LogInfo("WarehouseSyncService: No sync endpoints configured. Sync skipped.");
                result.Success = true;
                return result;
            }

            var allWarehouses = new List<ErpNextWarehouse>();
            foreach (var (epName, epUrl, epKey) in endpoints)
            {
                var list = await ErpNextWarehouseApiService.FetchWarehousesFromErpNextAsync(
                    settings,
                    overrideBaseUrl: epUrl,
                    overrideApiKey: epKey,
                    endpointName: epName);
                if (list != null)
                    allWarehouses.AddRange(list);
                else
                    result.Errors.Add(
                        $"Warehouses ({epName}): ERPNext request failed (check Error Log for HTTP details and API key).");
            }

            // Deduplicate by code — use document name when "code" is not in API response
            var byCode = new Dictionary<string, ErpNextWarehouse>(StringComparer.OrdinalIgnoreCase);
            foreach (var wh in allWarehouses)
            {
                var code = wh.ResolvedCode;
                if (string.IsNullOrWhiteSpace(code))
                    continue;
                if (!byCode.ContainsKey(code))
                    byCode[code] = wh;
            }

            result.TotalFetched = byCode.Count;
            ErrorLogService.LogInfo($"WarehouseSyncService: Syncing {result.TotalFetched} warehouses (code, name, warehouse_type).");

            // UPSERT: insert or update code, name, warehouse_type
            const string sql = @"
                INSERT INTO tabWarehouse (code, name, warehouse_type, is_group, parent_warehouse)
                VALUES (@code, @name, @warehouse_type, 0, NULL)
                ON DUPLICATE KEY UPDATE name = @name, warehouse_type = @warehouse_type, updated_at = CURRENT_TIMESTAMP";

            foreach (var kv in byCode)
            {
                var wh = kv.Value;
                var code = kv.Key;
                var name = (wh.WarehouseName ?? "").Trim();
                if (string.IsNullOrWhiteSpace(name))
                    name = code;
                var warehouseType = string.IsNullOrWhiteSpace(wh.WarehouseType) ? null : wh.WarehouseType.Trim();
                try
                {
                    await using var cmd = new MySqlCommand(sql, connection);
                    cmd.Parameters.AddWithValue("@code", code);
                    cmd.Parameters.AddWithValue("@name", name);
                    cmd.Parameters.AddWithValue("@warehouse_type", (object?)warehouseType ?? DBNull.Value);
                    var rowsAffected = await cmd.ExecuteNonQueryAsync();
                    if (rowsAffected == 1)
                        result.Inserted++;
                    else if (rowsAffected == 2)
                        result.Updated++;
                }
                catch (Exception ex)
                {
                    var err = $"Error syncing warehouse {code}: {ex.Message}";
                    result.Errors.Add(err);
                    ErrorLogService.LogError(err, ex);
                }
            }

            await SyncBinLocationsForEndpointsAsync(settings, connection, endpoints, result);

            result.Success = true;
            ErrorLogService.LogInfo(
                $"Warehouse sync completed successfully. Warehouses: {result.TotalFetched} fetched, {result.Inserted} inserted, {result.Updated} updated. tabLocation: {result.BinLocationsTotalFetched} fetched, inserted {result.BinLocationsInserted}, updated {result.BinLocationsUpdated}, unchanged {result.BinLocationsUnchanged}, skipped {result.BinLocationsSkipped}. Errors: {result.Errors.Count}");
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Errors.Add(ex.Message);
            ErrorLogService.LogError("WarehouseSyncService: Error syncing warehouses from ERPNext", ex);
        }

        return result;
    }

    private static string? ResolveBinLocationKey(ErpNextBinLocationRow row)
    {
        if (!string.IsNullOrWhiteSpace(row.BinId)) return row.BinId.Trim();
        if (!string.IsNullOrWhiteSpace(row.BinCode)) return row.BinCode.Trim();
        if (!string.IsNullOrWhiteSpace(row.LocationId)) return row.LocationId.Trim();
        if (!string.IsNullOrWhiteSpace(row.Name)) return row.Name.Trim();
        return null;
    }

    /// <summary>
    /// list_locations often omits warehouse per row; fall back to settings default or first warehouse in tabWarehouse.
    /// </summary>
    private static string? ResolveWarehouseCodeForLocation(
        ErpNextBinLocationRow row,
        List<Warehouse> warehouses,
        WmsSettings settings)
    {
        var whLink = (row.Warehouse ?? row.ErpWarehouse ?? "").Trim();
        if (!string.IsNullOrWhiteSpace(whLink))
        {
            var c = WarehouseDataService.ResolveToCode(whLink, warehouses);
            if (!string.IsNullOrWhiteSpace(c))
                return c;
        }

        foreach (var candidate in new[] { settings.DefaultPickingWarehouse, settings.DefaultReceivingWarehouseForPr })
        {
            var t = (candidate ?? "").Trim();
            if (string.IsNullOrEmpty(t))
                continue;
            var c = WarehouseDataService.ResolveToCode(t, warehouses);
            if (!string.IsNullOrWhiteSpace(c))
                return c;
        }

        var first = warehouses
            .OrderBy(w => w.Code, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();
        return string.IsNullOrEmpty(first?.Code) ? null : first.Code;
    }

    private static async Task SyncBinLocationsForEndpointsAsync(
        WmsSettings settings,
        MySqlConnection connection,
        List<(string Name, string BaseUrl, string ApiKey)> endpoints,
        WarehouseSyncResult result)
    {
        ErrorLogService.LogInfo("WarehouseSyncService: Syncing locations from ERPNext to tabLocation…");

        var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
        var allRows = new List<ErpNextBinLocationRow>();
        // Same server twice (e.g. "Pull Warehouse" + "Item Group" with same URL) should not double-fetch or double-error.
        var binFetchSeen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (epName, epUrl, epKey) in endpoints)
        {
            var dedupe = $"{epUrl.Trim()}|{epKey}";
            if (!binFetchSeen.Add(dedupe))
                continue;

            var (list, errDetail) = await ErpNextBinLocationApiService.FetchBinLocationsFromErpNextAsync(
                settings, overrideBaseUrl: epUrl, overrideApiKey: epKey, endpointName: epName);
            if (list == null)
            {
                result.Errors.Add(
                    $"Bin locations ({epName}): {errDetail ?? "fetch failed"} — DocType '{ErpNextBinLocationApiService.BinLocationDocType}' must exist and API user needs read permission.");
                continue;
            }

            allRows.AddRange(list);
        }

        var byBin = new Dictionary<string, ErpNextBinLocationRow>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in allRows)
        {
            var key = ResolveBinLocationKey(row);
            if (string.IsNullOrWhiteSpace(key))
                continue;
            if (!byBin.ContainsKey(key))
                byBin[key] = row;
        }

        result.BinLocationsTotalFetched = byBin.Count;
        var usedWarehouseFallback = 0;

        const string sql = @"
            INSERT INTO tabLocation (
                location_id, warehouse, zone, aisle, parent_rack, level, bin_id,
                location_type, location_type_detailed, is_available, capacity_volume_weight)
            VALUES (
                @location_id, @warehouse, @zone, @aisle, @parent_rack, @level, @bin_id,
                @location_type, @location_type_detailed, TRUE, NULL)
            ON DUPLICATE KEY UPDATE
                warehouse = VALUES(warehouse),
                zone = VALUES(zone),
                aisle = VALUES(aisle),
                parent_rack = VALUES(parent_rack),
                level = VALUES(level),
                bin_id = VALUES(bin_id),
                location_type = VALUES(location_type),
                location_type_detailed = VALUES(location_type_detailed),
                is_available = VALUES(is_available),
                updated_at = CURRENT_TIMESTAMP";

        foreach (var kv in byBin)
        {
            var row = kv.Value;
            var hadApiWarehouse = !string.IsNullOrWhiteSpace(row.Warehouse ?? row.ErpWarehouse);
            var whCode = ResolveWarehouseCodeForLocation(row, warehouses, settings);
            if (string.IsNullOrWhiteSpace(whCode))
            {
                result.BinLocationsSkipped++;
                ErrorLogService.LogInfo(
                    $"WarehouseSyncService: Skipping location '{kv.Key}' — no warehouse on API row and no default/first warehouse in tabWarehouse.");
                continue;
            }

            if (!hadApiWarehouse)
                usedWarehouseFallback++;

            var binSlot = EmptyToNull(row.BinCode) ?? EmptyToNull(row.Position);
            if (!string.IsNullOrEmpty(binSlot) &&
                string.Equals(binSlot, kv.Key, StringComparison.OrdinalIgnoreCase))
                binSlot = null;

            try
            {
                await using var cmd = new MySqlCommand(sql, connection);
                cmd.Parameters.AddWithValue("@location_id", kv.Key);
                cmd.Parameters.AddWithValue("@warehouse", whCode);
                cmd.Parameters.AddWithValue("@zone", (object?)EmptyToNull(row.Zone) ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@aisle", (object?)EmptyToNull(row.Aisle) ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@parent_rack", (object?)EmptyToNull(row.Rack) ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@level", (object?)EmptyToNull(row.Level) ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@bin_id", (object?)binSlot ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@location_type", NormalizeLocationType(row.LocationType));
                cmd.Parameters.AddWithValue("@location_type_detailed", (object?)BuildLocationTypeDetailed(row) ?? DBNull.Value);
                var rowsAffected = await cmd.ExecuteNonQueryAsync();
                // MySQL: 1 = insert, 2 = row updated; 0 = duplicate row but no column values changed
                if (rowsAffected == 1)
                    result.BinLocationsInserted++;
                else if (rowsAffected == 2)
                    result.BinLocationsUpdated++;
                else
                    result.BinLocationsUnchanged++;
            }
            catch (Exception ex)
            {
                var err = $"Error syncing location {kv.Key} to tabLocation: {ex.Message}";
                result.Errors.Add(err);
                ErrorLogService.LogError(err, ex);
            }
        }

        if (usedWarehouseFallback > 0)
        {
            ErrorLogService.LogInfo(
                $"WarehouseSyncService: {usedWarehouseFallback} location row(s) had no warehouse field from API; used Settings default or first tabWarehouse code.");
        }
    }

    private static string NormalizeLocationType(string? t)
    {
        if (string.IsNullOrWhiteSpace(t))
            return "STORAGE";
        var x = t.Trim();
        if (string.Equals(x, "Storage", StringComparison.OrdinalIgnoreCase))
            return "STORAGE";
        return x;
    }

    private static string? BuildLocationTypeDetailed(ErpNextBinLocationRow row)
    {
        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(row.LocationTypeDetailed))
            parts.Add(row.LocationTypeDetailed.Trim());
        if (!string.IsNullOrWhiteSpace(row.Priority))
            parts.Add("priority:" + row.Priority.Trim());
        return parts.Count == 0 ? null : string.Join(" | ", parts);
    }

    private static string? EmptyToNull(string? s) =>
        string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}
