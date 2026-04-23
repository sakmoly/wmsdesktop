using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Windows;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public partial class SettingsViewModel : ObservableObject
{
    private WmsSettings _settings = new();
    private WmsSettings _originalSettings = new();
    private string _connectionStatus = "Not tested";
    private bool _isTestingConnection;
    private ImportViewModel? _importViewModel;
    private SyncEndpointConfig? _selectedSyncEndpoint;
    private PushEndpointConfig? _selectedPushEndpoint;
    private bool _isSyncingWarehouses;
    private bool _isSyncingItemGroups;
    private bool _isSyncingAsns;
    private bool _isSyncingTransferOrders;
    private bool _isSyncingMaterialRequests;
    private bool _isSyncingTransferIn;
    private bool _isSyncingAll;
    private bool _isRunningAsnSyncTest;
    private bool _isPushingWmsSnapshot;
    private bool _isRunningPushWmsSnapshotTest;

    public WmsSettings Settings
    {
        get => _settings;
        set
        {
            if (SetProperty(ref _settings, value))
            {
                CheckIfCreateButtonShouldBeEnabled();
            }
        }
    }

    public string ConnectionStatus
    {
        get => _connectionStatus;
        set => SetProperty(ref _connectionStatus, value);
    }

    public bool IsTestingConnection
    {
        get => _isTestingConnection;
        set => SetProperty(ref _isTestingConnection, value);
    }

    public bool CanCreateDatabase => !Settings.DatabaseExists || !Settings.TablesExist || HasSettingsChanged();

    public ImportViewModel ImportViewModel
    {
        get
        {
            if (_importViewModel == null)
            {
                _importViewModel = new ImportViewModel(_settings);
            }
            return _importViewModel;
        }
    }

    public SettingsViewModel()
    {
        // Try to load settings from file, otherwise use defaults
        var loadedSettings = SettingsService.LoadSettings();
        if (loadedSettings != null)
        {
            _settings = loadedSettings;
        }
        else
        {
            // Default settings if file doesn't exist
            _settings = new WmsSettings
            {
                Company = "Printechs Advanced Printing Trading Co.",
                ApiEndpointUrl = "https://erpnext.printechs.example.com/api",
                ApiKey = "******-MOCK-KEY-ONLY-******",
                SyncFrequencyMinutes = 15,
                DefaultPickingWarehouse = "WH-MAIN",
                DefaultReceivingWarehouseForPr = "Main Warehouse - MAATC",
                IntransitWarehouseName = "Goods In Transit - MAATC",
                MaterialRequestForTransferCarton = null,
                SendCartonIdWithCycleCountPush = false,
                LastSyncTimestamp = DateTime.Now.AddMinutes(-30),
                DatabaseType = "MySQL",
                DatabaseHost = "localhost",
                DatabaseName = "wms_desktop",
                DatabaseUserName = "root",
                DatabasePassword = string.Empty,
                DatabasePort = 3306,
                DatabaseExists = false,
                TablesExist = false,
                InventoryTrackingMode = "BinLevel"
            };
        }

        // Subscribe to property changes to detect when database settings change and auto-save
        _settings.PropertyChanged += (sender, e) =>
        {
            if (e.PropertyName != null && 
                (e.PropertyName.StartsWith("Database") || e.PropertyName == "DatabaseType"))
            {
                CheckIfCreateButtonShouldBeEnabled();
            }
            
            // Auto-save settings when any property changes (debounced)
            SaveSettingsDebounced();
        };

        // Store original settings for comparison
        _originalSettings = CloneSettings(_settings);

        // Ensure sync endpoints (and edits in grid) are persisted
        SubscribeSyncEndpointsToSave();
        SubscribePushEndpointsToSave();

        AddSyncEndpointCommand = new RelayCommand(_ => AddSyncEndpoint());
        RemoveSyncEndpointCommand = new RelayCommand(param => RemoveSyncEndpoint(param as SyncEndpointConfig));
        AddPushEndpointCommand = new RelayCommand(_ => AddPushEndpoint());
        RemovePushEndpointCommand = new RelayCommand(param => RemovePushEndpoint(param as PushEndpointConfig));
        OpenActivityLogCommand = new RelayCommand(_ => OpenActivityLog());
        SyncWarehousesCommand = new RelayCommand(_ => _ = SyncWarehousesAsync(), _ => !IsSyncingWarehouses);
        SyncItemGroupsCommand = new RelayCommand(_ => _ = SyncItemGroupsAsync(), _ => !IsSyncingItemGroups);
        SyncAsnsFromErpNextCommand = new RelayCommand(_ => _ = SyncAsnsFromErpNextAsync(), _ => !IsSyncingAsns);
        SyncTransferOrdersFromErpNextCommand = new RelayCommand(_ => _ = SyncTransferOrdersFromErpNextAsync(), _ => !IsSyncingTransferOrders);
        SyncMaterialRequestsFromErpNextCommand = new RelayCommand(_ => _ = SyncMaterialRequestsFromErpNextAsync(), _ => !IsSyncingMaterialRequests);
        SyncTransferInFromErpNextCommand = new RelayCommand(_ => _ = SyncTransferInFromErpNextAsync(), _ => !IsSyncingTransferIn);
        SyncAllCommand = new RelayCommand(_ => _ = SyncAllAsync(), _ => !IsSyncingAll);
        RunAsnSyncTestCommand = new RelayCommand(_ => _ = RunAsnSyncTestAsync(), _ => !IsRunningAsnSyncTest);
        PushWmsSnapshotCommand = new RelayCommand(_ => _ = PushWmsSnapshotAsync(), _ => !IsPushingWmsSnapshot);
        TestPushWmsSnapshotCommand = new RelayCommand(_ => _ = RunTestPushWmsSnapshotAsync(), _ => !IsRunningPushWmsSnapshotTest);

        // Check database status on load (fire and forget)
        _ = CheckDatabaseStatusAsync();
    }

    private void SubscribeSyncEndpointsToSave()
    {
        if (Settings.SyncEndpoints == null) return;
        Settings.SyncEndpoints.CollectionChanged += (_, _) => SaveSettingsDebounced();
        foreach (var ep in Settings.SyncEndpoints)
        {
            ep.PropertyChanged -= OnSyncEndpointPropertyChanged;
            ep.PropertyChanged += OnSyncEndpointPropertyChanged;
        }
    }

    private void OnSyncEndpointPropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
    {
        SaveSettingsDebounced();
    }

    private void SubscribePushEndpointsToSave()
    {
        if (Settings.PushEndpoints == null) return;
        Settings.PushEndpoints.CollectionChanged += (_, _) => SaveSettingsDebounced();
        foreach (var ep in Settings.PushEndpoints)
        {
            ep.PropertyChanged -= OnPushEndpointPropertyChanged;
            ep.PropertyChanged += OnPushEndpointPropertyChanged;
        }
    }

    private void OnPushEndpointPropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
    {
        SaveSettingsDebounced();
    }

    private void AddPushEndpoint()
    {
        var name = "Push " + (Settings.PushEndpoints.Count + 1);
        var ep = new PushEndpointConfig { Name = name, BaseUrl = string.Empty, ApiKey = string.Empty, Enabled = true, EndpointType = PushEndpointTypeNames.Custom, Method = PushEndpointMethodNames.Post };
        ep.PropertyChanged += OnPushEndpointPropertyChanged;
        Settings.PushEndpoints.Add(ep);
        SettingsService.SaveSettings(Settings);
    }

    private void RemovePushEndpoint(PushEndpointConfig? endpoint)
    {
        if (endpoint != null && Settings.PushEndpoints.Contains(endpoint))
        {
            endpoint.PropertyChanged -= OnPushEndpointPropertyChanged;
            Settings.PushEndpoints.Remove(endpoint);
            SettingsService.SaveSettings(Settings);
        }
    }

    public ICommand AddSyncEndpointCommand { get; }
    public ICommand RemoveSyncEndpointCommand { get; }
    public ICommand AddPushEndpointCommand { get; }
    public ICommand RemovePushEndpointCommand { get; }
    public ICommand OpenActivityLogCommand { get; }
    public ICommand SyncWarehousesCommand { get; }
    public ICommand SyncItemGroupsCommand { get; }
    public ICommand SyncAsnsFromErpNextCommand { get; }
    public ICommand SyncTransferOrdersFromErpNextCommand { get; }
    public ICommand SyncMaterialRequestsFromErpNextCommand { get; }
    public ICommand SyncTransferInFromErpNextCommand { get; }
    public ICommand SyncAllCommand { get; }
    public ICommand RunAsnSyncTestCommand { get; }
    public ICommand PushWmsSnapshotCommand { get; }
    public ICommand TestPushWmsSnapshotCommand { get; }

    /// <summary>Options for Sync type column (All, Item, Warehouse, Item Group).</summary>
    public string[] SyncTypeOptions => SyncTypeNames.Options;

    /// <summary>Options for Push endpoint type (ASN Status, TO Status, etc.).</summary>
    public string[] PushEndpointTypeOptions => PushEndpointTypeNames.Options;

    /// <summary>Options for HTTP method (GET, POST).</summary>
    public string[] PushEndpointMethodOptions => PushEndpointMethodNames.Options;

    public PushEndpointConfig? SelectedPushEndpoint
    {
        get => _selectedPushEndpoint;
        set => SetProperty(ref _selectedPushEndpoint, value);
    }

    public bool IsSyncingWarehouses
    {
        get => _isSyncingWarehouses;
        set
        {
            if (SetProperty(ref _isSyncingWarehouses, value))
                OnPropertyChanged(nameof(IsNotSyncingWarehouses));
        }
    }

    public bool IsNotSyncingWarehouses => !IsSyncingWarehouses;

    public bool IsSyncingItemGroups
    {
        get => _isSyncingItemGroups;
        set { if (SetProperty(ref _isSyncingItemGroups, value)) OnPropertyChanged(nameof(IsNotSyncingItemGroups)); }
    }
    public bool IsNotSyncingItemGroups => !IsSyncingItemGroups;

    public bool IsSyncingAsns { get => _isSyncingAsns; set { if (SetProperty(ref _isSyncingAsns, value)) OnPropertyChanged(nameof(IsNotSyncingAsns)); } }
    public bool IsNotSyncingAsns => !IsSyncingAsns;
    public bool IsSyncingTransferOrders { get => _isSyncingTransferOrders; set { if (SetProperty(ref _isSyncingTransferOrders, value)) OnPropertyChanged(nameof(IsNotSyncingTransferOrders)); } }
    public bool IsNotSyncingTransferOrders => !IsSyncingTransferOrders;
    public bool IsSyncingMaterialRequests { get => _isSyncingMaterialRequests; set { if (SetProperty(ref _isSyncingMaterialRequests, value)) OnPropertyChanged(nameof(IsNotSyncingMaterialRequests)); } }
    public bool IsNotSyncingMaterialRequests => !IsSyncingMaterialRequests;
    public bool IsSyncingTransferIn { get => _isSyncingTransferIn; set { if (SetProperty(ref _isSyncingTransferIn, value)) OnPropertyChanged(nameof(IsNotSyncingTransferIn)); } }
    public bool IsNotSyncingTransferIn => !IsSyncingTransferIn;

    public bool IsSyncingAll
    {
        get => _isSyncingAll;
        set
        {
            if (SetProperty(ref _isSyncingAll, value))
                OnPropertyChanged(nameof(IsNotSyncingAll));
        }
    }

    public bool IsNotSyncingAll => !IsSyncingAll;

    public bool IsRunningAsnSyncTest { get => _isRunningAsnSyncTest; set { if (SetProperty(ref _isRunningAsnSyncTest, value)) OnPropertyChanged(nameof(IsNotRunningAsnSyncTest)); } }
    public bool IsNotRunningAsnSyncTest => !IsRunningAsnSyncTest;
    public bool IsPushingWmsSnapshot { get => _isPushingWmsSnapshot; set { if (SetProperty(ref _isPushingWmsSnapshot, value)) OnPropertyChanged(nameof(IsNotPushingWmsSnapshot)); } }
    public bool IsNotPushingWmsSnapshot => !IsPushingWmsSnapshot;
    public bool IsRunningPushWmsSnapshotTest { get => _isRunningPushWmsSnapshotTest; set { if (SetProperty(ref _isRunningPushWmsSnapshotTest, value)) OnPropertyChanged(nameof(IsNotRunningPushWmsSnapshotTest)); } }
    public bool IsNotRunningPushWmsSnapshotTest => !IsRunningPushWmsSnapshotTest;

    public SyncEndpointConfig? SelectedSyncEndpoint
    {
        get => _selectedSyncEndpoint;
        set => SetProperty(ref _selectedSyncEndpoint, value);
    }

    private void AddSyncEndpoint()
    {
        var name = "ERPNext " + (Settings.SyncEndpoints.Count + 1);
        var ep = new SyncEndpointConfig { Name = name, BaseUrl = string.Empty, ApiKey = string.Empty, Enabled = true, SyncType = SyncTypeNames.All };
        ep.PropertyChanged += OnSyncEndpointPropertyChanged;
        Settings.SyncEndpoints.Add(ep);
        SettingsService.SaveSettings(Settings);
    }

    private void RemoveSyncEndpoint(SyncEndpointConfig? endpoint)
    {
        if (endpoint != null && Settings.SyncEndpoints.Contains(endpoint))
        {
            endpoint.PropertyChanged -= OnSyncEndpointPropertyChanged;
            Settings.SyncEndpoints.Remove(endpoint);
            SettingsService.SaveSettings(Settings);
        }
    }

    private void OpenActivityLog()
    {
        var window = new Wms.Desktop.Windows.ActivityLogWindow();
        window.Show();
    }

    private async System.Threading.Tasks.Task SyncWarehousesAsync()
    {
        var settings = SettingsService.LoadSettings();
        if (settings == null)
        {
            MessageBox.Show("Settings not found. Please configure settings first.", "Sync Warehouses",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        if (!settings.DatabaseExists || !settings.TablesExist)
        {
            MessageBox.Show("Database not initialized. Please create database and tables first.", "Sync Warehouses",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        IsSyncingWarehouses = true;
        try
        {
            var result = await WarehouseSyncService.SyncWarehousesFromErpNextAsync(settings);
            if (result.Success)
            {
                var msg = $"Warehouse sync completed.\n\nWarehouses — Fetched: {result.TotalFetched}, Inserted: {result.Inserted}, Updated: {result.Updated}";
                msg += $"\n\nLocations (tabLocation) — Fetched: {result.BinLocationsTotalFetched}, Inserted: {result.BinLocationsInserted}, Updated: {result.BinLocationsUpdated}, Unchanged: {result.BinLocationsUnchanged}, Skipped: {result.BinLocationsSkipped}";
                if (result.Errors.Count > 0)
                {
                    msg += $"\n\nDetails ({result.Errors.Count}):\n" + string.Join("\n", result.Errors);
                }
                MessageBox.Show(msg, "Sync Warehouses", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            else
            {
                MessageBox.Show("Warehouse sync failed:\n\n" + string.Join("\n", result.Errors),
                    "Sync Warehouses", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error syncing warehouses", ex);
            MessageBox.Show($"Error syncing warehouses: {ex.Message}", "Sync Warehouses",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsSyncingWarehouses = false;
        }
    }

    private async System.Threading.Tasks.Task SyncItemGroupsAsync()
    {
        var settings = SettingsService.LoadSettings();
        if (settings == null)
        {
            MessageBox.Show("Settings not found. Please configure settings first.", "Sync Item Groups",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        // tabItemGroup is created on first use by ItemGroupSyncService; no need to require TablesExist
        IsSyncingItemGroups = true;
        try
        {
            var result = await ItemGroupSyncService.SyncItemGroupsFromErpNextAsync(settings);
            if (result.Success)
            {
                var msg = $"Item group sync completed.\n\nFetched: {result.TotalFetched}, Inserted: {result.Inserted}, Updated: {result.Updated}";
                if (result.Errors.Count > 0) msg += $"\n\nErrors: {result.Errors.Count}";
                MessageBox.Show(msg, "Sync Item Groups", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            else
                MessageBox.Show("Item group sync failed:\n\n" + string.Join("\n", result.Errors), "Sync Item Groups", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error syncing item groups", ex);
            MessageBox.Show($"Error syncing item groups: {ex.Message}", "Sync Item Groups", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsSyncingItemGroups = false;
        }
    }

    private async System.Threading.Tasks.Task SyncAsnsFromErpNextAsync()
    {
        var settings = SettingsService.LoadSettings();
        if (settings == null) { MessageBox.Show("Settings not found.", "Sync ASNs", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
        IsSyncingAsns = true;
        try
        {
            var result = await AsnSyncFromErpNextService.SyncAsnsFromErpNextAsync(settings);
            var msg = result.Success
                ? $"ASN sync completed.\n\nFetched: {result.TotalFetched}, ASNs inserted: {result.AsnsInserted}, updated: {result.AsnsUpdated}, items: {result.ItemsInserted}"
                : "ASN sync failed:\n\n" + string.Join("\n", result.Errors);
            if (result.Errors.Count > 0) msg += $"\n\nErrors: {result.Errors.Count}";
            MessageBox.Show(msg, "Sync ASNs (ERPNext)", MessageBoxButton.OK, result.Success ? MessageBoxImage.Information : MessageBoxImage.Error);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error syncing ASNs from ERPNext", ex);
            MessageBox.Show($"Error: {ex.Message}", "Sync ASNs", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally { IsSyncingAsns = false; }
    }

    private async System.Threading.Tasks.Task RunAsnSyncTestAsync()
    {
        var settings = SettingsService.LoadSettings();
        if (settings == null) { MessageBox.Show("Settings not found.", "ASN Sync Test", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
        IsRunningAsnSyncTest = true;
        try
        {
            var testResult = await AsnSyncTestService.RunAsnSyncTestAsync(settings);
            var msg = testResult.Success ? "ASN sync test passed.\n\n" : "ASN sync test failed.\n\n";
            msg += testResult.Message + "\n\n";
            if (testResult.Steps != null && testResult.Steps.Count > 0)
            {
                msg += "Steps:\n";
                foreach (var step in testResult.Steps)
                    msg += $"  • {step.Name}: {step.Status} - {step.Message}\n";
            }
            MessageBox.Show(msg.TrimEnd(), "ASN Sync Test", MessageBoxButton.OK,
                testResult.Success ? MessageBoxImage.Information : MessageBoxImage.Warning);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("ASN sync test error", ex);
            MessageBox.Show($"Error: {ex.Message}", "ASN Sync Test", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally { IsRunningAsnSyncTest = false; }
    }

    private async System.Threading.Tasks.Task PushWmsSnapshotAsync()
    {
        var settings = SettingsService.LoadSettings();
        if (settings == null)
        {
            MessageBox.Show("Settings not found.", "Push WMS Snapshot", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        IsPushingWmsSnapshot = true;
        try
        {
            var snapshot = await WmsSnapshotDataService.BuildSnapshotAsync(settings);
            var sentTxns = snapshot?.StockTransactions?.Count ?? 0;
            var sentCartonStock = snapshot?.CartonStock?.Count ?? 0;
            var sentCartons = snapshot?.Cartons?.Count ?? 0;

            var (success, error, response) = await ErpNextWmsSyncApiService.PushWmsSnapshotToErpNextWithResponseAsync(settings, snapshot!);

            if (!success)
            {
                var msg = "Push failed: " + (error ?? "Unknown error");
                msg += "\n\nCheck: Settings > Push Endpoints (Offline Sync) or ERPNext API URL / API Key; and that ERPNext is reachable.";
                MessageBox.Show(msg, "Push WMS Snapshot", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            var msg2 = "WMS snapshot sent to ERPNext.";
            msg2 += $"\n\nSent: {sentCartonStock} stock rows, {sentTxns} transactions, {sentCartons} cartons.";
            if (response?.Processed != null)
                msg2 += $"\nERPNext processed: {response.Processed.CartonStock} stock, {response.Processed.Ledger} ledger, {response.Processed.Cartons} cartons.";
            if (response?.Errors != null && response.Errors.Count > 0)
                msg2 += "\n\nErrors from ERPNext:\n" + string.Join("\n", response.Errors.Take(5));
            if (sentCartonStock == 0 && sentTxns == 0)
                msg2 += "\n\nNo data was sent (local DB has no carton stock / transactions). Complete a putaway from the Putaway Task screen first, or check your Database connection and tabCartonStock / tabStockTransaction tables.";

            // End transit / create receipt only for Transfer Ins that have completed putaway and not yet end-transited (no receipt_stock_entry_no)
            await DatabaseService.EnsurePutawayTaskReceiptStockEntryNoColumnAsync(settings);
            var transferIns = await TransferInDataService.GetTransferInsAsync(settings);
            var completedPutawayTransferInTitles = await PutawayTaskDataService.GetTransferInTitlesWithCompletedPutawayAsync(settings);
            var completedPutawaySet = new HashSet<string>(completedPutawayTransferInTitles, StringComparer.OrdinalIgnoreCase);
            var toEndTransit = transferIns.Where(ti =>
                (string.Equals(ti.Status, "Submitted", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(ti.Status, "Received", StringComparison.OrdinalIgnoreCase)) &&
                completedPutawaySet.Contains(ti.Title)).ToList();
            if (toEndTransit.Count > 0)
            {
                var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
                var defaultToWarehouseName = WarehouseDataService.ResolveToName(settings.DefaultReceivingWarehouseForPr ?? "WH-MAIN", warehouses);
                defaultToWarehouseName = WarehouseDataService.NormalizeWarehouseNameForErpNext(defaultToWarehouseName);
                if (string.IsNullOrWhiteSpace(defaultToWarehouseName)) defaultToWarehouseName = "Main Warehouse - MAATC";
                int endTransitOk = 0, endTransitFail = 0;
                foreach (var ti in toEndTransit)
                {
                    var toWarehouseName = WarehouseDataService.ResolveToName(ti.ToWarehouse, warehouses);
                    if (string.IsNullOrWhiteSpace(toWarehouseName)) toWarehouseName = defaultToWarehouseName;
                    else toWarehouseName = WarehouseDataService.NormalizeWarehouseNameForErpNext(toWarehouseName);
                    var (etSuccess, etError, receiptStockEntryNo) = await ErpNextWmsSyncApiService.EndTransitCreateReceiptAsync(settings, ti.Title, toWarehouseName, "Received at warehouse");
                    if (etSuccess)
                    {
                        endTransitOk++;
                        if (!string.IsNullOrWhiteSpace(receiptStockEntryNo))
                            await PutawayTaskDataService.UpdateReceiptStockEntryNoForTransferInAsync(settings, ti.Title, receiptStockEntryNo);
                    }
                    else
                        endTransitFail++;
                    if (!etSuccess && !string.IsNullOrEmpty(etError))
                        ErrorLogService.LogError($"End transit create receipt for {ti.Title}: {etError}", null);
                }
                msg2 += $"\n\nEnd transit (receive at warehouse): {toEndTransit.Count} transfer in(s) with completed putaway (not yet ended) — {endTransitOk} succeeded, {endTransitFail} failed.";
            }

            MessageBox.Show(msg2, "Push WMS Snapshot", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show("Error: " + ex.Message, "Push WMS Snapshot", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsPushingWmsSnapshot = false;
        }
    }

    private async System.Threading.Tasks.Task RunTestPushWmsSnapshotAsync()
    {
        var settings = SettingsService.LoadSettings();
        if (settings == null) { MessageBox.Show("Settings not found.", "Test Push WMS Snapshot", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
        IsRunningPushWmsSnapshotTest = true;
        try
        {
            var testResult = await WmsSnapshotTestService.TestPushWmsSnapshotAsync(settings);
            var msg = testResult.Success ? "Push WMS Snapshot test passed.\n\n" : "Push WMS Snapshot test failed or had warnings.\n\n";
            msg += testResult.Message + "\n\n";
            if (testResult.Steps != null && testResult.Steps.Count > 0)
            {
                msg += "Steps:\n";
                foreach (var step in testResult.Steps)
                    msg += $"  • {step.Name}: {step.Status} - {step.Message}\n";
            }
            MessageBox.Show(msg.TrimEnd(), "Test Push WMS Snapshot", MessageBoxButton.OK,
                testResult.Success ? MessageBoxImage.Information : MessageBoxImage.Warning);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Test Push WMS Snapshot error", ex);
            MessageBox.Show("Error: " + ex.Message, "Test Push WMS Snapshot", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally { IsRunningPushWmsSnapshotTest = false; }
    }

    private async System.Threading.Tasks.Task SyncTransferOrdersFromErpNextAsync()
    {
        var settings = SettingsService.LoadSettings();
        if (settings == null) { MessageBox.Show("Settings not found.", "Sync TOs", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
        IsSyncingTransferOrders = true;
        try
        {
            var result = await TransferOrderSyncFromErpNextService.SyncTransferOrdersFromErpNextAsync(settings);
            var msg = result.Success
                ? $"Transfer Order sync completed.\n\nFetched: {result.TotalFetched}, TOs inserted: {result.TosInserted}, updated: {result.TosUpdated}, items: {result.ItemsInserted}"
                : "TO sync failed:\n\n" + string.Join("\n", result.Errors);
            if (result.Errors.Count > 0) msg += $"\n\nErrors: {result.Errors.Count}";
            MessageBox.Show(msg, "Sync TOs (ERPNext)", MessageBoxButton.OK, result.Success ? MessageBoxImage.Information : MessageBoxImage.Error);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error syncing TOs from ERPNext", ex);
            MessageBox.Show($"Error: {ex.Message}", "Sync TOs", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally { IsSyncingTransferOrders = false; }
    }

    private async System.Threading.Tasks.Task SyncMaterialRequestsFromErpNextAsync()
    {
        var settings = SettingsService.LoadSettings();
        if (settings == null) { MessageBox.Show("Settings not found.", "Sync Material Requests", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
        IsSyncingMaterialRequests = true;
        try
        {
            var result = await MaterialRequestSyncFromErpNextService.SyncMaterialRequestsFromErpNextAsync(settings);
            var msg = result.Success
                ? $"Material Request sync completed.\n\nFetched: {result.TotalFetched}, MRs inserted: {result.MrsInserted}, updated: {result.MrsUpdated}, items: {result.ItemsInserted}"
                : "Material Request sync failed:\n\n" + string.Join("\n", result.Errors);
            if (result.Errors.Count > 0) msg += $"\n\nErrors: {result.Errors.Count}";
            MessageBox.Show(msg, "Sync Material Requests (ERPNext)", MessageBoxButton.OK, result.Success ? MessageBoxImage.Information : MessageBoxImage.Error);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error syncing Material Requests from ERPNext", ex);
            MessageBox.Show($"Error: {ex.Message}", "Sync Material Requests", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally { IsSyncingMaterialRequests = false; }
    }

    private async System.Threading.Tasks.Task SyncTransferInFromErpNextAsync()
    {
        var settings = SettingsService.LoadSettings();
        if (settings == null) { MessageBox.Show("Settings not found.", "Sync Transfer In", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
        IsSyncingTransferIn = true;
        try
        {
            var result = await TransferInSyncFromErpNextService.SyncTransferInFromErpNextAsync(settings);
            var msg = result.Success
                ? $"Transfer In sync completed.\n\nFetched: {result.TotalFetched}, entries inserted: {result.EntriesInserted}, updated: {result.EntriesUpdated}, items: {result.ItemsInserted}"
                : "Transfer In sync failed:\n\n" + string.Join("\n", result.Errors);
            if (result.Errors.Count > 0) msg += $"\n\nErrors: {result.Errors.Count}";
            MessageBox.Show(msg, "Sync Transfer In (ERPNext)", MessageBoxButton.OK, result.Success ? MessageBoxImage.Information : MessageBoxImage.Error);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error syncing Transfer In from ERPNext", ex);
            MessageBox.Show($"Error: {ex.Message}", "Sync Transfer In", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally { IsSyncingTransferIn = false; }
    }

    private async System.Threading.Tasks.Task SyncAllAsync()
    {
        var settings = SettingsService.LoadSettings();
        if (settings == null)
        {
            MessageBox.Show("Settings not found. Please configure settings first.", "Sync All",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        if (!settings.DatabaseExists || !settings.TablesExist)
        {
            MessageBox.Show("Database not initialized. Please create database and tables first.", "Sync All",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        IsSyncingAll = true;
        try
        {
            var itemResult = await ItemSyncService.SyncItemsFromErpNextAsync(settings, incrementalSync: false);
            var whResult = await WarehouseSyncService.SyncWarehousesFromErpNextAsync(settings);
            var igResult = await ItemGroupSyncService.SyncItemGroupsFromErpNextAsync(settings);
            var msg = "Sync all completed.\n\n";
            msg += $"Items: Fetched {itemResult.TotalFetched}, Inserted {itemResult.Inserted}, Updated {itemResult.Updated}";
            if (!itemResult.Success) msg += " (with errors)";
            msg += "\n\n";
            msg += $"Warehouses: Fetched {whResult.TotalFetched}, Inserted {whResult.Inserted}, Updated {whResult.Updated}";
            if (!whResult.Success) msg += " (with errors)";
            msg += $"\ntabLocation: Fetched {whResult.BinLocationsTotalFetched}, Inserted {whResult.BinLocationsInserted}, Updated {whResult.BinLocationsUpdated}, Unchanged {whResult.BinLocationsUnchanged}, Skipped {whResult.BinLocationsSkipped}";
            msg += "\n\n";
            msg += $"Item groups: Fetched {igResult.TotalFetched}, Inserted {igResult.Inserted}, Updated {igResult.Updated}";
            if (!igResult.Success) msg += " (with errors)";
            var allOk = itemResult.Success && whResult.Success && igResult.Success;
            MessageBox.Show(msg, "Sync All", MessageBoxButton.OK, allOk ? MessageBoxImage.Information : MessageBoxImage.Warning);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error during sync all", ex);
            MessageBox.Show($"Error: {ex.Message}", "Sync All", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsSyncingAll = false;
        }
    }

    private System.Threading.Timer? _saveTimer;

    private void SaveSettingsDebounced()
    {
        // Debounce saves to avoid excessive file writes
        _saveTimer?.Dispose();
        _saveTimer = new System.Threading.Timer(_ =>
        {
            try
            {
                SettingsService.SaveSettings(_settings);
            }
            catch (Exception ex)
            {
                ErrorLogService.LogError("Failed to auto-save settings", ex);
            }
        }, null, 1000, System.Threading.Timeout.Infinite); // Wait 1 second before saving
    }

    [RelayCommand]
    private void SaveSettings()
    {
        try
        {
            SettingsService.SaveSettings(_settings);
            _originalSettings = CloneSettings(_settings);
            MessageBox.Show("Settings saved successfully!", "Settings", 
                MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to save settings", ex);
            MessageBox.Show($"Failed to save settings: {ex.Message}", "Settings", 
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async System.Threading.Tasks.Task TestConnectionAsync()
    {
        IsTestingConnection = true;
        ConnectionStatus = "Testing...";

        try
        {
            var success = await DatabaseService.TestConnectionAsync(Settings);
            
            if (success)
            {
                ConnectionStatus = "Connection successful";
                MessageBox.Show("Database connection test successful!", "Connection Test", 
                    MessageBoxButton.OK, MessageBoxImage.Information);
                
                // Check database and tables status
                await CheckDatabaseStatusAsync();
            }
            else
            {
                ConnectionStatus = "Connection failed";
                MessageBox.Show("Database connection test failed. Please check your settings.", 
                    "Connection Test", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ConnectionStatus = "Error: " + ex.Message;
            MessageBox.Show($"Connection test error: {ex.Message}", "Connection Test", 
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsTestingConnection = false;
        }
    }

    [RelayCommand]
    private async System.Threading.Tasks.Task CreateDatabaseAndTablesAsync()
    {
        if (!CanCreateDatabase)
        {
            MessageBox.Show("Database and tables already exist. No changes needed.", 
                "Database Status", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var result = MessageBox.Show(
            "This will create the database and all required tables. Continue?",
            "Create Database and Tables",
            MessageBoxButton.YesNo,
            MessageBoxImage.Question);

        if (result != MessageBoxResult.Yes)
            return;

        try
        {
            IsTestingConnection = true;
            ConnectionStatus = "Creating database and tables...";

            var (success, errorMessage) = await DatabaseService.CreateDatabaseAndTablesAsync(Settings);

            if (success)
            {
                ConnectionStatus = "Database and tables created successfully";
                MessageBox.Show("Database and tables created successfully!", 
                    "Database Creation", MessageBoxButton.OK, MessageBoxImage.Information);
                
                // Update status
                Settings.DatabaseExists = true;
                Settings.TablesExist = true;
                _originalSettings = CloneSettings(_settings);
                await CheckDatabaseStatusAsync();
            }
            else
            {
                ConnectionStatus = "Failed to create database/tables";
                var errorMsg = string.IsNullOrWhiteSpace(errorMessage) 
                    ? "Failed to create database and tables. Please check your settings and try again." 
                    : $"Failed to create database and tables:\n\n{errorMessage}";
                MessageBox.Show(errorMsg, 
                    "Database Creation", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ConnectionStatus = "Error: " + ex.Message;
            MessageBox.Show($"Error creating database: {ex.Message}", 
                "Database Creation", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsTestingConnection = false;
        }
    }

    private async System.Threading.Tasks.Task CheckDatabaseStatusAsync()
    {
        await DatabaseService.CheckDatabaseStatusAsync(Settings);
        OnPropertyChanged(nameof(CanCreateDatabase));
    }

    private bool HasSettingsChanged()
    {
        return _settings.DatabaseHost != _originalSettings.DatabaseHost ||
               _settings.DatabaseName != _originalSettings.DatabaseName ||
               _settings.DatabaseUserName != _originalSettings.DatabaseUserName ||
               _settings.DatabasePassword != _originalSettings.DatabasePassword ||
               _settings.DatabasePort != _originalSettings.DatabasePort ||
               _settings.DatabaseType != _originalSettings.DatabaseType;
    }

    private void CheckIfCreateButtonShouldBeEnabled()
    {
        OnPropertyChanged(nameof(CanCreateDatabase));
    }

    private static WmsSettings CloneSettings(WmsSettings source)
    {
        return new WmsSettings
        {
            Company = source.Company,
            ApiEndpointUrl = source.ApiEndpointUrl,
            ErpNextApiUrl = source.ErpNextApiUrl,
            ApiKey = source.ApiKey,
            ErpNextApiKey = source.ErpNextApiKey,
            SyncFrequencyMinutes = source.SyncFrequencyMinutes,
            DefaultPickingWarehouse = source.DefaultPickingWarehouse,
            DefaultReceivingWarehouseForPr = source.DefaultReceivingWarehouseForPr,
            IntransitWarehouseName = source.IntransitWarehouseName,
            MaterialRequestForTransferCarton = source.MaterialRequestForTransferCarton,
            SendCartonIdWithCycleCountPush = source.SendCartonIdWithCycleCountPush,
            LastSyncTimestamp = source.LastSyncTimestamp,
            LastItemSyncTimestamp = source.LastItemSyncTimestamp,
            DatabaseType = source.DatabaseType,
            DatabaseHost = source.DatabaseHost,
            DatabaseName = source.DatabaseName,
            DatabaseUserName = source.DatabaseUserName,
            DatabasePassword = source.DatabasePassword,
            DatabasePort = source.DatabasePort,
            DatabaseExists = source.DatabaseExists,
            TablesExist = source.TablesExist,
            InventoryTrackingMode = source.InventoryTrackingMode,
            ItemSyncFilters = source.ItemSyncFilters,
            ItemSyncAttributeFilters = source.ItemSyncAttributeFilters,
            ItemSyncFields = source.ItemSyncFields,
            ItemSyncFlattenAttributes = source.ItemSyncFlattenAttributes,
            SyncEndpoints = source.SyncEndpoints != null ? new ObservableCollection<SyncEndpointConfig>(source.SyncEndpoints.Select(e => new SyncEndpointConfig { Name = e.Name, BaseUrl = e.BaseUrl, ApiKey = e.ApiKey, Enabled = e.Enabled, SyncType = e.SyncType ?? SyncTypeNames.All })) : new ObservableCollection<SyncEndpointConfig>(),
            PushEndpoints = source.PushEndpoints != null ? new ObservableCollection<PushEndpointConfig>(source.PushEndpoints.Select(p => new PushEndpointConfig { Name = p.Name, EndpointType = p.EndpointType, BaseUrl = p.BaseUrl, Method = p.Method, ApiKey = p.ApiKey, Enabled = p.Enabled })) : new ObservableCollection<PushEndpointConfig>(),
            ItemSyncPushUrl = source.ItemSyncPushUrl ?? string.Empty
        };
    }

}


