using System;
using System.Collections.ObjectModel;
using System.Threading.Tasks;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class RelocationListViewModel : BaseViewModel
{
    public ObservableCollection<RelocationSession> Sessions { get; } = new();

    public RelocationListViewModel()
    {
        _ = LoadDataAsync();
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
            
            if (success && sessions != null)
            {
                Sessions.Clear();
                foreach (var session in sessions)
                {
                    Sessions.Add(session);
                }
            }
            else
            {
                ErrorLogService.LogError($"Failed to load relocation sessions: {message}", null);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading relocation sessions in ViewModel", ex);
        }
    }
}
