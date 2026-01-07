using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class UserListViewModel : BaseViewModel
{
    public ObservableCollection<WmsUser> Users { get; } = new();

    public UserListViewModel()
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
                // Database not available - return empty list
                return;
            }

            var users = await UserDataService.GetUsersAsync(settings);
            foreach (var user in users)
            {
                Users.Add(user);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Users in ViewModel", ex);
            // On error, return empty list (users must be imported into database)
        }
    }
}


