using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class TransferCartonDataService
{
    /// <summary>
    /// Get all Transfer Cartons from database
    /// </summary>
    public static async Task<List<TransferCarton>> GetTransferCartonsAsync(WmsSettings settings)
    {
        var cartons = new List<TransferCarton>();
        
        try
        {
            ErrorLogService.LogInfo("Loading Transfer Cartons from database...");
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Detect schema - check which column names exist
            var schemaInfo = await DetectSchemaAsync(connection);
            ErrorLogService.LogInfo($"Detected schema: AsnColumn={schemaInfo.AsnColumn}, ToColumn={schemaInfo.ToColumn}");

            // Build SQL query based on detected schema
            var sql = $@"SELECT tc_id, status, {schemaInfo.AsnColumn}, {schemaInfo.ToColumn}, store, 
                               created_by, created_on, sealed_by, sealed_on, dispatched_on, remarks
                        FROM tabTransferCarton
                        ORDER BY created_on DESC, tc_id";
            
            ErrorLogService.LogInfo($"Executing query: {sql}");
            await using var cmd = new MySqlCommand(sql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();

            int rowCount = 0;
            while (await reader.ReadAsync())
            {
                rowCount++;
                cartons.Add(new TransferCarton
                {
                    TcId = reader.GetString(0),
                    Status = reader.GetString(1),
                    AdvanceShippingNotice = reader.IsDBNull(2) ? null : reader.GetString(2), // Handle NULL for Material Request transfer cartons
                    TransferOrder = reader.IsDBNull(3) ? null : reader.GetString(3), // Handle NULL for Material Request transfer cartons
                    Store = reader.GetString(4),
                    CreatedBy = reader.IsDBNull(5) ? null : reader.GetString(5),
                    CreatedOn = reader.GetDateTime(6),
                    SealedBy = reader.IsDBNull(7) ? null : reader.GetString(7),
                    SealedOn = reader.IsDBNull(8) ? null : reader.GetDateTime(8),
                    DispatchedOn = reader.IsDBNull(9) ? null : reader.GetDateTime(9),
                    Remarks = reader.IsDBNull(10) ? null : reader.GetString(10)
                });
            }
            
            ErrorLogService.LogInfo($"Loaded {rowCount} transfer cartons from database");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Transfer Cartons from database", ex);
        }

        return cartons;
    }

    /// <summary>
    /// Detect which schema is being used by checking which columns exist
    /// </summary>
    private static async Task<(string AsnColumn, string ToColumn)> DetectSchemaAsync(MySqlConnection connection)
    {
        try
        {
            ErrorLogService.LogInfo("TransferCartonDataService: Starting schema detection");
            
            // Check which ASN column exists
            var asnColumn = "advance_shipping_notice"; // Default (desktop app format)
            var toColumn = "transfer_order"; // Default (desktop app format)
            
            await using var checkCmd = new MySqlCommand(@"
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'tabTransferCarton'
                AND COLUMN_NAME IN ('advance_shipping_notice', 'asn_no', 'transfer_order', 'to_no')
            ", connection);
            
            await using var reader = await checkCmd.ExecuteReaderAsync();
            var existingColumns = new HashSet<string>();
            while (await reader.ReadAsync())
            {
                existingColumns.Add(reader.GetString(0));
            }
            await reader.CloseAsync();

            // Determine ASN column
            if (existingColumns.Contains("asn_no"))
            {
                asnColumn = "asn_no";
                ErrorLogService.LogInfo("TransferCartonDataService: Found column 'asn_no'");
            }
            else if (existingColumns.Contains("advance_shipping_notice"))
            {
                asnColumn = "advance_shipping_notice";
                ErrorLogService.LogInfo("TransferCartonDataService: Found column 'advance_shipping_notice'");
            }

            // Determine Transfer Order column
            if (existingColumns.Contains("to_no"))
            {
                toColumn = "to_no";
                ErrorLogService.LogInfo("TransferCartonDataService: Found column 'to_no'");
            }
            else if (existingColumns.Contains("transfer_order"))
            {
                toColumn = "transfer_order";
                ErrorLogService.LogInfo("TransferCartonDataService: Found column 'transfer_order'");
            }

            ErrorLogService.LogInfo($"TransferCartonDataService: Returning - AsnColumn={asnColumn}, ToColumn={toColumn}");
            return (asnColumn, toColumn);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("TransferCartonDataService: Error detecting schema, using defaults", ex);
            // Return defaults
            return ("advance_shipping_notice", "transfer_order");
        }
    }

    /// <summary>
    /// Dispatch a transfer carton (update status to Dispatched and reduce stock for Material Requests)
    /// Note: Stock reduction is handled by the API. This method only updates the status.
    /// For full dispatch with stock reduction, use the API endpoint POST /api/transfer-cartons/dispatch
    /// </summary>
    public static async Task<(bool Success, string Message)> DispatchTransferCartonAsync(
        WmsSettings settings, 
        string tcId, 
        string? dispatchedBy = null)
    {
        try
        {
            ErrorLogService.LogInfo($"TransferCartonDataService: Dispatching transfer carton {tcId}");
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            await using var transaction = await connection.BeginTransactionAsync();

            try
            {
                // Get transfer carton status
                var checkSql = @"SELECT status FROM tabTransferCarton WHERE tc_id = @tcId";
                await using var checkCmd = new MySqlCommand(checkSql, connection, transaction);
                checkCmd.Parameters.AddWithValue("@tcId", tcId);
                var currentStatus = await checkCmd.ExecuteScalarAsync() as string;

                if (currentStatus == null)
                {
                    await transaction.RollbackAsync();
                    return (false, $"Transfer carton {tcId} not found");
                }

                if (currentStatus != "Sealed")
                {
                    await transaction.RollbackAsync();
                    return (false, $"Transfer carton must be Sealed before dispatch. Current status: {currentStatus}");
                }

                // Detect schema for column names
                var schemaInfo = await DetectSchemaAsync(connection);

                // Get transfer carton details to check if it's a Material Request
                var tcDetailsSql = $@"SELECT {schemaInfo.ToColumn} as transfer_order, created_on
                                      FROM tabTransferCarton
                                      WHERE tc_id = @tcId";
                await using var tcDetailsCmd = new MySqlCommand(tcDetailsSql, connection, transaction);
                tcDetailsCmd.Parameters.AddWithValue("@tcId", tcId);
                await using var tcDetailsReader = await tcDetailsCmd.ExecuteReaderAsync();
                
                string? transferOrder = null;
                DateTime? tcCreatedOn = null;
                
                if (await tcDetailsReader.ReadAsync())
                {
                    transferOrder = tcDetailsReader.IsDBNull(0) ? null : tcDetailsReader.GetString(0);
                    tcCreatedOn = tcDetailsReader.IsDBNull(1) ? null : tcDetailsReader.GetDateTime(1);
                }
                await tcDetailsReader.CloseAsync();

                // Update transfer carton status to Dispatched
                var updateSql = $@"UPDATE tabTransferCarton 
                                  SET status = 'Dispatched',
                                      dispatched_by = @dispatchedBy,
                                      dispatched_on = NOW(),
                                      updated_on = NOW()
                                  WHERE tc_id = @tcId";

                await using var updateCmd = new MySqlCommand(updateSql, connection, transaction);
                updateCmd.Parameters.AddWithValue("@tcId", tcId);
                updateCmd.Parameters.AddWithValue("@dispatchedBy", dispatchedBy ?? (object)DBNull.Value);
                
                var rowsAffected = await updateCmd.ExecuteNonQueryAsync();

                if (rowsAffected == 0)
                {
                    await transaction.RollbackAsync();
                    return (false, $"Transfer carton {tcId} not found or could not be updated");
                }

                // For Material Request transfer cartons, reduce stock when dispatched
                if (!string.IsNullOrEmpty(transferOrder) && 
                    (transferOrder.StartsWith("MR-", StringComparison.OrdinalIgnoreCase) ||
                     System.Text.RegularExpressions.Regex.IsMatch(transferOrder, @"^MR-\d+$", System.Text.RegularExpressions.RegexOptions.IgnoreCase)))
                {
                    var materialRequest = transferOrder;
                    ErrorLogService.LogInfo($"TransferCartonDataService: Material Request transfer carton detected: {materialRequest}");

                    // Get Material Request details
                    var mrSql = @"SELECT title, from_warehouse, to_showroom
                                  FROM tabMaterialRequest
                                  WHERE title = @materialRequest";
                    await using var mrCmd = new MySqlCommand(mrSql, connection, transaction);
                    mrCmd.Parameters.AddWithValue("@materialRequest", materialRequest);
                    await using var mrReader = await mrCmd.ExecuteReaderAsync();

                    if (await mrReader.ReadAsync())
                    {
                        var warehouse = mrReader.GetString(1);
                        await mrReader.CloseAsync();

                        // Check which columns exist in tabWmsScanEvent for source bin
                        var eventColsSql = @"SELECT COLUMN_NAME 
                                            FROM INFORMATION_SCHEMA.COLUMNS 
                                            WHERE TABLE_SCHEMA = DATABASE() 
                                            AND TABLE_NAME = 'tabWmsScanEvent' 
                                            AND COLUMN_NAME IN ('rack', 'bin', 'location_id', 'source_bin')";
                        await using var eventColsCmd = new MySqlCommand(eventColsSql, connection, transaction);
                        await using var eventColsReader = await eventColsCmd.ExecuteReaderAsync();
                        
                        var hasRack = false;
                        var hasBin = false;
                        var hasLocationId = false;
                        var hasSourceBin = false;
                        
                        while (await eventColsReader.ReadAsync())
                        {
                            var colName = eventColsReader.GetString(0);
                            if (colName == "rack") hasRack = true;
                            if (colName == "bin") hasBin = true;
                            if (colName == "location_id") hasLocationId = true;
                            if (colName == "source_bin") hasSourceBin = true;
                        }
                        await eventColsReader.CloseAsync();

                        // Build source bin expression
                        // Note: If rack and bin are the same value, we should use just one to avoid duplication
                        string sourceBinExpr;
                        if (hasSourceBin)
                        {
                            sourceBinExpr = "source_bin";
                        }
                        else if (hasLocationId)
                        {
                            sourceBinExpr = "location_id";
                        }
                        else if (hasRack && hasBin)
                        {
                            // Use just bin if rack and bin might be the same (common in some systems)
                            // The bin field often contains the full location
                            sourceBinExpr = "bin";
                        }
                        else if (hasRack)
                        {
                            sourceBinExpr = "rack";
                        }
                        else if (hasBin)
                        {
                            sourceBinExpr = "bin";
                        }
                        else
                        {
                            sourceBinExpr = "NULL";
                        }

                        // Get items from transfer carton with quantities and source bins
                        var startTime = tcCreatedOn?.AddHours(-6) ?? DateTime.Now.AddHours(-6);
                        var endTime = DateTime.Now;

                        var sourceBinColumn = sourceBinExpr.Replace(" as source_bin", "");
                        var itemsSql = $@"SELECT 
                                            item_code,
                                            {sourceBinExpr} as source_bin,
                                            SUM(qty) as total_qty
                                          FROM tabWmsScanEvent
                                          WHERE (tc_id = @tcId OR (transfer_order = @materialRequest AND event_time >= @startTime AND event_time <= @endTime))
                                            AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
                                            AND item_code IS NOT NULL
                                            AND qty > 0
                                          GROUP BY item_code, {sourceBinColumn}";

                        await using var itemsCmd = new MySqlCommand(itemsSql, connection, transaction);
                        itemsCmd.Parameters.AddWithValue("@tcId", tcId);
                        itemsCmd.Parameters.AddWithValue("@materialRequest", materialRequest);
                        itemsCmd.Parameters.AddWithValue("@startTime", startTime);
                        itemsCmd.Parameters.AddWithValue("@endTime", endTime);
                        await using var itemsReader = await itemsCmd.ExecuteReaderAsync();

                        var itemsToDispatch = new List<(string ItemCode, string? SourceBin, double Qty)>();
                        while (await itemsReader.ReadAsync())
                        {
                            var itemCode = itemsReader.GetString(0);
                            var sourceBin = itemsReader.IsDBNull(1) ? null : itemsReader.GetString(1);
                            var qty = Convert.ToDouble(itemsReader.GetDecimal(2));
                            itemsToDispatch.Add((itemCode, sourceBin, qty));
                        }
                        await itemsReader.CloseAsync();

                        ErrorLogService.LogInfo($"TransferCartonDataService: Found {itemsToDispatch.Count} item-bin combination(s) to dispatch");

                        // For each item-bin combination, reduce stock
                        foreach (var item in itemsToDispatch)
                        {
                            var itemCode = item.ItemCode;
                            var qty = item.Qty;
                            var sourceBin = item.SourceBin;

                            // If source_bin is not available, try to get it from picking events
                            if (string.IsNullOrEmpty(sourceBin))
                            {
                                var sourceBinCol = sourceBinExpr.Replace(" as source_bin", "");
                                var pickingSql = $@"SELECT {sourceBinExpr} as source_bin
                                                     FROM tabWmsScanEvent
                                                     WHERE transfer_order = @materialRequest
                                                       AND item_code = @itemCode
                                                       AND event_type IN ('PICK_ITEM', 'SORT_TO_BOX', 'PACK_BOX_TO_TC')
                                                       AND event_time <= @endTime
                                                       AND {sourceBinCol} IS NOT NULL
                                                     ORDER BY event_time DESC
                                                     LIMIT 1";
                                
                                await using var pickingCmd = new MySqlCommand(pickingSql, connection, transaction);
                                pickingCmd.Parameters.AddWithValue("@materialRequest", materialRequest);
                                pickingCmd.Parameters.AddWithValue("@itemCode", itemCode);
                                pickingCmd.Parameters.AddWithValue("@endTime", endTime);
                                await using var pickingReader = await pickingCmd.ExecuteReaderAsync();
                                
                                if (await pickingReader.ReadAsync())
                                {
                                    sourceBin = pickingReader.IsDBNull(0) ? null : pickingReader.GetString(0);
                                }
                                await pickingReader.CloseAsync();
                            }

                            if (!string.IsNullOrEmpty(sourceBin) && qty > 0)
                            {
                                // Get current stock from source bin
                                var stockSql = @"SELECT qty, reserved_qty
                                                 FROM tabStockLedger
                                                 WHERE item_code = @itemCode
                                                   AND warehouse = @warehouse
                                                   AND bin_location = @sourceBin";
                                
                                await using var stockCmd = new MySqlCommand(stockSql, connection, transaction);
                                stockCmd.Parameters.AddWithValue("@itemCode", itemCode);
                                stockCmd.Parameters.AddWithValue("@warehouse", warehouse);
                                stockCmd.Parameters.AddWithValue("@sourceBin", sourceBin);
                                await using var stockReader = await stockCmd.ExecuteReaderAsync();

                                double currentQty = 0;
                                double currentReservedQty = 0;

                                if (await stockReader.ReadAsync())
                                {
                                    currentQty = Convert.ToDouble(stockReader.GetDecimal(0));
                                    currentReservedQty = Convert.ToDouble(stockReader.GetDecimal(1));
                                }
                                await stockReader.CloseAsync();

                                if (currentQty >= qty)
                                {
                                    var newQty = currentQty - qty;
                                    var qtyBefore = currentQty;
                                    var qtyReduced = -qty; // Negative for reduction

                                    // Update stock ledger
                                    var updateStockSql = @"INSERT INTO tabStockLedger 
                                                          (item_code, warehouse, bin_location, qty, reserved_qty,
                                                           qty_before, qty_reduced,
                                                           last_transaction_date, last_transaction_type, last_transaction_ref,
                                                           updated_at, created_at)
                                                          VALUES (@itemCode, @warehouse, @sourceBin, @newQty, @currentReservedQty,
                                                                  @qtyBefore, @qtyReduced,
                                                                  NOW(), 'Dispatch', @tcId,
                                                                  NOW(), NOW())
                                                          ON DUPLICATE KEY UPDATE
                                                            qty = @newQty,
                                                            qty_before = @qtyBefore,
                                                            qty_reduced = @qtyReduced,
                                                            last_transaction_date = NOW(),
                                                            last_transaction_type = 'Dispatch',
                                                            last_transaction_ref = @tcId,
                                                            updated_at = NOW()";

                                    await using var updateStockCmd = new MySqlCommand(updateStockSql, connection, transaction);
                                    updateStockCmd.Parameters.AddWithValue("@itemCode", itemCode);
                                    updateStockCmd.Parameters.AddWithValue("@warehouse", warehouse);
                                    updateStockCmd.Parameters.AddWithValue("@sourceBin", sourceBin);
                                    updateStockCmd.Parameters.AddWithValue("@newQty", newQty);
                                    updateStockCmd.Parameters.AddWithValue("@currentReservedQty", currentReservedQty);
                                    updateStockCmd.Parameters.AddWithValue("@qtyBefore", qtyBefore);
                                    updateStockCmd.Parameters.AddWithValue("@qtyReduced", qtyReduced);
                                    updateStockCmd.Parameters.AddWithValue("@tcId", tcId);
                                    await updateStockCmd.ExecuteNonQueryAsync();

                                    // Insert stock transaction log
                                    var transSql = @"INSERT INTO tabStockTransaction 
                                                     (transaction_date, transaction_type, reference_doc_type, reference_doc,
                                                      item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
                                                      source_bin, target_bin, performed_by, created_at)
                                                     VALUES 
                                                     (NOW(), 'Dispatch', 'Transfer Carton', @tcId,
                                                      @itemCode, @warehouse, @sourceBin, @qtyChange, @qtyBefore, @qtyAfter,
                                                      @sourceBin, NULL, @dispatchedBy, NOW())";

                                    await using var transCmd = new MySqlCommand(transSql, connection, transaction);
                                    transCmd.Parameters.AddWithValue("@tcId", tcId);
                                    transCmd.Parameters.AddWithValue("@itemCode", itemCode);
                                    transCmd.Parameters.AddWithValue("@warehouse", warehouse);
                                    transCmd.Parameters.AddWithValue("@sourceBin", sourceBin);
                                    transCmd.Parameters.AddWithValue("@qtyChange", -qty); // Negative (decrease)
                                    transCmd.Parameters.AddWithValue("@qtyBefore", currentQty);
                                    transCmd.Parameters.AddWithValue("@qtyAfter", newQty);
                                    transCmd.Parameters.AddWithValue("@dispatchedBy", dispatchedBy ?? (object)DBNull.Value);
                                    await transCmd.ExecuteNonQueryAsync();

                                    // Update tabItem.stock_qty
                                    var sumSql = @"SELECT COALESCE(SUM(qty), 0) as total_qty
                                                   FROM tabStockLedger
                                                   WHERE item_code = @itemCode AND warehouse = @warehouse";
                                    
                                    await using var sumCmd = new MySqlCommand(sumSql, connection, transaction);
                                    sumCmd.Parameters.AddWithValue("@itemCode", itemCode);
                                    sumCmd.Parameters.AddWithValue("@warehouse", warehouse);
                                    await using var sumReader = await sumCmd.ExecuteReaderAsync();
                                    
                                    double totalStockQty = 0;
                                    if (await sumReader.ReadAsync())
                                    {
                                        totalStockQty = Convert.ToDouble(sumReader.GetDecimal(0));
                                    }
                                    await sumReader.CloseAsync();

                                    var updateItemSql = @"UPDATE tabItem
                                                          SET stock_qty = @totalQty,
                                                              updated_at = NOW()
                                                          WHERE code = @itemCode";
                                    
                                    await using var updateItemCmd = new MySqlCommand(updateItemSql, connection, transaction);
                                    updateItemCmd.Parameters.AddWithValue("@totalQty", totalStockQty);
                                    updateItemCmd.Parameters.AddWithValue("@itemCode", itemCode);
                                    await updateItemCmd.ExecuteNonQueryAsync();

                                    ErrorLogService.LogInfo($"TransferCartonDataService: Reduced stock for {itemCode} at {sourceBin}: {currentQty} → {newQty} (Transfer Carton: {tcId})");
                                }
                                else
                                {
                                    ErrorLogService.LogInfo($"TransferCartonDataService: Insufficient stock for {itemCode} at {sourceBin}. Available: {currentQty}, Required: {qty}");
                                }
                            }
                            else
                            {
                                ErrorLogService.LogInfo($"TransferCartonDataService: Cannot reduce stock for {itemCode}: source_bin not found or qty is 0");
                            }
                        }
                    }
                    else
                    {
                        await mrReader.CloseAsync();
                    }
                }

                await transaction.CommitAsync();
                ErrorLogService.LogInfo($"TransferCartonDataService: Successfully dispatched transfer carton {tcId}");

                return (true, $"Transfer carton {tcId} dispatched successfully");
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                throw;
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"TransferCartonDataService: Error dispatching transfer carton {tcId}", ex);
            return (false, $"Error dispatching transfer carton: {ex.Message}");
        }
    }

    /// <summary>
    /// Get a single transfer carton by ID
    /// </summary>
    public static async Task<TransferCarton?> GetTransferCartonByIdAsync(WmsSettings settings, string tcId)
    {
        try
        {
            ErrorLogService.LogInfo($"TransferCartonDataService: Loading transfer carton {tcId}");
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Detect schema
            var schemaInfo = await DetectSchemaAsync(connection);

            var sql = $@"SELECT tc_id, status, {schemaInfo.AsnColumn}, {schemaInfo.ToColumn}, store, 
                               created_by, created_on, sealed_by, sealed_on, dispatched_on, remarks
                        FROM tabTransferCarton
                        WHERE tc_id = @tcId";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@tcId", tcId);
            await using var reader = await cmd.ExecuteReaderAsync();

            if (await reader.ReadAsync())
            {
                return new TransferCarton
                {
                    TcId = reader.GetString(0),
                    Status = reader.GetString(1),
                    AdvanceShippingNotice = reader.IsDBNull(2) ? null : reader.GetString(2),
                    TransferOrder = reader.IsDBNull(3) ? null : reader.GetString(3),
                    Store = reader.GetString(4),
                    CreatedBy = reader.IsDBNull(5) ? null : reader.GetString(5),
                    CreatedOn = reader.GetDateTime(6),
                    SealedBy = reader.IsDBNull(7) ? null : reader.GetString(7),
                    SealedOn = reader.IsDBNull(8) ? null : reader.GetDateTime(8),
                    DispatchedOn = reader.IsDBNull(9) ? null : reader.GetDateTime(9),
                    Remarks = reader.IsDBNull(10) ? null : reader.GetString(10)
                };
            }

            return null;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"TransferCartonDataService: Error loading transfer carton {tcId}", ex);
            return null;
        }
    }
}

