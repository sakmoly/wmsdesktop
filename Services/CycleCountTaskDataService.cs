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

            // Get all Cycle Count Tasks
            var taskSql = @"SELECT title, status, count_type, warehouse, zone, count_date, 
                                  scheduled_start_time, scheduled_end_time, freeze_stock, 
                                  created_by, assigned_to, total_items, counted_items, items_with_discrepancy
                           FROM tabCycleCountTask
                           ORDER BY count_date DESC, title";
            
            await using var taskCmd = new MySqlCommand(taskSql, connection);
            await using var taskReader = await taskCmd.ExecuteReaderAsync();

            var taskTitles = new List<string>();
            while (await taskReader.ReadAsync())
            {
                var title = taskReader.GetString(0);
                taskTitles.Add(title);
                
                tasks.Add(new CycleCountTask
                {
                    Title = title,
                    Status = taskReader.GetString(1),
                    CountType = taskReader.GetString(2),
                    Warehouse = taskReader.GetString(3),
                    Zone = taskReader.IsDBNull(4) ? null : taskReader.GetString(4),
                    CountDate = taskReader.GetDateTime(5),
                    ScheduledStartTime = taskReader.IsDBNull(6) ? null : ParseTimeSpan(taskReader.GetValue(6)),
                    ScheduledEndTime = taskReader.IsDBNull(7) ? null : ParseTimeSpan(taskReader.GetValue(7)),
                    FreezeStock = taskReader.GetBoolean(8),
                    CreatedBy = taskReader.GetString(9),
                    AssignedTo = taskReader.IsDBNull(10) ? null : taskReader.GetString(10),
                    TotalItems = taskReader.GetInt32(11),
                    CountedItems = taskReader.GetInt32(12),
                    ItemsWithDiscrepancy = taskReader.GetInt32(13)
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
                        var placeholders = string.Join(",", taskTitles.Select((_, i) => $"@title{i}"));
                        var linesSql = $@"SELECT parent_title, item_code, bin_location, expected_qty, actual_qty,
                                                counted_by, counted_on, reviewed_by, reviewed_on, 
                                                approval_required, approved_by, approved_on, discrepancy_reason, status
                                         FROM tabCycleCountLine
                                         WHERE parent_title IN ({placeholders})
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

                            linesDict[parentTitle].Add(new CycleCountLine
                            {
                                ItemCode = linesReader.GetString(1),
                                BinLocation = linesReader.IsDBNull(2) ? null : linesReader.GetString(2),
                                ExpectedQty = Convert.ToDouble(linesReader.GetDecimal(3)),
                                ActualQty = linesReader.IsDBNull(4) ? null : Convert.ToDouble(linesReader.GetDecimal(4)),
                                CountedBy = linesReader.IsDBNull(5) ? null : linesReader.GetString(5),
                                CountedOn = linesReader.IsDBNull(6) ? null : linesReader.GetDateTime(6),
                                ReviewedBy = linesReader.IsDBNull(7) ? null : linesReader.GetString(7),
                                ReviewedOn = linesReader.IsDBNull(8) ? null : linesReader.GetDateTime(8),
                                ApprovalRequired = linesReader.GetBoolean(9),
                                ApprovedBy = linesReader.IsDBNull(10) ? null : linesReader.GetString(10),
                                ApprovedOn = linesReader.IsDBNull(11) ? null : linesReader.GetDateTime(11),
                                DiscrepancyReason = linesReader.IsDBNull(12) ? null : linesReader.GetString(12),
                                Status = linesReader.GetString(13)
                            });
                        }

                        // Assign lines to tasks
                        for (int i = 0; i < tasks.Count; i++)
                        {
                            var task = tasks[i];
                            var lines = linesDict.ContainsKey(task.Title) ? linesDict[task.Title] : new List<CycleCountLine>();
                            
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
                                CreatedBy = task.CreatedBy,
                                AssignedTo = task.AssignedTo,
                                TotalItems = task.TotalItems,
                                CountedItems = task.CountedItems,
                                ItemsWithDiscrepancy = task.ItemsWithDiscrepancy,
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
                                CreatedBy = task.CreatedBy,
                                AssignedTo = task.AssignedTo,
                                TotalItems = task.TotalItems,
                                CountedItems = task.CountedItems,
                                ItemsWithDiscrepancy = task.ItemsWithDiscrepancy,
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
                            CreatedBy = task.CreatedBy,
                            AssignedTo = task.AssignedTo,
                            TotalItems = task.TotalItems,
                            CountedItems = task.CountedItems,
                            ItemsWithDiscrepancy = task.ItemsWithDiscrepancy,
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
        return tasks.FirstOrDefault(t => t.Title == title);
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
}

