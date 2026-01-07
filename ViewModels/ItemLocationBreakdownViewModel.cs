using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

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
            // Get settings
            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                ErrorLogService.LogError("ItemLocationBreakdownViewModel: Settings not found", null);
                return;
            }

            // Default warehouse - try multiple variations
            // Backend uses "Main Warehouse" as default, so try that first
            var warehousesToTry = new List<string>();
            
            // Add the setting's default warehouse if it exists
            if (!string.IsNullOrEmpty(settings.DefaultPickingWarehouse))
            {
                warehousesToTry.Add(settings.DefaultPickingWarehouse);
            }
            
            // Add common warehouse name variations
            warehousesToTry.Add("Main Warehouse");
            warehousesToTry.Add("WH-MAIN");
            warehousesToTry.Add("WH-Main");
            
            // Remove duplicates
            warehousesToTry = warehousesToTry.Distinct().ToList();
            
            ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Loading location data for {item.Code}, trying warehouses: {string.Join(", ", warehousesToTry)}");

            // Try each warehouse until we find entries
            var stockLedgerEntries = new List<StockLedger>();
            string? foundWarehouse = null;
            
            foreach (var warehouse in warehousesToTry)
            {
                var entries = await StockLedgerService.GetStockByBinAsync(settings, item.Code, warehouse);
                if (entries.Count > 0)
                {
                    stockLedgerEntries = entries;
                    foundWarehouse = warehouse;
                    ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Found {entries.Count} entries in warehouse '{warehouse}'");
                    break;
                }
            }
            
            // If no entries found, try to find entries in any warehouse for this item
            if (stockLedgerEntries.Count == 0)
            {
                ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: No entries found in tried warehouses, searching all warehouses for {item.Code}");
                
                // Query all warehouses for this item
                var connectionString = DatabaseService.BuildConnectionString(settings);
                await using var connection = new MySqlConnection(connectionString);
                await connection.OpenAsync();

                var sql = @"
                    SELECT DISTINCT warehouse
                    FROM tabStockLedger
                    WHERE item_code = @itemCode
                    LIMIT 10";

                await using var cmd = new MySqlCommand(sql, connection);
                cmd.Parameters.AddWithValue("@itemCode", item.Code);

                var warehouses = new List<string>();
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    warehouses.Add(reader.GetString(0));
                }

                if (warehouses.Count > 0)
                {
                    ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Found item in warehouses: {string.Join(", ", warehouses)}");
                    // Try the first warehouse found
                    foundWarehouse = warehouses[0];
                    var entries = await StockLedgerService.GetStockByBinAsync(settings, item.Code, foundWarehouse);
                    if (entries.Count > 0)
                    {
                        stockLedgerEntries = entries;
                    }
                }
                else
                {
                    ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: No stock ledger entries found for {item.Code} in any warehouse");
                }
            }
            
            ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Found {stockLedgerEntries.Count} stock ledger entries for {item.Code} in warehouse '{foundWarehouse ?? "none"}'");

            // Join with tabLocation to get actual location_id and location details
            // Reuse existing connection from the search above if available, otherwise create new one
            var locationConnectionString = DatabaseService.BuildConnectionString(settings);
            await using var locationConnection = new MySqlConnection(locationConnectionString);
            await locationConnection.OpenAsync();

            // Build a list of location details with actual location_id from tabLocation
            var locationDetails = new List<(string LocationId, string? Zone, string? Aisle, string? Rack, string? Level, string? Bin, double Qty)>();

            foreach (var entry in stockLedgerEntries)
            {
                if (string.IsNullOrEmpty(entry.BinLocation))
                {
                    // Warehouse-level (no bin location)
                    locationDetails.Add(("Warehouse", null, null, null, null, null, entry.Qty));
                    continue;
                }

                // Try to find location in tabLocation by matching bin_location with location_id first
                // If not found, try to match by parsing bin_location to get rack and bin
                string? actualLocationId = null;
                string? zone = null;
                string? aisle = null;
                string? rack = null;
                string? level = null;
                string? bin = null;

                // Method 1: Direct match - bin_location might be the location_id itself
                var locationSql1 = @"
                    SELECT location_id, zone, aisle, parent_rack, level, bin_id
                    FROM tabLocation
                    WHERE location_id = @binLocation
                    LIMIT 1";

                await using var cmd1 = new MySqlCommand(locationSql1, locationConnection);
                cmd1.Parameters.AddWithValue("@binLocation", entry.BinLocation);
                await using var reader1 = await cmd1.ExecuteReaderAsync();

                if (await reader1.ReadAsync())
                {
                    actualLocationId = reader1.GetString(0);
                    zone = reader1.IsDBNull(1) ? null : reader1.GetString(1);
                    aisle = reader1.IsDBNull(2) ? null : reader1.GetString(2);
                    rack = reader1.IsDBNull(3) ? null : reader1.GetString(3);
                    level = reader1.IsDBNull(4) ? null : reader1.GetString(4);
                    bin = reader1.IsDBNull(5) ? null : reader1.GetString(5);
                    ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Direct match found location_id={actualLocationId} for bin_location={entry.BinLocation}");
                }
                await reader1.CloseAsync();

                // Method 2: If not found, try to parse bin_location and match by rack+bin
                if (string.IsNullOrEmpty(actualLocationId))
                {
                    // Parse bin_location (format: "Rack 02-B3" or "RACK-BIN")
                    string? parsedRack = null;
                    string? parsedBin = null;

                    var parts = entry.BinLocation.Split('-');
                    if (parts.Length >= 2)
                    {
                        // Format 1: "Rack 02-B3" -> rack = "Rack 02", bin = "B3"
                        parsedRack = string.Join("-", parts.Take(parts.Length - 1)).Trim();
                        parsedBin = parts[parts.Length - 1].Trim();
                    }
                    else if (parts.Length == 1)
                    {
                        parsedRack = parts[0].Trim();
                    }

                    ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Parsed bin_location='{entry.BinLocation}' -> rack='{parsedRack}', bin='{parsedBin}'");

                    if (!string.IsNullOrEmpty(parsedRack) || !string.IsNullOrEmpty(parsedBin))
                    {
                        // Try matching with warehouse first
                        var locationWarehousesToTry = new List<string>();
                        if (!string.IsNullOrEmpty(foundWarehouse))
                        {
                            locationWarehousesToTry.Add(foundWarehouse);
                        }
                        if (!string.IsNullOrEmpty(entry.Warehouse))
                        {
                            locationWarehousesToTry.Add(entry.Warehouse);
                        }
                        // Add common warehouse name variations
                        locationWarehousesToTry.AddRange(new[] { "Main Warehouse", "WH-MAIN", "WH-Main" });
                        locationWarehousesToTry = locationWarehousesToTry.Distinct().ToList();

                        foreach (var warehouseName in locationWarehousesToTry)
                        {
                            var locationSql2 = @"
                                SELECT location_id, zone, aisle, parent_rack, level, bin_id
                                FROM tabLocation
                                WHERE warehouse = @warehouse
                                  AND (parent_rack = @rack OR (@rack IS NULL AND parent_rack IS NULL))
                                  AND (bin_id = @bin OR (@bin IS NULL AND bin_id IS NULL))
                                LIMIT 1";

                            await using var cmd2 = new MySqlCommand(locationSql2, locationConnection);
                            cmd2.Parameters.AddWithValue("@warehouse", warehouseName);
                            cmd2.Parameters.AddWithValue("@rack", parsedRack ?? (object)DBNull.Value);
                            cmd2.Parameters.AddWithValue("@bin", parsedBin ?? (object)DBNull.Value);
                            await using var reader2 = await cmd2.ExecuteReaderAsync();

                            if (await reader2.ReadAsync())
                            {
                                actualLocationId = reader2.GetString(0);
                                zone = reader2.IsDBNull(1) ? null : reader2.GetString(1);
                                aisle = reader2.IsDBNull(2) ? null : reader2.GetString(2);
                                rack = reader2.IsDBNull(3) ? null : reader2.GetString(3);
                                level = reader2.IsDBNull(4) ? null : reader2.GetString(4);
                                bin = reader2.IsDBNull(5) ? null : reader2.GetString(5);
                                ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Found location_id={actualLocationId} by rack+bin match (warehouse={warehouseName}, rack={parsedRack}, bin={parsedBin})");
                                await reader2.CloseAsync();
                                break;
                            }
                            await reader2.CloseAsync();
                        }

                        // If still not found, try without warehouse constraint
                        if (string.IsNullOrEmpty(actualLocationId))
                        {
                            var locationSql3 = @"
                                SELECT location_id, zone, aisle, parent_rack, level, bin_id
                                FROM tabLocation
                                WHERE (parent_rack = @rack OR (@rack IS NULL AND parent_rack IS NULL))
                                  AND (bin_id = @bin OR (@bin IS NULL AND bin_id IS NULL))
                                LIMIT 1";

                            await using var cmd3 = new MySqlCommand(locationSql3, locationConnection);
                            cmd3.Parameters.AddWithValue("@rack", parsedRack ?? (object)DBNull.Value);
                            cmd3.Parameters.AddWithValue("@bin", parsedBin ?? (object)DBNull.Value);
                            await using var reader3 = await cmd3.ExecuteReaderAsync();

                            if (await reader3.ReadAsync())
                            {
                                actualLocationId = reader3.GetString(0);
                                zone = reader3.IsDBNull(1) ? null : reader3.GetString(1);
                                aisle = reader3.IsDBNull(2) ? null : reader3.GetString(2);
                                rack = reader3.IsDBNull(3) ? null : reader3.GetString(3);
                                level = reader3.IsDBNull(4) ? null : reader3.GetString(4);
                                bin = reader3.IsDBNull(5) ? null : reader3.GetString(5);
                                ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Found location_id={actualLocationId} by rack+bin match (no warehouse constraint, rack={parsedRack}, bin={parsedBin})");
                            }
                            await reader3.CloseAsync();
                        }
                    }
                }

                // If still not found, use bin_location as fallback
                if (string.IsNullOrEmpty(actualLocationId))
                {
                    ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Could not find location_id for bin_location='{entry.BinLocation}', using as fallback");
                    actualLocationId = entry.BinLocation;
                    // Parse for display
                    var parts = entry.BinLocation.Split('-');
                    if (parts.Length >= 2)
                    {
                        rack = string.Join("-", parts.Take(parts.Length - 1)).Trim();
                        bin = parts[parts.Length - 1].Trim();
                    }
                    else if (parts.Length == 1)
                    {
                        rack = parts[0].Trim();
                    }
                    ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Using bin_location as fallback location_id: '{actualLocationId}' (rack='{rack}', bin='{bin}')");
                }

                locationDetails.Add((actualLocationId, zone, aisle, rack, level, bin, entry.Qty));
            }

            // Update UI on UI thread (using Application dispatcher for reliability)
            await Application.Current.Dispatcher.InvokeAsync(() =>
            {
                Locations.Clear();
                ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Cleared locations collection, current count: {Locations.Count}");

                for (int i = 0; i < stockLedgerEntries.Count && i < locationDetails.Count; i++)
                {
                    var entry = stockLedgerEntries[i];
                    var loc = locationDetails[i];

                    var locationStock = new ItemLocationStock
                    {
                        ItemCode = entry.ItemCode,
                        ItemName = item.Name,
                        Warehouse = entry.Warehouse,
                        LocationId = loc.LocationId,
                        Zone = loc.Zone ?? (loc.Rack?.StartsWith("STAGE") == true ? "Staging Area" : "Main Warehouse"),
                        Aisle = loc.Aisle,
                        Rack = loc.Rack,
                        Level = loc.Level,
                        BinId = loc.Bin,
                        Qty = loc.Qty
                    };
                    
                    Locations.Add(locationStock);
                    ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Added location {loc.LocationId} (Zone: {locationStock.Zone}, Rack: {loc.Rack}, Bin: {loc.Bin}, Qty: {loc.Qty})");
                }

                // Calculate total
                TotalQty = Locations.Sum(loc => loc.Qty);
                
                ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Final count - Added {Locations.Count} locations, Total Qty: {TotalQty}, Collection Count: {Locations.Count}");
            }, System.Windows.Threading.DispatcherPriority.Normal);
        }
        catch (System.Exception ex)
        {
            ErrorLogService.LogError($"ItemLocationBreakdownViewModel: Error loading location data for {item.Code}", ex);
        }
    }
}


