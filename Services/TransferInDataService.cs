using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class TransferInDataService
{
    /// <summary>
    /// Get all Transfer Ins from database
    /// </summary>
    public static async Task<List<TransferIn>> GetTransferInsAsync(WmsSettings settings)
    {
        var transferIns = new List<TransferIn>();
        
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if tables exist
            if (!await CheckTableExistsAsync(connection, "tabTransferIn"))
            {
                ErrorLogService.LogInfo("TransferInDataService: tabTransferIn table does not exist, returning empty list");
                return transferIns;
            }

            if (!await CheckTableExistsAsync(connection, "tabTransferInItem"))
            {
                ErrorLogService.LogInfo("TransferInDataService: tabTransferInItem table does not exist, items will not be loaded");
            }

            // Get all Transfer Ins
            var tiSql = @"SELECT title, status, from_showroom, to_warehouse, transfer_date, 
                                 expected_arrival_date, prepared_by, received_by, received_on, total_qty
                          FROM tabTransferIn
                          ORDER BY transfer_date DESC, title";
            
            await using var tiCmd = new MySqlCommand(tiSql, connection);
            await using var tiReader = await tiCmd.ExecuteReaderAsync();

            var tiTitles = new List<string>();
            while (await tiReader.ReadAsync())
            {
                var title = tiReader.GetString(0);
                tiTitles.Add(title);
                
                transferIns.Add(new TransferIn
                {
                    Title = title,
                    Status = tiReader.GetString(1),
                    FromShowroom = tiReader.GetString(2),
                    ToWarehouse = tiReader.GetString(3),
                    TransferDate = tiReader.GetDateTime(4),
                    ExpectedArrivalDate = tiReader.IsDBNull(5) ? null : tiReader.GetDateTime(5),
                    PreparedBy = tiReader.GetString(6),
                    ReceivedBy = tiReader.IsDBNull(7) ? null : tiReader.GetString(7),
                    ReceivedOn = tiReader.IsDBNull(8) ? null : tiReader.GetDateTime(8),
                    TotalQty = Convert.ToDouble(tiReader.GetDecimal(9))
                });
            }

            await tiReader.CloseAsync();

            // Get Transfer In items for each Transfer In
            if (tiTitles.Count > 0)
            {
                try
                {
                    if (await CheckTableExistsAsync(connection, "tabTransferInItem"))
                    {
                        var placeholders = string.Join(",", tiTitles.Select((_, i) => $"@title{i}"));
                        var itemsSql = $@"SELECT parent_title, item_code, qty, carton_id, received_qty
                                          FROM tabTransferInItem
                                          WHERE parent_title IN ({placeholders})
                                          ORDER BY parent_title, item_code";
                        
                        await using var itemsCmd = new MySqlCommand(itemsSql, connection);
                        for (int i = 0; i < tiTitles.Count; i++)
                        {
                            itemsCmd.Parameters.AddWithValue($"@title{i}", tiTitles[i]);
                        }
                        
                        await using var itemsReader = await itemsCmd.ExecuteReaderAsync();

                        var itemsDict = new Dictionary<string, List<TransferInItem>>();
                        
                        while (await itemsReader.ReadAsync())
                        {
                            var parentTitle = itemsReader.GetString(0);
                            if (!itemsDict.ContainsKey(parentTitle))
                            {
                                itemsDict[parentTitle] = new List<TransferInItem>();
                            }

                            itemsDict[parentTitle].Add(new TransferInItem
                            {
                                ItemCode = itemsReader.GetString(1),
                                Qty = Convert.ToDouble(itemsReader.GetDecimal(2)),
                                CartonId = itemsReader.IsDBNull(3) ? null : itemsReader.GetString(3),
                                ReceivedQty = Convert.ToDouble(itemsReader.GetDecimal(4))
                            });
                        }

                        // Assign items to Transfer Ins
                        for (int i = 0; i < transferIns.Count; i++)
                        {
                            var ti = transferIns[i];
                            var items = itemsDict.ContainsKey(ti.Title) ? itemsDict[ti.Title] : new List<TransferInItem>();
                            
                            transferIns[i] = new TransferIn
                            {
                                Title = ti.Title,
                                Status = ti.Status,
                                FromShowroom = ti.FromShowroom,
                                ToWarehouse = ti.ToWarehouse,
                                TransferDate = ti.TransferDate,
                                ExpectedArrivalDate = ti.ExpectedArrivalDate,
                                PreparedBy = ti.PreparedBy,
                                ReceivedBy = ti.ReceivedBy,
                                ReceivedOn = ti.ReceivedOn,
                                TotalQty = ti.TotalQty,
                                Items = items
                            };
                        }
                    }
                    else
                    {
                        // Table doesn't exist, assign empty items list
                        for (int i = 0; i < transferIns.Count; i++)
                        {
                            var ti = transferIns[i];
                            transferIns[i] = new TransferIn
                            {
                                Title = ti.Title,
                                Status = ti.Status,
                                FromShowroom = ti.FromShowroom,
                                ToWarehouse = ti.ToWarehouse,
                                TransferDate = ti.TransferDate,
                                ExpectedArrivalDate = ti.ExpectedArrivalDate,
                                PreparedBy = ti.PreparedBy,
                                ReceivedBy = ti.ReceivedBy,
                                ReceivedOn = ti.ReceivedOn,
                                TotalQty = ti.TotalQty,
                                Items = new List<TransferInItem>()
                            };
                        }
                    }
                }
                catch (Exception ex)
                {
                    ErrorLogService.LogError("Error loading Transfer In items", ex);
                    // Continue with empty items list
                    for (int i = 0; i < transferIns.Count; i++)
                    {
                        var ti = transferIns[i];
                        transferIns[i] = new TransferIn
                        {
                            Title = ti.Title,
                            Status = ti.Status,
                            FromShowroom = ti.FromShowroom,
                            ToWarehouse = ti.ToWarehouse,
                            TransferDate = ti.TransferDate,
                            ExpectedArrivalDate = ti.ExpectedArrivalDate,
                            PreparedBy = ti.PreparedBy,
                            ReceivedBy = ti.ReceivedBy,
                            ReceivedOn = ti.ReceivedOn,
                            TotalQty = ti.TotalQty,
                            Items = new List<TransferInItem>()
                        };
                    }
                }
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Transfer Ins from database", ex);
            // Return empty list on error
        }

        return transferIns;
    }

    /// <summary>
    /// Get Transfer In by title from database
    /// </summary>
    public static async Task<TransferIn?> GetTransferInByTitleAsync(WmsSettings settings, string title)
    {
        var transferIns = await GetTransferInsAsync(settings);
        return transferIns.FirstOrDefault(ti => ti.Title == title);
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

