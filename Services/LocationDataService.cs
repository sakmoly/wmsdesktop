using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class LocationDataService
{
    /// <summary>
    /// Get all Locations from database
    /// </summary>
    public static async Task<List<Location>> GetLocationsAsync(WmsSettings settings)
    {
        var locations = new List<Location>();
        
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var sql = @"SELECT location_id, warehouse, zone, aisle, parent_rack, level, bin_id, 
                               location_type, location_type_detailed, is_available, capacity_volume_weight
                        FROM tabLocation
                        ORDER BY warehouse, zone, aisle, parent_rack, level, bin_id";
            
            await using var cmd = new MySqlCommand(sql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                locations.Add(new Location
                {
                    LocationId = reader.GetString(0),
                    Warehouse = reader.GetString(1),
                    Zone = reader.IsDBNull(2) ? null : reader.GetString(2),
                    Aisle = reader.IsDBNull(3) ? null : reader.GetString(3),
                    ParentRack = reader.IsDBNull(4) ? null : reader.GetString(4),
                    Level = reader.IsDBNull(5) ? null : reader.GetString(5),
                    BinId = reader.IsDBNull(6) ? null : reader.GetString(6),
                    LocationType = reader.IsDBNull(7) ? null : reader.GetString(7),
                    LocationTypeDetailed = reader.IsDBNull(8) ? null : reader.GetString(8),
                    IsAvailable = reader.GetBoolean(9),
                    CapacityVolumeWeight = reader.IsDBNull(10) ? null : Convert.ToDouble(reader.GetDecimal(10))
                });
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Locations from database", ex);
        }

        return locations;
    }

    /// <summary>
    /// Get Location by location_id from database
    /// </summary>
    public static async Task<Location?> GetLocationByIdAsync(WmsSettings settings, string locationId)
    {
        var locations = await GetLocationsAsync(settings);
        return locations.FirstOrDefault(l => l.LocationId == locationId);
    }
}

