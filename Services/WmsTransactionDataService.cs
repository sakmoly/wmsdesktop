using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class WmsTransactionDataService
{
    /// <summary>
    /// Get all WMS Transactions from database
    /// </summary>
    public static async Task<List<WmsTransaction>> GetWmsTransactionsAsync(WmsSettings settings)
    {
        var transactions = new List<WmsTransaction>();
        
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            ErrorLogService.LogInfo("Loading WMS Transactions from database...");

            // Get all WMS Transactions
            var sql = @"SELECT title, status, operation_type, transaction_date, assigned_to, 
                               source_warehouse, target_warehouse, reference_doc_type, reference_doc,
                               transaction_status, primary_assignee, completion_progress, is_locked,
                               receiving_dock, require_qc, putaway_strategy, suggest_bins,
                               picking_wave, pick_route, cycle_count_zone, freeze_stock_during_count
                        FROM tabWmsTransaction
                        ORDER BY transaction_date DESC, title";
            
            await using var cmd = new MySqlCommand(sql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();

            var transactionTitles = new List<string>();
            while (await reader.ReadAsync())
            {
                var title = reader.GetString(0);
                transactionTitles.Add(title);
                
                // Parse operation type
                var operationTypeStr = reader.GetString(2);
                OperationType operationType = OperationType.Receiving;
                if (Enum.TryParse<OperationType>(operationTypeStr, true, out var parsedOp))
                {
                    operationType = parsedOp;
                }

                transactions.Add(new WmsTransaction
                {
                    Title = title,
                    Status = reader.GetString(1),
                    OperationType = operationType,
                    TransactionDate = reader.GetDateTime(3),
                    AssignedTo = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                    SourceWarehouse = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                    TargetWarehouse = reader.IsDBNull(6) ? string.Empty : reader.GetString(6),
                    ReferenceDocType = reader.IsDBNull(7) ? null : reader.GetString(7),
                    ReferenceDoc = reader.IsDBNull(8) ? null : reader.GetString(8),
                    TransactionStatus = reader.GetString(9),
                    PrimaryAssignee = reader.IsDBNull(10) ? null : reader.GetString(10),
                    CompletionProgress = reader.IsDBNull(11) ? 0 : Convert.ToDouble(reader.GetDecimal(11)),
                    IsLocked = reader.IsDBNull(12) ? false : reader.GetBoolean(12),
                    ReceivingDock = reader.IsDBNull(13) ? null : reader.GetString(13),
                    RequireQC = reader.IsDBNull(14) ? false : reader.GetBoolean(14),
                    PutawayStrategy = reader.IsDBNull(15) ? null : reader.GetString(15),
                    SuggestBins = reader.IsDBNull(16) ? true : reader.GetBoolean(16),
                    PickingWave = reader.IsDBNull(17) ? null : reader.GetString(17),
                    PickRoute = reader.IsDBNull(18) ? null : reader.GetString(18),
                    CycleCountZone = reader.IsDBNull(19) ? null : reader.GetString(19),
                    FreezeStockDuringCount = reader.IsDBNull(20) ? true : reader.GetBoolean(20),
                    Details = new ObservableCollection<WmsTransactionItemDetail>(),
                    ConcurrentUsers = new ObservableCollection<WmsActiveUser>()
                });
            }

            await reader.CloseAsync();

            // Get Transaction Details for each transaction
            if (transactionTitles.Count > 0)
            {
                var placeholders = string.Join(",", transactionTitles.Select((_, i) => $"@title{i}"));
                var detailsSql = $@"SELECT parent_title, item_code, item_name, qty, uom, container_id,
                                           source_bin, target_bin, actual_qty_counted, discrepancy,
                                           assignment_status, assigned_operator, actual_completion_time
                                    FROM tabWmsTransactionDetail
                                    WHERE parent_title IN ({placeholders})
                                    ORDER BY parent_title, item_code";
                
                await using var detailsCmd = new MySqlCommand(detailsSql, connection);
                for (int i = 0; i < transactionTitles.Count; i++)
                {
                    detailsCmd.Parameters.AddWithValue($"@title{i}", transactionTitles[i]);
                }
                
                await using var detailsReader = await detailsCmd.ExecuteReaderAsync();
                var detailsDict = new Dictionary<string, List<WmsTransactionItemDetail>>();
                
                while (await detailsReader.ReadAsync())
                {
                    var parentTitle = detailsReader.GetString(0);
                    if (!detailsDict.ContainsKey(parentTitle))
                    {
                        detailsDict[parentTitle] = new List<WmsTransactionItemDetail>();
                    }

                    detailsDict[parentTitle].Add(new WmsTransactionItemDetail
                    {
                        ItemCode = detailsReader.GetString(1),
                        ItemName = detailsReader.IsDBNull(2) ? string.Empty : detailsReader.GetString(2),
                        Qty = Convert.ToDouble(detailsReader.GetDecimal(3)),
                        Uom = detailsReader.IsDBNull(4) ? "Nos" : detailsReader.GetString(4),
                        ContainerId = detailsReader.IsDBNull(5) ? null : detailsReader.GetString(5),
                        SourceBin = detailsReader.IsDBNull(6) ? null : detailsReader.GetString(6),
                        TargetBin = detailsReader.IsDBNull(7) ? null : detailsReader.GetString(7),
                        ActualQtyCounted = detailsReader.IsDBNull(8) ? null : (double?)Convert.ToDouble(detailsReader.GetDecimal(8)),
                        Discrepancy = detailsReader.IsDBNull(9) ? null : (double?)Convert.ToDouble(detailsReader.GetDecimal(9)),
                        AssignmentStatus = detailsReader.IsDBNull(10) ? "Pending" : detailsReader.GetString(10),
                        AssignedOperator = detailsReader.IsDBNull(11) ? null : detailsReader.GetString(11),
                        ActualCompletionTime = detailsReader.IsDBNull(12) ? null : (DateTime?)detailsReader.GetDateTime(12)
                    });
                }

                await detailsReader.CloseAsync();

                // Assign details to transactions
                for (int i = 0; i < transactions.Count; i++)
                {
                    var transaction = transactions[i];
                    var details = detailsDict.ContainsKey(transaction.Title) 
                        ? detailsDict[transaction.Title] 
                        : new List<WmsTransactionItemDetail>();
                    
                    transactions[i].Details = new ObservableCollection<WmsTransactionItemDetail>(details);
                    
                    // Calculate concurrent users from assigned operators
                    var userGroups = details
                        .Where(d => !string.IsNullOrEmpty(d.AssignedOperator))
                        .GroupBy(d => d.AssignedOperator)
                        .Select(g => new WmsActiveUser
                        {
                            User = g.Key!,
                            AssignedItemsCount = g.Count(),
                            CompletedItemsCount = g.Count(d => d.AssignmentStatus == "Done"),
                            Status = "Active"
                        })
                        .ToList();
                    
                    transactions[i].ConcurrentUsers = new ObservableCollection<WmsActiveUser>(userGroups);
                }
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading WMS Transactions from database", ex);
        }

        ErrorLogService.LogInfo($"Loaded {transactions.Count} WMS Transactions from database");
        return transactions;
    }

    /// <summary>
    /// Create or update a WMS Transaction in the database
    /// </summary>
    public static async Task<bool> SaveWmsTransactionAsync(WmsSettings settings, WmsTransaction transaction)
    {
        try
        {
            ErrorLogService.LogInfo($"WmsTransactionDataService: Saving transaction '{transaction.Title}'");
            
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Use INSERT ... ON DUPLICATE KEY UPDATE for upsert
            var sql = @"INSERT INTO tabWmsTransaction 
                        (title, status, operation_type, transaction_date, assigned_to, 
                         source_warehouse, target_warehouse, reference_doc_type, reference_doc,
                         transaction_status, primary_assignee, completion_progress, is_locked,
                         receiving_dock, require_qc, putaway_strategy, suggest_bins,
                         picking_wave, pick_route, cycle_count_zone, freeze_stock_during_count)
                        VALUES 
                        (@title, @status, @operation_type, @transaction_date, @assigned_to,
                         @source_warehouse, @target_warehouse, @reference_doc_type, @reference_doc,
                         @transaction_status, @primary_assignee, @completion_progress, @is_locked,
                         @receiving_dock, @require_qc, @putaway_strategy, @suggest_bins,
                         @picking_wave, @pick_route, @cycle_count_zone, @freeze_stock_during_count)
                        ON DUPLICATE KEY UPDATE
                         status = VALUES(status),
                         operation_type = VALUES(operation_type),
                         transaction_date = VALUES(transaction_date),
                         assigned_to = VALUES(assigned_to),
                         source_warehouse = VALUES(source_warehouse),
                         target_warehouse = VALUES(target_warehouse),
                         reference_doc_type = VALUES(reference_doc_type),
                         reference_doc = VALUES(reference_doc),
                         transaction_status = VALUES(transaction_status),
                         primary_assignee = VALUES(primary_assignee),
                         completion_progress = VALUES(completion_progress),
                         is_locked = VALUES(is_locked),
                         receiving_dock = VALUES(receiving_dock),
                         require_qc = VALUES(require_qc),
                         putaway_strategy = VALUES(putaway_strategy),
                         suggest_bins = VALUES(suggest_bins),
                         picking_wave = VALUES(picking_wave),
                         pick_route = VALUES(pick_route),
                         cycle_count_zone = VALUES(cycle_count_zone),
                         freeze_stock_during_count = VALUES(freeze_stock_during_count),
                         updated_at = CURRENT_TIMESTAMP";

            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@title", transaction.Title);
            cmd.Parameters.AddWithValue("@status", transaction.Status);
            cmd.Parameters.AddWithValue("@operation_type", transaction.OperationType.ToString());
            cmd.Parameters.AddWithValue("@transaction_date", transaction.TransactionDate);
            cmd.Parameters.AddWithValue("@assigned_to", string.IsNullOrEmpty(transaction.AssignedTo) ? (object)DBNull.Value : transaction.AssignedTo);
            cmd.Parameters.AddWithValue("@source_warehouse", string.IsNullOrEmpty(transaction.SourceWarehouse) ? (object)DBNull.Value : transaction.SourceWarehouse);
            cmd.Parameters.AddWithValue("@target_warehouse", string.IsNullOrEmpty(transaction.TargetWarehouse) ? (object)DBNull.Value : transaction.TargetWarehouse);
            cmd.Parameters.AddWithValue("@reference_doc_type", transaction.ReferenceDocType ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@reference_doc", transaction.ReferenceDoc ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@transaction_status", transaction.TransactionStatus);
            cmd.Parameters.AddWithValue("@primary_assignee", transaction.PrimaryAssignee ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@completion_progress", transaction.CompletionProgress);
            cmd.Parameters.AddWithValue("@is_locked", transaction.IsLocked);
            cmd.Parameters.AddWithValue("@receiving_dock", transaction.ReceivingDock ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@require_qc", transaction.RequireQC);
            cmd.Parameters.AddWithValue("@putaway_strategy", transaction.PutawayStrategy ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@suggest_bins", transaction.SuggestBins);
            cmd.Parameters.AddWithValue("@picking_wave", transaction.PickingWave ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@pick_route", transaction.PickRoute ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@cycle_count_zone", transaction.CycleCountZone ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@freeze_stock_during_count", transaction.FreezeStockDuringCount);

            await cmd.ExecuteNonQueryAsync();

            // Delete existing details and insert fresh ones
            var deleteDetailsSql = "DELETE FROM tabWmsTransactionDetail WHERE parent_title = @title";
            await using var deleteCmd = new MySqlCommand(deleteDetailsSql, connection);
            deleteCmd.Parameters.AddWithValue("@title", transaction.Title);
            await deleteCmd.ExecuteNonQueryAsync();

            // Insert transaction details
            if (transaction.Details != null && transaction.Details.Count > 0)
            {
                var insertDetailSql = @"INSERT INTO tabWmsTransactionDetail
                                       (parent_title, item_code, item_name, qty, uom, container_id,
                                        source_bin, target_bin, actual_qty_counted, discrepancy,
                                        assignment_status, assigned_operator, actual_completion_time)
                                       VALUES
                                       (@parent_title, @item_code, @item_name, @qty, @uom, @container_id,
                                        @source_bin, @target_bin, @actual_qty_counted, @discrepancy,
                                        @assignment_status, @assigned_operator, @actual_completion_time)";

                foreach (var detail in transaction.Details)
                {
                    await using var detailCmd = new MySqlCommand(insertDetailSql, connection);
                    detailCmd.Parameters.AddWithValue("@parent_title", transaction.Title);
                    detailCmd.Parameters.AddWithValue("@item_code", detail.ItemCode);
                    detailCmd.Parameters.AddWithValue("@item_name", string.IsNullOrEmpty(detail.ItemName) ? (object)DBNull.Value : detail.ItemName);
                    detailCmd.Parameters.AddWithValue("@qty", detail.Qty);
                    detailCmd.Parameters.AddWithValue("@uom", string.IsNullOrEmpty(detail.Uom) ? "Nos" : detail.Uom);
                    detailCmd.Parameters.AddWithValue("@container_id", detail.ContainerId ?? (object)DBNull.Value);
                    detailCmd.Parameters.AddWithValue("@source_bin", detail.SourceBin ?? (object)DBNull.Value);
                    detailCmd.Parameters.AddWithValue("@target_bin", detail.TargetBin ?? (object)DBNull.Value);
                    detailCmd.Parameters.AddWithValue("@actual_qty_counted", detail.ActualQtyCounted ?? (object)DBNull.Value);
                    detailCmd.Parameters.AddWithValue("@discrepancy", detail.Discrepancy ?? (object)DBNull.Value);
                    detailCmd.Parameters.AddWithValue("@assignment_status", detail.AssignmentStatus);
                    detailCmd.Parameters.AddWithValue("@assigned_operator", detail.AssignedOperator ?? (object)DBNull.Value);
                    detailCmd.Parameters.AddWithValue("@actual_completion_time", detail.ActualCompletionTime ?? (object)DBNull.Value);
                    
                    await detailCmd.ExecuteNonQueryAsync();
                }
            }

            ErrorLogService.LogInfo($"WmsTransactionDataService: Successfully saved transaction '{transaction.Title}'");

            // Update stock if transaction is completed (use warehouse code for consistency in Stock Ledger)
            if (transaction.TransactionStatus == "Completed")
            {
                try
                {
                    var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
                    var targetWarehouseCode = WarehouseDataService.ResolveToCode(transaction.TargetWarehouse, warehouses) ?? transaction.TargetWarehouse;
                    var sourceWarehouseCode = WarehouseDataService.ResolveToCode(transaction.SourceWarehouse, warehouses) ?? transaction.SourceWarehouse;

                    switch (transaction.OperationType)
                    {
                        case OperationType.Receiving:
                            if (transaction.ReferenceDocType == "Transfer In")
                            {
                                await StockLedgerService.UpdateStockAfterTransferInAsync(
                                    settings, transaction.Title, targetWarehouseCode);
                            }
                            else
                            {
                                await StockLedgerService.UpdateStockAfterReceivingAsync(
                                    settings, transaction.Title, targetWarehouseCode);
                            }
                            break;

                        case OperationType.Putaway:
                            await StockLedgerService.UpdateStockAfterPutawayAsync(
                                settings, transaction.Title, targetWarehouseCode);
                            break;

                        case OperationType.Picking:
                            if (transaction.ReferenceDocType == "Material Request")
                            {
                                await StockLedgerService.UpdateStockAfterMaterialRequestAsync(
                                    settings, transaction.Title, sourceWarehouseCode);
                            }
                            else
                            {
                                await StockLedgerService.UpdateStockAfterPickingAsync(
                                    settings, transaction.Title, sourceWarehouseCode);
                            }
                            break;

                        case OperationType.CycleCount:
                            await StockLedgerService.UpdateStockAfterCycleCountAsync(
                                settings, transaction.Title, sourceWarehouseCode);
                            break;
                    }
                }
                catch (Exception stockEx)
                {
                    // Log error but don't fail the transaction save
                    ErrorLogService.LogError($"WmsTransactionDataService: Error updating stock for transaction '{transaction.Title}'", stockEx);
                }

                // Push WMS snapshot to ERPNext so stock stays in sync (fire-and-forget)
                WmsSnapshotDataService.TryPushSnapshotAfterTransaction(settings);
            }

            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"Error saving WMS Transaction '{transaction.Title}'", ex);
            return false;
        }
    }

    /// <summary>
    /// Generate a unique transaction title
    /// </summary>
    public static async Task<string> GenerateTransactionTitleAsync(WmsSettings settings, OperationType operationType)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Get the highest transaction number
            var sql = @"SELECT title FROM tabWmsTransaction 
                       WHERE title LIKE 'WMS-TRANS-%' 
                       ORDER BY title DESC LIMIT 1";
            
            await using var cmd = new MySqlCommand(sql, connection);
            var result = await cmd.ExecuteScalarAsync();
            
            if (result == null || result == DBNull.Value)
            {
                return "WMS-TRANS-0001";
            }

            var lastTitle = result.ToString()!;
            if (lastTitle.StartsWith("WMS-TRANS-"))
            {
                var numberPart = lastTitle.Substring("WMS-TRANS-".Length);
                if (int.TryParse(numberPart, out var lastNumber))
                {
                    return $"WMS-TRANS-{(lastNumber + 1):D4}";
                }
            }

            return "WMS-TRANS-0001";
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error generating transaction title", ex);
            return $"WMS-TRANS-{DateTime.Now:yyyyMMddHHmmss}";
        }
    }
}

