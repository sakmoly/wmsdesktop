using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class TransferOrderDataService
{
    /// <summary>
    /// Get all Transfer Orders from database
    /// </summary>
    public static async Task<List<TransferOrder>> GetTransferOrdersAsync(WmsSettings settings)
    {
        var transferOrders = new List<TransferOrder>();
        
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Get all Transfer Orders
            var toSql = @"SELECT title, status, advance_shipping_notice, from_warehouse, 
                                 prepared_by, required_date, total_allocated_qty
                          FROM tabTransferOrder
                          ORDER BY required_date DESC, title";
            
            await using var toCmd = new MySqlCommand(toSql, connection);
            await using var toReader = await toCmd.ExecuteReaderAsync();

            var toTitles = new List<string>();
            while (await toReader.ReadAsync())
            {
                var title = toReader.GetString(0);
                toTitles.Add(title);
                
                transferOrders.Add(new TransferOrder
                {
                    Title = title,
                    Status = toReader.GetString(1),
                    AdvanceShippingNotice = toReader.GetString(2),
                    FromWarehouse = toReader.GetString(3),
                    PreparedBy = toReader.GetString(4),
                    RequiredDate = toReader.IsDBNull(5) ? null : toReader.GetDateTime(5),
                    TotalAllocatedQty = Convert.ToDouble(toReader.GetDecimal(6))
                });
            }

            await toReader.CloseAsync();

            // Get Transfer Order items for each TO
            if (toTitles.Count > 0)
            {
                var placeholders = string.Join(",", toTitles.Select((_, i) => $"@title{i}"));
                var itemsSql = $@"SELECT parent_title, store, item_code, allocated_qty, sorted_qty, 
                                         packed_qty, pending_qty, remarks
                                  FROM tabTransferOrderItem
                                  WHERE parent_title IN ({placeholders})
                                  ORDER BY parent_title, item_code";
                
                await using var itemsCmd = new MySqlCommand(itemsSql, connection);
                for (int i = 0; i < toTitles.Count; i++)
                {
                    itemsCmd.Parameters.AddWithValue($"@title{i}", toTitles[i]);
                }
                
                await using var itemsReader = await itemsCmd.ExecuteReaderAsync();

                var itemsDict = new Dictionary<string, List<TransferOrderItem>>();
                
                while (await itemsReader.ReadAsync())
                {
                    var parentTitle = itemsReader.GetString(0);
                    if (!itemsDict.ContainsKey(parentTitle))
                    {
                        itemsDict[parentTitle] = new List<TransferOrderItem>();
                    }

                    itemsDict[parentTitle].Add(new TransferOrderItem
                    {
                        Store = itemsReader.GetString(1),
                        ItemCode = itemsReader.GetString(2),
                        AllocatedQty = Convert.ToDouble(itemsReader.GetDecimal(3)),
                        SortedQty = Convert.ToDouble(itemsReader.GetDecimal(4)),
                        PackedQty = Convert.ToDouble(itemsReader.GetDecimal(5)),
                        PendingQty = Convert.ToDouble(itemsReader.GetDecimal(6)),
                        Remarks = itemsReader.IsDBNull(7) ? null : itemsReader.GetString(7)
                    });
                }

                // Assign items to Transfer Orders
                for (int i = 0; i < transferOrders.Count; i++)
                {
                    var to = transferOrders[i];
                    var items = itemsDict.ContainsKey(to.Title) ? itemsDict[to.Title] : new List<TransferOrderItem>();
                    
                    transferOrders[i] = new TransferOrder
                    {
                        Title = to.Title,
                        Status = to.Status,
                        AdvanceShippingNotice = to.AdvanceShippingNotice,
                        FromWarehouse = to.FromWarehouse,
                        PreparedBy = to.PreparedBy,
                        RequiredDate = to.RequiredDate,
                        TotalAllocatedQty = to.TotalAllocatedQty,
                        Items = items
                    };
                }
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Transfer Orders from database", ex);
        }

        return transferOrders;
    }

    /// <summary>
    /// Get Transfer Order by title from database
    /// </summary>
    public static async Task<TransferOrder?> GetTransferOrderByTitleAsync(WmsSettings settings, string title)
    {
        var tos = await GetTransferOrdersAsync(settings);
        return tos.FirstOrDefault(to => to.Title == title);
    }

    /// <summary>
    /// Get Transfer Order by ASN from database
    /// </summary>
    public static async Task<TransferOrder?> GetTransferOrderByAsnAsync(WmsSettings settings, string asnTitle)
    {
        var tos = await GetTransferOrdersAsync(settings);
        return tos.FirstOrDefault(to => to.AdvanceShippingNotice == asnTitle);
    }
}

