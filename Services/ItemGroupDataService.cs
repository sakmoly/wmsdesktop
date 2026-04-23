using System;
using System.Collections.Generic;
using System.Data;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class ItemGroupDataService
{
    /// <summary>
    /// Get all item groups from database (tabItemGroup)
    /// </summary>
    public static async Task<List<ItemGroup>> GetItemGroupsAsync(WmsSettings settings)
    {
        var list = new List<ItemGroup>();
        try
        {
            await DatabaseService.EnsureTabItemGroupExistsAsync(settings);
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var sql = @"SELECT name, parent_item_group, is_group FROM tabItemGroup ORDER BY name";
            await using var cmd = new MySqlCommand(sql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                list.Add(new ItemGroup
                {
                    Code = reader.GetString(0),
                    Name = reader.GetString(0),
                    ParentGroup = reader.IsDBNull(1) ? null : reader.GetString(1),
                    IsGroup = !reader.IsDBNull(2) && reader.GetBoolean(2)
                });
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading item groups from database", ex);
        }

        return list;
    }
}
