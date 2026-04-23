using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class TransferInListViewModel : BaseViewModel
{
    public ObservableCollection<TransferIn> TransferIns { get; } = new();

    private bool _isLoading;
    public bool IsLoading
    {
        get => _isLoading;
        set { _isLoading = value; OnPropertyChanged(); CommandManager.InvalidateRequerySuggested(); }
    }

    public ICommand RefreshCommand { get; }

    public TransferInListViewModel()
    {
        RefreshCommand = new RelayCommand(_ => _ = RefreshFromErpNextAsync(), _ => !IsLoading);
        _ = LoadDataAsync();
    }

    /// <summary>
    /// Loads Transfer In list from DB only (no ERPNext sync). Opening the screen shows current DB contents.
    /// </summary>
    private async Task LoadDataAsync()
    {
        await LoadFromDatabaseAsync(syncFromErpNext: false);
    }

    /// <summary>
    /// Refresh: sync from ERPNext into tabTransferIn/tabTransferInItem, then reload from DB.
    /// </summary>
    private async Task RefreshFromErpNextAsync()
    {
        await LoadFromDatabaseAsync(syncFromErpNext: true);
    }

    /// <summary>
    /// Loads list from DB; optionally runs ERPNext sync first when syncFromErpNext is true.
    /// </summary>
    private async Task LoadFromDatabaseAsync(bool syncFromErpNext)
    {
        if (IsLoading) return;
        IsLoading = true;
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null || !settings.DatabaseExists || !settings.TablesExist)
            {
                return;
            }

            TransferIns.Clear();

            if (syncFromErpNext)
            {
                try
                {
                    var syncResult = await TransferInSyncFromErpNextService.SyncTransferInFromErpNextAsync(settings);
                    if (syncResult.TotalFetched > 0 || syncResult.Errors.Count > 0)
                        ErrorLogService.LogInfo($"Transfer In list: sync from ERPNext — Fetched: {syncResult.TotalFetched}, inserted: {syncResult.EntriesInserted}, updated: {syncResult.EntriesUpdated}, errors: {syncResult.Errors.Count}");
                }
                catch (Exception syncEx)
                {
                    ErrorLogService.LogError("Transfer In list: sync from ERPNext failed; showing existing DB data.", syncEx);
                }
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
        finally
        {
            IsLoading = false;
        }
    }
}

