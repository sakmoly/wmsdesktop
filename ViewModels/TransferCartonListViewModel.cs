using System;
using System.Collections.ObjectModel;
using System.Threading.Tasks;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class TransferCartonListViewModel : BaseViewModel
{
    public ObservableCollection<TransferCarton> TransferCartons { get; } = new();

    public TransferCartonListViewModel()
    {
        // Don't load in constructor - wait for Loaded event
    }

    public async Task RefreshAsync()
    {
        await LoadDataAsync();
    }

    private async Task LoadDataAsync()
    {
        try
        {
            ErrorLogService.LogInfo("TransferCartonListViewModel: Starting to load transfer cartons");
            
            // Clear existing data
            TransferCartons.Clear();
            
            var settings = SettingsService.LoadSettings();
            if (settings == null || !settings.DatabaseExists || !settings.TablesExist)
            {
                ErrorLogService.LogInfo("TransferCartonListViewModel: Database not available - using mock data");
                // Fallback to mock data if database not available
                foreach (var tc in MockDataService.GetTransferCartons())
                {
                    TransferCartons.Add(tc);
                }
                ErrorLogService.LogInfo($"TransferCartonListViewModel: Added {TransferCartons.Count} mock transfer cartons");
                return;
            }

            var cartons = await TransferCartonDataService.GetTransferCartonsAsync(settings);
            ErrorLogService.LogInfo($"TransferCartonListViewModel: Received {cartons.Count} transfer cartons from service");
            
            foreach (var carton in cartons)
            {
                TransferCartons.Add(carton);
            }
            
            ErrorLogService.LogInfo($"TransferCartonListViewModel: Added {TransferCartons.Count} transfer cartons to collection");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Transfer Cartons in ViewModel", ex);
            // Fallback to mock data on error
            foreach (var tc in MockDataService.GetTransferCartons())
            {
                TransferCartons.Add(tc);
            }
            ErrorLogService.LogInfo($"TransferCartonListViewModel: Added {TransferCartons.Count} mock transfer cartons after error");
        }
    }
}

