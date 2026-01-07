using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class PutawayTaskListViewModel : BaseViewModel
{
    public ObservableCollection<PutawayTask> PutawayTasks { get; } = new();
    
    private bool _isLoading = false;
    private readonly object _loadLock = new object();

    public PutawayTaskListViewModel()
    {
        // Don't load in constructor - let Loaded event handle it to prevent double loading
    }

    public async Task RefreshDataAsync()
    {
        // Prevent concurrent loads
        lock (_loadLock)
        {
            if (_isLoading)
            {
                ErrorLogService.LogInfo("PutawayTaskListViewModel: Load already in progress, skipping");
                return;
            }
            _isLoading = true;
        }

        try
        {
            // Clear existing tasks
            PutawayTasks.Clear();
            // Reload from database
            await LoadDataAsync();
        }
        finally
        {
            lock (_loadLock)
            {
                _isLoading = false;
            }
        }
    }

    private async Task LoadDataAsync()
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null || !settings.DatabaseExists || !settings.TablesExist)
            {
                // Fallback to mock data if database not available
                foreach (var task in MockDataService.GetPutawayTasks())
                {
                    PutawayTasks.Add(task);
                }
                return;
            }

            var tasks = await PutawayTaskDataService.GetPutawayTasksAsync(settings);
            
            // Clear collection before adding to prevent duplicates
            PutawayTasks.Clear();
            
            // Deduplicate by title to prevent showing the same task multiple times
            var seenTitles = new HashSet<string>();
            var uniqueCount = 0;
            
            foreach (var task in tasks)
            {
                if (!seenTitles.Contains(task.Title))
                {
                    seenTitles.Add(task.Title);
                    uniqueCount++;
                    PutawayTasks.Add(task);
                }
            }
            
            ErrorLogService.LogInfo($"PutawayTaskListViewModel: Loaded {tasks.Count} putaway tasks from database, {uniqueCount} unique tasks displayed");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Putaway Tasks in ViewModel", ex);
            // Fallback to mock data on error
            PutawayTasks.Clear();
            foreach (var task in MockDataService.GetPutawayTasks())
            {
                PutawayTasks.Add(task);
            }
        }
    }
}

