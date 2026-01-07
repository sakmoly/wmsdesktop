using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class InboundSessionListViewModel : BaseViewModel
{
    public ObservableCollection<InboundSession> Sessions { get; } = new();
    private bool _isLoading = false;
    private readonly object _loadLock = new object();

    public InboundSessionListViewModel()
    {
        // Don't load in constructor - let Loaded event handle it
        // This prevents double loading
    }

    public async Task RefreshAsync()
    {
        await LoadDataAsync();
    }

    private async Task LoadDataAsync()
    {
        // Prevent concurrent loads
        lock (_loadLock)
        {
            if (_isLoading)
            {
                ErrorLogService.LogInfo("InboundSessionListViewModel: Load already in progress, skipping");
                return;
            }
            _isLoading = true;
        }

        try
        {
            // Clear existing data before reloading
            Sessions.Clear();
            ErrorLogService.LogInfo("InboundSessionListViewModel: Starting to load sessions");

            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                ErrorLogService.LogInfo("InboundSessionListViewModel: Settings is null, showing empty list");
                return;
            }

            if (!settings.DatabaseExists || !settings.TablesExist)
            {
                ErrorLogService.LogInfo($"InboundSessionListViewModel: Database not available (Exists={settings.DatabaseExists}, TablesExist={settings.TablesExist}), showing empty list");
                return;
            }

            // Step 1: Try to sync from API (real-time update)
            // If API is not available, we'll keep existing database data
            ErrorLogService.LogInfo("InboundSessionListViewModel: Attempting to sync from API...");
            var syncSuccess = await InboundSessionSyncService.SyncSessionsFromApiAsync(settings);
            if (syncSuccess)
            {
                ErrorLogService.LogInfo("InboundSessionListViewModel: Successfully synced sessions from API");
            }
            else
            {
                ErrorLogService.LogInfo("InboundSessionListViewModel: API sync not available - using existing database data");
            }

            // Step 2: Load sessions from database (includes synced data or existing data)
            ErrorLogService.LogInfo("InboundSessionListViewModel: Loading sessions from database");
            var sessions = await InboundSessionDataService.GetInboundSessionsAsync(settings);
            ErrorLogService.LogInfo($"InboundSessionListViewModel: Received {sessions.Count} sessions from service");
            
            // Prevent duplicates by tracking titles as we add them
            var addedTitles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            
            foreach (var session in sessions)
            {
                if (!addedTitles.Contains(session.Title))
                {
                    Sessions.Add(session);
                    addedTitles.Add(session.Title);
                }
                else
                {
                    ErrorLogService.LogInfo($"InboundSessionListViewModel: Skipping duplicate session: {session.Title}");
                }
            }
            
            ErrorLogService.LogInfo($"InboundSessionListViewModel: Added {Sessions.Count} sessions to collection");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"Error loading Inbound Sessions in ViewModel: {ex.Message}", ex);
            // Clear on error - no mock data fallback
            Sessions.Clear();
        }
        finally
        {
            lock (_loadLock)
            {
                _isLoading = false;
            }
        }
    }
}

