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
/// Supports both Bin-Level and Carton-Level inventory tracking modes
/// </summary>
public static class StockLedgerService
{
    /// <summary>
    /// Check if carton-level inventory mode is enabled
    /// </summary>
    private static bool IsCartonLevelMode(WmsSettings settings)
    {
        return settings.InventoryTrackingMode == "CartonLevel";
    }
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
                    performedBy: null,
                    cartonId: null,
                    settings: settings
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
            // Try to get carton_id from putaway lines if available
            var hasCartonIdColumn = await CheckColumnExistsAsync(connection, "tabWmsTransactionDetail", "carton_id");
            var cartonIdSelect = hasCartonIdColumn ? ", carton_id" : ", NULL as carton_id";
            
            var itemsSql = $@"
                SELECT item_code, qty, source_bin, target_bin, uom{cartonIdSelect}
                FROM tabWmsTransactionDetail
                WHERE parent_title = @transactionTitle
                  AND assignment_status = 'Completed'
                  AND qty > 0
                  AND target_bin IS NOT NULL";

            await using var itemsCmd = new MySqlCommand(itemsSql, connection);
            itemsCmd.Parameters.AddWithValue("@transactionTitle", wmsTransactionTitle);
            await using var itemsReader = await itemsCmd.ExecuteReaderAsync();

            var items = new List<(string ItemCode, double Qty, string SourceBin, string TargetBin, string? CartonId)>();
            while (await itemsReader.ReadAsync())
            {
                var cartonId = hasCartonIdColumn && !itemsReader.IsDBNull(5) 
                    ? itemsReader.GetString(5) 
                    : null;
                
                items.Add((
                    itemsReader.GetString(0),
                    Convert.ToDouble(itemsReader.GetDecimal(1)),
                    itemsReader.IsDBNull(2) ? "DOCK-01" : itemsReader.GetString(2),
                    itemsReader.GetString(3),
                    cartonId
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
                // If carton-level mode and carton ID available, try to get from putaway lines
                string? cartonId = item.CartonId;
                if (IsCartonLevelMode(settings) && string.IsNullOrEmpty(cartonId))
                {
                    // Try to get carton_id from putaway lines
                    var putawayLineSql = @"
                        SELECT carton_id 
                        FROM tabPutawayLine 
                        WHERE parent_title = (
                            SELECT reference_doc 
                            FROM tabWmsTransaction 
                            WHERE title = @transactionTitle
                        )
                        AND item_code = @itemCode
                        LIMIT 1";
                    
                    await using var putawayCmd = new MySqlCommand(putawayLineSql, connection);
                    putawayCmd.Parameters.AddWithValue("@transactionTitle", wmsTransactionTitle);
                    putawayCmd.Parameters.AddWithValue("@itemCode", item.ItemCode);
                    var cartonIdResult = await putawayCmd.ExecuteScalarAsync();
                    if (cartonIdResult != null && cartonIdResult != DBNull.Value)
                    {
                        cartonId = cartonIdResult.ToString();
                    }
                }

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
                    performedBy: null,
                    cartonId: cartonId,
                    settings: settings
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
                    performedBy: null,
                    cartonId: cartonId,
                    settings: settings
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
    /// Apply completed Putaway Task to local WMS DB (tabCartonStock / tabStockLedger and tabStockTransaction).
    /// Call this after PutawayApiService.CompletePutawayAsync succeeds so that the next push_wms_snapshot
    /// includes the new stock. Use when putaway is completed from the Putaway Task UI (no WmsTransaction save).
    /// </summary>
    public static async Task<bool> ApplyPutawayTaskToLocalStockAsync(
        WmsSettings settings,
        string putawayTaskTitle,
        string warehouse)
    {
        try
        {
            ErrorLogService.LogInfo($"StockLedgerService: Applying Putaway Task '{putawayTaskTitle}' to local stock.");

            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Idempotency: avoid applying the same putaway task twice (e.g. Complete Putaway then Run ASN sync test).
            // Prevents double count in WMS Stock Balance (e.g. 15 pcs becoming 30).
            var alreadyAppliedSql = @"
                SELECT 1 FROM tabStockTransaction
                WHERE transaction_type = 'Putaway'
                  AND (reference_doc = @taskTitle OR wms_transaction_title = @taskTitle)
                LIMIT 1";
            await using (var checkCmd = new MySqlCommand(alreadyAppliedSql, connection))
            {
                checkCmd.Parameters.AddWithValue("@taskTitle", putawayTaskTitle);
                var already = await checkCmd.ExecuteScalarAsync();
                if (already != null && already != DBNull.Value)
                {
                    ErrorLogService.LogInfo($"StockLedgerService: Putaway Task '{putawayTaskTitle}' already applied (idempotent skip).");
                    return true;
                }
            }

            var hasTaskLocationId = await CheckColumnExistsAsync(connection, "tabPutawayTask", "location_id");
            var locationIdCol = hasTaskLocationId ? "location_id" : "NULL as location_id";
            var taskSql = $@"SELECT {locationIdCol} FROM tabPutawayTask WHERE title = @title LIMIT 1";
            await using var taskCmd = new MySqlCommand(taskSql, connection);
            taskCmd.Parameters.AddWithValue("@title", putawayTaskTitle);
            var targetBin = (await taskCmd.ExecuteScalarAsync())?.ToString()?.Trim();
            if (string.IsNullOrEmpty(targetBin))
            {
                ErrorLogService.LogInfo($"StockLedgerService: No location_id for Putaway Task '{putawayTaskTitle}'; trying rack+bin from lines.");
            }

            var hasLineLocationId = await CheckColumnExistsAsync(connection, "tabPutawayLine", "location_id");
            var lineLocationCol = hasLineLocationId ? "pl.location_id" : "NULL as location_id";
            var linesSql = $@"
                SELECT pl.item_code, SUM(pl.qty) as qty, pl.carton_id, pl.rack, pl.bin, {lineLocationCol}
                FROM tabPutawayLine pl
                WHERE pl.parent_title = @title
                GROUP BY pl.item_code, pl.carton_id, pl.rack, pl.bin{(hasLineLocationId ? ", pl.location_id" : "")}";
            await using var linesCmd = new MySqlCommand(linesSql, connection);
            linesCmd.Parameters.AddWithValue("@title", putawayTaskTitle);
            await using var linesReader = await linesCmd.ExecuteReaderAsync();

            var lines = new List<(string ItemCode, double Qty, string? CartonId, string? LineLocationId, string Rack, string Bin)>();
            while (await linesReader.ReadAsync())
            {
                var itemCode = linesReader.GetString(0);
                var qty = Convert.ToDouble(linesReader.GetDecimal(1));
                var cartonId = linesReader.IsDBNull(2) ? null : linesReader.GetString(2);
                var rack = linesReader.IsDBNull(3) ? "" : linesReader.GetString(3);
                var bin = linesReader.IsDBNull(4) ? "" : linesReader.GetString(4);
                var lineLoc = linesReader.IsDBNull(5) ? null : linesReader.GetString(5)?.Trim();
                lines.Add((itemCode, qty, cartonId, lineLoc, rack ?? "", bin ?? ""));
            }
            await linesReader.CloseAsync();

            if (lines.Count == 0)
            {
                ErrorLogService.LogInfo($"StockLedgerService: No putaway lines found for task '{putawayTaskTitle}'.");
                return true;
            }

            foreach (var line in lines)
            {
                var lineTargetBin = !string.IsNullOrEmpty(line.LineLocationId) ? line.LineLocationId : targetBin;
                if (string.IsNullOrEmpty(lineTargetBin) && !string.IsNullOrEmpty(line.Rack) && !string.IsNullOrEmpty(line.Bin))
                    lineTargetBin = $"{line.Rack}-{line.Bin}";
                if (string.IsNullOrEmpty(lineTargetBin))
                    lineTargetBin = line.Bin ?? line.Rack ?? "DOCK-01";

                // Decrease from dock/warehouse level (bin = null); skip in carton mode if dock has no bin
                try
                {
                    await UpdateStockAsync(
                        connection,
                        line.ItemCode,
                        warehouse,
                        binLocation: null,
                        qtyChange: -line.Qty,
                        transactionType: "Putaway",
                        referenceDocType: "Putaway Task",
                        referenceDoc: putawayTaskTitle,
                        wmsTransactionTitle: putawayTaskTitle,
                        sourceBin: "DOCK-01",
                        targetBin: lineTargetBin,
                        performedBy: null,
                        cartonId: line.CartonId,
                        settings: settings);
                }
                catch (Exception dex)
                {
                    ErrorLogService.LogInfo($"StockLedgerService: Dock decrease skipped for {line.ItemCode} (may be carton-only): {dex.Message}");
                }

                // Increase at target bin (this populates tabCartonStock for snapshot).
                // If line has no carton_id, use a synthetic id so carton path runs and tabCartonStock gets the row (snapshot reads only tabCartonStock).
                var cartonIdForTarget = !string.IsNullOrEmpty(line.CartonId)
                    ? line.CartonId
                    : $"PUTAWAY-{lineTargetBin}-{line.ItemCode}";
                await UpdateStockAsync(
                    connection,
                    line.ItemCode,
                    warehouse,
                    binLocation: lineTargetBin,
                    qtyChange: line.Qty,
                    transactionType: "Putaway",
                    referenceDocType: "Putaway Task",
                    referenceDoc: putawayTaskTitle,
                    wmsTransactionTitle: putawayTaskTitle,
                    sourceBin: "DOCK-01",
                    targetBin: lineTargetBin,
                    performedBy: null,
                    cartonId: cartonIdForTarget,
                    settings: settings);
                // Bin-level mode: UpdateStockAsync only writes tabStockLedger; snapshot reads tabCartonStock. Ensure tabCartonStock has this row.
                if (settings != null && !IsCartonLevelMode(settings))
                {
                    await CartonDataService.UpdateCartonStockAsync(
                        settings,
                        cartonIdForTarget,
                        line.ItemCode,
                        warehouse,
                        lineTargetBin,
                        line.Qty,
                        uom: null,
                        batchNo: null,
                        status: "PUTAWAY");
                }
            }

            ErrorLogService.LogInfo($"StockLedgerService: Applied Putaway Task '{putawayTaskTitle}' to local stock ({lines.Count} line groups).");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"StockLedgerService: Error applying Putaway Task '{putawayTaskTitle}' to local stock.", ex);
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
                            performedBy: null,
                            cartonId: null,
                            settings: settings
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
                        performedBy: null,
                        cartonId: null,
                        settings: settings
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
                            performedBy: null,
                            cartonId: null,
                            settings: settings
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
    /// Apply cycle count adjustments from a Cycle Count Task to the WMS DB (tabStockLedger / tabCartonStock and tabStockTransaction).
    /// Call this before building and pushing the WMS snapshot so ERPNext receives the post-cycle-count state.
    /// Idempotent: if this task was already applied (existing tabStockTransaction with same reference_doc), skip to avoid double ledger entries.
    /// </summary>
    public static async Task<bool> ApplyCycleCountFromTaskAsync(WmsSettings settings, CycleCountTask task)
    {
        if (task?.Lines == null || task.Lines.Count == 0)
            return true;

        var warehouseRaw = (task.Warehouse ?? "").Trim();
        if (string.IsNullOrEmpty(warehouseRaw))
        {
            ErrorLogService.LogInfo("StockLedgerService: ApplyCycleCountFromTaskAsync - task has no warehouse.");
            return false;
        }

        var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
        var warehouse = WarehouseDataService.ResolveToCode(warehouseRaw, warehouses);
        if (string.IsNullOrEmpty(warehouse))
            warehouse = warehouseRaw;

        var toApply = task.Lines
            .Where(l => Math.Abs(l.Discrepancy) > 1e-9)
            .ToList();
        if (toApply.Count == 0)
        {
            ErrorLogService.LogInfo($"StockLedgerService: No lines with discrepancy for task {task.Title}.");
            return true;
        }

        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Idempotency: avoid applying the same task twice (prevents double WMS Stock Ledger entries on ERPNext)
            var alreadyAppliedSql = @"
                SELECT 1 FROM tabStockTransaction
                WHERE transaction_type = 'CycleCount'
                  AND (reference_doc = @taskTitle OR wms_transaction_title = @taskTitle)
                LIMIT 1";
            await using (var checkCmd = new MySqlCommand(alreadyAppliedSql, connection))
            {
                checkCmd.Parameters.AddWithValue("@taskTitle", task.Title ?? "");
                var already = await checkCmd.ExecuteScalarAsync();
                if (already != null && already != DBNull.Value)
                {
                    ErrorLogService.LogInfo($"StockLedgerService: Task {task.Title} already applied (idempotent skip).");
                    return true;
                }
            }

            foreach (var line in toApply)
            {
                await UpdateStockAsync(
                    connection,
                    line.ItemCode,
                    warehouse,
                    binLocation: line.BinLocation,
                    qtyChange: line.Discrepancy,
                    transactionType: "CycleCount",
                    referenceDocType: "Cycle Count Task",
                    referenceDoc: task.Title ?? "",
                    wmsTransactionTitle: task.Title ?? "",
                    sourceBin: line.BinLocation,
                    targetBin: line.BinLocation,
                    performedBy: null,
                    cartonId: line.CartonId,
                    settings: settings);
            }

            ErrorLogService.LogInfo($"StockLedgerService: Applied {toApply.Count} cycle count adjustment(s) from task {task.Title}.");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"StockLedgerService: Error applying cycle count from task {task.Title}", ex);
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
                    performedBy: null,
                    cartonId: null,
                    settings: settings
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
    /// Supports both bin-level and carton-level modes
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
        string? performedBy,
        string? cartonId = null,
        WmsSettings? settings = null)
    {
        // If carton-level mode and carton ID provided, use carton stock
        if (settings != null && IsCartonLevelMode(settings) && !string.IsNullOrEmpty(cartonId) && !string.IsNullOrEmpty(binLocation))
        {
            await UpdateCartonStockAsync(
                settings,
                cartonId,
                itemCode,
                warehouse,
                binLocation,
                qtyChange,
                transactionType,
                referenceDocType,
                referenceDoc,
                wmsTransactionTitle,
                sourceBin,
                targetBin,
                performedBy);
            return;
        }

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
            // Check if carton_id column exists
            var hasCartonIdColumn = await CheckColumnExistsAsync(connection, "tabStockTransaction", "carton_id");
            var cartonIdColumn = hasCartonIdColumn ? ", carton_id" : "";
            var cartonIdValue = hasCartonIdColumn ? ", @cartonId" : "";

            var insertTransactionSql = $@"
                INSERT INTO tabStockTransaction 
                    (transaction_date, transaction_type, reference_doc_type, reference_doc, wms_transaction_title,
                     item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
                     source_bin, target_bin, performed_by{cartonIdColumn}, created_at)
                VALUES 
                    (NOW(), @transactionType, @referenceDocType, @referenceDoc, @wmsTransactionTitle,
                     @itemCode, @warehouse, @binLocation, @qtyChange, @currentQty, @newQty,
                     @sourceBin, @targetBin, @performedBy{cartonIdValue}, NOW())";

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
            if (hasCartonIdColumn && !string.IsNullOrEmpty(cartonId))
            {
                insertTransactionCmd.Parameters.AddWithValue("@cartonId", cartonId);
            }
            
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

            var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);

            // Check if carton_id column exists in tabStockLedger
            var hasCartonIdColumn = await CheckColumnExistsAsync(connection, "tabStockLedger", "carton_id");
            var cartonIdSelect = hasCartonIdColumn ? ", carton_id" : ", NULL as carton_id";
            
            var sql = $@"
                SELECT item_code, warehouse, bin_location, qty, reserved_qty,
                       qty_before, qty_reduced,
                       last_transaction_date, last_transaction_type, last_transaction_ref,
                       updated_at, created_at{cartonIdSelect}
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
                var cartonIdIndex = 12; // Index after created_at (11)
                var cartonId = hasCartonIdColumn && !reader.IsDBNull(cartonIdIndex) 
                    ? reader.GetString(cartonIdIndex) 
                    : null;
                
                // Calculate values based on user requirements:
                // - Qty = Transaction Qty (the quantity involved in the transaction)
                // - Available Qty = Qty after Deduction of this Transaction (stock after transaction)
                // - Qty Before = Stock before deduction of this transaction
                // - Qty +/- = Current transaction qty (negative for picking/reduction)
                
                var remainingStock = Convert.ToDouble(reader.GetDecimal(3)); // Remaining stock after transaction
                var reservedQty = Convert.ToDouble(reader.GetDecimal(4));
                var qtyBefore = reader.IsDBNull(5) ? (double?)null : Convert.ToDouble(reader.GetDecimal(5));
                var qtyReduced = reader.IsDBNull(6) ? (double?)null : Convert.ToDouble(reader.GetDecimal(6));
                
                // Calculate transaction quantity
                // IMPORTANT: qty_reduced should be negative for picking (e.g., -2.00)
                // If qty_reduced is positive and large (e.g., 100.00), it's likely an old record with wrong value
                // In that case, we should NOT use it as transaction qty
                double transactionQty;
                if (qtyReduced.HasValue)
                {
                    // For picking: qty_reduced should be negative (e.g., -2.00)
                    // For old records: qty_reduced might be positive 100.00 (wrong)
                    // Use absolute value, but if it's suspiciously large, try to calculate from qty_before
                    var absQtyReduced = Math.Abs(qtyReduced.Value);
                    
                    // If qty_before is valid and qty_reduced seems wrong (positive and large), use qty_before calculation
                    if (qtyBefore.HasValue && qtyBefore.Value > 0 && qtyReduced.Value > 0 && absQtyReduced > 10)
                    {
                        // Likely old record with wrong qty_reduced, calculate from qty_before
                        transactionQty = Math.Abs(qtyBefore.Value - remainingStock);
                    }
                    else
                    {
                        // Use qty_reduced (absolute value)
                        transactionQty = absQtyReduced;
                    }
                }
                else if (qtyBefore.HasValue && qtyBefore.Value > 0)
                {
                    // Calculate from before/after if qty_before is valid
                    transactionQty = Math.Abs(qtyBefore.Value - remainingStock);
                }
                else
                {
                    // Fallback: If no valid transaction data, show 0 (can't determine transaction qty)
                    // This is better than showing wrong value
                    transactionQty = 0;
                }
                
                stockList.Add(new StockLedger
                {
                    ItemCode = reader.GetString(0),
                    Warehouse = WarehouseDataService.ResolveToCode(reader.GetString(1), warehouses),
                    BinLocation = reader.IsDBNull(2) ? null : reader.GetString(2),
                    Qty = transactionQty, // Transaction Qty (the quantity involved in the transaction)
                    ReservedQty = reservedQty,
                    RemainingStock = remainingStock, // Remaining stock after transaction
                    QtyBefore = qtyBefore, // Stock before deduction of this transaction
                    QtyReduced = qtyReduced, // Current transaction qty (negative for picking, positive for increase)
                    LastTransactionDate = reader.IsDBNull(7) ? null : reader.GetDateTime(7),
                    LastTransactionType = reader.IsDBNull(8) ? null : reader.GetString(8),
                    LastTransactionRef = reader.IsDBNull(9) ? null : reader.GetString(9),
                    UpdatedAt = reader.GetDateTime(10),
                    CreatedAt = reader.GetDateTime(11),
                    CartonId = cartonId
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

            var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);

            // Check if carton_id column exists
            var hasCartonIdColumn = await CheckColumnExistsAsync(connection, "tabStockLedger", "carton_id");
            var cartonIdSelect = hasCartonIdColumn ? ", carton_id" : ", NULL as carton_id";
            
            var sql = $@"
                SELECT item_code, warehouse, bin_location, qty, reserved_qty,
                       qty_before, qty_reduced,
                       last_transaction_date, last_transaction_type, last_transaction_ref,
                       updated_at, created_at{cartonIdSelect}
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
                // Calculate values based on user requirements:
                // - Qty = Transaction Qty (the quantity involved in the transaction)
                // - Available Qty = Qty after Deduction of this Transaction (stock after transaction)
                // - Qty Before = Stock before deduction of this transaction
                // - Qty +/- = Current transaction qty (negative for picking/reduction)
                
                var remainingStock = Convert.ToDouble(reader.GetDecimal(3)); // Remaining stock after transaction
                var reservedQty = Convert.ToDouble(reader.GetDecimal(4));
                var qtyBefore = reader.IsDBNull(5) ? (double?)null : Convert.ToDouble(reader.GetDecimal(5));
                var qtyReduced = reader.IsDBNull(6) ? (double?)null : Convert.ToDouble(reader.GetDecimal(6));
                
                // Calculate transaction quantity
                // IMPORTANT: qty_reduced should be negative for picking (e.g., -2.00)
                // If qty_reduced is positive and large (e.g., 100.00), it's likely an old record with wrong value
                double transactionQty;
                if (qtyReduced.HasValue)
                {
                    var absQtyReduced = Math.Abs(qtyReduced.Value);
                    
                    // If qty_before is valid and qty_reduced seems wrong (positive and large), use qty_before calculation
                    if (qtyBefore.HasValue && qtyBefore.Value > 0 && qtyReduced.Value > 0 && absQtyReduced > 10)
                    {
                        // Likely old record with wrong qty_reduced, calculate from qty_before
                        transactionQty = Math.Abs(qtyBefore.Value - remainingStock);
                    }
                    else
                    {
                        // Use qty_reduced (absolute value)
                        transactionQty = absQtyReduced;
                    }
                }
                else if (qtyBefore.HasValue && qtyBefore.Value > 0)
                {
                    transactionQty = Math.Abs(qtyBefore.Value - remainingStock);
                }
                else
                {
                    // Fallback: Show 0 if no valid transaction data
                    transactionQty = 0;
                }
                
                var cartonIdIndex = 12; // Index after created_at (11)
                var cartonId = hasCartonIdColumn && !reader.IsDBNull(cartonIdIndex) 
                    ? reader.GetString(cartonIdIndex) 
                    : null;
                
                stockList.Add(new StockLedger
                {
                    ItemCode = reader.GetString(0),
                    Warehouse = WarehouseDataService.ResolveToCode(reader.GetString(1), warehouses),
                    BinLocation = reader.IsDBNull(2) ? null : reader.GetString(2),
                    CartonId = cartonId,
                    Qty = transactionQty, // Transaction Qty (the quantity involved in the transaction)
                    ReservedQty = reservedQty,
                    RemainingStock = remainingStock, // Remaining stock after transaction
                    QtyBefore = qtyBefore, // Stock before deduction of this transaction
                    QtyReduced = qtyReduced, // Current transaction qty (negative for picking, positive for increase)
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

            var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);

            // Check if carton_id column exists
            var hasCartonIdColumn = await CheckColumnExistsAsync(connection, "tabStockLedger", "carton_id");
            var cartonIdSelect = hasCartonIdColumn ? ", carton_id" : ", NULL as carton_id";
            
            // Get paginated data
            var offset = (result.Page - 1) * result.PageSize;
            var sql = $@"
                SELECT item_code, warehouse, bin_location, qty, reserved_qty,
                       qty_before, qty_reduced,
                       last_transaction_date, last_transaction_type, last_transaction_ref,
                       updated_at, created_at{cartonIdSelect}
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
                // Calculate values based on user requirements:
                // - Qty = Transaction Qty (the quantity involved in the transaction)
                // - Available Qty = Qty after Deduction of this Transaction (stock after transaction)
                // - Qty Before = Stock before deduction of this transaction
                // - Qty +/- = Current transaction qty (negative for picking/reduction)
                
                var remainingStock = Convert.ToDouble(reader.GetDecimal(3)); // Remaining stock after transaction
                var reservedQty = Convert.ToDouble(reader.GetDecimal(4));
                var qtyBefore = reader.IsDBNull(5) ? (double?)null : Convert.ToDouble(reader.GetDecimal(5));
                var qtyReduced = reader.IsDBNull(6) ? (double?)null : Convert.ToDouble(reader.GetDecimal(6));
                
                // Calculate transaction quantity
                // IMPORTANT: qty_reduced should be negative for picking (e.g., -2.00)
                // If qty_reduced is positive and large (e.g., 100.00), it's likely an old record with wrong value
                double transactionQty;
                if (qtyReduced.HasValue)
                {
                    var absQtyReduced = Math.Abs(qtyReduced.Value);
                    
                    // If qty_before is valid and qty_reduced seems wrong (positive and large), use qty_before calculation
                    if (qtyBefore.HasValue && qtyBefore.Value > 0 && qtyReduced.Value > 0 && absQtyReduced > 10)
                    {
                        // Likely old record with wrong qty_reduced, calculate from qty_before
                        transactionQty = Math.Abs(qtyBefore.Value - remainingStock);
                    }
                    else
                    {
                        // Use qty_reduced (absolute value)
                        transactionQty = absQtyReduced;
                    }
                }
                else if (qtyBefore.HasValue && qtyBefore.Value > 0)
                {
                    transactionQty = Math.Abs(qtyBefore.Value - remainingStock);
                }
                else
                {
                    // Fallback: Show 0 if no valid transaction data
                    transactionQty = 0;
                }
                
                var cartonIdIndex = 12; // Index after created_at (11)
                var cartonId = hasCartonIdColumn && !reader.IsDBNull(cartonIdIndex) 
                    ? reader.GetString(cartonIdIndex) 
                    : null;
                
                stockList.Add(new StockLedger
                {
                    ItemCode = reader.GetString(0),
                    Warehouse = WarehouseDataService.ResolveToCode(reader.GetString(1), warehouses),
                    BinLocation = reader.IsDBNull(2) ? null : reader.GetString(2),
                    CartonId = cartonId,
                    Qty = transactionQty, // Transaction Qty (the quantity involved in the transaction)
                    ReservedQty = reservedQty,
                    RemainingStock = remainingStock, // Remaining stock after transaction
                    QtyBefore = qtyBefore, // Stock before deduction of this transaction
                    QtyReduced = qtyReduced, // Current transaction qty (negative for picking, positive for increase)
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

    /// <summary>
    /// Check if a column exists in a table
    /// </summary>
    private static async Task<bool> CheckColumnExistsAsync(MySqlConnection connection, string tableName, string columnName)
    {
        try
        {
            var sql = @"
                SELECT COUNT(*) 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND LOWER(TABLE_NAME) = LOWER(@tableName)
                AND LOWER(COLUMN_NAME) = LOWER(@columnName)";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@tableName", tableName);
            cmd.Parameters.AddWithValue("@columnName", columnName);
            var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            return count > 0;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Update carton-level stock (when carton mode is enabled)
    /// </summary>
    private static async Task UpdateCartonStockAsync(
        WmsSettings settings,
        string cartonId,
        string itemCode,
        string warehouse,
        string binLocation,
        double qtyChange,
        string transactionType,
        string? referenceDocType,
        string referenceDoc,
        string wmsTransactionTitle,
        string? sourceBin,
        string? targetBin,
        string? performedBy)
    {
        try
        {
            // Update carton stock using CartonDataService
            var success = await CartonDataService.UpdateCartonStockAsync(
                settings,
                cartonId,
                itemCode,
                warehouse,
                binLocation,
                qtyChange,
                uom: null,
                batchNo: null,
                status: transactionType == "Putaway" ? "PUTAWAY" : 
                       transactionType == "Picking" ? "PICKED" : "PUTAWAY");

            if (!success)
            {
                ErrorLogService.LogError($"StockLedgerService: Failed to update carton stock for {cartonId}");
                return;
            }

            // Also update carton location if moving between bins
            if (!string.IsNullOrEmpty(sourceBin) && !string.IsNullOrEmpty(targetBin) && sourceBin != targetBin)
            {
                await CartonDataService.MoveCartonToBinAsync(settings, cartonId, targetBin, warehouse);
            }

            // Log to stock transaction (with carton_id)
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Get current carton stock for qty_before/qty_after
            var currentStock = await CartonDataService.GetCartonStockAsync(settings, cartonId, itemCode, warehouse, binLocation);
            var currentQty = currentStock.FirstOrDefault()?.Qty ?? 0;
            var newQty = currentQty; // Already updated by CartonDataService

            var hasCartonIdColumn = await CheckColumnExistsAsync(connection, "tabStockTransaction", "carton_id");
            var cartonIdColumn = hasCartonIdColumn ? ", carton_id" : "";
            var cartonIdValue = hasCartonIdColumn ? ", @cartonId" : "";

            var insertTransactionSql = $@"
                INSERT INTO tabStockTransaction 
                    (transaction_date, transaction_type, reference_doc_type, reference_doc, wms_transaction_title,
                     item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
                     source_bin, target_bin, performed_by{cartonIdColumn}, created_at)
                VALUES 
                    (NOW(), @transactionType, @referenceDocType, @referenceDoc, @wmsTransactionTitle,
                     @itemCode, @warehouse, @binLocation, @qtyChange, @qtyBefore, @qtyAfter,
                     @sourceBin, @targetBin, @performedBy{cartonIdValue}, NOW())";

            await using var cmd = new MySqlCommand(insertTransactionSql, connection);
            cmd.Parameters.AddWithValue("@transactionType", transactionType);
            cmd.Parameters.AddWithValue("@referenceDocType", referenceDocType ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@referenceDoc", referenceDoc);
            cmd.Parameters.AddWithValue("@wmsTransactionTitle", wmsTransactionTitle);
            cmd.Parameters.AddWithValue("@itemCode", itemCode);
            cmd.Parameters.AddWithValue("@warehouse", warehouse);
            cmd.Parameters.AddWithValue("@binLocation", binLocation);
            cmd.Parameters.AddWithValue("@qtyChange", qtyChange);
            cmd.Parameters.AddWithValue("@qtyBefore", currentQty - qtyChange);
            cmd.Parameters.AddWithValue("@qtyAfter", newQty);
            cmd.Parameters.AddWithValue("@sourceBin", sourceBin ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@targetBin", targetBin ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@performedBy", performedBy ?? (object)DBNull.Value);
            if (hasCartonIdColumn)
            {
                cmd.Parameters.AddWithValue("@cartonId", cartonId);
            }

            await cmd.ExecuteNonQueryAsync();

            ErrorLogService.LogInfo($"StockLedgerService: Updated carton stock for {cartonId} @ {warehouse}/{binLocation}: {currentQty - qtyChange} → {newQty} (change: {qtyChange:+0.00;-0.00})");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"StockLedgerService: Error updating carton stock for {cartonId}", ex);
            throw;
        }
    }
}

