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
    /// Get all Items from database. Stock Qty is set from transaction history total balance
    /// (same as Item Location Breakdown total) so the list matches the breakdown popup.
    /// </summary>
    public static async Task<List<Item>> GetItemsAsync(WmsSettings settings)
    {
        var items = new List<Item>();

        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            await DatabaseService.EnsureTabItemUomColumnsAsync(connection);

            var sql = @"SELECT code, name, item_group, color, size, year, season, brand, default_uom, stock_uom,
                               barcode, maintain_stock, stock_qty, reserved_qty, updated_on
                        FROM tabItem
                        ORDER BY code";

            await using (var cmd = new MySqlCommand(sql, connection))
            await using (var reader = await cmd.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                {
                    items.Add(new Item
                    {
                        Code = reader.GetString(0),
                        Name = reader.GetString(1),
                        ItemGroup = reader.IsDBNull(2) ? null : reader.GetString(2),
                        Color = reader.IsDBNull(3) ? null : reader.GetString(3),
                        Size = reader.IsDBNull(4) ? null : reader.GetString(4),
                        Year = reader.IsDBNull(5) ? null : reader.GetString(5),
                        Season = reader.IsDBNull(6) ? null : reader.GetString(6),
                        Brand = reader.IsDBNull(7) ? null : reader.GetString(7),
                        DefaultUom = reader.IsDBNull(8) ? null : reader.GetString(8),
                        StockUom = reader.IsDBNull(9) ? null : reader.GetString(9),
                        Barcode = reader.IsDBNull(10) ? null : reader.GetString(10),
                        MaintainStock = reader.GetBoolean(11),
                        StockQty = Convert.ToDouble(reader.GetDecimal(12)),
                        ReservedQty = Convert.ToDouble(reader.GetDecimal(13)),
                        UpdatedOn = reader.IsDBNull(14) ? null : reader.GetDateTime(14)
                    });
                }
            }

            // Override StockQty with total balance from transaction history (same as Item Location Breakdown total)
            var balances = await GetItemTotalBalancesFromTransactionHistoryAsync(connection);
            for (var i = 0; i < items.Count; i++)
            {
                var item = items[i];
                if (balances.TryGetValue(item.Code, out var totalBalance))
                {
                    items[i] = new Item
                    {
                        Code = item.Code,
                        Name = item.Name,
                        ItemGroup = item.ItemGroup,
                        Color = item.Color,
                        Size = item.Size,
                        Year = item.Year,
                        Season = item.Season,
                        Brand = item.Brand,
                        DefaultUom = item.DefaultUom,
                        StockUom = item.StockUom,
                        Barcode = item.Barcode,
                        MaintainStock = item.MaintainStock,
                        StockQty = totalBalance,
                        ReservedQty = item.ReservedQty,
                        UpdatedOn = item.UpdatedOn
                    };
                }
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Items from database", ex);
        }

        return items;
    }

    /// <summary>
    /// Returns item_code -> total balance (sum of qty_change) from tabtransactionhistory.
    /// Same total as used in Item Location Breakdown.
    /// </summary>
    private static async Task<Dictionary<string, double>> GetItemTotalBalancesFromTransactionHistoryAsync(MySqlConnection connection)
    {
        var balances = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        try
        {
            const string sql = @"
                SELECT item_code, SUM(qty_change) AS total_balance
                FROM tabtransactionhistory
                GROUP BY item_code";
            await using var cmd = new MySqlCommand(sql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var code = reader.GetString(0);
                var total = reader.IsDBNull(1) ? 0.0 : reader.GetDouble(1);
                balances[code] = total;
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading item balances from transaction history", ex);
        }

        return balances;
    }
}

