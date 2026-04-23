using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Result of item group sync from ERPNext
/// </summary>
public class ItemGroupSyncResult
{
    public bool Success { get; set; }
    public int TotalFetched { get; set; }
    public int Inserted { get; set; }
    public int Updated { get; set; }
    public List<string> Errors { get; set; } = new();
}

/// <summary>
/// Syncs item groups from ERPNext to tabItemGroup. Uses endpoints with Sync type "Item Group" or "All".
/// </summary>
public static class ItemGroupSyncService
{
    public static async Task<ItemGroupSyncResult> SyncItemGroupsFromErpNextAsync(WmsSettings settings)
    {
        var result = new ItemGroupSyncResult
        {
            Success = false,
            TotalFetched = 0,
            Inserted = 0,
            Updated = 0,
            Errors = new List<string>()
        };

        ErrorLogService.LogInfo("Item group sync started.");

        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            await DatabaseService.EnsureTabItemGroupExistsAsync(settings);

            var endpoints = new List<(string Name, string BaseUrl, string ApiKey)>();
            if (settings.SyncEndpoints != null && settings.SyncEndpoints.Count > 0)
            {
                foreach (var ep in settings.SyncEndpoints.Where(e => e.Enabled && !string.IsNullOrWhiteSpace(e.BaseUrl) && !string.IsNullOrWhiteSpace(e.ApiKey) &&
                    (string.Equals(e.SyncType, SyncTypeNames.All, StringComparison.OrdinalIgnoreCase) || string.Equals(e.SyncType, SyncTypeNames.ItemGroup, StringComparison.OrdinalIgnoreCase))))
                {
                    endpoints.Add((ep.Name, ep.BaseUrl.Trim(), ep.ApiKey));
                }
            }
            if (endpoints.Count == 0 && (settings.SyncEndpoints == null || settings.SyncEndpoints.Count == 0))
            {
                var url = !string.IsNullOrWhiteSpace(settings.ErpNextApiUrl) ? settings.ErpNextApiUrl : settings.ApiEndpointUrl;
                var key = !string.IsNullOrWhiteSpace(settings.ErpNextApiKey) ? settings.ErpNextApiKey : settings.ApiKey;
                if (!string.IsNullOrWhiteSpace(url) && !string.IsNullOrWhiteSpace(key))
                    endpoints.Add(("Default", url.Trim(), key));
            }

            if (endpoints.Count == 0)
            {
                ErrorLogService.LogInfo("ItemGroupSyncService: No sync endpoints configured for item groups. Sync skipped.");
                result.Success = true;
                return result;
            }

            var allGroups = new List<ErpNextItemGroup>();
            foreach (var (epName, epUrl, epKey) in endpoints)
            {
                var list = await ErpNextItemGroupApiService.FetchItemGroupsFromErpNextAsync(
                    settings,
                    overrideBaseUrl: epUrl,
                    overrideApiKey: epKey,
                    endpointName: epName);
                if (list != null)
                    allGroups.AddRange(list);
            }

            var byName = new Dictionary<string, ErpNextItemGroup>(StringComparer.OrdinalIgnoreCase);
            foreach (var g in allGroups)
            {
                var name = (g.Name ?? "").Trim();
                if (string.IsNullOrWhiteSpace(name)) continue;
                if (!byName.ContainsKey(name))
                    byName[name] = g;
            }

            result.TotalFetched = byName.Count;
            ErrorLogService.LogInfo($"ItemGroupSyncService: Syncing {result.TotalFetched} item groups.");

            const string sql = @"
                INSERT INTO tabItemGroup (name, parent_item_group, is_group)
                VALUES (@name, @parent_item_group, @is_group)
                ON DUPLICATE KEY UPDATE parent_item_group = @parent_item_group, is_group = @is_group, updated_at = CURRENT_TIMESTAMP";

            foreach (var kv in byName)
            {
                var g = kv.Value;
                var name = kv.Key;
                var parent = string.IsNullOrWhiteSpace(g.ParentItemGroup) ? null : g.ParentItemGroup.Trim();
                var isGroup = g.IsGroup != 0;
                try
                {
                    await using var cmd = new MySqlCommand(sql, connection);
                    cmd.Parameters.AddWithValue("@name", name);
                    cmd.Parameters.AddWithValue("@parent_item_group", (object?)parent ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@is_group", isGroup);
                    var rowsAffected = await cmd.ExecuteNonQueryAsync();
                    if (rowsAffected == 1) result.Inserted++;
                    else if (rowsAffected == 2) result.Updated++;
                }
                catch (Exception ex)
                {
                    var err = $"Error syncing item group {name}: {ex.Message}";
                    result.Errors.Add(err);
                    ErrorLogService.LogError(err, ex);
                }
            }

            result.Success = true;
            ErrorLogService.LogInfo($"Item group sync completed successfully. Fetched: {result.TotalFetched}, Inserted: {result.Inserted}, Updated: {result.Updated}, Errors: {result.Errors.Count}");
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Errors.Add(ex.Message);
            ErrorLogService.LogError("ItemGroupSyncService: Error syncing item groups from ERPNext", ex);
        }

        return result;
    }
}
