using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Service for managing Transfer Carton contents derived from WMS Scan Events
/// </summary>
public static class TransferCartonService
{
    private static string? NormalizeBoxId(string? s) =>
        string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static string? PreferBoxId(string? a, string? b) =>
        NormalizeBoxId(a) ?? NormalizeBoxId(b);

    /// <summary>
    /// Get transfer carton contents from WMS Scan Events
    /// Query events where event_type = 'PACK_BOX_TO_TC' and tc_id = tcId
    /// </summary>
    public static async Task<List<TransferCartonItem>> GetCartonContentsAsync(WmsSettings settings, string tcId)
    {
        var items = new List<TransferCartonItem>();
        
        try
        {
            ErrorLogService.LogInfo($"TransferCartonService: Loading contents for transfer carton {tcId}");
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // First, check if tc_id column exists in tabWmsScanEvent
            var checkColumnSql = @"
                SELECT COUNT(*) 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'tabWmsScanEvent' 
                AND COLUMN_NAME = 'tc_id'";
            
            await using var checkCmd = new MySqlCommand(checkColumnSql, connection);
            var columnExists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;
            
            if (!columnExists)
            {
                ErrorLogService.LogInfo($"TransferCartonService: Column 'tc_id' does not exist in tabWmsScanEvent table");
                return items;
            }

            var checkBoxIdSql = @"
                SELECT COUNT(*) 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'tabWmsScanEvent' 
                AND COLUMN_NAME = 'box_id'";
            await using var checkBoxIdCmd = new MySqlCommand(checkBoxIdSql, connection);
            var hasBoxId = Convert.ToInt32(await checkBoxIdCmd.ExecuteScalarAsync()) > 0;

            // Query WMS Scan Events for this transfer carton
            // Get PACK_BOX_TO_TC and PACK_ITEM_TO_TC events with item_code (items packed into transfer carton)
            // CRITICAL: Group by item_code and carton_id to properly SUM all quantities
            // When the same item is scanned multiple times with the same carton_id and tc_id,
            // we need to SUM all the qty values from all events, not just use the latest value
            // Query matches user requirement: GROUP BY item_code, carton_id (without tc_id)
            // box_id on the same rows links the scan to the sort box used when packing into this TC
            // This query MUST match the backend API query exactly
            var sql = hasBoxId
                ? @"SELECT 
                            item_code,
                            carton_id AS source_carton,
                            MAX(NULLIF(TRIM(box_id), '')) AS sort_box_id,
                            SUM(qty) AS quantity,
                            MAX(user_id) AS packed_by,
                            MAX(event_time) AS packed_on
                        FROM tabWmsScanEvent
                        WHERE tc_id = @tc_id
                        AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
                        AND item_code IS NOT NULL
                        AND item_code != ''
                        AND qty > 0
                        GROUP BY item_code, carton_id
                        ORDER BY packed_on DESC"
                : @"SELECT 
                            item_code,
                            carton_id AS source_carton,
                            SUM(qty) AS quantity,
                            MAX(user_id) AS packed_by,
                            MAX(event_time) AS packed_on
                        FROM tabWmsScanEvent
                        WHERE tc_id = @tc_id
                        AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
                        AND item_code IS NOT NULL
                        AND item_code != ''
                        AND qty > 0
                        GROUP BY item_code, carton_id
                        ORDER BY packed_on DESC";
            
            ErrorLogService.LogInfo($"TransferCartonService: Executing query with tc_id = '{tcId}'");
            ErrorLogService.LogInfo($"TransferCartonService: SQL = {sql}");
            
            // Also check how many events exist for this tc_id (for debugging)
            var countSql = @"SELECT COUNT(*) FROM tabWmsScanEvent WHERE tc_id = @tc_id";
            await using var countCmd = new MySqlCommand(countSql, connection);
            countCmd.Parameters.AddWithValue("@tc_id", tcId);
            var totalEvents = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
            ErrorLogService.LogInfo($"TransferCartonService: Total events with tc_id = '{tcId}': {totalEvents}");
            
            // Check events with item_code
            var eventsWithItemCodeSql = @"SELECT COUNT(*) FROM tabWmsScanEvent WHERE tc_id = @tc_id AND item_code IS NOT NULL";
            await using var countItemCmd = new MySqlCommand(eventsWithItemCodeSql, connection);
            countItemCmd.Parameters.AddWithValue("@tc_id", tcId);
            var eventsWithItemCode = Convert.ToInt32(await countItemCmd.ExecuteScalarAsync());
            ErrorLogService.LogInfo($"TransferCartonService: Events with item_code: {eventsWithItemCode}");
            
            // Check PACK_BOX_TO_TC events
            var packEventsSql = @"SELECT COUNT(*) FROM tabWmsScanEvent WHERE tc_id = @tc_id AND event_type = 'PACK_BOX_TO_TC'";
            await using var countPackCmd = new MySqlCommand(packEventsSql, connection);
            countPackCmd.Parameters.AddWithValue("@tc_id", tcId);
            var packEvents = Convert.ToInt32(await countPackCmd.ExecuteScalarAsync());
            ErrorLogService.LogInfo($"TransferCartonService: PACK_BOX_TO_TC events: {packEvents}");
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@tc_id", tcId);
            await using var reader = await cmd.ExecuteReaderAsync();

            // Results are already grouped and summed by SQL query
            var itemDict = new Dictionary<(string ItemCode, string? CartonId), TransferCartonItem>();
            int rowCount = 0;

            while (await reader.ReadAsync())
            {
                rowCount++;
                var itemCode = reader.IsDBNull(0) ? null : reader.GetString(0);
                var sourceCartonId = reader.IsDBNull(1) ? null : reader.GetString(1);
                string? boxId = null;
                int qtyOrd;
                int pbOrd;
                int poOrd;
                if (hasBoxId)
                {
                    boxId = reader.IsDBNull(2) ? null : reader.GetString(2);
                    qtyOrd = 3;
                    pbOrd = 4;
                    poOrd = 5;
                }
                else
                {
                    qtyOrd = 2;
                    pbOrd = 3;
                    poOrd = 4;
                }

                var quantity = Convert.ToDouble(reader.GetDecimal(qtyOrd)); // Already summed by SQL (column name: quantity)
                var packedBy = reader.IsDBNull(pbOrd) ? null : reader.GetString(pbOrd);
                var packedOn = reader.GetDateTime(poOrd);

                ErrorLogService.LogInfo($"TransferCartonService: Found grouped item - ItemCode: {itemCode ?? "NULL"}, SourceCarton: {sourceCartonId ?? "NULL"}, BoxId: {boxId ?? "NULL"}, Quantity: {quantity}");

                // Skip events without item_code
                if (string.IsNullOrEmpty(itemCode))
                {
                    ErrorLogService.LogInfo($"TransferCartonService: Skipping row without item_code");
                    continue;
                }

                var key = (itemCode, sourceCartonId);
                
                // Since SQL already groups by item_code and carton_id, we should not have duplicates
                // If a duplicate is found, REPLACE (not add) - the SQL query already summed correctly
                if (itemDict.ContainsKey(key))
                {
                    // This shouldn't happen if SQL grouping works correctly, but if it does, REPLACE not ADD
                    ErrorLogService.LogInfo($"TransferCartonService: WARNING - Duplicate key found after SQL grouping: {itemCode} + {sourceCartonId}. Replacing quantity (not adding).");
                    var existing = itemDict[key];
                    itemDict[key] = new TransferCartonItem
                    {
                        ItemCode = existing.ItemCode,
                        SourceCartonId = existing.SourceCartonId,
                        BoxId = PreferBoxId(boxId, existing.BoxId),
                        Qty = quantity, // REPLACE with new quantity (SQL already summed correctly)
                        PackedOn = packedOn > existing.PackedOn ? packedOn : existing.PackedOn,
                        PackedBy = packedOn > existing.PackedOn ? (packedBy ?? string.Empty) : existing.PackedBy
                    };
                }
                else
                {
                    // New item (already grouped and summed by SQL)
                    itemDict[key] = new TransferCartonItem
                    {
                        ItemCode = itemCode,
                        SourceCartonId = sourceCartonId,
                        BoxId = NormalizeBoxId(boxId),
                        Qty = quantity, // Use the summed quantity from SQL
                        PackedOn = packedOn,
                        PackedBy = packedBy ?? string.Empty
                    };
                }
            }

            ErrorLogService.LogInfo($"TransferCartonService: Processed {rowCount} rows from database");
            
            // Close the reader before executing new queries
            await reader.CloseAsync();

            // If no events found with tc_id, try fallback: derive from boxes matching ASN/TO/Store or Material Request
            // Also try fallback if events exist but don't have tc_id populated (mobile app might not send tc_id)
            if (itemDict.Count == 0)
            {
                ErrorLogService.LogInfo($"TransferCartonService: No events found with tc_id. Trying fallback: derive from boxes matching transfer carton criteria.");
                
                // Get transfer carton details to match boxes
                // Detect column names first
                var detectColumnsSql = @"SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                                        WHERE TABLE_SCHEMA = DATABASE() 
                                        AND TABLE_NAME = 'tabTransferCarton'
                                        AND COLUMN_NAME IN ('asn_no', 'advance_shipping_notice', 'to_no', 'transfer_order', 'store', 'created_on', 'sealed_on')";
                await using var detectCmd = new MySqlCommand(detectColumnsSql, connection);
                await using var detectReader = await detectCmd.ExecuteReaderAsync();
                var existingColumns = new HashSet<string>();
                while (await detectReader.ReadAsync())
                {
                    existingColumns.Add(detectReader.GetString(0));
                }
                await detectReader.CloseAsync();
                
                var asnColumn = existingColumns.Contains("asn_no") ? "asn_no" : 
                               (existingColumns.Contains("advance_shipping_notice") ? "advance_shipping_notice" : "asn_no");
                var toColumn = existingColumns.Contains("to_no") ? "to_no" : 
                              (existingColumns.Contains("transfer_order") ? "transfer_order" : "to_no");
                
                var tcSql = $@"SELECT {asnColumn}, {toColumn}, store, created_on, sealed_on
                             FROM tabTransferCarton 
                             WHERE tc_id = @tc_id";
                await using var tcCmd = new MySqlCommand(tcSql, connection);
                tcCmd.Parameters.AddWithValue("@tc_id", tcId);
                await using var tcReader = await tcCmd.ExecuteReaderAsync();
                
                string? asnNo = null;
                string? toNo = null;
                string? transferOrder = null;
                string? store = null;
                DateTime? createdOn = null;
                DateTime? sealedOn = null;
                
                if (await tcReader.ReadAsync())
                {
                    asnNo = tcReader.IsDBNull(0) ? null : tcReader.GetString(0);
                    toNo = tcReader.IsDBNull(1) ? null : tcReader.GetString(1);
                    transferOrder = toNo; // Use toNo as transferOrder (it contains MR number for Material Requests)
                    store = tcReader.IsDBNull(2) ? null : tcReader.GetString(2);
                    createdOn = tcReader.IsDBNull(3) ? null : tcReader.GetDateTime(3);
                    sealedOn = tcReader.IsDBNull(4) ? null : tcReader.GetDateTime(4);
                }
                await tcReader.CloseAsync(); // Close immediately after reading
                
                // Use toNo if transferOrder is null
                if (string.IsNullOrEmpty(transferOrder))
                {
                    transferOrder = toNo;
                }
                
                // Check if this is a Material Request transfer carton (TO starts with "MR-")
                bool isMaterialRequest = !string.IsNullOrEmpty(transferOrder) && 
                                         (transferOrder.StartsWith("MR-", StringComparison.OrdinalIgnoreCase) || 
                                          System.Text.RegularExpressions.Regex.IsMatch(transferOrder, @"^MR-\d+$", System.Text.RegularExpressions.RegexOptions.IgnoreCase));
                
                if (isMaterialRequest)
                {
                    // Material Request fallback: Find events by transfer_order (MR number) and time window
                    ErrorLogService.LogInfo($"TransferCartonService: Material Request transfer carton detected. Looking for events by transfer_order={transferOrder}");
                    
                    // Build query to find PACK_BOX_TO_TC or PACK_ITEM_TO_TC events for this Material Request
                    // Use time window around TC creation/seal time if available
                    // Also check if events have NULL tc_id (mobile app might not be sending tc_id)
                    
                    // Check if material_request column exists
                    var checkMaterialRequestColumn = @"SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                                                      WHERE TABLE_SCHEMA = DATABASE() 
                                                      AND TABLE_NAME = 'tabWmsScanEvent' 
                                                      AND COLUMN_NAME = 'material_request'";
                    await using var checkColCmd = new MySqlCommand(checkMaterialRequestColumn, connection);
                    var hasMaterialRequestColumn = Convert.ToInt32(await checkColCmd.ExecuteScalarAsync()) > 0;
                    
                    var mrEventsSql = new System.Text.StringBuilder();
                    mrEventsSql.Append(@"SELECT item_code, carton_id AS source_carton, ");
                    if (hasBoxId)
                    {
                        mrEventsSql.Append(@"MAX(NULLIF(TRIM(box_id), '')) AS sort_box_id, ");
                    }

                    mrEventsSql.Append(@"SUM(qty) AS quantity, MAX(user_id) AS packed_by, MAX(event_time) AS packed_on
                                        FROM tabWmsScanEvent
                                        WHERE transfer_order = @transfer_order");
                    
                    if (hasMaterialRequestColumn)
                    {
                        mrEventsSql.Append(" OR material_request = @transfer_order");
                    }
                    
                    mrEventsSql.Append(@"
                                        AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
                                        AND item_code IS NOT NULL
                                        AND item_code != ''
                                        AND (tc_id IS NULL OR tc_id = @tc_id)");
                    
                    var mrParams = new List<MySqlParameter>
                    {
                        new MySqlParameter("@transfer_order", transferOrder),
                        new MySqlParameter("@tc_id", tcId)
                    };
                    
                    // Add time window if we have TC creation/seal times
                    // For "Created" status: Look back before TC creation (events might happen before TC is created)
                    // For "Sealed" status: Use TC creation to seal time + buffer
                    if (createdOn.HasValue || sealedOn.HasValue)
                    {
                        DateTime startTime;
                        DateTime endTime;
                        
                        if (sealedOn.HasValue)
                        {
                            // Sealed: Look back 6 hours before creation (events might happen before TC is created)
                            // End at seal time + 2 hours buffer
                            startTime = createdOn.HasValue ? createdOn.Value.AddHours(-6) : sealedOn.Value.AddHours(-6);
                            endTime = sealedOn.Value.AddHours(2);
                        }
                        else
                        {
                            // Created (not sealed): Look back 6 hours before creation and forward to Now (createdOn has value when sealedOn does not and outer condition is true)
                            startTime = createdOn!.Value.AddHours(-6);
                            endTime = DateTime.Now;
                        }
                        
                        mrEventsSql.Append(" AND event_time >= @start_time AND event_time <= @end_time");
                        mrParams.Add(new MySqlParameter("@start_time", startTime));
                        mrParams.Add(new MySqlParameter("@end_time", endTime));
                        ErrorLogService.LogInfo($"TransferCartonService: Using time window: {startTime:yyyy-MM-dd HH:mm:ss} to {endTime:yyyy-MM-dd HH:mm:ss} (TC status: {(sealedOn.HasValue ? "Sealed" : "Created")})");
                    }
                    else
                    {
                        // If no time window, use a broader window (last 24 hours)
                        var endTime = DateTime.Now;
                        var startTime = endTime.AddHours(-24);
                        mrEventsSql.Append(" AND event_time >= @start_time AND event_time <= @end_time");
                        mrParams.Add(new MySqlParameter("@start_time", startTime));
                        mrParams.Add(new MySqlParameter("@end_time", endTime));
                        ErrorLogService.LogInfo($"TransferCartonService: Using default time window (last 24 hours): {startTime:yyyy-MM-dd HH:mm:ss} to {endTime:yyyy-MM-dd HH:mm:ss}");
                    }
                    
                    mrEventsSql.Append(" GROUP BY item_code, carton_id ORDER BY packed_on DESC");
                    
                    await using var mrCmd = new MySqlCommand(mrEventsSql.ToString(), connection);
                    foreach (var param in mrParams)
                    {
                        mrCmd.Parameters.Add(param);
                    }
                    
                    await using var mrReader = await mrCmd.ExecuteReaderAsync();
                    
                    while (await mrReader.ReadAsync())
                    {
                        var itemCode = mrReader.IsDBNull(0) ? null : mrReader.GetString(0);
                        var sourceCartonId = mrReader.IsDBNull(1) ? null : mrReader.GetString(1);
                        string? mrBoxId = null;
                        int mrQtyOrd;
                        int mrPbOrd;
                        int mrPoOrd;
                        if (hasBoxId)
                        {
                            mrBoxId = mrReader.IsDBNull(2) ? null : mrReader.GetString(2);
                            mrQtyOrd = 3;
                            mrPbOrd = 4;
                            mrPoOrd = 5;
                        }
                        else
                        {
                            mrQtyOrd = 2;
                            mrPbOrd = 3;
                            mrPoOrd = 4;
                        }

                        var quantity = Convert.ToDouble(mrReader.GetDecimal(mrQtyOrd));
                        var packedBy = mrReader.IsDBNull(mrPbOrd) ? null : mrReader.GetString(mrPbOrd);
                        var packedOn = mrReader.GetDateTime(mrPoOrd);
                        
                        if (!string.IsNullOrEmpty(itemCode))
                        {
                            var key = (itemCode, sourceCartonId);
                            
                            if (itemDict.ContainsKey(key))
                            {
                                // REPLACE (not add) - SQL already summed correctly
                                var existing = itemDict[key];
                                itemDict[key] = new TransferCartonItem
                                {
                                    ItemCode = existing.ItemCode,
                                    SourceCartonId = existing.SourceCartonId,
                                    BoxId = PreferBoxId(mrBoxId, existing.BoxId),
                                    Qty = quantity, // REPLACE with new quantity (SQL already summed correctly)
                                    PackedOn = packedOn > existing.PackedOn ? packedOn : existing.PackedOn,
                                    PackedBy = packedOn > existing.PackedOn ? (packedBy ?? string.Empty) : existing.PackedBy
                                };
                            }
                            else
                            {
                                itemDict[key] = new TransferCartonItem
                                {
                                    ItemCode = itemCode,
                                    SourceCartonId = sourceCartonId,
                                    BoxId = NormalizeBoxId(mrBoxId),
                                    Qty = quantity,
                                    PackedOn = packedOn,
                                    PackedBy = packedBy ?? string.Empty
                                };
                            }
                        }
                    }
                    await mrReader.CloseAsync();
                    
                    ErrorLogService.LogInfo($"TransferCartonService: Found {itemDict.Count} items for Material Request {transferOrder} via fallback");
                }
                else if (!string.IsNullOrEmpty(asnNo) && !string.IsNullOrEmpty(toNo) && !string.IsNullOrEmpty(store))
                {
                    ErrorLogService.LogInfo($"TransferCartonService: Transfer carton details - ASN: {asnNo}, TO: {toNo}, Store: {store}");
                    
                    // Detect ASN column name in tabSortBox
                    var sortBoxAsnColumnCheck = @"SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                                          WHERE TABLE_SCHEMA = DATABASE() 
                                          AND TABLE_NAME = 'tabSortBox' 
                                          AND COLUMN_NAME IN ('advance_shipping_notice', 'asn_no')";
                    await using var sortBoxAsnColCmd = new MySqlCommand(sortBoxAsnColumnCheck, connection);
                    await using var sortBoxAsnColReader = await sortBoxAsnColCmd.ExecuteReaderAsync();
                    var sortBoxAsnColumn = "advance_shipping_notice"; // default
                    if (await sortBoxAsnColReader.ReadAsync())
                    {
                        sortBoxAsnColumn = sortBoxAsnColReader.GetString(0);
                    }
                    await sortBoxAsnColReader.CloseAsync();
                    
                    // Detect TO column name in tabSortBox
                    var sortBoxToColumnCheck = @"SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                                         WHERE TABLE_SCHEMA = DATABASE() 
                                         AND TABLE_NAME = 'tabSortBox' 
                                         AND COLUMN_NAME IN ('transfer_order', 'to_no')";
                    await using var sortBoxToColCmd = new MySqlCommand(sortBoxToColumnCheck, connection);
                    await using var sortBoxToColReader = await sortBoxToColCmd.ExecuteReaderAsync();
                    var sortBoxToColumn = "transfer_order"; // default
                    if (await sortBoxToColReader.ReadAsync())
                    {
                        sortBoxToColumn = sortBoxToColReader.GetString(0);
                    }
                    await sortBoxToColReader.CloseAsync();
                    
                    // Find boxes matching this transfer carton's ASN, TO, and Store
                    var boxSql = $@"SELECT box_id FROM tabSortBox 
                                   WHERE {sortBoxAsnColumn} = @asn 
                                   AND {sortBoxToColumn} = @to 
                                   AND store = @store";
                    await using var boxCmd = new MySqlCommand(boxSql, connection);
                    boxCmd.Parameters.AddWithValue("@asn", asnNo ?? "");
                    boxCmd.Parameters.AddWithValue("@to", toNo ?? "");
                    boxCmd.Parameters.AddWithValue("@store", store ?? "");
                    await using var boxReader = await boxCmd.ExecuteReaderAsync();
                    
                    var boxIds = new List<string>();
                    while (await boxReader.ReadAsync())
                    {
                        boxIds.Add(boxReader.GetString(0));
                    }
                    await boxReader.CloseAsync();
                    
                    ErrorLogService.LogInfo($"TransferCartonService: Found {boxIds.Count} boxes matching ASN={asnNo}, TO={toNo}, Store={store}");
                    
                    // Get contents from SORT_TO_BOX events for these boxes
                    if (boxIds.Count > 0)
                    {
                        var boxIdsParam = string.Join(",", boxIds.Select((_, i) => $"@box{i}"));
                        var sortEventsSql = hasBoxId
                            ? $@"SELECT item_code, carton_id, box_id, qty, event_time, user_id
                                              FROM tabWmsScanEvent
                                              WHERE event_type = 'SORT_TO_BOX'
                                              AND box_id IN ({boxIdsParam})
                                              AND item_code IS NOT NULL
                                              ORDER BY event_time DESC"
                            : $@"SELECT item_code, carton_id, qty, event_time, user_id
                                              FROM tabWmsScanEvent
                                              WHERE event_type = 'SORT_TO_BOX'
                                              AND box_id IN ({boxIdsParam})
                                              AND item_code IS NOT NULL
                                              ORDER BY event_time DESC";
                        
                        await using var sortCmd = new MySqlCommand(sortEventsSql, connection);
                        for (int i = 0; i < boxIds.Count; i++)
                        {
                            sortCmd.Parameters.AddWithValue($"@box{i}", boxIds[i]);
                        }
                        await using var sortReader = await sortCmd.ExecuteReaderAsync();
                        
                        while (await sortReader.ReadAsync())
                        {
                            var itemCode = sortReader.GetString(0);
                            var cartonId = sortReader.IsDBNull(1) ? null : sortReader.GetString(1);
                            string? sortBoxId = null;
                            int sqOrd;
                            int stOrd;
                            int suOrd;
                            if (hasBoxId)
                            {
                                sortBoxId = sortReader.IsDBNull(2) ? null : sortReader.GetString(2);
                                sqOrd = 3;
                                stOrd = 4;
                                suOrd = 5;
                            }
                            else
                            {
                                sqOrd = 2;
                                stOrd = 3;
                                suOrd = 4;
                            }

                            var qty = Convert.ToDouble(sortReader.GetDecimal(sqOrd));
                            var eventTime = sortReader.GetDateTime(stOrd);
                            var userId = sortReader.IsDBNull(suOrd) ? null : sortReader.GetString(suOrd);
                            
                            var key = (itemCode, cartonId);
                            
                            if (itemDict.ContainsKey(key))
                            {
                                // For SORT_TO_BOX fallback, we need to sum because items from multiple boxes might have same item_code+carton_id
                                // But if the main query already found this item, we should use the main query's summed quantity
                                // Only sum if this is from the fallback and main query didn't find it
                                var existing = itemDict[key];
                                itemDict[key] = new TransferCartonItem
                                {
                                    ItemCode = existing.ItemCode,
                                    SourceCartonId = existing.SourceCartonId,
                                    BoxId = PreferBoxId(existing.BoxId, sortBoxId),
                                    Qty = existing.Qty + qty, // Sum for SORT_TO_BOX fallback (multiple boxes)
                                    PackedOn = eventTime > existing.PackedOn ? eventTime : existing.PackedOn,
                                    PackedBy = eventTime > existing.PackedOn ? (userId ?? string.Empty) : existing.PackedBy
                                };
                            }
                            else
                            {
                                itemDict[key] = new TransferCartonItem
                                {
                                    ItemCode = itemCode,
                                    SourceCartonId = cartonId,
                                    BoxId = NormalizeBoxId(sortBoxId),
                                    Qty = qty,
                                    PackedOn = eventTime,
                                    PackedBy = userId ?? string.Empty
                                };
                            }
                        }
                        
                        ErrorLogService.LogInfo($"TransferCartonService: Derived {itemDict.Count} items from {boxIds.Count} boxes");
                    }
                }
            }

            items = itemDict.Values
                .OrderBy(i => i.ItemCode)
                .ToList();

            ErrorLogService.LogInfo($"TransferCartonService: Found {items.Count} unique items for transfer carton {tcId}");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"TransferCartonService: Error loading contents for transfer carton {tcId}", ex);
            ErrorLogService.LogError($"TransferCartonService: Exception details - {ex.GetType().Name}: {ex.Message}", ex);
            if (ex.InnerException != null)
            {
                ErrorLogService.LogError($"TransferCartonService: Inner exception - {ex.InnerException.Message}", ex.InnerException);
            }
        }

        return items;
    }

    /// <summary>
    /// Packing-list lines for multiple transfer cartons, keyed by sort box (<c>box_id</c> on scan events).
    /// When <c>box_id</c> is missing or the column does not exist, rows are grouped under <c>(No sort box) {tc_id}</c>.
    /// </summary>
    public static async Task<List<SortBoxPackingListRow>> GetPackingListRowsBySortBoxAsync(
        WmsSettings settings,
        IReadOnlyList<string> tcIds)
    {
        var rows = new List<SortBoxPackingListRow>();
        if (tcIds == null || tcIds.Count == 0)
            return rows;

        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var checkTcSql = @"
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabWmsScanEvent' AND COLUMN_NAME = 'tc_id'";
            await using var checkTcCmd = new MySqlCommand(checkTcSql, connection);
            if (Convert.ToInt32(await checkTcCmd.ExecuteScalarAsync()) == 0)
                return rows;

            var checkBoxSql = @"
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabWmsScanEvent' AND COLUMN_NAME = 'box_id'";
            await using var checkBoxCmd = new MySqlCommand(checkBoxSql, connection);
            var hasBoxId = Convert.ToInt32(await checkBoxCmd.ExecuteScalarAsync()) > 0;

            var placeholders = string.Join(",", tcIds.Select((_, i) => $"@tc{i}"));
            var boxKeyExpr = hasBoxId
                ? "COALESCE(NULLIF(TRIM(box_id), ''), CONCAT('(No sort box) ', tc_id))"
                : "CONCAT('(No sort box) ', tc_id)";

            var sql = $@"SELECT 
                            {boxKeyExpr} AS box_key,
                            tc_id,
                            item_code,
                            carton_id AS source_carton,
                            SUM(qty) AS quantity
                        FROM tabWmsScanEvent
                        WHERE tc_id IN ({placeholders})
                        AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
                        AND item_code IS NOT NULL
                        AND item_code != ''
                        AND qty > 0
                        GROUP BY {boxKeyExpr}, tc_id, item_code, carton_id
                        ORDER BY box_key, tc_id, item_code";

            await using var cmd = new MySqlCommand(sql, connection);
            for (var i = 0; i < tcIds.Count; i++)
                cmd.Parameters.AddWithValue($"@tc{i}", tcIds[i]);

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var boxKey = reader.IsDBNull(0) ? "" : reader.GetString(0);
                var tcId = reader.IsDBNull(1) ? "" : reader.GetString(1);
                var itemCode = reader.IsDBNull(2) ? "" : reader.GetString(2);
                var source = reader.IsDBNull(3) ? null : reader.GetString(3);
                var qty = Convert.ToDouble(reader.GetDecimal(4));
                if (string.IsNullOrEmpty(itemCode))
                    continue;
                rows.Add(new SortBoxPackingListRow
                {
                    BoxKey = boxKey,
                    TcId = tcId,
                    ItemCode = itemCode,
                    SourceCartonId = source,
                    Qty = qty
                });
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("TransferCartonService: GetPackingListRowsBySortBoxAsync failed", ex);
        }

        return rows;
    }
}

