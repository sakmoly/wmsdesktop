using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class MaterialRequestListViewModel : BaseViewModel
{
    public ObservableCollection<MaterialRequest> MaterialRequests { get; } = new();

    public MaterialRequestListViewModel()
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
                return;
            }

            var materialRequests = await MaterialRequestDataService.GetMaterialRequestsAsync(settings);
            foreach (var materialRequest in materialRequests)
            {
                MaterialRequests.Add(materialRequest);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Material Requests in ViewModel", ex);
        }
    }
}

