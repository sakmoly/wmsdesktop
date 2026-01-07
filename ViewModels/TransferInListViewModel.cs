using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class TransferInListViewModel : BaseViewModel
{
    public ObservableCollection<TransferIn> TransferIns { get; } = new();

    public TransferInListViewModel()
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

            var transferIns = await TransferInDataService.GetTransferInsAsync(settings);
            foreach (var transferIn in transferIns)
            {
                TransferIns.Add(transferIn);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Transfer Ins in ViewModel", ex);
        }
    }
}

