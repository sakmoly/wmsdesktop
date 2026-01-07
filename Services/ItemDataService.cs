using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class ItemDataService
{
    /// <summary>
    /// Get all Items from database
    /// </summary>
    public static async Task<List<Item>> GetItemsAsync(WmsSettings settings)
    {
        var items = new List<Item>();
        
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var sql = @"SELECT code, name, item_group, brand, default_uom, stock_uom, 
                               barcode, maintain_stock, stock_qty, reserved_qty, updated_on
                        FROM tabItem
                        ORDER BY code";
            
            await using var cmd = new MySqlCommand(sql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                items.Add(new Item
                {
                    Code = reader.GetString(0),
                    Name = reader.GetString(1),
                    ItemGroup = reader.IsDBNull(2) ? null : reader.GetString(2),
                    Brand = reader.IsDBNull(3) ? null : reader.GetString(3),
                    DefaultUom = reader.IsDBNull(4) ? null : reader.GetString(4),
                    StockUom = reader.IsDBNull(5) ? null : reader.GetString(5),
                    Barcode = reader.IsDBNull(6) ? null : reader.GetString(6),
                    MaintainStock = reader.GetBoolean(7),
                    StockQty = Convert.ToDouble(reader.GetDecimal(8)),
                    ReservedQty = Convert.ToDouble(reader.GetDecimal(9)),
                    UpdatedOn = reader.IsDBNull(10) ? null : reader.GetDateTime(10)
                });
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Items from database", ex);
        }

        return items;
    }
}

