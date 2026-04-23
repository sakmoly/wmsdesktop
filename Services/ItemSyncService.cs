using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Service for syncing items from ERPNext to local database
/// </summary>
public static class ItemSyncService
{
    private const int PageSize = 100; // Items per page

    /// <summary>
    /// Sync all items from ERPNext to local database
    /// Supports incremental sync using max_modified
    /// </summary>
    /// <param name="settings">WMS settings</param>
    /// <param name="incrementalSync">If true, only sync items modified since last sync</param>
    /// <returns>Sync result with counts</returns>
    public static async Task<ItemSyncResult> SyncItemsFromErpNextAsync(WmsSettings settings, bool incrementalSync = false)
    {
        var result = new ItemSyncResult
        {
            Success = false,
            TotalFetched = 0,
            Inserted = 0,
            Updated = 0,
            Errors = new List<string>()
        };

        ErrorLogService.LogInfo(incrementalSync
            ? "Item sync started (incremental sync)."
            : "Item sync started (full sync).");

        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Get last sync cursor from app_sync_state (for incremental sync)
            DateTime? maxModified = null;
            if (incrementalSync)
            {
                var cursorValue = await GetLastSyncCursorAsync(connection);
                if (!string.IsNullOrWhiteSpace(cursorValue))
                {
                    if (DateTime.TryParse(cursorValue, out var cursorDate))
                    {
                        maxModified = cursorDate;
                        ErrorLogService.LogInfo($"ItemSyncService: Incremental sync since {maxModified:yyyy-MM-dd HH:mm:ss}");
                    }
                }
                
                if (!maxModified.HasValue && settings.LastItemSyncTimestamp.HasValue)
                {
                    maxModified = settings.LastItemSyncTimestamp.Value;
                    ErrorLogService.LogInfo($"ItemSyncService: Using settings timestamp (since {maxModified:yyyy-MM-dd HH:mm:ss})");
                }
            }
            else
            {
                ErrorLogService.LogInfo("ItemSyncService: Full sync (all items).");
            }

            string? maxCustomWmsModified = null;
            var allItems = new List<ErpNextItem>();

            // Build list of endpoints: multiple from SyncEndpoints (enabled) or single from settings
            var endpoints = new List<(string Name, string BaseUrl, string ApiKey)>();
            if (settings.SyncEndpoints != null && settings.SyncEndpoints.Count > 0)
            {
                foreach (var ep in settings.SyncEndpoints.Where(e => e.Enabled && !string.IsNullOrWhiteSpace(e.BaseUrl) && !string.IsNullOrWhiteSpace(e.ApiKey) &&
                    (string.Equals(e.SyncType, SyncTypeNames.All, StringComparison.OrdinalIgnoreCase) || string.Equals(e.SyncType, SyncTypeNames.Item, StringComparison.OrdinalIgnoreCase))))
                {
                    endpoints.Add((ep.Name, ep.BaseUrl.Trim(), ep.ApiKey));
                }
            }
            // Only use default URL when no sync endpoints are configured at all (empty list). If user has endpoints but disabled or wrong type, do not fall back.
            if (endpoints.Count == 0 && (settings.SyncEndpoints == null || settings.SyncEndpoints.Count == 0))
            {
                var url = !string.IsNullOrWhiteSpace(settings.ErpNextApiUrl) ? settings.ErpNextApiUrl : settings.ApiEndpointUrl;
                var key = !string.IsNullOrWhiteSpace(settings.ErpNextApiKey) ? settings.ErpNextApiKey : settings.ApiKey;
                if (!string.IsNullOrWhiteSpace(url) && !string.IsNullOrWhiteSpace(key))
                    endpoints.Add(("Default", url.Trim(), key));
            }

            if (endpoints.Count == 0)
            {
                ErrorLogService.LogInfo("ItemSyncService: No sync endpoints configured. Sync skipped.");
                result.Success = true;
                return result;
            }

            ErrorLogService.LogInfo($"ItemSyncService: Syncing from {endpoints.Count} endpoint(s): {string.Join(", ", endpoints.Select(e => e.Name))}");

            // Fetch from each endpoint (all pages per endpoint)
            foreach (var (epName, epUrl, epKey) in endpoints)
            {
                int offset = 0;
                bool hasMore = true;
                while (hasMore)
                {
                    var fetchResult = await ErpNextItemApiService.FetchItemsFromErpNextAsync(
                        settings,
                        limit: PageSize,
                        offset: offset,
                        maxModified: maxModified,
                        overrideBaseUrl: epUrl,
                        overrideApiKey: epKey,
                        endpointName: epName
                    );

                    if (fetchResult == null || fetchResult.Items.Count == 0)
                    {
                        hasMore = false;
                        break;
                    }

                    var items = fetchResult.Items;
                    allItems.AddRange(items);
                    result.TotalFetched += items.Count;

                    if (!string.IsNullOrWhiteSpace(fetchResult.MaxCustomWmsModified) &&
                        (string.IsNullOrWhiteSpace(maxCustomWmsModified) ||
                         string.Compare(fetchResult.MaxCustomWmsModified, maxCustomWmsModified, StringComparison.Ordinal) > 0))
                    {
                        maxCustomWmsModified = fetchResult.MaxCustomWmsModified;
                    }

                    if (!fetchResult.HasMore)
                    {
                        hasMore = false;
                        break;
                    }
                    offset += items.Count;
                }
            }

            // Process all fetched items (UPSERT)
            foreach (var erpItem in allItems)
                {
                    try
                    {
                        // Special logging for debugging specific items
                        var itemCode = erpItem.ItemCode?.Trim() ?? string.Empty;
                        if (itemCode == "10886" || itemCode.Contains("10886"))
                        {
                            ErrorLogService.LogInfo($"ItemSyncService: Processing item 10886 - Name: '{erpItem.ItemName}', Modified: '{erpItem.Modified}'");
                        }
                        
                        // Parse custom_wms_modified date (primary cursor for incremental sync)
                        // Map ERPNext custom_wms_modified → Desktop wms_modified
                        DateTime? wmsModifiedDate = null;
                        string? wmsModifiedString = erpItem.CustomWmsModified ?? erpItem.Modified;
                        
                        if (!string.IsNullOrWhiteSpace(wmsModifiedString))
                        {
                            if (DateTime.TryParse(wmsModifiedString, out var parsedDate))
                            {
                                wmsModifiedDate = parsedDate;
                            }
                            else
                            {
                                ErrorLogService.LogInfo($"ItemSyncService: Failed to parse wms_modified date for item {itemCode}: '{wmsModifiedString}'");
                            }
                        }
                        else
                        {
                            // Log when custom_wms_modified is missing (only for first few items to avoid spam)
                            if (result.TotalFetched <= 3)
                            {
                                ErrorLogService.LogInfo($"ItemSyncService: Item {itemCode} has no custom_wms_modified or modified field from ERPNext. wms_modified will be NULL.");
                            }
                        }

                        // Parse updated_on date (fallback to modified if not available)
                        DateTime? updatedOnDate = wmsModifiedDate;
                        if (string.IsNullOrWhiteSpace(erpItem.Modified) && wmsModifiedDate.HasValue)
                        {
                            updatedOnDate = wmsModifiedDate;
                        }

                        // Convert is_stock_item (0/1) to boolean
                        bool maintainStock = erpItem.IsStockItem == 1;
                        
                        // Convert disabled (0/1) to boolean
                        bool disabled = erpItem.Disabled == 1;

                        // UPSERT into tabItem
                        // Map ERPNext custom_wms_modified → Desktop wms_modified
                        // Map ERPNext stock_uom → Desktop default_uom AND stock_uom (both fields)
                        var sql = @"INSERT INTO tabItem 
                                    (code, name, item_group, color, size, year, season, brand, default_uom, stock_uom, barcode, maintain_stock, disabled, wms_modified, updated_on, created_at, updated_at)
                                    VALUES 
                                    (@code, @name, @item_group, @color, @size, @year, @season, @brand, @default_uom, @stock_uom, @barcode, @maintain_stock, @disabled, @wms_modified, @updated_on,
                                     COALESCE(@created_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
                                    ON DUPLICATE KEY UPDATE
                                        name = @name,
                                        item_group = @item_group,
                                        color = @color,
                                        size = @size,
                                        year = @year,
                                        season = @season,
                                        brand = @brand,
                                        default_uom = @default_uom,
                                        stock_uom = @stock_uom,
                                        barcode = @barcode,
                                        maintain_stock = @maintain_stock,
                                        disabled = @disabled,
                                        wms_modified = @wms_modified,
                                        updated_on = @updated_on,
                                        updated_at = CURRENT_TIMESTAMP";

                        await using var cmd = new MySqlCommand(sql, connection);
                        
                        // Trim item code to avoid whitespace issues (already done above)
                        var itemName = erpItem.ItemName?.Trim() ?? string.Empty;
                        
                        cmd.Parameters.AddWithValue("@code", itemCode);
                        cmd.Parameters.AddWithValue("@name", itemName);
                        cmd.Parameters.AddWithValue("@item_group", erpItem.ItemGroup?.Trim() ?? (object)DBNull.Value);
                        cmd.Parameters.AddWithValue("@color", erpItem.Color?.Trim() ?? (object)DBNull.Value);
                        cmd.Parameters.AddWithValue("@size", erpItem.Size?.Trim() ?? (object)DBNull.Value);
                        cmd.Parameters.AddWithValue("@year", erpItem.Year?.Trim() ?? (object)DBNull.Value);
                        cmd.Parameters.AddWithValue("@season", erpItem.Season?.Trim() ?? (object)DBNull.Value);
                        cmd.Parameters.AddWithValue("@brand", erpItem.Brand?.Trim() ?? (object)DBNull.Value);
                        // Map ERPNext stock_uom to both default_uom and stock_uom
                        var stockUomValue = erpItem.StockUom?.Trim() ?? (object)DBNull.Value;
                        cmd.Parameters.AddWithValue("@default_uom", stockUomValue);
                        cmd.Parameters.AddWithValue("@stock_uom", stockUomValue);
                        cmd.Parameters.AddWithValue("@barcode", erpItem.Barcode?.Trim() ?? (object)DBNull.Value);
                        cmd.Parameters.AddWithValue("@maintain_stock", maintainStock);
                        cmd.Parameters.AddWithValue("@disabled", disabled);
                        cmd.Parameters.AddWithValue("@wms_modified", wmsModifiedDate ?? (object)DBNull.Value);
                        cmd.Parameters.AddWithValue("@updated_on", updatedOnDate ?? (object)DBNull.Value);
                        
                        // Try to preserve created_at if item already exists
                        if (wmsModifiedDate.HasValue)
                        {
                            cmd.Parameters.AddWithValue("@created_at", wmsModifiedDate.Value);
                        }
                        else
                        {
                            cmd.Parameters.AddWithValue("@created_at", DBNull.Value);
                        }

                        var rowsAffected = await cmd.ExecuteNonQueryAsync();
                        
                        // Log what happened for debugging
                        if (rowsAffected == 1)
                        {
                            result.Inserted++;
                            ErrorLogService.LogInfo($"ItemSyncService: Inserted new item: {itemCode} - {itemName}");
                        }
                        else if (rowsAffected == 2)
                        {
                            result.Updated++;
                            ErrorLogService.LogInfo($"ItemSyncService: Updated existing item: {itemCode} - {itemName}");
                        }
                        else
                        {
                            // This shouldn't happen, but log it
                            ErrorLogService.LogInfo($"ItemSyncService: Unexpected rowsAffected={rowsAffected} for item: {itemCode}");
                        }
                    }
                    catch (Exception ex)
                    {
                        var errorMsg = $"Error syncing item {erpItem.ItemCode}: {ex.Message}";
                        result.Errors.Add(errorMsg);
                        ErrorLogService.LogError(errorMsg, ex);
                    }
                }

            // Update app_sync_state with max_custom_wms_modified from API response
            // This is the cursor for next incremental sync
            if (!string.IsNullOrWhiteSpace(maxCustomWmsModified))
            {
                await UpdateSyncCursorAsync(connection, "items_last_custom_wms_modified", maxCustomWmsModified);
                ErrorLogService.LogInfo($"ItemSyncService: Updated app_sync_state cursor to {maxCustomWmsModified}");
                
                // Also update settings for backward compatibility
                if (DateTime.TryParse(maxCustomWmsModified, out var cursorDate))
                {
                    settings.LastItemSyncTimestamp = cursorDate;
                    SettingsService.SaveSettings(settings);
                }
            }
            else if (result.TotalFetched > 0)
            {
                // If no cursor from API but items were synced, use current time as fallback
                var fallbackCursor = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.ffffff");
                await UpdateSyncCursorAsync(connection, "items_last_custom_wms_modified", fallbackCursor);
                settings.LastItemSyncTimestamp = DateTime.Now;
                SettingsService.SaveSettings(settings);
                ErrorLogService.LogInfo($"ItemSyncService: Updated app_sync_state cursor to {fallbackCursor} (fallback)");
            }

            result.Success = true;
            ErrorLogService.LogInfo($"Item sync completed successfully. Fetched: {result.TotalFetched}, Inserted: {result.Inserted}, Updated: {result.Updated}, Errors: {result.Errors.Count}");

            // Optional: notify push URL (webhook) after successful sync
            if (!string.IsNullOrWhiteSpace(settings.ItemSyncPushUrl))
            {
                _ = NotifyPushUrlAsync(settings.ItemSyncPushUrl, result);
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Errors.Add($"Sync failed: {ex.Message}");
            ErrorLogService.LogError("ItemSyncService: Error syncing items from ERPNext", ex);
        }

        return result;
    }

    /// <summary>
    /// POST sync summary to optional push URL (webhook). Fire-and-forget; does not affect sync result.
    /// </summary>
    private static async Task NotifyPushUrlAsync(string pushUrl, ItemSyncResult result)
    {
        try
        {
            var payload = new
            {
                @event = "item_sync_completed",
                success = result.Success,
                total_fetched = result.TotalFetched,
                inserted = result.Inserted,
                updated = result.Updated,
                errors_count = result.Errors.Count,
                completed_at = DateTime.UtcNow.ToString("O")
            };
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            var json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await client.PostAsync(pushUrl.Trim(), content);
            if (response.IsSuccessStatusCode)
                ErrorLogService.LogInfo($"ItemSyncService: Push URL notified successfully: {pushUrl}");
            else
                ErrorLogService.LogInfo($"ItemSyncService: Push URL returned {response.StatusCode}: {pushUrl}");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ItemSyncService: Push URL failed ({pushUrl})", ex);
        }
    }

    /// <summary>
    /// Get last sync cursor from app_sync_state table
    /// </summary>
    private static async Task<string?> GetLastSyncCursorAsync(MySqlConnection connection)
    {
        try
        {
            var sql = "SELECT `value` FROM app_sync_state WHERE `key` = @key LIMIT 1";
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@key", "items_last_custom_wms_modified");
            
            var result = await cmd.ExecuteScalarAsync();
            return result?.ToString();
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("ItemSyncService: Failed to get sync cursor from app_sync_state", ex);
            return null;
        }
    }

    /// <summary>
    /// Update sync cursor in app_sync_state table
    /// </summary>
    private static async Task UpdateSyncCursorAsync(MySqlConnection connection, string key, string value)
    {
        try
        {
            var sql = @"INSERT INTO app_sync_state (`key`, `value`)
                        VALUES (@key, @value)
                        ON DUPLICATE KEY UPDATE
                            `value` = VALUES(`value`),
                            updated_at = CURRENT_TIMESTAMP";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@key", key);
            cmd.Parameters.AddWithValue("@value", value);
            
            await cmd.ExecuteNonQueryAsync();
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ItemSyncService: Failed to update sync cursor in app_sync_state for key '{key}'", ex);
            // Don't throw - this is not critical for sync to succeed
        }
    }
}

/// <summary>
/// Result of item sync operation
/// </summary>
public class ItemSyncResult
{
    public bool Success { get; set; }
    public int TotalFetched { get; set; }
    public int Inserted { get; set; }
    public int Updated { get; set; }
    public List<string> Errors { get; set; } = new();
}
