using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

/// <summary>
/// ViewModel for Item Location Breakdown window.
/// Prefers tabCartonStock (current state) so all locations match Stock Locations; falls back to transaction history.
/// </summary>
public sealed class ItemLocationBreakdownViewModel : BaseViewModel
{
    public string ItemCode { get; }
    public string ItemName { get; }

    public ObservableCollection<ItemLocationStock> Locations { get; } = new();

    private double _totalQty;
    public double TotalQty
    {
        get => _totalQty;
        private set
        {
            if (_totalQty != value)
            {
                _totalQty = value;
                OnPropertyChanged();
            }
        }
    }

    public ItemLocationBreakdownViewModel(Item item)
    {
        ItemCode = item.Code;
        ItemName = item.Name;
    }

    public async Task LoadLocationDataAsync(Item item)
    {
        try
        {
            Locations.Clear();
            TotalQty = 0;

            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                ErrorLogService.LogError("ItemLocationBreakdownViewModel: Settings not found", null);
                return;
            }

            var warehouseCode = await ResolveWarehouseCodeAsync(settings);

            // Prefer tabCartonStock so all locations show (same source as Stock Locations / API)
            var fromCartonStock = await LoadFromCartonStockAsync(settings, item, warehouseCode);
            if (fromCartonStock.Count > 0)
            {
                await ApplyLocationsAsync(fromCartonStock);
                ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Loaded {fromCartonStock.Count} entries from tabCartonStock, Total: {TotalQty}");
                return;
            }

            // Fallback: transaction history
            await LoadFromTransactionHistoryAsync(settings, item, warehouseCode);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ItemLocationBreakdownViewModel: Error loading location data for {item.Code}", ex);
        }
    }

    private static async Task<string> ResolveWarehouseCodeAsync(WmsSettings settings)
    {
        var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
        return WarehouseDataService.ResolveToCode(settings.DefaultPickingWarehouse ?? "Main Warehouse", warehouses);
    }

    private static async Task<System.Collections.Generic.List<ItemLocationStock>> LoadFromCartonStockAsync(
        WmsSettings settings,
        Item item,
        string warehouseCode)
    {
        var list = new System.Collections.Generic.List<ItemLocationStock>();
        var rows = await CartonDataService.GetCartonStockAsync(settings, cartonId: null, itemCode: item.Code, warehouse: null, binLocation: null);
        foreach (var row in rows.OrderBy(r => r.BinLocation).ThenBy(r => r.CartonId))
        {
            if (row.Qty <= 0) continue;
            list.Add(new ItemLocationStock
            {
                ItemCode = item.Code,
                ItemName = item.Name,
                Warehouse = warehouseCode,
                LocationId = row.BinLocation ?? "",
                CartonId = row.CartonId,
                InQty = 0,
                OutQty = 0,
                BalanceQty = row.Qty
            });
        }
        return list;
    }

    private async Task LoadFromTransactionHistoryAsync(WmsSettings settings, Item item, string warehouseCode)
    {
        ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Loading location data for {item.Code} from transaction history");

        var connectionString = DatabaseService.BuildConnectionString(settings);
        await using var connection = new MySqlConnection(connectionString);
        await connection.OpenAsync();

        var sql = @"
            SELECT
                location_id,
                carton_id,
                SUM(CASE WHEN stock_direction = 'IN' THEN qty_change ELSE 0 END) AS in_qty,
                SUM(CASE WHEN stock_direction = 'OUT' THEN ABS(qty_change) ELSE 0 END) AS out_qty,
                SUM(qty_change) AS balance_qty
            FROM (
                SELECT
                    CASE
                        WHEN stock_direction = 'IN' THEN COALESCE(NULLIF(TRIM(target_bin), ''), NULLIF(TRIM(bin_location), ''), location_id)
                        WHEN stock_direction = 'OUT' THEN COALESCE(NULLIF(TRIM(source_bin), ''), NULLIF(TRIM(bin_location), ''), location_id)
                        ELSE COALESCE(NULLIF(TRIM(bin_location), ''), location_id)
                    END AS location_id,
                    carton_id,
                    stock_direction,
                    qty_change
                FROM tabtransactionhistory
                WHERE item_code = @itemCode
            ) t
            GROUP BY location_id, carton_id
            HAVING balance_qty <> 0
            ORDER BY location_id, carton_id";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@itemCode", item.Code);

        System.Collections.Generic.List<ItemLocationStock> locations;
        try
        {
            locations = new System.Collections.Generic.List<ItemLocationStock>();
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var locationId = reader.IsDBNull(0) ? "Unknown" : reader.GetString(0);
                var cartonId = reader.IsDBNull(1) ? null : reader.GetString(1);
                var inQty = reader.IsDBNull(2) ? 0.0 : reader.GetDouble(2);
                var outQty = reader.IsDBNull(3) ? 0.0 : reader.GetDouble(3);
                var balanceQty = reader.IsDBNull(4) ? 0.0 : reader.GetDouble(4);

                locations.Add(new ItemLocationStock
                {
                    ItemCode = item.Code,
                    ItemName = item.Name,
                    Warehouse = warehouseCode,
                    LocationId = locationId,
                    CartonId = cartonId,
                    InQty = inQty,
                    OutQty = outQty,
                    BalanceQty = balanceQty
                });
            }
        }
        catch (MySqlException)
        {
            // Table or columns (e.g. bin_location) may not exist; retry without bin_location
            locations = await LoadFromTransactionHistoryFallbackAsync(connection, item, warehouseCode);
        }

        ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Found {locations.Count} location/carton entries from transaction history");
        await ApplyLocationsAsync(locations);
    }

    private static async Task<System.Collections.Generic.List<ItemLocationStock>> LoadFromTransactionHistoryFallbackAsync(
        MySqlConnection connection,
        Item item,
        string warehouseCode)
    {
        var locations = new System.Collections.Generic.List<ItemLocationStock>();
        var sql = @"
            SELECT
                location_id,
                carton_id,
                SUM(CASE WHEN stock_direction = 'IN' THEN qty_change ELSE 0 END) AS in_qty,
                SUM(CASE WHEN stock_direction = 'OUT' THEN ABS(qty_change) ELSE 0 END) AS out_qty,
                SUM(qty_change) AS balance_qty
            FROM (
                SELECT
                    CASE
                        WHEN stock_direction = 'IN' THEN COALESCE(NULLIF(TRIM(target_bin), ''), location_id)
                        WHEN stock_direction = 'OUT' THEN COALESCE(NULLIF(TRIM(source_bin), ''), location_id)
                        ELSE location_id
                    END AS location_id,
                    carton_id,
                    stock_direction,
                    qty_change
                FROM tabtransactionhistory
                WHERE item_code = @itemCode
            ) t
            GROUP BY location_id, carton_id
            HAVING balance_qty <> 0
            ORDER BY location_id, carton_id";
        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@itemCode", item.Code);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var locationId = reader.IsDBNull(0) ? "Unknown" : reader.GetString(0);
            var cartonId = reader.IsDBNull(1) ? null : reader.GetString(1);
            var inQty = reader.IsDBNull(2) ? 0.0 : reader.GetDouble(2);
            var outQty = reader.IsDBNull(3) ? 0.0 : reader.GetDouble(3);
            var balanceQty = reader.IsDBNull(4) ? 0.0 : reader.GetDouble(4);
            locations.Add(new ItemLocationStock
            {
                ItemCode = item.Code,
                ItemName = item.Name,
                Warehouse = warehouseCode,
                LocationId = locationId,
                CartonId = cartonId,
                InQty = inQty,
                OutQty = outQty,
                BalanceQty = balanceQty
            });
        }
        return locations;
    }

    private async Task ApplyLocationsAsync(System.Collections.Generic.List<ItemLocationStock> locations)
    {
        await Application.Current.Dispatcher.InvokeAsync(() =>
        {
            Locations.Clear();
            foreach (var loc in locations)
                Locations.Add(loc);
            TotalQty = Locations.Sum(l => l.BalanceQty);
        }, System.Windows.Threading.DispatcherPriority.Normal);
    }
}
