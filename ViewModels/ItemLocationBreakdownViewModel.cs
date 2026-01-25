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
/// Uses transaction history to calculate In/Out/Balance per location and carton.
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

            ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Loading location data for {item.Code} from transaction history");

            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Query from transaction history with proper source/target bin handling
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
                            WHEN stock_direction = 'IN' THEN COALESCE(NULLIF(target_bin, ''), location_id)
                            WHEN stock_direction = 'OUT' THEN COALESCE(NULLIF(source_bin, ''), location_id)
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

            var locations = new System.Collections.Generic.List<ItemLocationStock>();

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
                    Warehouse = settings.DefaultPickingWarehouse ?? "Main Warehouse",
                    LocationId = locationId,
                    CartonId = cartonId,
                    InQty = inQty,
                    OutQty = outQty,
                    BalanceQty = balanceQty
                });
            }

            ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Found {locations.Count} location/carton entries from transaction history");

            // Update UI on UI thread
            await Application.Current.Dispatcher.InvokeAsync(() =>
            {
                Locations.Clear();
                foreach (var loc in locations)
                {
                    Locations.Add(loc);
                }
                TotalQty = Locations.Sum(l => l.BalanceQty);
                
                ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Displayed {Locations.Count} entries, Total Balance: {TotalQty}");
            }, System.Windows.Threading.DispatcherPriority.Normal);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ItemLocationBreakdownViewModel: Error loading location data for {item.Code}", ex);
        }
    }
}
