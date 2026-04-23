using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public partial class PutawayTaskDetailViewModel : ObservableObject
{
    private PutawayTask _putawayTask;
    public PutawayTask PutawayTask
    {
        get => _putawayTask;
        set
        {
            if (SetProperty(ref _putawayTask, value))
            {
                OnPropertyChanged(nameof(TotalLines));
                OnPropertyChanged(nameof(TotalQty));
                OnPropertyChanged(nameof(CanComplete));
                OnPropertyChanged(nameof(CanUpdateLocation));
                OnPropertyChanged(nameof(IsTransferInPutaway));
                OnPropertyChanged(nameof(CanEndTransit));
            }
        }
    }

    public int TotalLines => PutawayTask.Lines?.Count ?? 0;

    public double TotalQty => PutawayTask.Lines?.Sum(l => l.Qty) ?? 0;

    public bool CanComplete => PutawayTask.Status == "In Progress" || PutawayTask.Status == "Pending";

    /// <summary>True when this putaway is from a Transfer In (source_type = TransferIn).</summary>
    public bool IsTransferInPutaway => string.Equals(PutawayTask.SourceType, "TransferIn", StringComparison.OrdinalIgnoreCase);

    /// <summary>True when End Transit button can be used: Transfer In putaway, status Completed, and we have the in-transit stock entry (TransferIn).</summary>
    public bool CanEndTransit => IsTransferInPutaway &&
        string.Equals(PutawayTask.Status, "Completed", StringComparison.OrdinalIgnoreCase) &&
        !string.IsNullOrWhiteSpace(PutawayTask.TransferIn);

    private string? _scannedLocationId;
    public string? ScannedLocationId
    {
        get => _scannedLocationId;
        set
        {
            if (SetProperty(ref _scannedLocationId, value))
            {
                OnPropertyChanged(nameof(CanUpdateLocation));
            }
        }
    }

    public bool CanUpdateLocation => !string.IsNullOrWhiteSpace(ScannedLocationId) && 
                                     (PutawayTask.Status == "Draft" || PutawayTask.Status == "Open" || PutawayTask.Status == "In Progress");

    public event EventHandler? TaskUpdated;

    private bool _isCartonLevelMode;
    public bool IsCartonLevelMode
    {
        get => _isCartonLevelMode;
        set
        {
            if (_isCartonLevelMode != value)
            {
                _isCartonLevelMode = value;
                OnPropertyChanged();
            }
        }
    }

    private Dictionary<string, Carton?> _cartonCache = new();
    private Dictionary<string, List<CartonItem>> _cartonItemsCache = new();

    public PutawayTaskDetailViewModel(PutawayTask putawayTask)
    {
        _putawayTask = putawayTask;
        PutawayTask = putawayTask;
        
        // Check inventory mode
        var settings = SettingsService.LoadSettings();
        IsCartonLevelMode = settings?.InventoryTrackingMode == "CartonLevel";
        
        // Load carton details if carton mode
        if (IsCartonLevelMode)
        {
            _ = LoadCartonDetailsAsync();
        }
    }

    private async Task LoadCartonDetailsAsync()
    {
        if (PutawayTask.Lines == null) return;

        var settings = SettingsService.LoadSettings();
        if (settings == null) return;

        var uniqueCartonIds = PutawayTask.Lines
            .Where(l => !string.IsNullOrEmpty(l.CartonId))
            .Select(l => l.CartonId!)
            .Distinct()
            .ToList();

        foreach (var cartonId in uniqueCartonIds)
        {
            try
            {
                var carton = await CartonDataService.GetCartonAsync(settings, cartonId);
                if (carton != null)
                {
                    _cartonCache[cartonId] = carton;
                    
                    var items = await CartonDataService.GetCartonItemsAsync(settings, cartonId);
                    _cartonItemsCache[cartonId] = items;
                }
            }
            catch
            {
                // Ignore errors loading carton details
            }
        }
    }

    public Carton? GetCarton(string? cartonId)
    {
        if (string.IsNullOrEmpty(cartonId)) return null;
        return _cartonCache.TryGetValue(cartonId, out var carton) ? carton : null;
    }

    public List<CartonItem> GetCartonItems(string? cartonId)
    {
        if (string.IsNullOrEmpty(cartonId)) return new List<CartonItem>();
        return _cartonItemsCache.TryGetValue(cartonId, out var items) ? items : new List<CartonItem>();
    }

    public string GetCartonCurrentBin(string? cartonId)
    {
        var carton = GetCarton(cartonId);
        return carton?.CurrentBinId ?? "N/A";
    }

    public string GetCartonStatus(string? cartonId)
    {
        var carton = GetCarton(cartonId);
        return carton?.Status ?? "N/A";
    }

    [RelayCommand]
    private async Task UpdateLocationAsync()
    {
        if (string.IsNullOrWhiteSpace(ScannedLocationId))
        {
            MessageBox.Show("Please scan or enter a Location ID", "Validation Error", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        // Confirm with user before updating
        var result = MessageBox.Show(
            $"Assign Location ID '{ScannedLocationId.Trim()}' to all items in Putaway Task '{PutawayTask.Title}'?\n\nThis will update all putaway lines with this location.",
            "Confirm Update Location",
            MessageBoxButton.YesNo,
            MessageBoxImage.Question);

        if (result != MessageBoxResult.Yes)
        {
            return;
        }

        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                MessageBox.Show("Settings not configured", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            var apiResult = await PutawayApiService.UpdatePutawayLocationAsync(
                settings, 
                PutawayTask.Title, 
                ScannedLocationId.Trim());

            if (apiResult.Success)
            {
                MessageBox.Show($"Location ID '{ScannedLocationId.Trim()}' successfully assigned to all items in this putaway task.", 
                    "Success", MessageBoxButton.OK, MessageBoxImage.Information);
                
                // Clear scanned location ID after successful update
                ScannedLocationId = null;
                
                // Reload task data from database to show updated location
                await RefreshTaskAsync();
                
                TaskUpdated?.Invoke(this, EventArgs.Empty);
            }
            else
            {
                MessageBox.Show(apiResult.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error updating Putaway Task location", ex);
            MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async Task CompletePutawayAsync()
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                MessageBox.Show("Settings not configured", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            // Confirm with user
            var result = MessageBox.Show(
                $"Are you sure you want to complete the Putaway Task '{PutawayTask.Title}'?\n\nThis will:\n- Update the task status to 'Completed'\n- Update stock at the assigned locations\n- This action cannot be undone.",
                "Confirm Complete Putaway Task",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);

            if (result != MessageBoxResult.Yes)
            {
                return;
            }

            var apiResult = await PutawayApiService.CompletePutawayAsync(settings, PutawayTask.Title);
            
            if (apiResult.Success)
            {
                // Apply putaway task to local WMS DB so snapshot includes the new stock (desktop DB is not updated by putaway API).
                // Use warehouse code (e.g. WH-MAIN) so Stock Ledger shows same as cycle count, not warehouse name.
                var warehouseCode = (settings.DefaultReceivingWarehouseForPr ?? settings.DefaultPickingWarehouse ?? "WH-MAIN").Trim();
                var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
                var matched = warehouses.FirstOrDefault(w =>
                    string.Equals(w.Code, warehouseCode, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(w.Name, warehouseCode, StringComparison.OrdinalIgnoreCase));
                var warehouse = !string.IsNullOrEmpty(matched?.Code) ? matched.Code : warehouseCode;
                if (string.IsNullOrEmpty(warehouse))
                    warehouse = "WH-MAIN";

                await StockLedgerService.ApplyPutawayTaskToLocalStockAsync(settings, PutawayTask.Title, warehouse);

                // Push WMS snapshot to ERPNext so WMS Stock Balance updates (now includes the new putaway from local DB)
                var snapshot = await WmsSnapshotDataService.BuildSnapshotAsync(settings);
                var (pushSuccess, pushError, pushResponse) = await ErpNextWmsSyncApiService.PushWmsSnapshotToErpNextWithResponseAsync(settings, snapshot);
                var sentStock = snapshot?.CartonStock?.Count ?? 0;
                var successMessage = apiResult.Message ?? "Putaway completed.";
                if (!pushSuccess && !string.IsNullOrEmpty(pushError))
                {
                    ErrorLogService.LogInfo($"PutawayTaskDetail: Snapshot push after putaway failed: {pushError}");
                    successMessage += $"\n\nSnapshot to ERPNext failed: {pushError}\nCheck Settings: ERPNext API URL + API Key (or Push Endpoint Offline Sync). See TROUBLESHOOT_STOCK_BALANCE_AND_EVENT_LOG.md.";
                }
                else if (pushSuccess)
                {
                    successMessage += $"\n\nSnapshot sent: {sentStock} stock rows. ERPNext processed: {pushResponse?.Processed?.CartonStock ?? 0} stock.";
                    if (sentStock == 0)
                        successMessage += "\n(No stock rows in local DB yet; if balance still not updating, run Push WMS Snapshot again after a moment or check Database.)";
                }

                // End Transit: only for Transfer In putaway when reference (receipt_stock_entry_no) is null. Get stock entry number from response and update putaway.
                if (string.Equals(PutawayTask.SourceType, "TransferIn", StringComparison.OrdinalIgnoreCase) &&
                    !string.IsNullOrWhiteSpace(PutawayTask.TransferIn) &&
                    string.IsNullOrWhiteSpace(PutawayTask.ReceiptStockEntryNo))
                {
                    await DatabaseService.EnsurePutawayTaskReceiptStockEntryNoColumnAsync(settings);
                    var transferIns = await TransferInDataService.GetTransferInsAsync(settings);
                    var ti = transferIns.FirstOrDefault(t => string.Equals(t.Title, PutawayTask.TransferIn, StringComparison.OrdinalIgnoreCase));
                    var defaultToWarehouseName = WarehouseDataService.ResolveToName(settings.DefaultReceivingWarehouseForPr ?? "WH-MAIN", warehouses);
                    defaultToWarehouseName = WarehouseDataService.NormalizeWarehouseNameForErpNext(defaultToWarehouseName);
                    if (string.IsNullOrWhiteSpace(defaultToWarehouseName)) defaultToWarehouseName = "Main Warehouse - MAATC";
                    var toWarehouseName = ti != null ? WarehouseDataService.ResolveToName(ti.ToWarehouse, warehouses) : null;
                    if (string.IsNullOrWhiteSpace(toWarehouseName)) toWarehouseName = defaultToWarehouseName;
                    else toWarehouseName = WarehouseDataService.NormalizeWarehouseNameForErpNext(toWarehouseName);
                    var (etSuccess, etError, receiptStockEntryNo) = await ErpNextWmsSyncApiService.EndTransitCreateReceiptAsync(settings, PutawayTask.TransferIn, toWarehouseName, "Received at warehouse");
                    if (etSuccess)
                    {
                        if (!string.IsNullOrWhiteSpace(receiptStockEntryNo))
                            await PutawayTaskDataService.UpdateReceiptStockEntryNoForTransferInAsync(settings, PutawayTask.TransferIn, receiptStockEntryNo);
                        successMessage += "\n\nEnd Transit: receipt created in ERPNext" + (!string.IsNullOrWhiteSpace(receiptStockEntryNo) ? $" ({receiptStockEntryNo})." : ".");
                    }
                    else
                    {
                        if (!string.IsNullOrEmpty(etError))
                            ErrorLogService.LogError($"PutawayTaskDetail: End Transit for {PutawayTask.TransferIn}: {etError}", null);
                        successMessage += "\n\nEnd Transit to ERPNext failed: " + (etError ?? "Unknown error") + ". You can retry from Settings > Push WMS Snapshot.";
                    }
                }

                MessageBox.Show(successMessage, pushSuccess ? "Success" : "Putaway completed (sync warning)", MessageBoxButton.OK, pushSuccess ? MessageBoxImage.Information : MessageBoxImage.Warning);

                // Reload task data from database
                await RefreshTaskAsync();

                TaskUpdated?.Invoke(this, EventArgs.Empty);
            }
            else
            {
                MessageBox.Show(apiResult.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error completing Putaway Task", ex);
            MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    /// <summary>Manually call end_transit_create_receipt API for this Transfer In putaway (only when status = Completed).</summary>
    [RelayCommand(CanExecute = nameof(CanEndTransit))]
    private async Task EndTransitAsync()
    {
        if (!CanEndTransit)
            return;

        var settings = SettingsService.LoadSettings();
        if (settings == null)
        {
            MessageBox.Show("Settings not configured", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        var inTransitStockEntry = (PutawayTask.TransferIn ?? "").Trim();
        if (string.IsNullOrEmpty(inTransitStockEntry))
        {
            MessageBox.Show("Transfer In (in-transit Stock Entry) is missing for this task.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        try
        {
            await DatabaseService.EnsurePutawayTaskReceiptStockEntryNoColumnAsync(settings);
            var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
            var defaultToWarehouseName = WarehouseDataService.ResolveToName(settings.DefaultReceivingWarehouseForPr ?? "WH-MAIN", warehouses);
            defaultToWarehouseName = WarehouseDataService.NormalizeWarehouseNameForErpNext(defaultToWarehouseName);
            if (string.IsNullOrWhiteSpace(defaultToWarehouseName)) defaultToWarehouseName = "Main Warehouse - MAATC";
            var ti = (await TransferInDataService.GetTransferInsAsync(settings)).FirstOrDefault(t => string.Equals(t.Title, inTransitStockEntry, StringComparison.OrdinalIgnoreCase));
            var toWarehouseName = ti != null ? WarehouseDataService.ResolveToName(ti.ToWarehouse, warehouses) : null;
            if (string.IsNullOrWhiteSpace(toWarehouseName)) toWarehouseName = defaultToWarehouseName;
            else toWarehouseName = WarehouseDataService.NormalizeWarehouseNameForErpNext(toWarehouseName);

            var (etSuccess, etError, receiptStockEntryNo) = await ErpNextWmsSyncApiService.EndTransitCreateReceiptAsync(settings, inTransitStockEntry, toWarehouseName, "Received at warehouse");

            if (etSuccess)
            {
                if (!string.IsNullOrWhiteSpace(receiptStockEntryNo))
                    await PutawayTaskDataService.UpdateReceiptStockEntryNoForTransferInAsync(settings, inTransitStockEntry, receiptStockEntryNo);
                MessageBox.Show("End Transit completed successfully." + (!string.IsNullOrWhiteSpace(receiptStockEntryNo) ? $" Receipt: {receiptStockEntryNo}" : ""), "Success", MessageBoxButton.OK, MessageBoxImage.Information);
                await RefreshTaskAsync();
                TaskUpdated?.Invoke(this, EventArgs.Empty);
            }
            else
            {
                MessageBox.Show("End Transit failed: " + (etError ?? "Unknown error"), "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("End Transit (manual) failed", ex);
            MessageBox.Show("Error: " + ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async Task RefreshTaskAsync()
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null) return;

            // Reload the task from database
            var tasks = await PutawayTaskDataService.GetPutawayTasksAsync(settings);
            var updatedTask = tasks.FirstOrDefault(t => t.Title == PutawayTask.Title);
            
            if (updatedTask != null)
            {
                PutawayTask = updatedTask;
                OnPropertyChanged(nameof(PutawayTask));
                OnPropertyChanged(nameof(TotalLines));
                OnPropertyChanged(nameof(TotalQty));
                OnPropertyChanged(nameof(CanComplete));
                OnPropertyChanged(nameof(CanEndTransit));
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error refreshing Putaway Task", ex);
        }
    }
}

