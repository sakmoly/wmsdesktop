using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class WarehouseListViewModel : BaseViewModel
{
    public ObservableCollection<Warehouse> Warehouses { get; } = new();

    public WarehouseListViewModel()
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
                LoadMockWarehouses();
                return;
            }

            var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
            foreach (var warehouse in warehouses)
            {
                Warehouses.Add(warehouse);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Warehouses in ViewModel", ex);
            // Fallback to mock data on error
            LoadMockWarehouses();
        }
    }

    private void LoadMockWarehouses()
    {
        // Mock data for design and testing
        Warehouses.Add(new Warehouse { Code = "WH-MAIN", Name = "Main Distribution Center", IsStore = false });
        Warehouses.Add(new Warehouse { Code = "ST-RYD-01", Name = "Riyadh Flagship Store", IsStore = true });
        Warehouses.Add(new Warehouse { Code = "ST-JED-02", Name = "Jeddah Mall Store 2", IsStore = true });
        Warehouses.Add(new Warehouse { Code = "WH-RETURNS", Name = "Returns / QC Warehouse", IsStore = false });
        
        // Also add from mock service
        foreach (var wh in MockDataService.GetWarehouses())
        {
            if (Warehouses.All(w => w.Code != wh.Code))
            {
                Warehouses.Add(wh);
            }
        }
    }
}


