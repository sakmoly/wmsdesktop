using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class MaterialRequestDetailViewModel : BaseViewModel
{
    public MaterialRequest MaterialRequest { get; }

    public int TotalLines => MaterialRequest.Items.Count;
    public double TotalRequestedQty => MaterialRequest.TotalRequestedQty;
    public double TotalPickedQty => MaterialRequest.TotalPickedQty;

    private string? _stockEntryNo;
    /// <summary>Stock Entry from Push to ERP (add to transit). Updated after successful push.</summary>
    public string? StockEntryNo
    {
        get => _stockEntryNo ?? MaterialRequest.StockEntryNo;
        set { _stockEntryNo = value; OnPropertyChanged(); OnPropertyChanged(nameof(CanPushToErp)); }
    }

    private bool _isPushingToErp;
    public bool IsPushingToErp { get => _isPushingToErp; set { _isPushingToErp = value; OnPropertyChanged(); OnPropertyChanged(nameof(CanPushToErp)); } }
    /// <summary>Allow Push to ERP only when not already pushed (no Stock Entry) and not currently pushing.</summary>
    public bool CanPushToErp => !IsPushingToErp && string.IsNullOrWhiteSpace(StockEntryNo);

    public ICommand PushToErpCommand { get; }

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

    private Dictionary<string, List<(string CartonId, double AvailableQty)>> _availableCartonsCache = new();

    public MaterialRequestDetailViewModel(MaterialRequest materialRequest)
    {
        MaterialRequest = materialRequest;
        _stockEntryNo = materialRequest.StockEntryNo;
        PushToErpCommand = new RelayCommand(_ => _ = PushToErpAsync(), _ => CanPushToErp);

        // Check inventory mode
        var settings = SettingsService.LoadSettings();
        IsCartonLevelMode = settings?.InventoryTrackingMode == "CartonLevel";
    }

    private async Task PushToErpAsync()
    {
        if (IsPushingToErp) return;
        if (!string.IsNullOrWhiteSpace(StockEntryNo))
        {
            MessageBox.Show($"Already pushed to ERP.\n\nStock Entry: {StockEntryNo}\n\nNo need to send again.", "Push to ERP", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        var settings = SettingsService.LoadSettings();
        if (settings == null)
        {
            MessageBox.Show("Settings not available.", "Push to ERP", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        // Cap qty at requested so we never exceed ERPNext Material Request (avoids "cannot be greater than requested quantity").
        List<ErpNextWmsSyncApiService.AddToTransitItemDto> itemsWithQty = MaterialRequest.Items
            .Where(i => i.PickedQty > 0)
            .Select(i => new ErpNextWmsSyncApiService.AddToTransitItemDto
            {
                ItemCode = i.ItemCode,
                Qty = Math.Min(i.PickedQty, i.RequestedQty)
            })
            .ToList();
        if (itemsWithQty.Count == 0)
        {
            MessageBox.Show("No picked items to push. Pick items first.", "Push to ERP", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        IsPushingToErp = true;
        try
        {
            var company = (settings.Company ?? "").Trim();
            if (string.IsNullOrEmpty(company))
                company = await ErpNextWmsSyncApiService.GetDefaultCompanyFromErpNextAsync(settings) ?? "Mohammed Abdullah Almousa Trading Company";

            // ERPNext expects warehouse document names (e.g. "Main Warehouse - MAATC"), not codes (WH-MAIN). Resolve from synced tabWarehouse.
            var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
            var fromWarehouseName = WarehouseDataService.NormalizeWarehouseNameForErpNext(
                WarehouseDataService.ResolveToName(MaterialRequest.FromWarehouse, warehouses));
            var toShowroomName = WarehouseDataService.NormalizeWarehouseNameForErpNext(
                WarehouseDataService.ResolveToName(MaterialRequest.ToShowroom, warehouses));

            var payload = new ErpNextWmsSyncApiService.CreateMaterialTransferAddToTransitPayloadDto
            {
                Company = company,
                MaterialRequest = MaterialRequest.Title,
                FromWarehouse = fromWarehouseName,
                ToWarehouse = "Goods In Transit - MAATC",
                CustomReceivingWarehouse = toShowroomName,
                Remarks = "Push from WMS Desktop",
                Submit = 1,
                Items = itemsWithQty
            };

            var (success, error, stockEntryNo) = await ErpNextWmsSyncApiService.CreateMaterialTransferAddToTransitAsync(settings, payload);
            if (success && !string.IsNullOrWhiteSpace(stockEntryNo))
            {
                var saved = await MaterialRequestDataService.UpdateMaterialRequestStockEntryNoAsync(settings, MaterialRequest.Title, stockEntryNo);
                if (saved)
                {
                    StockEntryNo = stockEntryNo;
                    MessageBox.Show($"Pushed to ERP successfully.\n\nStock Entry: {stockEntryNo}", "Push to ERP", MessageBoxButton.OK, MessageBoxImage.Information);
                }
                else
                    MessageBox.Show($"Stock Entry {stockEntryNo} created but failed to save to Material Request.", "Push to ERP", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
            else
                MessageBox.Show(error ?? "Failed to create transfer to transit.", "Push to ERP", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        catch (System.Exception ex)
        {
            ErrorLogService.LogError("MaterialRequestDetailViewModel: PushToErp error", ex);
            MessageBox.Show($"Error: {ex.Message}", "Push to ERP", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsPushingToErp = false;
        }
    }

    /// <summary>
    /// Get available cartons for picking an item from a bin
    /// </summary>
    public async Task<List<(string CartonId, double AvailableQty)>> GetAvailableCartonsAsync(
        string itemCode,
        string sourceBin)
    {
        if (!IsCartonLevelMode || string.IsNullOrEmpty(itemCode) || string.IsNullOrEmpty(sourceBin))
        {
            return new List<(string CartonId, double AvailableQty)>();
        }

        var cacheKey = $"{itemCode}|{sourceBin}";
        if (_availableCartonsCache.TryGetValue(cacheKey, out var cached))
        {
            return cached;
        }

        var settings = SettingsService.LoadSettings();
        if (settings == null) return new List<(string CartonId, double AvailableQty)>();

        var cartons = await MaterialRequestDataService.GetAvailableCartonsForPickingAsync(
            settings,
            itemCode,
            sourceBin,
            MaterialRequest.FromWarehouse,
            MaterialRequest.Items.FirstOrDefault(i => i.ItemCode == itemCode)?.RequestedQty ?? 0);

        _availableCartonsCache[cacheKey] = cartons;
        return cartons;
    }

    /// <summary>
    /// Validate carton-level picking
    /// </summary>
    public async Task<(bool IsValid, string? ErrorMessage)> ValidateCartonPickingAsync(
        string cartonId,
        string itemCode,
        string sourceBin,
        double requestedQty)
    {
        if (!IsCartonLevelMode)
        {
            return (true, null);
        }

        var settings = SettingsService.LoadSettings();
        if (settings == null) return (false, "Settings not available");

        return await MaterialRequestDataService.ValidateCartonLevelPickingAsync(
            settings,
            cartonId,
            itemCode,
            sourceBin,
            MaterialRequest.FromWarehouse,
            requestedQty);
    }
}

