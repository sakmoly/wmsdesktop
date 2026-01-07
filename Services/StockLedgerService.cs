using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Service for managing real-time stock ledger and stock transactions
/// </summary>
public static class StockLedgerService
{
    /// <summary>
    /// Update stock after Receiving Transaction completed
    /// Increases stock at warehouse level (dock, no bin yet)
    /// </summary>
    public static async Task<bool> UpdateStockAfterReceivingAsync(
        WmsSettings settings,
        string wmsTransactionTitle,
        string warehouse)
    {
        try
        {
            ErrorLogService.LogInfo($"StockLedgerService: Updating stock after Receiving Transaction {wmsTransactionTitle}");

            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Get all completed items from Receiving Transaction
            var itemsSql = @"
                SELECT item_code, qty, source_bin, uom
                FROM tabWmsTransactionDetail
                WHERE parent_title = @transactionTitle
                  AND assignment_status = 'Completed'
                  AND qty > 0";

            await using var itemsCmd = new MySqlCommand(itemsSql, connection);
            itemsCmd.Parameters.AddWithValue("@transactionTitle", wmsTransactionTitle);
            await using var itemsReader = await itemsCmd.ExecuteReaderAsync();

            var items = new List<(string ItemCode, double Qty, string? SourceBin)>();
            while (await itemsReader.ReadAsync())
            {
                items.Add((
                    itemsReader.GetString(0),
                    Convert.ToDouble(itemsReader.GetDecimal(1)),
                    itemsReader.IsDBNull(2) ? null : itemsReader.GetString(2)
                ));
            }
            await itemsReader.CloseAsync();

            if (items.Count == 0)
            {
                ErrorLogService.LogInfo($"StockLedgerService: No completed items found for transaction {wmsTransactionTitle}");
                return true;
            }

            // Get reference document info
            var refDocSql = @"SELECT reference_doc_type, reference_doc FROM tabWmsTransaction WHERE title = @transactionTitle";
            await using var refDocCmd = new MySqlCommand(refDocSql, connection);
            refDocCmd.Parameters.AddWithValue("@transactionTitle", wmsTransactionTitle);
            await using var refDocReader = await refDocCmd.ExecuteReaderAsync();
            
            string? referenceDocType = null;
            string? referenceDoc = null;
            if (await refDocReader.ReadAsync())
            {
                referenceDocType = refDocReader.IsDBNull(0) ? null : refDocReader.GetString(0);
                referenceDoc = refDocReader.IsDBNull(1) ? null : refDocReader.GetString(1);
            }
            await refDocReader.CloseAsync();

            // Update stock for each item
            foreach (var item in items)
            {
                // Stock increases at warehouse level (dock, no bin yet)
                // SourceBin is typically "DOCK-01" but stock is tracked at warehouse level until putaway
                await UpdateStockAsync(
                    connection,
                    item.ItemCode,
                    warehouse,
                    binLocation: null, // Warehouse-level (not in bin yet)
                    qtyChange: item.Qty, // Positive (increase)
                    transactionType: "Receiving",
                    referenceDocType: referenceDocType,
                    referenceDoc: referenceDoc ?? wmsTransactionTitle,
                    wmsTransactionTitle: wmsTransactionTitle,
                    sourceBin: item.SourceBin ?? "DOCK-01",
                    targetBin: null,
                    performedBy: null
                );
            }

            ErrorLogService.LogInfo($"StockLedgerService: Successfully updated stock for {items.Count} items after Receiving Transaction {wmsTransactionTitle}");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"StockLedgerService: Error updating stock after Receiving Transaction {wmsTransactionTitle}", ex);
            return false;
        }
    }

    /// <summary>
    /// Update stock after Putaway Transaction completed
    /// Moves stock from dock (warehouse-level) to storage bin
    /// </summary>
    public static async Task<bool> UpdateStockAfterPutawayAsync(
        WmsSettings settings,
        string wmsTransactionTitle,
        string warehouse)
    {
        try
        {
            ErrorLogService.LogInfo($"StockLedgerService: Updating stock after Putaway Transaction {wmsTransactionTitle}");

            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Get all completed items from Putaway Transaction
            var itemsSql = @"
                SELECT item_code, qty, source_bin, target_bin, uom
                FROM tabWmsTransactionDetail
                WHERE parent_title = @transactionTitle
                  AND assignment_status = 'Completed'
                  AND qty > 0
                  AND target_bin IS NOT NULL";

            await using var itemsCmd = new MySqlCommand(itemsSql, connection);
            itemsCmd.Parameters.AddWithValue("@transactionTitle", wmsTransactionTitle);
            await using var itemsReader = await itemsCmd.ExecuteReaderAsync();

            var items = new List<(string ItemCode, double Qty, string SourceBin, string TargetBin)>();
            while (await itemsReader.ReadAsync())
            {
                items.Add((
                    itemsReader.GetString(0),
                    Convert.ToDouble(itemsReader.GetDecimal(1)),
                    itemsReader.IsDBNull(2) ? "DOCK-01" : itemsReader.GetString(2),
                    itemsReader.GetString(3)
                ));
            }
            await itemsReader.CloseAsync();

            if (items.Count == 0)
            {
                ErrorLogService.LogInfo($"StockLedgerService: No completed items found for transaction {wmsTransactionTitle}");
                return true;
            }

            // Get reference document info
            var refDocSql = @"SELECT reference_doc_type, reference_doc FROM tabWmsTransaction WHERE title = @transactionTitle";
            await using var refDocCmd = new MySqlCommand(refDocSql, connection);
            refDocCmd.Parameters.AddWithValue("@transactionTitle", wmsTransactionTitle);
            await using var refDocReader = await refDocCmd.ExecuteReaderAsync();
            
            string? referenceDocType = null;
            string? referenceDoc = null;
            if (await refDocReader.ReadAsync())
            {
                referenceDocType = refDocReader.IsDBNull(0) ? null : refDocReader.GetString(0);
                referenceDoc = refDocReader.IsDBNull(1) ? null : refDocReader.GetString(1);
            }
            await refDocReader.CloseAsync();

            // Update stock for each item (move from source to target bin)
            foreach (var item in items)
            {
                // Decrease from source bin (warehouse-level or dock)
                await UpdateStockAsync(
                    connection,
                    item.ItemCode,
                    warehouse,
                    binLocation: item.SourceBin == "DOCK-01" ? null : item.SourceBin, // NULL for warehouse-level
                    qtyChange: -item.Qty, // Negative (decrease)
                    transactionType: "Putaway",
                    referenceDocType: referenceDocType,
                    referenceDoc: referenceDoc ?? wmsTransactionTitle,
                    wmsTransactionTitle: wmsTransactionTitle,
                    sourceBin: item.SourceBin,
                    targetBin: item.TargetBin,
                    performedBy: null
                );

                // Increase in target bin
                await UpdateStockAsync(
                    connection,
                    item.ItemCode,
                    warehouse,
                    binLocation: item.TargetBin,
                    qtyChange: item.Qty, // Positive (increase)
                    transactionType: "Putaway",
                    referenceDocType: referenceDocType,
                    referenceDoc: referenceDoc ?? wmsTransactionTitle,
                    wmsTransactionTitle: wmsTransactionTitle,
                    sourceBin: item.SourceBin,
                    targetBin: item.TargetBin,
                    performedBy: null
                );
            }

            ErrorLogService.LogInfo($"StockLedgerService: Successfully updated stock for {items.Count} items after Putaway Transaction {wmsTransactionTitle}");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"StockLedgerService: Error updating stock after Putaway Transaction {wmsTransactionTitle}", ex);
            return false;
        }
    }

    /// <summary>
    /// Update stock after Picking Transaction completed
    /// Decreases stock from source bin (if dispatched) or moves to staging bin
    /// </summary>
    public static async Task<bool> UpdateStockAfterPickingAsync(
        WmsSettings settings,
        string wmsTransactionTitle,
        string warehouse)
    {
        try
        {
            ErrorLogService.LogInfo($"StockLedgerService: Updating stock after Picking Transaction {wmsTransactionTitle}");

            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Get all completed items from Picking Transaction
            var itemsSql = @"
                SELECT item_code, qty, source_bin, target_bin, uom
                FROM tabWmsTransactionDetail
                WHERE parent_title = @transactionTitle
                  AND assignment_status = 'Completed'
                  AND qty > 0";

            await using var itemsCmd = new MySqlCommand(itemsSql, connection);
            itemsCmd.Parameters.AddWithValue("@transactionTitle", wmsTransactionTitle);
            await using var itemsReader = await itemsCmd.ExecuteReaderAsync();

            var items = new List<(string ItemCode, double Qty, string? SourceBin, string? TargetBin)>();
            while (await itemsReader.ReadAsync())
            {
                items.Add((
                    itemsReader.GetString(0),
                    Convert.ToDouble(itemsReader.GetDecimal(1)),
                    itemsReader.IsDBNull(2) ? null : itemsReader.GetString(2),
                    itemsReader.IsDBNull(3) ? null : itemsReader.GetString(3)
                ));
            }
            await itemsReader.CloseAsync();

            if (items.Count == 0)
            {
                ErrorLogService.LogInfo($"StockLedgerService: No completed items found for transaction {wmsTransactionTitle}");
                return true;
            }

            // Get reference document info
            var refDocSql = @"SELECT reference_doc_type, reference_doc FROM tabWmsTransaction WHERE title = @transactionTitle";
            await using var refDocCmd = new MySqlCommand(refDocSql, connection);
            refDocCmd.Parameters.AddWithValue("@transactionTitle", wmsTransactionTitle);
            await using var refDocReader = await refDocCmd.ExecuteReaderAsync();
            
            string? referenceDocType = null;
            string? referenceDoc = null;
            if (await refDocReader.ReadAsync())
            {
                referenceDocType = refDocReader.IsDBNull(0) ? null : refDocReader.GetString(0);
                referenceDoc = refDocReader.IsDBNull(1) ? null : refDocReader.GetString(1);
            }
            await refDocReader.CloseAsync();

            // Update stock for each item
            foreach (var item in items)
            {
                if (item.TargetBin != null && item.TargetBin.StartsWith("STAGE-"))
                {
                    // Move to staging (no net change, just bin movement)
                    if (item.SourceBin != null)
                    {
                        // Decrease from source bin
                        await UpdateStockAsync(
                            connection,
                            item.ItemCode,
                            warehouse,
                            binLocation: item.SourceBin,
                            qtyChange: -item.Qty,
                            transactionType: "Picking",
                            referenceDocType: referenceDocType,
                            referenceDoc: referenceDoc ?? wmsTransactionTitle,
                            wmsTransactionTitle: wmsTransactionTitle,
                            sourceBin: item.SourceBin,
                            targetBin: item.TargetBin,
                            performedBy: null
                        );
                    }

                    // Increase in staging bin
                    await UpdateStockAsync(
                        connection,
                        item.ItemCode,
                        warehouse,
                        binLocation: item.TargetBin,
                        qtyChange: item.Qty,
                        transactionType: "Picking",
                        referenceDocType: referenceDocType,
                        referenceDoc: referenceDoc ?? wmsTransactionTitle,
                        wmsTransactionTitle: wmsTransactionTitle,
                        sourceBin: item.SourceBin,
                        targetBin: item.TargetBin,
                        performedBy: null
                    );
                }
                else
                {
                    // Dispatched (decrease stock from source bin)
                    if (item.SourceBin != null)
                    {
                        await UpdateStockAsync(
                            connection,
                            item.ItemCode,
                            warehouse,
                            binLocation: item.SourceBin,
                            qtyChange: -item.Qty, // Negative (decrease)
                            transactionType: "Picking",
                            referenceDocType: referenceDocType,
                            referenceDoc: referenceDoc ?? wmsTransactionTitle,
                            wmsTransactionTitle: wmsTransactionTitle,
                            sourceBin: item.SourceBin,
                            targetBin: null,
                            performedBy: null
                        );
                    }
                }
            }

            ErrorLogService.LogInfo($"StockLedgerService: Successfully updated stock for {items.Count} items after Picking Transaction {wmsTransactionTitle}");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"StockLedgerService: Error updating stock after Picking Transaction {wmsTransactionTitle}", ex);
            return false;
        }
    }

    /// <summary>
    /// Update stock after Cycle Count adjustment
    /// Adjusts stock based on discrepancy (actual - expected)
    /// </summary>
    public static async Task<bool> UpdateStockAfterCycleCountAsync(
        WmsSettings settings,
        string wmsTransactionTitle,
        string warehouse)
    {
        try
        {
            ErrorLogService.LogInfo($"StockLedgerService: Updating stock after Cycle Count Transaction {wmsTransactionTitle}");

            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Get all items with discrepancies from Cycle Count Transaction
            var itemsSql = @"
                SELECT item_code, qty, actual_qty_counted, discrepancy, source_bin
                FROM tabWmsTransactionDetail
                WHERE parent_title = @transactionTitle
                  AND assignment_status = 'Completed'
                  AND discrepancy IS NOT NULL
                  AND discrepancy != 0";

            await using var itemsCmd = new MySqlCommand(itemsSql, connection);
            itemsCmd.Parameters.AddWithValue("@transactionTitle", wmsTransactionTitle);
            await using var itemsReader = await itemsCmd.ExecuteReaderAsync();

            var items = new List<(string ItemCode, double Discrepancy, string? BinLocation)>();
            while (await itemsReader.ReadAsync())
            {
                var discrepancy = Convert.ToDouble(itemsReader.GetDecimal(3));
                if (discrepancy != 0)
                {
                    items.Add((
                        itemsReader.GetString(0),
                        discrepancy,
                        itemsReader.IsDBNull(4) ? null : itemsReader.GetString(4)
                    ));
                }
            }
            await itemsReader.CloseAsync();

            if (items.Count == 0)
            {
                ErrorLogService.LogInfo($"StockLedgerService: No discrepancies found for transaction {wmsTransactionTitle}");
                return true;
            }

            // Get reference document info
            var refDocSql = @"SELECT reference_doc_type, reference_doc FROM tabWmsTransaction WHERE title = @transactionTitle";
            await using var refDocCmd = new MySqlCommand(refDocSql, connection);
            refDocCmd.Parameters.AddWithValue("@transactionTitle", wmsTransactionTitle);
            await using var refDocReader = await refDocCmd.ExecuteReaderAsync();
            
            string? referenceDocType = null;
            string? referenceDoc = null;
            if (await refDocReader.ReadAsync())
            {
                referenceDocType = refDocReader.IsDBNull(0) ? null : refDocReader.GetString(0);
                referenceDoc = refDocReader.IsDBNull(1) ? null : refDocReader.GetString(1);
            }
            await refDocReader.CloseAsync();

            // Update stock for each item (adjust based on discrepancy)
            foreach (var item in items)
            {
                // Discrepancy can be positive (increase) or negative (decrease)
                await UpdateStockAsync(
                    connection,
                    item.ItemCode,
                    warehouse,
                    binLocation: item.BinLocation,
                    qtyChange: item.Discrepancy, // Can be positive or negative
                    transactionType: "CycleCount",
                    referenceDocType: referenceDocType,
                    referenceDoc: referenceDoc ?? wmsTransactionTitle,
                    wmsTransactionTitle: wmsTransactionTitle,
                    sourceBin: item.BinLocation, // Same bin (no movement)
                    targetBin: item.BinLocation, // Same bin (no movement)
                    performedBy: null
                );
            }

            ErrorLogService.LogInfo($"StockLedgerService: Successfully updated stock for {items.Count} items after Cycle Count Transaction {wmsTransactionTitle}");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"StockLedgerService: Error updating stock after Cycle Count Transaction {wmsTransactionTitle}", ex);
            return false;
        }
    }

    /// <summary>
    /// Core stock update method - updates tabStockLedger and logs to tabStockTransaction
    /// </summary>
    private static async Task UpdateStockAsync(
        MySqlConnection connection,
        string itemCode,
        string warehouse,
        string? binLocation,
        double qtyChange,
        string transactionType,
        string? referenceDocType,
        string referenceDoc,
        string wmsTransactionTitle,
        string? sourceBin,
        string? targetBin,
        string? performedBy)
    {
        await using var transaction = await connection.BeginTransactionAsync();
        
        try
        {
            // Get current stock (with lock for concurrency)
            var currentStockSql = @"
                SELECT qty, reserved_qty
                FROM tabStockLedger
                WHERE item_code = @itemCode
                  AND warehouse = @warehouse
                  AND (bin_location = @binLocation OR (bin_location IS NULL AND @binLocation IS NULL))
                FOR UPDATE";

            await using var currentStockCmd = new MySqlCommand(currentStockSql, connection, transaction);
            currentStockCmd.Parameters.AddWithValue("@itemCode", itemCode);
            currentStockCmd.Parameters.AddWithValue("@warehouse", warehouse);
            currentStockCmd.Parameters.AddWithValue("@binLocation", binLocation ?? (object)DBNull.Value);
            
            await using var currentStockReader = await currentStockCmd.ExecuteReaderAsync();
            
            double currentQty = 0;
            double currentReservedQty = 0;
            
            if (await currentStockReader.ReadAsync())
            {
                currentQty = Convert.ToDouble(currentStockReader.GetDecimal(0));
                currentReservedQty = Convert.ToDouble(currentStockReader.GetDecimal(1));
            }
            await currentStockReader.CloseAsync();

            var newQty = currentQty + qtyChange;

            // Validate: Prevent negative stock (except for cycle count adjustments which can go negative temporarily)
            if (newQty < 0 && transactionType != "CycleCount")
            {
                throw new InvalidOperationException(
                    $"Insufficient stock: Cannot decrease {itemCode} by {qtyChange}. Current: {currentQty}, Warehouse: {warehouse}, Bin: {binLocation ?? "NULL"}");
            }

            // Update or insert stock ledger
            var updateStockSql = @"
                INSERT INTO tabStockLedger 
                    (item_code, warehouse, bin_location, qty, reserved_qty, 
                     last_transaction_date, last_transaction_type, last_transaction_ref, updated_at, created_at)
                VALUES 
                    (@itemCode, @warehouse, @binLocation, @newQty, @currentReservedQty,
                     NOW(), @transactionType, @referenceDoc, NOW(), NOW())
                ON DUPLICATE KEY UPDATE
                    qty = @newQty,
                    last_transaction_date = NOW(),
                    last_transaction_type = @transactionType,
                    last_transaction_ref = @referenceDoc,
                    updated_at = NOW()";

            await using var updateStockCmd = new MySqlCommand(updateStockSql, connection, transaction);
            updateStockCmd.Parameters.AddWithValue("@itemCode", itemCode);
            updateStockCmd.Parameters.AddWithValue("@warehouse", warehouse);
            updateStockCmd.Parameters.AddWithValue("@binLocation", binLocation ?? (object)DBNull.Value);
            updateStockCmd.Parameters.AddWithValue("@newQty", newQty);
            updateStockCmd.Parameters.AddWithValue("@currentReservedQty", currentReservedQty);
            updateStockCmd.Parameters.AddWithValue("@transactionType", transactionType);
            updateStockCmd.Parameters.AddWithValue("@referenceDoc", referenceDoc);
            
            await updateStockCmd.ExecuteNonQueryAsync();

            // Insert stock transaction log
            var insertTransactionSql = @"
                INSERT INTO tabStockTransaction 
                    (transaction_date, transaction_type, reference_doc_type, reference_doc, wms_transaction_title,
                     item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
                     source_bin, target_bin, performed_by, created_at)
                VALUES 
                    (NOW(), @transactionType, @referenceDocType, @referenceDoc, @wmsTransactionTitle,
                     @itemCode, @warehouse, @binLocation, @qtyChange, @currentQty, @newQty,
                     @sourceBin, @targetBin, @performedBy, NOW())";

            await using var insertTransactionCmd = new MySqlCommand(insertTransactionSql, connection, transaction);
            insertTransactionCmd.Parameters.AddWithValue("@transactionType", transactionType);
            insertTransactionCmd.Parameters.AddWithValue("@referenceDocType", referenceDocType ?? (object)DBNull.Value);
            insertTransactionCmd.Parameters.AddWithValue("@referenceDoc", referenceDoc);
            insertTransactionCmd.Parameters.AddWithValue("@wmsTransactionTitle", wmsTransactionTitle);
            insertTransactionCmd.Parameters.AddWithValue("@itemCode", itemCode);
            insertTransactionCmd.Parameters.AddWithValue("@warehouse", warehouse);
            insertTransactionCmd.Parameters.AddWithValue("@binLocation", binLocation ?? (object)DBNull.Value);
            insertTransactionCmd.Parameters.AddWithValue("@qtyChange", qtyChange);
            insertTransactionCmd.Parameters.AddWithValue("@currentQty", currentQty);
            insertTransactionCmd.Parameters.AddWithValue("@newQty", newQty);
            insertTransactionCmd.Parameters.AddWithValue("@sourceBin", sourceBin ?? (object)DBNull.Value);
            insertTransactionCmd.Parameters.AddWithValue("@targetBin", targetBin ?? (object)DBNull.Value);
            insertTransactionCmd.Parameters.AddWithValue("@performedBy", performedBy ?? (object)DBNull.Value);
            
            await insertTransactionCmd.ExecuteNonQueryAsync();

            // Update tabItem.stock_qty (warehouse-level summary)
            var updateItemSql = @"
                UPDATE tabItem
                SET stock_qty = (
                    SELECT COALESCE(SUM(qty), 0)
                    FROM tabStockLedger 
                    WHERE item_code = @itemCode
                ),
                updated_at = NOW()
                WHERE code = @itemCode";

            await using var updateItemCmd = new MySqlCommand(updateItemSql, connection, transaction);
            updateItemCmd.Parameters.AddWithValue("@itemCode", itemCode);
            await updateItemCmd.ExecuteNonQueryAsync();

            await transaction.CommitAsync();
            
            ErrorLogService.LogInfo($"StockLedgerService: Updated stock for {itemCode} @ {warehouse}/{binLocation ?? "NULL"}: {currentQty} → {newQty} (change: {qtyChange:+0.00;-0.00})");
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    /// <summary>
    /// Get real-time stock for an item in a warehouse/bin
    /// </summary>
    public static async Task<double> GetStockAsync(
        WmsSettings settings,
        string itemCode,
        string warehouse,
        string? binLocation = null)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var sql = @"
                SELECT qty
                FROM tabStockLedger
                WHERE item_code = @itemCode
                  AND warehouse = @warehouse
                  AND (bin_location = @binLocation OR (bin_location IS NULL AND @binLocation IS NULL))";

            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@itemCode", itemCode);
            cmd.Parameters.AddWithValue("@warehouse", warehouse);
            cmd.Parameters.AddWithValue("@binLocation", binLocation ?? (object)DBNull.Value);

            var result = await cmd.ExecuteScalarAsync();
            return result != null && result != DBNull.Value ? Convert.ToDouble(result) : 0;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"StockLedgerService: Error getting stock for {itemCode} @ {warehouse}/{binLocation}", ex);
            return 0;
        }
    }

    /// <summary>
    /// Get stock breakdown by bin for an item in a warehouse
    /// </summary>
    public static async Task<List<StockLedger>> GetStockByBinAsync(
        WmsSettings settings,
        string itemCode,
        string warehouse)
    {
        var stockList = new List<StockLedger>();
        
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var sql = @"
                SELECT item_code, warehouse, bin_location, qty, reserved_qty,
                       qty_before, qty_reduced,
                       last_transaction_date, last_transaction_type, last_transaction_ref,
                       updated_at, created_at
                FROM tabStockLedger
                WHERE item_code = @itemCode
                  AND warehouse = @warehouse
                ORDER BY bin_location IS NULL, bin_location";

            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@itemCode", itemCode);
            cmd.Parameters.AddWithValue("@warehouse", warehouse);

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                stockList.Add(new StockLedger
                {
                    ItemCode = reader.GetString(0),
                    Warehouse = reader.GetString(1),
                    BinLocation = reader.IsDBNull(2) ? null : reader.GetString(2),
                    Qty = Convert.ToDouble(reader.GetDecimal(3)),
                    ReservedQty = Convert.ToDouble(reader.GetDecimal(4)),
                    QtyBefore = reader.IsDBNull(5) ? null : Convert.ToDouble(reader.GetDecimal(5)),
                    QtyReduced = reader.IsDBNull(6) ? null : Convert.ToDouble(reader.GetDecimal(6)),
                    LastTransactionDate = reader.IsDBNull(7) ? null : reader.GetDateTime(7),
                    LastTransactionType = reader.IsDBNull(8) ? null : reader.GetString(8),
                    LastTransactionRef = reader.IsDBNull(9) ? null : reader.GetString(9),
                    UpdatedAt = reader.GetDateTime(10),
                    CreatedAt = reader.GetDateTime(11)
                });
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"StockLedgerService: Error getting stock by bin for {itemCode} @ {warehouse}", ex);
        }

        return stockList;
    }

    /// <summary>
    /// Get total stock for an item across all bins in a warehouse
    /// </summary>
    public static async Task<double> GetTotalStockAsync(
        WmsSettings settings,
        string itemCode,
        string warehouse)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var sql = @"
                SELECT COALESCE(SUM(qty), 0)
                FROM tabStockLedger
                WHERE item_code = @itemCode
                  AND warehouse = @warehouse";

            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@itemCode", itemCode);
            cmd.Parameters.AddWithValue("@warehouse", warehouse);

            var result = await cmd.ExecuteScalarAsync();
            return result != null && result != DBNull.Value ? Convert.ToDouble(result) : 0;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"StockLedgerService: Error getting total stock for {itemCode} @ {warehouse}", ex);
            return 0;
        }
    }

    /// <summary>
    /// Update stock after Transfer In Receiving Transaction completed
    /// Increases stock at warehouse level (dock, no bin yet) - same as regular Receiving
    /// </summary>
    public static async Task<bool> UpdateStockAfterTransferInAsync(
        WmsSettings settings,
        string wmsTransactionTitle,
        string warehouse)
    {
        // Transfer In receiving works the same as regular Receiving
        // +qty at warehouse level (dock, no bin yet)
        return await UpdateStockAfterReceivingAsync(settings, wmsTransactionTitle, warehouse);
    }

    /// <summary>
    /// Update stock after Material Request Picking Transaction completed
    /// Decreases stock from source bin when dispatched to showroom
    /// </summary>
    public static async Task<bool> UpdateStockAfterMaterialRequestAsync(
        WmsSettings settings,
        string wmsTransactionTitle,
        string warehouse)
    {
        // Material Request picking works the same as regular Picking
        // -qty from source bin when dispatched
        return await UpdateStockAfterPickingAsync(settings, wmsTransactionTitle, warehouse);
    }

    /// <summary>
    /// Get all stock ledger entries (for list view display)
    /// </summary>
    public static async Task<List<StockLedger>> GetAllStockLedgerAsync(
        WmsSettings settings,
        string? warehouse = null,
        string? itemCode = null)
    {
        var stockList = new List<StockLedger>();
        
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if table exists
            if (!await CheckTableExistsAsync(connection, "tabStockLedger"))
            {
                ErrorLogService.LogInfo("StockLedgerService: tabStockLedger table does not exist, returning empty list");
                return stockList;
            }

            var sql = @"
                SELECT item_code, warehouse, bin_location, qty, reserved_qty,
                       qty_before, qty_reduced,
                       last_transaction_date, last_transaction_type, last_transaction_ref,
                       updated_at, created_at
                FROM tabStockLedger
                WHERE 1=1";

            if (!string.IsNullOrEmpty(warehouse))
            {
                sql += " AND warehouse = @warehouse";
            }

            if (!string.IsNullOrEmpty(itemCode))
            {
                sql += " AND item_code = @itemCode";
            }

            sql += " ORDER BY warehouse, item_code, bin_location IS NULL, bin_location";

            await using var cmd = new MySqlCommand(sql, connection);
            if (!string.IsNullOrEmpty(warehouse))
            {
                cmd.Parameters.AddWithValue("@warehouse", warehouse);
            }
            if (!string.IsNullOrEmpty(itemCode))
            {
                cmd.Parameters.AddWithValue("@itemCode", itemCode);
            }

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                stockList.Add(new StockLedger
                {
                    ItemCode = reader.GetString(0),
                    Warehouse = reader.GetString(1),
                    BinLocation = reader.IsDBNull(2) ? null : reader.GetString(2),
                    Qty = Convert.ToDouble(reader.GetDecimal(3)),
                    ReservedQty = Convert.ToDouble(reader.GetDecimal(4)),
                    QtyBefore = reader.IsDBNull(5) ? null : Convert.ToDouble(reader.GetDecimal(5)),
                    QtyReduced = reader.IsDBNull(6) ? null : Convert.ToDouble(reader.GetDecimal(6)),
                    LastTransactionDate = reader.IsDBNull(7) ? null : reader.GetDateTime(7),
                    LastTransactionType = reader.IsDBNull(8) ? null : reader.GetString(8),
                    LastTransactionRef = reader.IsDBNull(9) ? null : reader.GetString(9),
                    UpdatedAt = reader.GetDateTime(10),
                    CreatedAt = reader.GetDateTime(11)
                });
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("StockLedgerService: Error getting all stock ledger entries", ex);
        }

        return stockList;
    }

    /// <summary>
    /// Paginated result for stock ledger
    /// </summary>
    public sealed class StockLedgerPagedResult
    {
        public List<StockLedger> Data { get; set; } = new();
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalCount { get; set; }
        public int TotalPages { get; set; }
    }

    /// <summary>
    /// Get paginated stock ledger entries with filtering
    /// </summary>
    public static async Task<StockLedgerPagedResult> GetStockLedgerPagedAsync(
        WmsSettings settings,
        int page = 1,
        int pageSize = 100,
        string? warehouse = null,
        string? itemCode = null,
        DateTime? fromDate = null,
        DateTime? toDate = null)
    {
        var result = new StockLedgerPagedResult
        {
            Page = Math.Max(1, page),
            PageSize = Math.Min(500, Math.Max(1, pageSize))
        };

        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if table exists
            if (!await CheckTableExistsAsync(connection, "tabStockLedger"))
            {
                ErrorLogService.LogInfo("StockLedgerService: tabStockLedger table does not exist, returning empty result");
                return result;
            }

            // Build WHERE clause
            var whereConditions = new List<string> { "1=1" };
            var parameters = new List<MySqlParameter>();

            if (!string.IsNullOrEmpty(warehouse))
            {
                whereConditions.Add("warehouse = @warehouse");
                parameters.Add(new MySqlParameter("@warehouse", warehouse));
            }

            if (!string.IsNullOrEmpty(itemCode))
            {
                whereConditions.Add("item_code LIKE @itemCode");
                parameters.Add(new MySqlParameter("@itemCode", $"%{itemCode}%"));
            }

            if (fromDate.HasValue)
            {
                whereConditions.Add("DATE(last_transaction_date) >= @fromDate");
                parameters.Add(new MySqlParameter("@fromDate", fromDate.Value.ToString("yyyy-MM-dd")));
            }

            if (toDate.HasValue)
            {
                whereConditions.Add("DATE(last_transaction_date) <= @toDate");
                parameters.Add(new MySqlParameter("@toDate", toDate.Value.ToString("yyyy-MM-dd")));
            }

            var whereClause = string.Join(" AND ", whereConditions);

            // Get total count
            var countSql = $"SELECT COUNT(*) FROM tabStockLedger WHERE {whereClause}";
            await using var countCmd = new MySqlCommand(countSql, connection);
            foreach (var param in parameters)
            {
                countCmd.Parameters.Add(param);
            }
            var totalCount = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
            result.TotalCount = totalCount;
            result.TotalPages = (int)Math.Ceiling(totalCount / (double)result.PageSize);

            // Get paginated data
            var offset = (result.Page - 1) * result.PageSize;
            var sql = $@"
                SELECT item_code, warehouse, bin_location, qty, reserved_qty,
                       qty_before, qty_reduced,
                       last_transaction_date, last_transaction_type, last_transaction_ref,
                       updated_at, created_at
                FROM tabStockLedger
                WHERE {whereClause}
                ORDER BY last_transaction_date DESC, warehouse, item_code, bin_location IS NULL, bin_location
                LIMIT @pageSize OFFSET @offset";

            await using var cmd = new MySqlCommand(sql, connection);
            foreach (var param in parameters)
            {
                cmd.Parameters.Add(param);
            }
            cmd.Parameters.AddWithValue("@pageSize", result.PageSize);
            cmd.Parameters.AddWithValue("@offset", offset);

            await using var reader = await cmd.ExecuteReaderAsync();
            var stockList = new List<StockLedger>();
            while (await reader.ReadAsync())
            {
                stockList.Add(new StockLedger
                {
                    ItemCode = reader.GetString(0),
                    Warehouse = reader.GetString(1),
                    BinLocation = reader.IsDBNull(2) ? null : reader.GetString(2),
                    Qty = Convert.ToDouble(reader.GetDecimal(3)),
                    ReservedQty = Convert.ToDouble(reader.GetDecimal(4)),
                    QtyBefore = reader.IsDBNull(5) ? null : Convert.ToDouble(reader.GetDecimal(5)),
                    QtyReduced = reader.IsDBNull(6) ? null : Convert.ToDouble(reader.GetDecimal(6)),
                    LastTransactionDate = reader.IsDBNull(7) ? null : reader.GetDateTime(7),
                    LastTransactionType = reader.IsDBNull(8) ? null : reader.GetString(8),
                    LastTransactionRef = reader.IsDBNull(9) ? null : reader.GetString(9),
                    UpdatedAt = reader.GetDateTime(10),
                    CreatedAt = reader.GetDateTime(11)
                });
            }

            result.Data = stockList;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("StockLedgerService: Error getting paginated stock ledger entries", ex);
        }

        return result;
    }

    /// <summary>
    /// Check if a table exists in the database (case-insensitive)
    /// </summary>
    private static async Task<bool> CheckTableExistsAsync(MySqlConnection connection, string tableName)
    {
        try
        {
            var sql = @"
                SELECT COUNT(*) 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND LOWER(TABLE_NAME) = LOWER(@tableName)";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@tableName", tableName);
            var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            return count > 0;
        }
        catch
        {
            return false;
        }
    }
}

