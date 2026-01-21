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
            }
        }
    }

    public int TotalLines => PutawayTask.Lines?.Count ?? 0;

    public double TotalQty => PutawayTask.Lines?.Sum(l => l.Qty) ?? 0;

    public bool CanComplete => PutawayTask.Status == "In Progress" || PutawayTask.Status == "Pending";

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
                MessageBox.Show(apiResult.Message, "Success", MessageBoxButton.OK, MessageBoxImage.Information);
                
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
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error refreshing Putaway Task", ex);
        }
    }
}

