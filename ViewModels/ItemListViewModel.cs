using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class ItemListViewModel : BaseViewModel
{
    public ObservableCollection<Item> Items { get; } = new();

    public ItemListViewModel()
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
                LoadMockItems();
                return;
            }

            var items = await ItemDataService.GetItemsAsync(settings);
            foreach (var item in items)
            {
                Items.Add(item);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Items in ViewModel", ex);
            // Fallback to mock data on error
            LoadMockItems();
        }
    }

    private void LoadMockItems()
    {
        // Mock items inspired by WMS Item DocType with stock quantities
        Items.Add(new Item
        {
            Code = "SKU-TSHIRT-001-BLK-S",
            Name = "Basic T-Shirt Black S",
            ItemGroup = "Apparel - T-Shirts",
            Brand = "Printechs",
            DefaultUom = "Nos",
            StockUom = "Nos",
            Barcode = "6280000000001",
            MaintainStock = true,
            StockQty = 450,
            ReservedQty = 50
        });

        Items.Add(new Item
        {
            Code = "SKU-TSHIRT-001-BLK-M",
            Name = "Basic T-Shirt Black M",
            ItemGroup = "Apparel - T-Shirts",
            Brand = "Printechs",
            DefaultUom = "Nos",
            StockUom = "Nos",
            Barcode = "6280000000002",
            MaintainStock = true,
            StockQty = 380,
            ReservedQty = 80
        });

        Items.Add(new Item
        {
            Code = "SKU-JEANS-021-BLU-32",
            Name = "Slim Jeans Blue 32",
            ItemGroup = "Apparel - Jeans",
            Brand = "UrbanLine",
            DefaultUom = "Nos",
            StockUom = "Nos",
            Barcode = "6280000000101",
            MaintainStock = true,
            StockQty = 220,
            ReservedQty = 30
        });

        // Use mock data service for fallback
        foreach (var item in MockDataService.GetItems())
        {
            if (Items.All(i => i.Code != item.Code))
            {
                Items.Add(item);
            }
        }
    }
}

