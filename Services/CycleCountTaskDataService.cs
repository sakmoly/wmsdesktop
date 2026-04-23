using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class CycleCountTaskDataService
{
    /// <summary>
    /// Get all Cycle Count Tasks from database
    /// </summary>
    public static async Task<List<CycleCountTask>> GetCycleCountTasksAsync(WmsSettings settings)
    {
        var tasks = new List<CycleCountTask>();
        
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if tables exist
            if (!await CheckTableExistsAsync(connection, "tabCycleCountTask"))
            {
                ErrorLogService.LogInfo("CycleCountTaskDataService: tabCycleCountTask table does not exist, returning empty list");
                return tasks;
            }

            if (!await CheckTableExistsAsync(connection, "tabCycleCountLine"))
            {
                ErrorLogService.LogInfo("CycleCountTaskDataService: tabCycleCountLine table does not exist, lines will not be loaded");
            }

            // Optional: ERP reference columns (added in MIGRATION_008)
            var erpRefColumnExists = await CheckColumnExistsAsync(connection, "tabCycleCountTask", "erp_reference");
            var taskSql = erpRefColumnExists
                ? @"SELECT title, status, count_type, warehouse, zone, count_date, 
                         scheduled_start_time, scheduled_end_time, freeze_stock, 
                         created_by, assigned_to, total_items, counted_items, items_with_discrepancy,
                         erp_reference, erp_synced_at
                   FROM tabCycleCountTask
                   ORDER BY count_date DESC, title"
                : @"SELECT title, status, count_type, warehouse, zone, count_date, 
                         scheduled_start_time, scheduled_end_time, freeze_stock, 
                         created_by, assigned_to, total_items, counted_items, items_with_discrepancy
                   FROM tabCycleCountTask
                   ORDER BY count_date DESC, title";

            await using var taskCmd = new MySqlCommand(taskSql, connection);
            await using var taskReader = await taskCmd.ExecuteReaderAsync();

            var taskTitles = new List<string>();
            while (await taskReader.ReadAsync())
            {
                // Extract zone/bin from title if zone is null
                // Title format: CC-A1-R01-L1-B1-MK6KXT where A1-R01-L1-B1 is the bin location
                var title = taskReader.GetString(0);
                var zone = taskReader.IsDBNull(4) ? null : taskReader.GetString(4);
                
                // If zone is null, try to extract from title
                if (string.IsNullOrEmpty(zone) && title.StartsWith("CC-"))
                {
                    zone = ExtractBinLocationFromTitle(title);
                }
                
                taskTitles.Add(title);
                
                var erpRef = erpRefColumnExists && !taskReader.IsDBNull(14) ? taskReader.GetString(14) : null;
                var erpSyncedAt = erpRefColumnExists && taskReader.FieldCount > 15 && !taskReader.IsDBNull(15)
                    ? taskReader.GetDateTime(15)
                    : (DateTime?)null;

                tasks.Add(new CycleCountTask
                {
                    Title = title,
                    Status = taskReader.GetString(1),
                    CountType = taskReader.GetString(2),
                    Warehouse = taskReader.GetString(3),
                    Zone = zone, // Use extracted zone if database zone is null
                    CountDate = taskReader.GetDateTime(5),
                    ScheduledStartTime = taskReader.IsDBNull(6) ? null : ParseTimeSpan(taskReader.GetValue(6)),
                    ScheduledEndTime = taskReader.IsDBNull(7) ? null : ParseTimeSpan(taskReader.GetValue(7)),
                    FreezeStock = taskReader.GetBoolean(8),
                    IsOpeningStock = false, // Will be calculated after lines are loaded
                    CreatedBy = taskReader.GetString(9),
                    AssignedTo = taskReader.IsDBNull(10) ? null : taskReader.GetString(10),
                    TotalItems = taskReader.GetInt32(11),
                    CountedItems = taskReader.GetInt32(12),
                    ItemsWithDiscrepancy = taskReader.GetInt32(13),
                    ErpReference = erpRef,
                    ErpSyncedAt = erpSyncedAt
                });
            }

            await taskReader.CloseAsync();

            // Get Cycle Count Lines for each task
            if (taskTitles.Count > 0)
            {
                try
                {
                    if (await CheckTableExistsAsync(connection, "tabCycleCountLine"))
                    {
                        // Check if carton_id column exists
                        var cartonIdColumnExists = await CheckColumnExistsAsync(connection, "tabCycleCountLine", "carton_id");
                        
                        var placeholders = string.Join(",", taskTitles.Select((_, i) => $"@title{i}"));
                        // Only return lines that have been counted (actual_qty IS NOT NULL)
                        // Don't show items with only expected_qty - only show items that have been scanned/counted
                        // IMPORTANT: Include discrepancy column (generated column) - always returns 0 instead of null
                        var linesSql = cartonIdColumnExists
                            ? $@"SELECT parent_title, item_code, bin_location, carton_id, expected_qty, actual_qty, discrepancy,
                                        counted_by, counted_on, reviewed_by, reviewed_on, 
                                        approval_required, approved_by, approved_on, discrepancy_reason, status
                                 FROM tabCycleCountLine
                                 WHERE parent_title IN ({placeholders})
                                   AND actual_qty IS NOT NULL
                                 ORDER BY parent_title, item_code"
                            : $@"SELECT parent_title, item_code, bin_location, NULL as carton_id, expected_qty, actual_qty, discrepancy,
                                        counted_by, counted_on, reviewed_by, reviewed_on, 
                                        approval_required, approved_by, approved_on, discrepancy_reason, status
                                 FROM tabCycleCountLine
                                 WHERE parent_title IN ({placeholders})
                                   AND actual_qty IS NOT NULL
                                 ORDER BY parent_title, item_code";
                        
                        await using var linesCmd = new MySqlCommand(linesSql, connection);
                        for (int i = 0; i < taskTitles.Count; i++)
                        {
                            linesCmd.Parameters.AddWithValue($"@title{i}", taskTitles[i]);
                        }
                        
                        await using var linesReader = await linesCmd.ExecuteReaderAsync();

                        var linesDict = new Dictionary<string, List<CycleCountLine>>();
                        
                        while (await linesReader.ReadAsync())
                        {
                            var parentTitle = linesReader.GetString(0);
                            if (!linesDict.ContainsKey(parentTitle))
                            {
                                linesDict[parentTitle] = new List<CycleCountLine>();
                            }

                            var expectedQty = linesReader.IsDBNull(4) ? 0 : Convert.ToDouble(linesReader.GetDecimal(4));
                            var actualQty = linesReader.IsDBNull(5) ? null : (double?)Convert.ToDouble(linesReader.GetDecimal(5));
                            // Get discrepancy from database (generated column) - always returns 0 instead of null
                            // Ensure it's never null - default to 0
                            var discrepancy = linesReader.IsDBNull(6) ? 0 : Convert.ToDouble(linesReader.GetDecimal(6));
                            
                            linesDict[parentTitle].Add(new CycleCountLine
                            {
                                ItemCode = linesReader.GetString(1),
                                BinLocation = linesReader.IsDBNull(2) ? null : linesReader.GetString(2),
                                CartonId = linesReader.IsDBNull(3) ? null : linesReader.GetString(3), // carton_id column (or NULL if column doesn't exist)
                                ExpectedQty = expectedQty, // Use 0 instead of null for no previous history
                                ActualQty = actualQty,
                                Discrepancy = discrepancy, // Use discrepancy from database (always 0 instead of null)
                                CountedBy = linesReader.IsDBNull(7) ? null : linesReader.GetString(7), // Shifted indices after adding discrepancy
                                CountedOn = linesReader.IsDBNull(8) ? null : linesReader.GetDateTime(8),
                                ReviewedBy = linesReader.IsDBNull(9) ? null : linesReader.GetString(9),
                                ReviewedOn = linesReader.IsDBNull(10) ? null : linesReader.GetDateTime(10),
                                ApprovalRequired = linesReader.GetBoolean(11),
                                ApprovedBy = linesReader.IsDBNull(12) ? null : linesReader.GetString(12),
                                ApprovedOn = linesReader.IsDBNull(13) ? null : linesReader.GetDateTime(13),
                                DiscrepancyReason = linesReader.IsDBNull(14) ? null : linesReader.GetString(14),
                                Status = linesReader.GetString(15)
                            });
                        }

                        // Assign lines to tasks and calculate is_opening_stock at task level
                        for (int i = 0; i < tasks.Count; i++)
                        {
                            var task = tasks[i];
                            var lines = linesDict.ContainsKey(task.Title) ? linesDict[task.Title] : new List<CycleCountLine>();
                            
                            // Calculate IsOpeningStock at task level: true if task contains at least one opening stock item
                            // Opening stock: expected_qty = 0 and actual_qty > 0
                            var isOpeningStock = lines.Any(line => 
                                line.ExpectedQty == 0 && 
                                line.ActualQty.HasValue && 
                                line.ActualQty.Value > 0);
                            
                            tasks[i] = new CycleCountTask
                            {
                                Title = task.Title,
                                Status = task.Status,
                                CountType = task.CountType,
                                Warehouse = task.Warehouse,
                                Zone = task.Zone,
                                CountDate = task.CountDate,
                                ScheduledStartTime = task.ScheduledStartTime,
                                ScheduledEndTime = task.ScheduledEndTime,
                                FreezeStock = task.FreezeStock,
                                IsOpeningStock = isOpeningStock, // Task-level flag: true if contains opening stock items
                                CreatedBy = task.CreatedBy,
                                AssignedTo = task.AssignedTo,
                                TotalItems = task.TotalItems,
                                CountedItems = task.CountedItems,
                                ItemsWithDiscrepancy = task.ItemsWithDiscrepancy,
                                ErpReference = task.ErpReference,
                                ErpSyncedAt = task.ErpSyncedAt,
                                Lines = lines
                            };
                        }
                    }
                    else
                    {
                        // Table doesn't exist, assign empty lines list
                        for (int i = 0; i < tasks.Count; i++)
                        {
                            var task = tasks[i];
                            tasks[i] = new CycleCountTask
                            {
                                Title = task.Title,
                                Status = task.Status,
                                CountType = task.CountType,
                                Warehouse = task.Warehouse,
                                Zone = task.Zone,
                                CountDate = task.CountDate,
                                ScheduledStartTime = task.ScheduledStartTime,
                                ScheduledEndTime = task.ScheduledEndTime,
                                FreezeStock = task.FreezeStock,
                                IsOpeningStock = false, // No lines, so no opening stock
                                CreatedBy = task.CreatedBy,
                                AssignedTo = task.AssignedTo,
                                TotalItems = task.TotalItems,
                                CountedItems = task.CountedItems,
                                ItemsWithDiscrepancy = task.ItemsWithDiscrepancy,
                                ErpReference = task.ErpReference,
                                ErpSyncedAt = task.ErpSyncedAt,
                                Lines = new List<CycleCountLine>()
                            };
                        }
                    }
                }
                catch (Exception ex)
                {
                    ErrorLogService.LogError("Error loading Cycle Count Lines", ex);
                    // Continue with empty lines list
                    for (int i = 0; i < tasks.Count; i++)
                    {
                        var task = tasks[i];
                        tasks[i] = new CycleCountTask
                        {
                            Title = task.Title,
                            Status = task.Status,
                            CountType = task.CountType,
                            Warehouse = task.Warehouse,
                            Zone = task.Zone,
                            CountDate = task.CountDate,
                            ScheduledStartTime = task.ScheduledStartTime,
                            ScheduledEndTime = task.ScheduledEndTime,
                            FreezeStock = task.FreezeStock,
                            IsOpeningStock = false, // No lines, so no opening stock
                            CreatedBy = task.CreatedBy,
                            AssignedTo = task.AssignedTo,
                            TotalItems = task.TotalItems,
                            CountedItems = task.CountedItems,
                            ItemsWithDiscrepancy = task.ItemsWithDiscrepancy,
                            ErpReference = task.ErpReference,
                            ErpSyncedAt = task.ErpSyncedAt,
                            Lines = new List<CycleCountLine>()
                        };
                    }
                }
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Cycle Count Tasks from database", ex);
            // Return empty list on error
        }

        return tasks;
    }

    /// <summary>
    /// Get Cycle Count Task by title from database
    /// </summary>
    public static async Task<CycleCountTask?> GetCycleCountTaskByTitleAsync(WmsSettings settings, string title)
    {
        var tasks = await GetCycleCountTasksAsync(settings);
        var task = tasks.FirstOrDefault(t => t.Title == title);
        
        if (task != null)
        {
            ErrorLogService.LogInfo($"CycleCountTaskDataService: Retrieved task {title} - TotalItems: {task.TotalItems}, CountedItems: {task.CountedItems}, ItemsWithDiscrepancy: {task.ItemsWithDiscrepancy}, Lines: {task.Lines.Count}");
        }
        else
        {
            ErrorLogService.LogInfo($"CycleCountTaskDataService: Task {title} not found");
        }
        
        return task;
    }

    /// <summary>
    /// Update ERP reference and sync timestamp after successful push to ERPNext (sync_task_capture_only).
    /// </summary>
    public static async Task<bool> UpdateCycleCountTaskErpReferenceAsync(WmsSettings settings, string title, string? erpReference)
    {
        if (string.IsNullOrEmpty(title))
            return false;
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();
            var hasColumn = await CheckColumnExistsAsync(connection, "tabCycleCountTask", "erp_reference");
            if (!hasColumn)
            {
                ErrorLogService.LogInfo("CycleCountTaskDataService: erp_reference column not found; run MIGRATION_008.");
                return false;
            }
            await using var cmd = new MySqlCommand(
                "UPDATE tabCycleCountTask SET erp_reference = @ref, erp_synced_at = NOW() WHERE title = @title",
                connection);
            cmd.Parameters.AddWithValue("@ref", (object?)erpReference ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@title", title);
            var rows = await cmd.ExecuteNonQueryAsync();
            return rows > 0;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("CycleCountTaskDataService: UpdateCycleCountTaskErpReference failed", ex);
            return false;
        }
    }

    /// <summary>
    /// Extract bin location from cycle count task title
    /// Title format: CC-A1-R01-L1-B1-MK6KXT where A1-R01-L1-B1 is the bin location
    /// </summary>
    private static string? ExtractBinLocationFromTitle(string title)
    {
        if (string.IsNullOrEmpty(title) || !title.StartsWith("CC-"))
        {
            return null;
        }

        // Remove "CC-" prefix
        var withoutPrefix = title.Substring(3);
        
        // Split by hyphen
        var parts = withoutPrefix.Split('-');
        
        // The last part is usually a hash/identifier (e.g., MK6KXT)
        // Everything before it is the bin location
        // Examples:
        // CC-A1-R01-L1-B1-MK6KXT -> A1-R01-L1-B1
        // CC-BIN-A1-01-4B7A84C7 -> BIN-A1-01
        
        if (parts.Length <= 1)
        {
            return null; // Not enough parts
        }

        // If last part looks like a hash (6-8 alphanumeric chars), exclude it
        var lastPart = parts[parts.Length - 1];
        if (lastPart.Length >= 6 && lastPart.Length <= 8 && System.Text.RegularExpressions.Regex.IsMatch(lastPart, "^[A-Z0-9]+$", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
        {
            // Last part is likely a hash, use everything before it
            return string.Join("-", parts.Take(parts.Length - 1));
        }
        
        // Otherwise, use all parts (might be a different format)
        return string.Join("-", parts);
    }

    /// <summary>
    /// Parse TimeSpan from database value (handles TimeSpan, DateTime, or string)
    /// </summary>
    private static TimeSpan? ParseTimeSpan(object? value)
    {
        if (value == null || value == DBNull.Value)
            return null;

        if (value is TimeSpan ts)
            return ts;

        if (value is DateTime dt)
            return dt.TimeOfDay;

        if (value is string str && TimeSpan.TryParse(str, out var parsed))
            return parsed;

        return null;
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
    /// Check if a column exists in a table (case-insensitive)
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
    /// Get expected cartons for cycle count (for carton-level inventory mode)
    /// Returns cartons that should be in the specified bin
    /// </summary>
    public static async Task<List<(string CartonId, string ItemCode, double ExpectedQty)>> GetExpectedCartonsForBinAsync(
        WmsSettings settings,
        string binLocation,
        string warehouse)
    {
        var expectedCartons = new List<(string CartonId, string ItemCode, double ExpectedQty)>();

        try
        {
            // Check if carton-level mode is enabled
            if (settings.InventoryTrackingMode != "CartonLevel")
            {
                return expectedCartons; // Not applicable in bin-level mode
            }

            // Get carton stock for this bin
            var cartonStock = await CartonDataService.GetCartonStockAsync(
                settings,
                cartonId: null,
                itemCode: null,
                warehouse: warehouse,
                binLocation: binLocation);

            foreach (var stock in cartonStock)
            {
                // Only include cartons with PUTAWAY status (not picked/shipped)
                if (stock.Status == "PUTAWAY" && stock.Qty > 0)
                {
                    expectedCartons.Add((stock.CartonId, stock.ItemCode, stock.Qty));
                }
            }

            return expectedCartons;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"CycleCountTaskDataService: Error getting expected cartons for bin {binLocation}", ex);
            return expectedCartons;
        }
    }

    /// <summary>
    /// Create cycle count lines from cartons (for carton-level inventory mode)
    /// Creates count lines for each carton-item combination in the bin
    /// </summary>
    public static async Task<bool> CreateCycleCountLinesFromCartonsAsync(
        WmsSettings settings,
        string cycleCountTitle,
        string binLocation,
        string warehouse)
    {
        try
        {
            // Check if carton-level mode is enabled
            if (settings.InventoryTrackingMode != "CartonLevel")
            {
                return true; // Not needed in bin-level mode
            }

            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            if (!await CheckTableExistsAsync(connection, "tabCycleCountLine"))
            {
                ErrorLogService.LogError("CycleCountTaskDataService: tabCycleCountLine table does not exist");
                return false;
            }

            // Get expected cartons
            var expectedCartons = await GetExpectedCartonsForBinAsync(settings, binLocation, warehouse);

            if (expectedCartons.Count == 0)
            {
                ErrorLogService.LogInfo($"CycleCountTaskDataService: No cartons found in bin {binLocation} for cycle count {cycleCountTitle}");
                return true;
            }

            // Create cycle count lines for each carton-item
            foreach (var (cartonId, itemCode, expectedQty) in expectedCartons)
            {
                // Check if line already exists
                var checkSql = @"
                    SELECT COUNT(*) 
                    FROM tabCycleCountLine
                    WHERE parent_title = @title
                      AND item_code = @itemCode
                      AND bin_location = @binLocation";
                
                await using var checkCmd = new MySqlCommand(checkSql, connection);
                checkCmd.Parameters.AddWithValue("@title", cycleCountTitle);
                checkCmd.Parameters.AddWithValue("@itemCode", itemCode);
                checkCmd.Parameters.AddWithValue("@binLocation", binLocation);
                var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;

                if (!exists)
                {
                    // Insert new line with carton_id for carton-level inventory
                    // Set expected_qty to 0 - only set it when items are actually counted from stock data
                    // expected_qty should only come from stock ledger lookup, not pre-populated
                    var insertSql = @"
                        INSERT INTO tabCycleCountLine 
                            (parent_title, item_code, bin_location, carton_id, expected_qty, actual_qty, 
                             status, created_at, updated_at)
                        VALUES 
                            (@title, @itemCode, @binLocation, @cartonId, 0, NULL, 
                             'Pending', NOW(), NOW())";
                    
                    await using var insertCmd = new MySqlCommand(insertSql, connection);
                    insertCmd.Parameters.AddWithValue("@title", cycleCountTitle);
                    insertCmd.Parameters.AddWithValue("@itemCode", itemCode);
                    insertCmd.Parameters.AddWithValue("@binLocation", binLocation);
                    insertCmd.Parameters.AddWithValue("@cartonId", cartonId); // Store carton ID for carton-level counting
                    // Don't set expectedQty - only set when counting from actual stock data
                    await insertCmd.ExecuteNonQueryAsync();
                }
            }

            ErrorLogService.LogInfo($"CycleCountTaskDataService: Created {expectedCartons.Count} cycle count lines from cartons for bin {binLocation}");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"CycleCountTaskDataService: Error creating cycle count lines from cartons for bin {binLocation}", ex);
            return false;
        }
    }

    /// <summary>
    /// Validate carton count (for carton-level inventory mode)
    /// Checks if counted carton matches expected carton in bin
    /// </summary>
    public static async Task<(bool IsValid, string? ErrorMessage)> ValidateCartonCountAsync(
        WmsSettings settings,
        string cartonId,
        string binLocation,
        string warehouse)
    {
        try
        {
            // Check if carton-level mode is enabled
            if (settings.InventoryTrackingMode != "CartonLevel")
            {
                return (true, null); // Not needed in bin-level mode
            }

            // Get carton
            var carton = await CartonDataService.GetCartonAsync(settings, cartonId);
            if (carton == null)
            {
                return (false, $"Carton {cartonId} not found");
            }

            // Validate carton is in correct bin
            if (carton.CurrentBinId != binLocation)
            {
                return (false, $"Carton {cartonId} is in bin {carton.CurrentBinId}, not {binLocation}");
            }

            return (true, null);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"CycleCountTaskDataService: Error validating carton count for {cartonId}", ex);
            return (false, $"Validation error: {ex.Message}");
        }
    }
}

