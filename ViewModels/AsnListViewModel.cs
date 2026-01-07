using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class AsnListViewModel : BaseViewModel
{
    public ObservableCollection<Asn> Asns { get; } = new();

    public AsnListViewModel()
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
                foreach (var asn in MockDataService.GetAsns())
                {
                    Asns.Add(asn);
                }
                return;
            }

            var asns = await AsnDataService.GetAsnsAsync(settings);
            foreach (var asn in asns)
            {
                Asns.Add(asn);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading ASNs in ViewModel", ex);
            // Fallback to mock data on error
            foreach (var asn in MockDataService.GetAsns())
            {
                Asns.Add(asn);
            }
        }
    }
}


