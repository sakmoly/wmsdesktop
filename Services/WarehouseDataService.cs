using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class WarehouseDataService
{
    /// <summary>
    /// Get all Warehouses from database
    /// </summary>
    public static async Task<List<Warehouse>> GetWarehousesAsync(WmsSettings settings)
    {
        var warehouses = new List<Warehouse>();
        
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var sql = @"SELECT code, name, warehouse_type, is_group, parent_warehouse
                        FROM tabWarehouse
                        ORDER BY code";
            
            await using var cmd = new MySqlCommand(sql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var warehouseType = reader.IsDBNull(2) ? null : reader.GetString(2);
                var isStore = warehouseType == "Store";
                
                warehouses.Add(new Warehouse
                {
                    Code = reader.GetString(0),
                    Name = reader.GetString(1),
                    IsStore = isStore
                });
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Warehouses from database", ex);
        }

        return warehouses;
    }
}

