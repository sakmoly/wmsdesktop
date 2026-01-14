using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed class MaterialRequestDetailViewModel : BaseViewModel
{
    public MaterialRequest MaterialRequest { get; }

    public int TotalLines => MaterialRequest.Items.Count;
    public double TotalRequestedQty => MaterialRequest.TotalRequestedQty;
    public double TotalPickedQty => MaterialRequest.TotalPickedQty;

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
        
        // Check inventory mode
        var settings = SettingsService.LoadSettings();
        IsCartonLevelMode = settings?.InventoryTrackingMode == "CartonLevel";
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

