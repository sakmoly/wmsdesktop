using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using System.Windows.Threading;
using System.Windows.Data;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class ItemListViewModel : BaseViewModel
{
    public ObservableCollection<Item> Items { get; } = new();
    public ICollectionView ItemsView { get; private set; }

    public List<string> QtyOperators { get; } = new() { "Any", "=", ">", ">=", "<", "<=", "Between" };

    private string _filterItemCode = string.Empty;
    public string FilterItemCode
    {
        get => _filterItemCode;
        set { _filterItemCode = value; OnPropertyChanged(); DebounceFilter(); }
    }

    private string _filterDescription = string.Empty;
    public string FilterDescription
    {
        get => _filterDescription;
        set { _filterDescription = value; OnPropertyChanged(); DebounceFilter(); }
    }

    private string _selectedQtyOperator = "Any";
    public string SelectedQtyOperator
    {
        get => _selectedQtyOperator;
        set { _selectedQtyOperator = value; OnPropertyChanged(); OnPropertyChanged(nameof(IsQtyToEnabled)); DebounceFilter(); }
    }

    private string _qtyValue1Text = string.Empty;
    public string QtyValue1Text
    {
        get => _qtyValue1Text;
        set { _qtyValue1Text = value; OnPropertyChanged(); DebounceFilter(); }
    }

    private string _qtyValue2Text = string.Empty;
    public string QtyValue2Text
    {
        get => _qtyValue2Text;
        set { _qtyValue2Text = value; OnPropertyChanged(); DebounceFilter(); }
    }

    public bool IsQtyToEnabled => SelectedQtyOperator == "Between";

    public ICommand ClearFiltersCommand { get; }
    public ICommand SyncItemsCommand { get; }
    public ICommand TestSyncCommand { get; }

    private bool _isSyncing;
    public bool IsSyncing
    {
        get => _isSyncing;
        set { _isSyncing = value; OnPropertyChanged(); OnPropertyChanged(nameof(IsNotSyncing)); }
    }

    public bool IsNotSyncing => !_isSyncing;

    private string _syncStatusMessage = string.Empty;
    public string SyncStatusMessage
    {
        get => _syncStatusMessage;
        set { _syncStatusMessage = value; OnPropertyChanged(); }
    }

    private readonly DispatcherTimer _filterTimer;

    public ItemListViewModel()
    {
        ClearFiltersCommand = new RelayCommand(_ => ClearFilters());
        SyncItemsCommand = new RelayCommand(_ => _ = SyncItemsAsync(), _ => IsNotSyncing);
        TestSyncCommand = new RelayCommand(_ => _ = TestSyncAsync(), _ => IsNotSyncing);

        ItemsView = CollectionViewSource.GetDefaultView(Items);
        ItemsView.Filter = FilterPredicate;

        _filterTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(300)
        };
        _filterTimer.Tick += (_, __) =>
        {
            _filterTimer.Stop();
            ItemsView.Refresh();
        };

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
                LoadMockItems();
                return;
            }

            var items = await ItemDataService.GetItemsAsync(settings);
            foreach (var item in items)
            {
                Items.Add(item);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Items in ViewModel", ex);
            // Fallback to mock data on error
            LoadMockItems();
        }
    }

    private void LoadMockItems()
    {
        // Mock items inspired by WMS Item DocType with stock quantities
        Items.Add(new Item
        {
            Code = "SKU-TSHIRT-001-BLK-S",
            Name = "Basic T-Shirt Black S",
            ItemGroup = "Apparel - T-Shirts",
            Brand = "Printechs",
            DefaultUom = "Nos",
            StockUom = "Nos",
            Barcode = "6280000000001",
            MaintainStock = true,
            StockQty = 450,
            ReservedQty = 50
        });

        Items.Add(new Item
        {
            Code = "SKU-TSHIRT-001-BLK-M",
            Name = "Basic T-Shirt Black M",
            ItemGroup = "Apparel - T-Shirts",
            Brand = "Printechs",
            DefaultUom = "Nos",
            StockUom = "Nos",
            Barcode = "6280000000002",
            MaintainStock = true,
            StockQty = 380,
            ReservedQty = 80
        });

        Items.Add(new Item
        {
            Code = "SKU-JEANS-021-BLU-32",
            Name = "Slim Jeans Blue 32",
            ItemGroup = "Apparel - Jeans",
            Brand = "UrbanLine",
            DefaultUom = "Nos",
            StockUom = "Nos",
            Barcode = "6280000000101",
            MaintainStock = true,
            StockQty = 220,
            ReservedQty = 30
        });

        // Use mock data service for fallback
        foreach (var item in MockDataService.GetItems())
        {
            if (Items.All(i => i.Code != item.Code))
            {
                Items.Add(item);
            }
        }
    }

    private void DebounceFilter()
    {
        _filterTimer.Stop();
        _filterTimer.Start();
    }

    private void ClearFilters()
    {
        FilterItemCode = string.Empty;
        FilterDescription = string.Empty;
        SelectedQtyOperator = "Any";
        QtyValue1Text = string.Empty;
        QtyValue2Text = string.Empty;
        ItemsView.Refresh();
    }

    private bool FilterPredicate(object obj)
    {
        if (obj is not Item item) return false;

        // Code filter
        if (!string.IsNullOrWhiteSpace(FilterItemCode))
        {
            if (item.Code == null || item.Code.IndexOf(FilterItemCode.Trim(), StringComparison.OrdinalIgnoreCase) < 0)
                return false;
        }

        // Description/Name filter
        if (!string.IsNullOrWhiteSpace(FilterDescription))
        {
            var name = item.Name ?? string.Empty;
            if (name.IndexOf(FilterDescription.Trim(), StringComparison.OrdinalIgnoreCase) < 0)
                return false;
        }

        // Qty operator filter
        if (SelectedQtyOperator != "Any")
        {
            double qty = item.StockQty;
            if (!TryParseDecimal(QtyValue1Text, out var v1)) return false;

            switch (SelectedQtyOperator)
            {
                case "=":
                    if (qty != v1) return false;
                    break;
                case ">":
                    if (qty <= v1) return false;
                    break;
                case ">=":
                    if (qty < v1) return false;
                    break;
                case "<":
                    if (qty >= v1) return false;
                    break;
                case "<=":
                    if (qty > v1) return false;
                    break;
                case "Between":
                    if (!TryParseDecimal(QtyValue2Text, out var v2)) return false;
                    var min = Math.Min(v1, v2);
                    var max = Math.Max(v1, v2);
                    if (qty < min || qty > max) return false;
                    break;
            }
        }

        return true;
    }

    private bool TryParseDecimal(string s, out double value)
    {
        value = 0;
        if (string.IsNullOrWhiteSpace(s)) return false;
        return double.TryParse(s.Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out value)
            || double.TryParse(s.Trim(), NumberStyles.Any, CultureInfo.CurrentCulture, out value);
    }

    private async Task SyncItemsAsync()
    {
        IsSyncing = true;
        SyncStatusMessage = "Starting sync...";
        
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                SyncStatusMessage = string.Empty;
                System.Windows.MessageBox.Show(
                    "Settings not found. Please configure settings first.",
                    "Sync",
                    System.Windows.MessageBoxButton.OK,
                    System.Windows.MessageBoxImage.Warning);
                return;
            }

            if (!settings.DatabaseExists || !settings.TablesExist)
            {
                SyncStatusMessage = string.Empty;
                System.Windows.MessageBox.Show(
                    "Database not initialized. Please create database and tables first.",
                    "Sync",
                    System.Windows.MessageBoxButton.OK,
                    System.Windows.MessageBoxImage.Warning);
                return;
            }

            // Ask user if they want incremental sync
            var incrementalSync = false;
            if (settings.LastItemSyncTimestamp.HasValue)
            {
                var result = System.Windows.MessageBox.Show(
                    $"Last sync: {settings.LastItemSyncTimestamp.Value:yyyy-MM-dd HH:mm:ss}\n\n" +
                    "Do you want to sync only items modified since last sync?\n\n" +
                    "Yes = Incremental Sync (only changed items)\n" +
                    "No = Full Sync (all items)",
                    "Sync",
                    System.Windows.MessageBoxButton.YesNoCancel,
                    System.Windows.MessageBoxImage.Question);
                
                if (result == System.Windows.MessageBoxResult.Cancel)
                {
                    SyncStatusMessage = string.Empty;
                    return;
                }
                
                incrementalSync = result == System.Windows.MessageBoxResult.Yes;
            }

            SyncStatusMessage = incrementalSync ? "Syncing changed items..." : "Syncing all items...";

            // Perform sync
            var syncResult = await ItemSyncService.SyncItemsFromErpNextAsync(settings, incrementalSync);

            SyncStatusMessage = string.Empty;

            if (syncResult.Success)
            {
                // Build detailed success message
                var message = "✅ Sync completed successfully!\n\n";
                
                if (syncResult.TotalFetched == 0)
                {
                    message += "No items found to sync.\n";
                    message += "(Items may not match the filter criteria)";
                }
                else
                {
                    message += $"📥 Total fetched from ERPNext: {syncResult.TotalFetched}\n\n";
                    
                    if (syncResult.Inserted > 0)
                    {
                        message += $"➕ New items created: {syncResult.Inserted}\n";
                    }
                    
                    if (syncResult.Updated > 0)
                    {
                        message += $"🔄 Existing items updated: {syncResult.Updated}\n";
                    }
                    
                    if (syncResult.Inserted == 0 && syncResult.Updated == 0)
                    {
                        message += "ℹ️ No changes detected (items already up-to-date)";
                    }
                }
                
                if (syncResult.Errors.Count > 0)
                {
                    message += $"\n\n⚠️ Errors encountered: {syncResult.Errors.Count}";
                    if (syncResult.Errors.Count <= 5)
                    {
                        message += "\n\n" + string.Join("\n", syncResult.Errors);
                    }
                    else
                    {
                        message += "\n(Check error log for details)";
                    }
                }

                System.Windows.MessageBox.Show(
                    message,
                    "Sync - Success",
                    System.Windows.MessageBoxButton.OK,
                    System.Windows.MessageBoxImage.Information);

                // Reload items from database
                Items.Clear();
                await LoadDataAsync();
            }
            else
            {
                var errorMessage = "❌ Sync failed:\n\n" + string.Join("\n", syncResult.Errors);
                System.Windows.MessageBox.Show(
                    errorMessage,
                    "Sync - Error",
                    System.Windows.MessageBoxButton.OK,
                    System.Windows.MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            SyncStatusMessage = string.Empty;
            ErrorLogService.LogError("Error syncing items", ex);
            System.Windows.MessageBox.Show(
                $"Error syncing items: {ex.Message}\n\nCheck error log for details.",
                "Sync - Error",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Error);
        }
        finally
        {
            IsSyncing = false;
        }
    }

    private async Task TestSyncAsync()
    {
        IsSyncing = true;
        
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                System.Windows.MessageBox.Show(
                    "Settings not found. Please configure settings first.",
                    "Test Sync",
                    System.Windows.MessageBoxButton.OK,
                    System.Windows.MessageBoxImage.Warning);
                return;
            }

            var testResult = await ItemSyncTestService.TestErpNextConnectionAsync(settings);

            var message = "Test Results:\n\n";
            foreach (var step in testResult.Steps)
            {
                var statusIcon = step.Status switch
                {
                    "Passed" => "✅",
                    "Failed" => "❌",
                    "Warning" => "⚠️",
                    _ => "⏳"
                };
                message += $"{statusIcon} {step.Name}: {step.Status}\n";
                if (!string.IsNullOrWhiteSpace(step.Message))
                {
                    message += $"   {step.Message}\n";
                }
                message += "\n";
            }

            if (testResult.Success)
            {
                message += $"✅ {testResult.Message}";
                System.Windows.MessageBox.Show(
                    message,
                    "Test Sync - Success",
                    System.Windows.MessageBoxButton.OK,
                    System.Windows.MessageBoxImage.Information);
            }
            else
            {
                message += $"❌ Test failed. Check error logs for details.";
                System.Windows.MessageBox.Show(
                    message,
                    "Test Sync - Failed",
                    System.Windows.MessageBoxButton.OK,
                    System.Windows.MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error testing sync", ex);
            System.Windows.MessageBox.Show(
                $"Error testing sync: {ex.Message}\n\nCheck error log for details.",
                "Test Sync - Error",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Error);
        }
        finally
        {
            IsSyncing = false;
        }
    }
}

// Simple RelayCommand implementation
public class RelayCommand : ICommand
{
    private readonly Action<object?> _execute;
    private readonly Func<object?, bool>? _canExecute;

    public RelayCommand(Action<object?> execute, Func<object?, bool>? canExecute = null)
    {
        _execute = execute ?? throw new ArgumentNullException(nameof(execute));
        _canExecute = canExecute;
    }

    public event EventHandler? CanExecuteChanged
    {
        add { CommandManager.RequerySuggested += value; }
        remove { CommandManager.RequerySuggested -= value; }
    }

    public bool CanExecute(object? parameter) => _canExecute?.Invoke(parameter) ?? true;

    public void Execute(object? parameter) => _execute(parameter);
}

