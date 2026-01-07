using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class CycleCountTaskListViewModel : BaseViewModel
{
    public ObservableCollection<CycleCountTask> CycleCountTasks { get; } = new();

    public CycleCountTaskListViewModel()
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

            var tasks = await CycleCountTaskDataService.GetCycleCountTasksAsync(settings);
            foreach (var task in tasks)
            {
                CycleCountTasks.Add(task);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Cycle Count Tasks in ViewModel", ex);
        }
    }
}

