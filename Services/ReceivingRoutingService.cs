using System;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Service for routing received items to either Sorting (for Transfer Order) or Putaway (for storage)
/// </summary>
public static class ReceivingRoutingService
{
    /// <summary>
    /// Route received items after ASN receiving is complete
    /// Decision: If Transfer Order exists → Route to Sorting, else → Route to Putaway
    /// </summary>
    public static async Task<bool> RouteReceivedItemsAsync(
        WmsSettings settings,
        string asnNo,
        string inboundSessionTitle)
    {
        try
        {
            ErrorLogService.LogInfo($"ReceivingRoutingService: Routing items for ASN {asnNo}");

            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if Transfer Order exists for this ASN
            var toCheckSql = @"
                SELECT COUNT(*) 
                FROM tabTransferOrder 
                WHERE advance_shipping_notice = @asnNo
                  AND status IN ('Submitted', 'Active', 'In Progress')";

            await using var toCheckCmd = new MySqlCommand(toCheckSql, connection);
            toCheckCmd.Parameters.AddWithValue("@asnNo", asnNo);
            var toExists = Convert.ToInt32(await toCheckCmd.ExecuteScalarAsync()) > 0;

            if (toExists)
            {
                // Transfer Order exists → Route to Sorting
                // Items will be sorted to boxes and packed to transfer cartons
                // NO Putaway Task needed for these items (they go to showroom)
                ErrorLogService.LogInfo($"ReceivingRoutingService: Transfer Order found for ASN {asnNo}. Items will be routed to Sorting (no Putaway needed).");
                return true;
            }
            else
            {
                // No Transfer Order → Route to Putaway
                // Create Putaway Task for all received items
                ErrorLogService.LogInfo($"ReceivingRoutingService: No Transfer Order found for ASN {asnNo}. Creating Putaway Task for all items.");
                
                var success = await PutawayTaskDataService.CreatePutawayTaskFromAsnAsync(
                    settings, asnNo, inboundSessionTitle);
                
                return success;
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ReceivingRoutingService: Error routing items for ASN {asnNo}", ex);
            return false;
        }
    }

    /// <summary>
    /// Route remaining items to Putaway after sorting is complete
    /// Calculates: ASN Total Qty - Sorted Qty (from SORT_TO_BOX events)
    /// If remaining > 0, creates Putaway Task for remaining items
    /// </summary>
    public static async Task<bool> RouteRemainingItemsToPutawayAsync(
        WmsSettings settings,
        string asnNo)
    {
        try
        {
            ErrorLogService.LogInfo($"ReceivingRoutingService: Checking for remaining items after sorting for ASN {asnNo}");

            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Get ASN total quantity
            var asnTotalSql = @"
                SELECT item_code, SUM(shipped_qty) as total_qty
                FROM tabAsnItemDetails
                WHERE parent_title = @asnNo
                GROUP BY item_code";

            await using var asnTotalCmd = new MySqlCommand(asnTotalSql, connection);
            asnTotalCmd.Parameters.AddWithValue("@asnNo", asnNo);
            await using var asnTotalReader = await asnTotalCmd.ExecuteReaderAsync();

            var asnItems = new System.Collections.Generic.Dictionary<string, double>();
            while (await asnTotalReader.ReadAsync())
            {
                var itemCode = asnTotalReader.GetString(0);
                var totalQty = Convert.ToDouble(asnTotalReader.GetDecimal(1));
                asnItems[itemCode] = totalQty;
            }
            await asnTotalReader.CloseAsync();

            if (asnItems.Count == 0)
            {
                ErrorLogService.LogInfo($"ReceivingRoutingService: No items found in ASN {asnNo}");
                return true;
            }

            // Get sorted quantity from SORT_TO_BOX events
            var sortedQtySql = @"
                SELECT item_code, SUM(qty) as sorted_qty
                FROM tabWmsScanEvent
                WHERE advance_shipping_notice = @asnNo
                  AND event_type = 'SORT_TO_BOX'
                  AND item_code IS NOT NULL
                  AND qty IS NOT NULL
                GROUP BY item_code";

            await using var sortedQtyCmd = new MySqlCommand(sortedQtySql, connection);
            sortedQtyCmd.Parameters.AddWithValue("@asnNo", asnNo);
            await using var sortedQtyReader = await sortedQtyCmd.ExecuteReaderAsync();

            var sortedItems = new System.Collections.Generic.Dictionary<string, double>();
            while (await sortedQtyReader.ReadAsync())
            {
                var itemCode = sortedQtyReader.GetString(0);
                var sortedQty = Convert.ToDouble(sortedQtyReader.GetDecimal(1));
                sortedItems[itemCode] = sortedQty;
            }
            await sortedQtyReader.CloseAsync();

            // Calculate remaining items
            var remainingItems = new System.Collections.Generic.Dictionary<string, double>();
            foreach (var asnItem in asnItems)
            {
                var sortedQty = sortedItems.ContainsKey(asnItem.Key) ? sortedItems[asnItem.Key] : 0;
                var remainingQty = asnItem.Value - sortedQty;
                
                if (remainingQty > 0)
                {
                    remainingItems[asnItem.Key] = remainingQty;
                    ErrorLogService.LogInfo($"ReceivingRoutingService: Item {asnItem.Key}: ASN={asnItem.Value}, Sorted={sortedQty}, Remaining={remainingQty}");
                }
            }

            if (remainingItems.Count == 0)
            {
                ErrorLogService.LogInfo($"ReceivingRoutingService: No remaining items for ASN {asnNo}. All items were sorted.");
                return true;
            }

            // Get inbound session for this ASN
            var sessionSql = @"
                SELECT inbound_session
                FROM tabInboundSession
                WHERE asn_no = @asnNo
                ORDER BY started_at DESC
                LIMIT 1";

            await using var sessionCmd = new MySqlCommand(sessionSql, connection);
            sessionCmd.Parameters.AddWithValue("@asnNo", asnNo);
            var sessionResult = await sessionCmd.ExecuteScalarAsync();
            var inboundSessionTitle = sessionResult?.ToString() ?? string.Empty;

            if (string.IsNullOrEmpty(inboundSessionTitle))
            {
                ErrorLogService.LogError($"ReceivingRoutingService: No inbound session found for ASN {asnNo}", null);
                return false;
            }

            // Create Putaway Task for remaining items only
            ErrorLogService.LogInfo($"ReceivingRoutingService: Creating Putaway Task for {remainingItems.Count} remaining items from ASN {asnNo}");
            
            var success = await PutawayTaskDataService.CreatePutawayTaskForRemainingItemsAsync(
                settings, asnNo, inboundSessionTitle, remainingItems);

            if (success)
            {
                ErrorLogService.LogInfo($"ReceivingRoutingService: Successfully created Putaway Task for remaining items from ASN {asnNo}");
            }

            return success;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ReceivingRoutingService: Error routing remaining items for ASN {asnNo}", ex);
            return false;
        }
    }

    /// <summary>
    /// Check if items should go to Putaway (no Transfer Order or remaining items)
    /// </summary>
    public static async Task<bool> ShouldRouteToPutawayAsync(
        WmsSettings settings,
        string asnNo)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if Transfer Order exists
            var toCheckSql = @"
                SELECT COUNT(*) 
                FROM tabTransferOrder 
                WHERE advance_shipping_notice = @asnNo
                  AND status IN ('Submitted', 'Active', 'In Progress')";

            await using var toCheckCmd = new MySqlCommand(toCheckSql, connection);
            toCheckCmd.Parameters.AddWithValue("@asnNo", asnNo);
            var toExists = Convert.ToInt32(await toCheckCmd.ExecuteScalarAsync()) > 0;

            // If no Transfer Order, route to Putaway
            return !toExists;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ReceivingRoutingService: Error checking routing for ASN {asnNo}", ex);
            return true; // Default to Putaway on error
        }
    }
}

