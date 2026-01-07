using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Service for managing Sort Box contents derived from SORT events
/// </summary>
public static class SortBoxService
{
    /// <summary>
    /// Get box contents from SORT events in database
    /// Query WMS Scan Events where event_type = SORT_TO_BOX and box_id = boxId
    /// </summary>
    public static async Task<List<SortBoxItem>> GetBoxContentsAsync(WmsSettings settings, string boxId)
    {
        var items = new List<SortBoxItem>();
        
        try
        {
            ErrorLogService.LogInfo($"SortBoxService: Loading contents for box {boxId}");
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Query WMS Scan Events for this box
            // Events where event_type = 'SORT_TO_BOX' and box_id = boxId
            var sql = @"SELECT item_code, carton_id, qty, event_time, user_id
                        FROM tabWmsScanEvent
                        WHERE event_type = 'SORT_TO_BOX'
                        AND box_id = @box_id
                        AND item_code IS NOT NULL
                        ORDER BY event_time DESC";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@box_id", boxId);
            await using var reader = await cmd.ExecuteReaderAsync();

            // Group by item_code and carton_id to sum quantities
            var itemDict = new Dictionary<(string ItemCode, string? CartonId), SortBoxItem>();

            while (await reader.ReadAsync())
            {
                var itemCode = reader.GetString(0);
                var cartonId = reader.IsDBNull(1) ? null : reader.GetString(1);
                var qty = Convert.ToDouble(reader.GetDecimal(2));
                var eventTime = reader.GetDateTime(3);
                var userId = reader.IsDBNull(4) ? null : reader.GetString(4);

                var key = (itemCode, cartonId);
                
                if (itemDict.ContainsKey(key))
                {
                    // Update existing item - sum quantities, use latest event time
                    var existing = itemDict[key];
                    itemDict[key] = new SortBoxItem
                    {
                        ItemCode = existing.ItemCode,
                        SourceCartonId = existing.SourceCartonId,
                        Qty = existing.Qty + qty,
                        SortedOn = eventTime > existing.SortedOn ? eventTime : existing.SortedOn,
                        SortedBy = eventTime > existing.SortedOn ? (userId ?? string.Empty) : existing.SortedBy
                    };
                }
                else
                {
                    // New item
                    itemDict[key] = new SortBoxItem
                    {
                        ItemCode = itemCode,
                        SourceCartonId = cartonId,
                        Qty = qty,
                        SortedOn = eventTime,
                        SortedBy = userId ?? string.Empty
                    };
                }
            }

            items = itemDict.Values
                .OrderBy(i => i.ItemCode)
                .ToList();

            ErrorLogService.LogInfo($"SortBoxService: Found {items.Count} unique items for box {boxId}");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"SortBoxService: Error loading contents for box {boxId}", ex);
        }

        return items;
    }

}

