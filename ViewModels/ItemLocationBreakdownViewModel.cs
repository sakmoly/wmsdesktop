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

    private bool _isCartonLevelMode;
    public bool IsCartonLevelMode
    {
        get => _isCartonLevelMode;
        private set
        {
            if (_isCartonLevelMode != value)
            {
                _isCartonLevelMode = value;
                OnPropertyChanged();
            }
        }
    }

    public ItemLocationBreakdownViewModel(Item item)
    {
        ItemCode = item.Code;
        ItemName = item.Name;
        
        // Check inventory mode
        var settings = SettingsService.LoadSettings();
        IsCartonLevelMode = settings?.InventoryTrackingMode == "CartonLevel";
    }

    public async Task LoadLocationDataAsync(Item item)
    {
        try
        {
            // Clear existing locations before loading fresh data
            Locations.Clear();
            TotalQty = 0;
            
            // Get settings
            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                ErrorLogService.LogError("ItemLocationBreakdownViewModel: Settings not found", null);
                return;
            }
            
            ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Refreshing location data for {item.Code} using API");

            // Default warehouse - try multiple variations
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

            // Try each warehouse until we find entries using API
            List<ItemLocationStockApiResponse>? apiStockData = null;
            string? foundWarehouse = null;
            
            foreach (var warehouse in warehousesToTry)
            {
                try
                {
                    apiStockData = await ItemLocationStockService.GetItemLocationStockAsync(settings, item.Code, warehouse);
                    if (apiStockData != null && apiStockData.Count > 0)
                    {
                        foundWarehouse = warehouse;
                        ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Found {apiStockData.Count} location(s) in warehouse '{warehouse}' via API");
                        break;
                    }
                }
                catch (Exception ex)
                {
                    ErrorLogService.LogError($"ItemLocationBreakdownViewModel: Error calling API for warehouse '{warehouse}': {ex.Message}", ex);
                }
            }
            
            if (apiStockData == null || apiStockData.Count == 0)
            {
                ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: No stock data found via API for {item.Code}");
                return;
            }
            
            ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Processing {apiStockData.Count} location(s) from API for {item.Code} in warehouse '{foundWarehouse ?? "none"}'");

            // Get location details from database for display
            var locationConnectionString = DatabaseService.BuildConnectionString(settings);
            await using var locationConnection = new MySqlConnection(locationConnectionString);
            await locationConnection.OpenAsync();

            // Process API response and enrich with location details
            var locationDetails = new List<(string LocationId, string? Zone, string? Aisle, string? Rack, string? Level, string? Bin, string? CartonId, double TotalQty, double ReservedQty, double BlockedQty, double AvailableQty, List<string>? CalculationLog)>();

            // Process API response - each bin location from API
            foreach (var binData in apiStockData)
            {
                var binLocation = binData.BinLocation;
                
                // Get location details from database
                string? actualLocationId = null;
                string? zone = null;
                string? aisle = null;
                string? rack = null;
                string? level = null;
                string? bin = null;

                if (string.IsNullOrEmpty(binLocation))
                {
                    // Warehouse-level (no bin location)
                    actualLocationId = "Warehouse";
                }
                else
                {
                    // Try to find location in tabLocation
                    var locationSql = @"
                        SELECT location_id, zone, aisle, parent_rack, level, bin_id
                        FROM tabLocation
                        WHERE location_id = @binLocation
                        LIMIT 1";

                    await using var cmd = new MySqlCommand(locationSql, locationConnection);
                    cmd.Parameters.AddWithValue("@binLocation", binLocation);
                    await using var reader = await cmd.ExecuteReaderAsync();

                    if (await reader.ReadAsync())
                    {
                        actualLocationId = reader.GetString(0);
                        zone = reader.IsDBNull(1) ? null : reader.GetString(1);
                        aisle = reader.IsDBNull(2) ? null : reader.GetString(2);
                        rack = reader.IsDBNull(3) ? null : reader.GetString(3);
                        level = reader.IsDBNull(4) ? null : reader.GetString(4);
                        bin = reader.IsDBNull(5) ? null : reader.GetString(5);
                    }
                    await reader.CloseAsync();

                    // If not found, use bin_location as fallback
                    if (string.IsNullOrEmpty(actualLocationId))
                    {
                        actualLocationId = binLocation;
                        // Parse for display
                        var parts = binLocation.Split('-');
                        if (parts.Length >= 2)
                        {
                            rack = string.Join("-", parts.Take(parts.Length - 1)).Trim();
                            bin = parts[parts.Length - 1].Trim();
                        }
                        else if (parts.Length == 1)
                        {
                            rack = parts[0].Trim();
                        }
                    }
                }

                // Show ONE row per bin location (not per carton)
                // If multiple cartons exist, show the first carton ID or comma-separated list
                string? cartonIdDisplay = null;
                if (binData.Cartons != null && binData.Cartons.Count > 0)
                {
                    // If only one carton, show it; if multiple, show first one or comma-separated
                    if (binData.Cartons.Count == 1)
                    {
                        cartonIdDisplay = binData.Cartons[0].CartonId;
                    }
                    else
                    {
                        // Show first carton ID (or could show comma-separated list)
                        cartonIdDisplay = binData.Cartons[0].CartonId;
                        // Note: For display purposes, we show the first carton ID
                        // The available_qty shown is the TOTAL for the bin (not per carton)
                    }
                }
                
                // Add ONE entry per bin location with the bin's total quantities
                locationDetails.Add((
                    actualLocationId ?? "Unknown",
                    zone,
                    aisle,
                    rack,
                    level,
                    bin,
                    cartonIdDisplay, // Show first carton ID if available
                    binData.TotalQty,
                    binData.ReservedQty,
                    binData.BlockedQty,
                    binData.AvailableQty, // This is the bin's total available_qty (not per carton)
                    binData.CalculationLog
                ));
            }

            ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Processed {locationDetails.Count} location detail(s) from API");

            // Update UI on UI thread (using Application dispatcher for reliability)
            await Application.Current.Dispatcher.InvokeAsync(() =>
            {
                Locations.Clear();
                ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Cleared locations collection, current count: {Locations.Count}");

                // Process all location details from API
                foreach (var loc in locationDetails)
                {
                    var locationStock = new ItemLocationStock
                    {
                        ItemCode = item.Code,
                        ItemName = item.Name,
                        Warehouse = foundWarehouse ?? "Unknown",
                        LocationId = loc.LocationId,
                        Zone = loc.Zone ?? (loc.Rack?.StartsWith("STAGE") == true ? "Staging Area" : "Main Warehouse"),
                        Aisle = loc.Aisle,
                        Rack = loc.Rack,
                        Level = loc.Level,
                        BinId = loc.Bin,
                        CartonId = loc.CartonId,
                        TotalQty = loc.TotalQty,
                        ReservedQty = loc.ReservedQty,
                        BlockedQty = loc.BlockedQty,
                        AvailableQty = loc.AvailableQty,
                        CalculationLog = loc.CalculationLog
                    };
                    
                    Locations.Add(locationStock);
                    ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Added location {loc.LocationId} (Zone: {locationStock.Zone}, Rack: {loc.Rack}, Bin: {loc.Bin}, Carton: {loc.CartonId ?? "NULL"}, Available Qty: {loc.AvailableQty})");
                }

                // Calculate total (sum of AvailableQty)
                TotalQty = Locations.Sum(loc => loc.AvailableQty);
                
                ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Final count - Added {Locations.Count} locations, Total Available Qty: {TotalQty}, Collection Count: {Locations.Count}");
            }, System.Windows.Threading.DispatcherPriority.Normal);
        }
        catch (System.Exception ex)
        {
            ErrorLogService.LogError($"ItemLocationBreakdownViewModel: Error loading location data for {item.Code}", ex);
        }
    }

    /// <summary>
    /// Check if a table exists in the database
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


