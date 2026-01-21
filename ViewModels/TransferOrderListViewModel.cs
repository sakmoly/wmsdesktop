using System;
using System.Collections.ObjectModel;
using System.Threading.Tasks;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class TransferOrderListViewModel : BaseViewModel
{
    public ObservableCollection<TransferOrder> TransferOrders { get; } = new();

    public TransferOrderListViewModel()
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
                foreach (var to in MockDataService.GetTransferOrders())
                {
                    TransferOrders.Add(to);
                }
                return;
            }

            // Sync transfer orders from API to local database first
            await TransferOrderSyncService.SyncTransferOrdersFromApiAsync(settings);

            // Then load from local database
            var tos = await TransferOrderDataService.GetTransferOrdersAsync(settings);
            foreach (var to in tos)
            {
                TransferOrders.Add(to);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Transfer Orders in ViewModel", ex);
            // Fallback to mock data on error
            foreach (var to in MockDataService.GetTransferOrders())
            {
                TransferOrders.Add(to);
            }
        }
    }
}


