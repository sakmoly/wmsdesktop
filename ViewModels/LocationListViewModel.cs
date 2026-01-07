using System;
using System.Collections.ObjectModel;
using System.Threading.Tasks;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class LocationListViewModel : BaseViewModel
{
    public ObservableCollection<Location> Locations { get; } = new();

    public LocationListViewModel()
    {
        _ = LoadDataAsync();
    }

    private async Task LoadDataAsync()
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null || !settings.DatabaseExists || !settings.TablesExist)
            {
                // Fallback to mock data if database not available
                LoadMockLocations();
                return;
            }

            var locations = await LocationDataService.GetLocationsAsync(settings);
            foreach (var location in locations)
            {
                Locations.Add(location);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Locations in ViewModel", ex);
            // Fallback to mock data on error
            LoadMockLocations();
        }
    }

    private void LoadMockLocations()
    {
        // Mock data for design and testing when database is not available
        Locations.Add(new Location
        {
            LocationId = "A1-R01-L1-B1",
            Warehouse = "WH-MAIN",
            Zone = "Zone A",
            Aisle = "Aisle 01",
            ParentRack = "Rack 01",
            Level = "1",
            BinId = "B1",
            LocationType = "Picking",
            IsAvailable = true,
            CapacityVolumeWeight = 100,
            LocationTypeDetailed = "Bin/Shelf"
        });

        Locations.Add(new Location
        {
            LocationId = "A1-R01-L2-B1",
            Warehouse = "WH-MAIN",
            Zone = "Zone A",
            Aisle = "Aisle 01",
            ParentRack = "Rack 01",
            Level = "2",
            BinId = "B1",
            LocationType = "Picking",
            IsAvailable = true,
            CapacityVolumeWeight = 120,
            LocationTypeDetailed = "Bin/Shelf"
        });

        Locations.Add(new Location
        {
            LocationId = "STAGE-01",
            Warehouse = "WH-MAIN",
            Zone = "Staging Area",
            Aisle = null,
            ParentRack = null,
            Level = null,
            BinId = "SL-01",
            LocationType = "Bulk Storage",
            IsAvailable = true,
            CapacityVolumeWeight = 1000,
            LocationTypeDetailed = "Staging Lane"
        });
    }
}


