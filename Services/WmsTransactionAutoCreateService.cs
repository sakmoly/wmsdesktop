using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class WmsTransactionAutoCreateService
{
    /// <summary>
    /// Automatically create a Receiving transaction when an Inbound Session is created
    /// </summary>
    public static async Task<bool> CreateReceivingTransactionFromSessionAsync(
        WmsSettings settings, 
        string inboundSessionTitle, 
        string asnNo, 
        string? dock, 
        string startedBy)
    {
        try
        {
            // Check if transaction already exists for this session
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if transaction already exists
            var checkSql = @"SELECT COUNT(*) FROM tabWmsTransaction 
                            WHERE reference_doc = @asn_no 
                            AND operation_type = 'Receiving'";
            await using var checkCmd = new MySqlCommand(checkSql, connection);
            checkCmd.Parameters.AddWithValue("@asn_no", asnNo);
            var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;

            if (exists)
            {
                ErrorLogService.LogInfo($"WmsTransactionAutoCreateService: Receiving transaction already exists for ASN {asnNo}");
                return true; // Already exists, that's OK
            }

            // Get ASN details to populate transaction
            var asnSql = @"SELECT purchase_order, supplier 
                          FROM tabAdvanceShippingNotice 
                          WHERE title = @asn_no LIMIT 1";
            await using var asnCmd = new MySqlCommand(asnSql, connection);
            asnCmd.Parameters.AddWithValue("@asn_no", asnNo);
            await using var asnReader = await asnCmd.ExecuteReaderAsync();

            string? purchaseOrder = null;
            if (await asnReader.ReadAsync())
            {
                purchaseOrder = asnReader.IsDBNull(0) ? null : asnReader.GetString(0);
            }
            await asnReader.CloseAsync();

            // Get ASN item details to populate transaction details
            var itemDetailsSql = @"SELECT item_code, shipped_qty, carton_id 
                                  FROM tabAsnItemDetails 
                                  WHERE parent_title = @asn_no";
            await using var itemsCmd = new MySqlCommand(itemDetailsSql, connection);
            itemsCmd.Parameters.AddWithValue("@asn_no", asnNo);
            await using var itemsReader = await itemsCmd.ExecuteReaderAsync();

            var details = new List<WmsTransactionItemDetail>();
            while (await itemsReader.ReadAsync())
            {
                var itemCode = itemsReader.GetString(0);
                var qty = Convert.ToDouble(itemsReader.GetDecimal(1));
                var cartonId = itemsReader.IsDBNull(2) ? null : itemsReader.GetString(2);

                // Get item name
                var itemName = await GetItemNameAsync(settings, itemCode);

                details.Add(new WmsTransactionItemDetail
                {
                    ItemCode = itemCode,
                    ItemName = itemName,
                    Qty = qty,
                    Uom = "Nos",
                    ContainerId = cartonId,
                    SourceBin = dock ?? "DOCK-01",
                    TargetBin = null, // Will be assigned during putaway
                    AssignmentStatus = "Pending",
                    AssignedOperator = null
                });
            }
            await itemsReader.CloseAsync();

            // Generate transaction title
            var transactionTitle = await WmsTransactionDataService.GenerateTransactionTitleAsync(settings, OperationType.Receiving);

            // Create transaction
            var transaction = new WmsTransaction
            {
                Title = transactionTitle,
                Status = "Submitted",
                OperationType = OperationType.Receiving,
                TransactionDate = DateTime.Now,
                AssignedTo = startedBy,
                SourceWarehouse = "WH-MAIN", // Default, can be updated
                TargetWarehouse = "WH-MAIN",
                ReferenceDocType = "Advance Shipping Notice",
                ReferenceDoc = asnNo,
                TransactionStatus = "In Progress",
                PrimaryAssignee = startedBy,
                CompletionProgress = 0,
                IsLocked = false,
                Details = new ObservableCollection<WmsTransactionItemDetail>(details),
                ConcurrentUsers = new ObservableCollection<WmsActiveUser>(),
                ReceivingDock = dock,
                RequireQC = false
            };

            // Save transaction
            var success = await WmsTransactionDataService.SaveWmsTransactionAsync(settings, transaction);
            if (success)
            {
                ErrorLogService.LogInfo($"WmsTransactionAutoCreateService: Created Receiving transaction {transactionTitle} for ASN {asnNo}");
            }
            return success;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"WmsTransactionAutoCreateService: Error creating Receiving transaction for ASN {asnNo}", ex);
            return false;
        }
    }

    /// <summary>
    /// Automatically create a Receiving transaction when an Inbound Session is created for Transfer In
    /// </summary>
    public static async Task<bool> CreateReceivingTransactionFromTransferInAsync(
        WmsSettings settings, 
        string inboundSessionTitle, 
        string transferInTitle, 
        string? dock, 
        string startedBy)
    {
        try
        {
            // Check if transaction already exists for this Transfer In
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if transaction already exists
            var checkSql = @"SELECT COUNT(*) FROM tabWmsTransaction 
                            WHERE reference_doc = @transfer_in 
                            AND operation_type = 'Receiving'
                            AND reference_doc_type = 'Transfer In'";
            await using var checkCmd = new MySqlCommand(checkSql, connection);
            checkCmd.Parameters.AddWithValue("@transfer_in", transferInTitle);
            var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;

            if (exists)
            {
                ErrorLogService.LogInfo($"WmsTransactionAutoCreateService: Receiving transaction already exists for Transfer In {transferInTitle}");
                return true; // Already exists, that's OK
            }

            // Get Transfer In details
            var tiSql = @"SELECT from_showroom, to_warehouse 
                          FROM tabTransferIn 
                          WHERE title = @transfer_in LIMIT 1";
            await using var tiCmd = new MySqlCommand(tiSql, connection);
            tiCmd.Parameters.AddWithValue("@transfer_in", transferInTitle);
            await using var tiReader = await tiCmd.ExecuteReaderAsync();

            string toWarehouse = "WH-MAIN";
            if (await tiReader.ReadAsync())
            {
                toWarehouse = tiReader.IsDBNull(1) ? "WH-MAIN" : tiReader.GetString(1);
            }
            await tiReader.CloseAsync();

            // Get Transfer In item details to populate transaction details
            var itemDetailsSql = @"SELECT item_code, qty, carton_id 
                                  FROM tabTransferInItem 
                                  WHERE parent_title = @transfer_in";
            await using var itemsCmd = new MySqlCommand(itemDetailsSql, connection);
            itemsCmd.Parameters.AddWithValue("@transfer_in", transferInTitle);
            await using var itemsReader = await itemsCmd.ExecuteReaderAsync();

            var details = new List<WmsTransactionItemDetail>();
            while (await itemsReader.ReadAsync())
            {
                var itemCode = itemsReader.GetString(0);
                var qty = Convert.ToDouble(itemsReader.GetDecimal(1));
                var cartonId = itemsReader.IsDBNull(2) ? null : itemsReader.GetString(2);

                // Get item name
                var itemName = await GetItemNameAsync(settings, itemCode);

                details.Add(new WmsTransactionItemDetail
                {
                    ItemCode = itemCode,
                    ItemName = itemName,
                    Qty = qty,
                    Uom = "Nos",
                    ContainerId = cartonId,
                    SourceBin = dock ?? "DOCK-01",
                    TargetBin = null, // Will be assigned during putaway
                    AssignmentStatus = "Pending",
                    AssignedOperator = null
                });
            }
            await itemsReader.CloseAsync();

            // Generate transaction title
            var transactionTitle = await WmsTransactionDataService.GenerateTransactionTitleAsync(settings, OperationType.Receiving);

            // Create transaction
            var transaction = new WmsTransaction
            {
                Title = transactionTitle,
                Status = "Submitted",
                OperationType = OperationType.Receiving,
                TransactionDate = DateTime.Now,
                AssignedTo = startedBy,
                SourceWarehouse = "SHOWROOM", // From showroom
                TargetWarehouse = toWarehouse,
                ReferenceDocType = "Transfer In",
                ReferenceDoc = transferInTitle,
                TransactionStatus = "In Progress",
                PrimaryAssignee = startedBy,
                CompletionProgress = 0,
                IsLocked = false,
                Details = new ObservableCollection<WmsTransactionItemDetail>(details),
                ConcurrentUsers = new ObservableCollection<WmsActiveUser>(),
                ReceivingDock = dock,
                RequireQC = false
            };

            // Save transaction
            var success = await WmsTransactionDataService.SaveWmsTransactionAsync(settings, transaction);
            if (success)
            {
                ErrorLogService.LogInfo($"WmsTransactionAutoCreateService: Created Receiving transaction {transactionTitle} for Transfer In {transferInTitle}");
            }
            return success;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"WmsTransactionAutoCreateService: Error creating Receiving transaction for Transfer In {transferInTitle}", ex);
            return false;
        }
    }

    /// <summary>
    /// Automatically create a Picking transaction when a Transfer Order is submitted
    /// </summary>
    public static async Task<bool> CreatePickingTransactionFromTransferOrderAsync(
        WmsSettings settings,
        string transferOrderTitle)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if transaction already exists
            var checkSql = @"SELECT COUNT(*) FROM tabWmsTransaction 
                            WHERE reference_doc = @to_title 
                            AND operation_type = 'Picking'";
            await using var checkCmd = new MySqlCommand(checkSql, connection);
            checkCmd.Parameters.AddWithValue("@to_title", transferOrderTitle);
            var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;

            if (exists)
            {
                ErrorLogService.LogInfo($"WmsTransactionAutoCreateService: Picking transaction already exists for TO {transferOrderTitle}");
                return true;
            }

            // Get Transfer Order details
            var toSql = @"SELECT from_warehouse, prepared_by, advance_shipping_notice
                          FROM tabTransferOrder 
                          WHERE title = @to_title LIMIT 1";
            await using var toCmd = new MySqlCommand(toSql, connection);
            toCmd.Parameters.AddWithValue("@to_title", transferOrderTitle);
            await using var toReader = await toCmd.ExecuteReaderAsync();

            string fromWarehouse = "WH-MAIN";
            string? preparedBy = null;
            string? asnNo = null;

            if (await toReader.ReadAsync())
            {
                fromWarehouse = toReader.IsDBNull(0) ? "WH-MAIN" : toReader.GetString(0);
                preparedBy = toReader.IsDBNull(1) ? null : toReader.GetString(1);
                asnNo = toReader.IsDBNull(2) ? null : toReader.GetString(2);
            }
            await toReader.CloseAsync();

            // Get Transfer Order items
            var itemsSql = @"SELECT store, item_code, allocated_qty 
                            FROM tabTransferOrderItem 
                            WHERE parent_title = @to_title";
            await using var itemsCmd = new MySqlCommand(itemsSql, connection);
            itemsCmd.Parameters.AddWithValue("@to_title", transferOrderTitle);
            await using var itemsReader = await itemsCmd.ExecuteReaderAsync();

            var details = new List<WmsTransactionItemDetail>();
            while (await itemsReader.ReadAsync())
            {
                var store = itemsReader.GetString(0);
                var itemCode = itemsReader.GetString(1);
                var qty = Convert.ToDouble(itemsReader.GetDecimal(2));

                var itemName = await GetItemNameAsync(settings, itemCode);

                details.Add(new WmsTransactionItemDetail
                {
                    ItemCode = itemCode,
                    ItemName = itemName,
                    Qty = qty,
                    Uom = "Nos",
                    ContainerId = null,
                    SourceBin = null, // Will be determined during picking
                    TargetBin = $"STAGE-{store}",
                    AssignmentStatus = "Pending",
                    AssignedOperator = null
                });
            }
            await itemsReader.CloseAsync();

            // Generate transaction title
            var transactionTitle = await WmsTransactionDataService.GenerateTransactionTitleAsync(settings, OperationType.Picking);

            // Create transaction
            var transaction = new WmsTransaction
            {
                Title = transactionTitle,
                Status = "Submitted",
                OperationType = OperationType.Picking,
                TransactionDate = DateTime.Now,
                AssignedTo = preparedBy ?? string.Empty,
                SourceWarehouse = fromWarehouse,
                TargetWarehouse = "STORE", // Will be determined per item
                ReferenceDocType = "Transfer Order",
                ReferenceDoc = transferOrderTitle,
                TransactionStatus = "In Planning",
                PrimaryAssignee = preparedBy,
                CompletionProgress = 0,
                IsLocked = false,
                Details = new ObservableCollection<WmsTransactionItemDetail>(details),
                ConcurrentUsers = new ObservableCollection<WmsActiveUser>(),
                PickingWave = null,
                PickRoute = null
            };

            var success = await WmsTransactionDataService.SaveWmsTransactionAsync(settings, transaction);
            if (success)
            {
                ErrorLogService.LogInfo($"WmsTransactionAutoCreateService: Created Picking transaction {transactionTitle} for TO {transferOrderTitle}");
            }
            return success;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"WmsTransactionAutoCreateService: Error creating Picking transaction for TO {transferOrderTitle}", ex);
            return false;
        }
    }

    /// <summary>
    /// Automatically create a Picking transaction when a Material Request is submitted
    /// </summary>
    public static async Task<bool> CreatePickingTransactionFromMaterialRequestAsync(
        WmsSettings settings,
        string materialRequestTitle)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if transaction already exists
            var checkSql = @"SELECT COUNT(*) FROM tabWmsTransaction 
                            WHERE reference_doc = @mr_title 
                            AND operation_type = 'Picking'
                            AND reference_doc_type = 'Material Request'";
            await using var checkCmd = new MySqlCommand(checkSql, connection);
            checkCmd.Parameters.AddWithValue("@mr_title", materialRequestTitle);
            var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;

            if (exists)
            {
                ErrorLogService.LogInfo($"WmsTransactionAutoCreateService: Picking transaction already exists for Material Request {materialRequestTitle}");
                return true;
            }

            // Get Material Request details
            var mrSql = @"SELECT from_warehouse, to_showroom, requested_by
                          FROM tabMaterialRequest 
                          WHERE title = @mr_title LIMIT 1";
            await using var mrCmd = new MySqlCommand(mrSql, connection);
            mrCmd.Parameters.AddWithValue("@mr_title", materialRequestTitle);
            await using var mrReader = await mrCmd.ExecuteReaderAsync();

            string fromWarehouse = "WH-MAIN";
            string toShowroom = "SHOWROOM-001";
            string? requestedBy = null;

            if (await mrReader.ReadAsync())
            {
                fromWarehouse = mrReader.IsDBNull(0) ? "WH-MAIN" : mrReader.GetString(0);
                toShowroom = mrReader.IsDBNull(1) ? "SHOWROOM-001" : mrReader.GetString(1);
                requestedBy = mrReader.IsDBNull(2) ? null : mrReader.GetString(2);
            }
            await mrReader.CloseAsync();

            // Get Material Request items
            var itemsSql = @"SELECT item_code, requested_qty 
                            FROM tabMaterialRequestItem 
                            WHERE parent_title = @mr_title";
            await using var itemsCmd = new MySqlCommand(itemsSql, connection);
            itemsCmd.Parameters.AddWithValue("@mr_title", materialRequestTitle);
            await using var itemsReader = await itemsCmd.ExecuteReaderAsync();

            var details = new List<WmsTransactionItemDetail>();
            while (await itemsReader.ReadAsync())
            {
                var itemCode = itemsReader.GetString(0);
                var qty = Convert.ToDouble(itemsReader.GetDecimal(1));

                var itemName = await GetItemNameAsync(settings, itemCode);

                details.Add(new WmsTransactionItemDetail
                {
                    ItemCode = itemCode,
                    ItemName = itemName,
                    Qty = qty,
                    Uom = "Nos",
                    ContainerId = null,
                    SourceBin = null, // Will be determined during picking
                    TargetBin = $"STAGE-{toShowroom}",
                    AssignmentStatus = "Pending",
                    AssignedOperator = null
                });
            }
            await itemsReader.CloseAsync();

            // Generate transaction title
            var transactionTitle = await WmsTransactionDataService.GenerateTransactionTitleAsync(settings, OperationType.Picking);

            // Create transaction
            var transaction = new WmsTransaction
            {
                Title = transactionTitle,
                Status = "Submitted",
                OperationType = OperationType.Picking,
                TransactionDate = DateTime.Now,
                AssignedTo = requestedBy ?? string.Empty,
                SourceWarehouse = fromWarehouse,
                TargetWarehouse = toShowroom,
                ReferenceDocType = "Material Request",
                ReferenceDoc = materialRequestTitle,
                TransactionStatus = "In Planning",
                PrimaryAssignee = requestedBy,
                CompletionProgress = 0,
                IsLocked = false,
                Details = new ObservableCollection<WmsTransactionItemDetail>(details),
                ConcurrentUsers = new ObservableCollection<WmsActiveUser>(),
                PickingWave = null,
                PickRoute = null
            };

            var success = await WmsTransactionDataService.SaveWmsTransactionAsync(settings, transaction);
            if (success)
            {
                ErrorLogService.LogInfo($"WmsTransactionAutoCreateService: Created Picking transaction {transactionTitle} for Material Request {materialRequestTitle}");
            }
            return success;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"WmsTransactionAutoCreateService: Error creating Picking transaction for Material Request {materialRequestTitle}", ex);
            return false;
        }
    }

    /// <summary>
    /// Automatically create a Putaway transaction when a Putaway Task is created
    /// </summary>
    public static async Task<bool> CreatePutawayTransactionFromTaskAsync(
        WmsSettings settings,
        string putawayTaskTitle)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if transaction already exists
            var checkSql = @"SELECT COUNT(*) FROM tabWmsTransaction 
                            WHERE reference_doc = @task_title 
                            AND operation_type = 'Putaway'";
            await using var checkCmd = new MySqlCommand(checkSql, connection);
            checkCmd.Parameters.AddWithValue("@task_title", putawayTaskTitle);
            var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;

            if (exists)
            {
                ErrorLogService.LogInfo($"WmsTransactionAutoCreateService: Putaway transaction already exists for task {putawayTaskTitle}");
                return true;
            }

            // Get Putaway Task details
            var taskSql = @"SELECT advance_shipping_notice, inbound_session, created_by
                           FROM tabPutawayTask 
                           WHERE title = @task_title LIMIT 1";
            await using var taskCmd = new MySqlCommand(taskSql, connection);
            taskCmd.Parameters.AddWithValue("@task_title", putawayTaskTitle);
            await using var taskReader = await taskCmd.ExecuteReaderAsync();

            string? asnNo = null;
            string? inboundSession = null;
            string? createdBy = null;

            if (await taskReader.ReadAsync())
            {
                asnNo = taskReader.IsDBNull(0) ? null : taskReader.GetString(0);
                inboundSession = taskReader.IsDBNull(1) ? null : taskReader.GetString(1);
                createdBy = taskReader.IsDBNull(2) ? null : taskReader.GetString(2);
            }
            await taskReader.CloseAsync();

            // Get Putaway Lines
            var linesSql = @"SELECT carton_id, item_code, qty, rack, bin 
                            FROM tabPutawayLine 
                            WHERE parent_title = @task_title";
            await using var linesCmd = new MySqlCommand(linesSql, connection);
            linesCmd.Parameters.AddWithValue("@task_title", putawayTaskTitle);
            await using var linesReader = await linesCmd.ExecuteReaderAsync();

            var details = new List<WmsTransactionItemDetail>();
            while (await linesReader.ReadAsync())
            {
                var cartonId = linesReader.IsDBNull(0) ? null : linesReader.GetString(0);
                var itemCode = linesReader.GetString(1);
                var qty = Convert.ToDouble(linesReader.GetDecimal(2));
                var rack = linesReader.GetString(3);
                var bin = linesReader.GetString(4);

                var itemName = await GetItemNameAsync(settings, itemCode);

                details.Add(new WmsTransactionItemDetail
                {
                    ItemCode = itemCode,
                    ItemName = itemName,
                    Qty = qty,
                    Uom = "Nos",
                    ContainerId = cartonId,
                    SourceBin = "DOCK-01", // From receiving dock
                    TargetBin = $"{rack}-{bin}",
                    AssignmentStatus = "Pending",
                    AssignedOperator = null
                });
            }
            await linesReader.CloseAsync();

            // Generate transaction title
            var transactionTitle = await WmsTransactionDataService.GenerateTransactionTitleAsync(settings, OperationType.Putaway);

            // Create transaction
            var transaction = new WmsTransaction
            {
                Title = transactionTitle,
                Status = "Submitted",
                OperationType = OperationType.Putaway,
                TransactionDate = DateTime.Now,
                AssignedTo = createdBy ?? string.Empty,
                SourceWarehouse = "WH-MAIN",
                TargetWarehouse = "WH-MAIN",
                ReferenceDocType = "Putaway Task",
                ReferenceDoc = putawayTaskTitle,
                TransactionStatus = "In Planning",
                PrimaryAssignee = createdBy,
                CompletionProgress = 0,
                IsLocked = false,
                Details = new ObservableCollection<WmsTransactionItemDetail>(details),
                ConcurrentUsers = new ObservableCollection<WmsActiveUser>(),
                PutawayStrategy = null,
                SuggestBins = true
            };

            var success = await WmsTransactionDataService.SaveWmsTransactionAsync(settings, transaction);
            if (success)
            {
                ErrorLogService.LogInfo($"WmsTransactionAutoCreateService: Created Putaway transaction {transactionTitle} for task {putawayTaskTitle}");
            }
            return success;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"WmsTransactionAutoCreateService: Error creating Putaway transaction for task {putawayTaskTitle}", ex);
            return false;
        }
    }

    /// <summary>
    /// Check and create missing transactions for existing data
    /// This is useful when loading data that may not have transactions yet
    /// </summary>
    public static async Task CreateMissingTransactionsAsync(WmsSettings settings)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Find Inbound Sessions without Receiving transactions
            var sessionsSql = @"SELECT DISTINCT i.inbound_session, i.asn_no, i.dock, i.started_by
                               FROM tabInboundSession i
                               LEFT JOIN tabWmsTransaction t ON t.reference_doc = i.asn_no AND t.operation_type = 'Receiving'
                               WHERE t.title IS NULL
                               AND i.asn_no IS NOT NULL AND i.asn_no != ''";
            
            await using var sessionsCmd = new MySqlCommand(sessionsSql, connection);
            await using var sessionsReader = await sessionsCmd.ExecuteReaderAsync();
            
            while (await sessionsReader.ReadAsync())
            {
                var sessionTitle = sessionsReader.GetString(0);
                var asnNo = sessionsReader.GetString(1);
                var dock = sessionsReader.IsDBNull(2) ? null : sessionsReader.GetString(2);
                var startedBy = sessionsReader.GetString(3);
                
                await CreateReceivingTransactionFromSessionAsync(settings, sessionTitle, asnNo, dock, startedBy);
            }
            await sessionsReader.CloseAsync();

            // Find Transfer Orders without Picking transactions (status = 'Submitted' or 'Active')
            var tosSql = @"SELECT DISTINCT t.title
                          FROM tabTransferOrder t
                          LEFT JOIN tabWmsTransaction w ON w.reference_doc = t.title AND w.operation_type = 'Picking'
                          WHERE w.title IS NULL
                          AND t.status IN ('Submitted', 'Active')";
            
            await using var tosCmd = new MySqlCommand(tosSql, connection);
            await using var tosReader = await tosCmd.ExecuteReaderAsync();
            
            while (await tosReader.ReadAsync())
            {
                var toTitle = tosReader.GetString(0);
                await CreatePickingTransactionFromTransferOrderAsync(settings, toTitle);
            }
            await tosReader.CloseAsync();

            // Find Putaway Tasks without Putaway transactions
            var tasksSql = @"SELECT DISTINCT p.title
                           FROM tabPutawayTask p
                           LEFT JOIN tabWmsTransaction w ON w.reference_doc = p.title AND w.operation_type = 'Putaway'
                           WHERE w.title IS NULL";
            
            await using var tasksCmd = new MySqlCommand(tasksSql, connection);
            await using var tasksReader = await tasksCmd.ExecuteReaderAsync();
            
            while (await tasksReader.ReadAsync())
            {
                var taskTitle = tasksReader.GetString(0);
                await CreatePutawayTransactionFromTaskAsync(settings, taskTitle);
            }
            await tasksReader.CloseAsync();

            // Find Inbound Sessions for Transfer In without Receiving transactions
            // Only process if transfer_in column exists
            try
            {
                // Check if transfer_in column exists
                var checkColumnSql = @"
                    SELECT COUNT(*) 
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_SCHEMA = DATABASE() 
                    AND TABLE_NAME = 'tabInboundSession' 
                    AND COLUMN_NAME = 'transfer_in'";
                
                await using var checkColumnCmd = new MySqlCommand(checkColumnSql, connection);
                var columnExists = Convert.ToInt32(await checkColumnCmd.ExecuteScalarAsync()) > 0;
                
                if (columnExists)
                {
                    var transferInSessionsSql = @"SELECT DISTINCT i.inbound_session, i.transfer_in, i.dock, i.started_by
                                                 FROM tabInboundSession i
                                                 LEFT JOIN tabWmsTransaction t ON t.reference_doc = i.transfer_in 
                                                    AND t.operation_type = 'Receiving'
                                                    AND t.reference_doc_type = 'Transfer In'
                                                 WHERE t.title IS NULL
                                                 AND i.transfer_in IS NOT NULL AND i.transfer_in != ''";
                    
                    await using var transferInSessionsCmd = new MySqlCommand(transferInSessionsSql, connection);
                    await using var transferInSessionsReader = await transferInSessionsCmd.ExecuteReaderAsync();
                    
                    while (await transferInSessionsReader.ReadAsync())
                    {
                        var sessionTitle = transferInSessionsReader.GetString(0);
                        var transferInTitle = transferInSessionsReader.GetString(1);
                        var dock = transferInSessionsReader.IsDBNull(2) ? null : transferInSessionsReader.GetString(2);
                        var startedBy = transferInSessionsReader.GetString(3);
                        
                        await CreateReceivingTransactionFromTransferInAsync(settings, sessionTitle, transferInTitle, dock, startedBy);
                    }
                    await transferInSessionsReader.CloseAsync();
                }
            }
            catch (Exception ex)
            {
                // Log but don't fail - transfer_in column may not exist yet
                ErrorLogService.LogError("WmsTransactionAutoCreateService: Error processing Transfer In sessions (transfer_in column may not exist)", ex);
            }

            // Find Material Requests without Picking transactions (status = 'Submitted' or 'In Progress')
            // Only process if table exists
            try
            {
                // Check if tabMaterialRequest table exists
                var checkTableSql = @"
                    SELECT COUNT(*) 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = DATABASE() 
                    AND TABLE_NAME = 'tabMaterialRequest'";
                
                await using var checkTableCmd = new MySqlCommand(checkTableSql, connection);
                var tableExists = Convert.ToInt32(await checkTableCmd.ExecuteScalarAsync()) > 0;
                
                if (tableExists)
                {
                    var mrsSql = @"SELECT DISTINCT m.title
                                  FROM tabMaterialRequest m
                                  LEFT JOIN tabWmsTransaction w ON w.reference_doc = m.title 
                                    AND w.operation_type = 'Picking'
                                    AND w.reference_doc_type = 'Material Request'
                                  WHERE w.title IS NULL
                                  AND m.status IN ('Submitted', 'In Progress')";
                    
                    await using var mrsCmd = new MySqlCommand(mrsSql, connection);
                    await using var mrsReader = await mrsCmd.ExecuteReaderAsync();
                    
                    while (await mrsReader.ReadAsync())
                    {
                        var mrTitle = mrsReader.GetString(0);
                        await CreatePickingTransactionFromMaterialRequestAsync(settings, mrTitle);
                    }
                    await mrsReader.CloseAsync();
                }
            }
            catch (Exception ex)
            {
                // Log but don't fail - tabMaterialRequest table may not exist yet
                ErrorLogService.LogError("WmsTransactionAutoCreateService: Error processing Material Requests (tabMaterialRequest table may not exist)", ex);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("WmsTransactionAutoCreateService: Error creating missing transactions", ex);
        }
    }

    /// <summary>
    /// Helper method to get item name from database
    /// Uses its own connection to avoid DataReader conflicts
    /// </summary>
    private static async Task<string> GetItemNameAsync(WmsSettings settings, string itemCode)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();
            
            var sql = @"SELECT name FROM tabItem WHERE code = @item_code LIMIT 1";
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@item_code", itemCode);
            var result = await cmd.ExecuteScalarAsync();
            
            if (result != null && result != DBNull.Value)
            {
                return result.ToString()!;
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"WmsTransactionAutoCreateService: Error getting item name for {itemCode}", ex);
        }
        
        return itemCode; // Fallback to item code if name not found
    }
}

