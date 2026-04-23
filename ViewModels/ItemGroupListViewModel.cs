using System;
using System.Collections.ObjectModel;
using System.Windows.Input;
using CommunityToolkit.Mvvm.Input;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class ItemGroupListViewModel : BaseViewModel
{
    public ObservableCollection<ItemGroup> ItemGroups { get; } = new();
    public ICommand SyncItemGroupsCommand { get; }
    public ICommand RefreshCommand { get; }

    public ItemGroupListViewModel()
    {
        SyncItemGroupsCommand = new RelayCommand(_ => _ = SyncItemGroupsAsync(), _ => !IsSyncing);
        RefreshCommand = new RelayCommand(_ => _ = LoadDataAsync(), _ => !IsSyncing);
        _ = LoadDataAsync();
    }

    private bool _isSyncing;
    public bool IsSyncing
    {
        get => _isSyncing;
        set { _isSyncing = value; OnPropertyChanged(nameof(IsSyncing)); }
    }

    private async System.Threading.Tasks.Task LoadDataAsync()
    {
        var settings = SettingsService.LoadSettings();
        if (settings == null) return;
        ItemGroups.Clear();
        var list = await ItemGroupDataService.GetItemGroupsAsync(settings);
        foreach (var g in list)
            ItemGroups.Add(g);
    }

    private async System.Threading.Tasks.Task SyncItemGroupsAsync()
    {
        var settings = SettingsService.LoadSettings();
        if (settings == null) return;
        // tabItemGroup is created on first use by ItemGroupSyncService
        IsSyncing = true;
        try
        {
            var result = await ItemGroupSyncService.SyncItemGroupsFromErpNextAsync(settings);
            if (result.Success)
                System.Windows.MessageBox.Show($"Item group sync completed.\n\nFetched: {result.TotalFetched}, Inserted: {result.Inserted}, Updated: {result.Updated}",
                    "Sync Item Groups", System.Windows.MessageBoxButton.OK, System.Windows.MessageBoxImage.Information);
            else
                System.Windows.MessageBox.Show("Item group sync failed:\n\n" + string.Join("\n", result.Errors),
                    "Sync Item Groups", System.Windows.MessageBoxButton.OK, System.Windows.MessageBoxImage.Error);
            await LoadDataAsync();
        }
        finally
        {
            IsSyncing = false;
        }
    }
}


