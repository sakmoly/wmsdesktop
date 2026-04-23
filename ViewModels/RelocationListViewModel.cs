using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class RelocationListViewModel : BaseViewModel
{
    public ObservableCollection<RelocationSessionDisplayItem> Sessions { get; } = new();

    public RelocationListViewModel()
    {
        _ = LoadDataAsync();
    }

    /// <summary>Reload sessions from API and refresh the list (warehouse shown as code).</summary>
    public async Task RefreshAsync()
    {
        await LoadDataAsync();
    }

    private async Task LoadDataAsync()
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                return;
            }

            var (success, message, sessions) = await RelocationApiService.GetSessionsAsync(settings);
            if (!success || sessions == null)
            {
                if (!success)
                    ErrorLogService.LogError($"Failed to load relocation sessions: {message}", null);
                return;
            }

            var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
            Sessions.Clear();
            foreach (var session in sessions)
            {
                var warehouseCode = WarehouseDataService.ResolveToCode(session.WarehouseId, warehouses);
                if (string.IsNullOrWhiteSpace(warehouseCode))
                    warehouseCode = session.WarehouseId ?? string.Empty;
                Sessions.Add(new RelocationSessionDisplayItem
                {
                    Session = session,
                    WarehouseCode = warehouseCode
                });
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading relocation sessions in ViewModel", ex);
        }
    }
}
