using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class PurchaseOrderListViewModel : BaseViewModel
{
    public ObservableCollection<PurchaseOrder> PurchaseOrders { get; } = new();
    private bool _isLoading = false;
    private readonly object _loadLock = new object();

    public PurchaseOrderListViewModel()
    {
        // Don't load in constructor - let Loaded event handle it
        // This prevents double loading and ensures fresh data on each view load
    }

    /// <summary>
    /// Refresh the Purchase Orders list from database
    /// </summary>
    public async Task RefreshAsync()
    {
        await LoadDataAsync();
    }

    private async Task LoadDataAsync()
    {
        // Prevent concurrent loads
        lock (_loadLock)
        {
            if (_isLoading)
            {
                ErrorLogService.LogInfo("PurchaseOrderListViewModel: Load already in progress, skipping");
                return;
            }
            _isLoading = true;
        }

        try
        {
            // Clear existing data before reloading
            PurchaseOrders.Clear();

            var settings = SettingsService.LoadSettings();
            if (settings == null || !settings.DatabaseExists || !settings.TablesExist)
            {
                // Database not available - show empty list
                ErrorLogService.LogInfo("PurchaseOrderListViewModel: Database not available, showing empty list");
                return;
            }

            // Load Purchase Orders from database (no mock data insertion)
            var pos = await PurchaseOrderDataService.GetPurchaseOrdersAsync(settings);
            foreach (var po in pos)
            {
                PurchaseOrders.Add(po);
            }
            
            ErrorLogService.LogInfo($"PurchaseOrderListViewModel: Loaded {pos.Count} Purchase Orders from database");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Purchase Orders in ViewModel", ex);
            // Show empty list on error - no mock data fallback
        }
        finally
        {
            lock (_loadLock)
            {
                _isLoading = false;
            }
        }
    }

    // Convenience properties (can be used in view with value converters, if needed)
    public int TotalOpenPos => PurchaseOrders.Count(po => po.Status is "Open");
}



