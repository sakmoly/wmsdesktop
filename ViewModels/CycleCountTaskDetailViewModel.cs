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

public partial class CycleCountTaskDetailViewModel : ObservableObject
{
    private CycleCountTask _cycleCountTask;
    
    public CycleCountTask CycleCountTask
    {
        get => _cycleCountTask;
        private set => SetProperty(ref _cycleCountTask, value);
    }

    public int TotalLines => CycleCountTask.Lines.Count;
    public int CountedLines => CycleCountTask.Lines.Count(l => l.Status == "Counted");
    public int PendingLines => CycleCountTask.Lines.Count(l => l.Status == "Pending");
    public int LinesWithDiscrepancy => CycleCountTask.Lines.Count(l => l.Discrepancy != 0);
    public double TotalExpectedQty => CycleCountTask.Lines.Where(l => l.ExpectedQty > 0).Sum(l => l.ExpectedQty);
    public double TotalActualQty => CycleCountTask.Lines.Where(l => l.ActualQty.HasValue).Sum(l => l.ActualQty!.Value);
    public double TotalDiscrepancy => CycleCountTask.Lines.Sum(l => l.Discrepancy); // Discrepancy is always a number (defaults to 0, never null)

    public bool CanStart => CycleCountTask.Status == "Draft" || CycleCountTask.Status == "Scheduled";
    public bool CanSubmit => CycleCountTask.Status == "In Progress";
    public bool CanComplete => CycleCountTask.Status == "Review";
    /// <summary>Can push to ERP when task is submitted or completed and has counted lines.</summary>
    public bool CanPushToErp => (CycleCountTask.Status == "Review" || CycleCountTask.Status == "Completed") && CycleCountTask.Lines.Count > 0;

    private bool _isCartonLevelMode;
    public bool IsCartonLevelMode
    {
        get => _isCartonLevelMode;
        set => SetProperty(ref _isCartonLevelMode, value);
    }

    private Dictionary<string, List<(string CartonId, string ItemCode, double ExpectedQty)>> _expectedCartonsCache = new();

    public event EventHandler? TaskUpdated;

    public CycleCountTaskDetailViewModel(CycleCountTask cycleCountTask)
    {
        _cycleCountTask = cycleCountTask;
        
        // Check inventory mode
        var settings = SettingsService.LoadSettings();
        IsCartonLevelMode = settings?.InventoryTrackingMode == "CartonLevel";
    }

    /// <summary>
    /// Get expected cartons for a bin location (for carton-level mode)
    /// </summary>
    public async Task<List<(string CartonId, string ItemCode, double ExpectedQty)>> GetExpectedCartonsForBinAsync(string binLocation)
    {
        if (!IsCartonLevelMode || string.IsNullOrEmpty(binLocation))
        {
            return new List<(string CartonId, string ItemCode, double ExpectedQty)>();
        }

        if (_expectedCartonsCache.TryGetValue(binLocation, out var cached))
        {
            return cached;
        }

        var settings = SettingsService.LoadSettings();
        if (settings == null) return new List<(string CartonId, string ItemCode, double ExpectedQty)>();

        var cartons = await CycleCountTaskDataService.GetExpectedCartonsForBinAsync(
            settings,
            binLocation,
            CycleCountTask.Warehouse);

        _expectedCartonsCache[binLocation] = cartons;
        return cartons;
    }

    /// <summary>
    /// Create cycle count lines from cartons for a bin (for carton-level mode)
    /// </summary>
    public async Task<bool> CreateLinesFromCartonsAsync(string binLocation)
    {
        if (!IsCartonLevelMode || string.IsNullOrEmpty(binLocation))
        {
            return false;
        }

        var settings = SettingsService.LoadSettings();
        if (settings == null) return false;

        var success = await CycleCountTaskDataService.CreateCycleCountLinesFromCartonsAsync(
            settings,
            CycleCountTask.Title,
            binLocation,
            CycleCountTask.Warehouse);

        if (success)
        {
            // Reload task to show new lines
            await RefreshTaskAsync();
        }

        return success;
    }

    [RelayCommand]
    private async Task StartCycleCountAsync()
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                MessageBox.Show("Settings not configured", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            var result = await CycleCountApiService.StartCycleCountAsync(settings, CycleCountTask.Title);
            
            if (result.Success)
            {
                MessageBox.Show(result.Message, "Success", MessageBoxButton.OK, MessageBoxImage.Information);
                
                // Reload task data
                await RefreshTaskAsync();
                
                TaskUpdated?.Invoke(this, EventArgs.Empty);
            }
            else
            {
                MessageBox.Show(result.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error starting Cycle Count Task", ex);
            MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async Task SubmitCycleCountAsync()
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                MessageBox.Show("Settings not configured", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            var result = await CycleCountApiService.SubmitCycleCountAsync(settings, CycleCountTask.Title);
            
            if (result.Success)
            {
                MessageBox.Show(result.Message, "Success", MessageBoxButton.OK, MessageBoxImage.Information);
                
                // Reload task data
                await RefreshTaskAsync();
                
                TaskUpdated?.Invoke(this, EventArgs.Empty);
            }
            else
            {
                MessageBox.Show(result.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error submitting Cycle Count Task", ex);
            MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async Task CompleteCycleCountAsync()
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                MessageBox.Show("Settings not configured", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            var result = await CycleCountApiService.CompleteCycleCountAsync(settings, CycleCountTask.Title);

            if (result.Success)
            {
                MessageBox.Show(result.Message, "Success", MessageBoxButton.OK, MessageBoxImage.Information);

                // Reload task data
                await RefreshTaskAsync();

                TaskUpdated?.Invoke(this, EventArgs.Empty);
            }
            else
            {
                MessageBox.Show(result.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error completing Cycle Count Task", ex);
            MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    public async Task RefreshTaskAsync()
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null)
                return;

            ErrorLogService.LogInfo($"CycleCountTaskDetailViewModel: Refreshing task {CycleCountTask.Title}");
            
            var updatedTask = await CycleCountTaskDataService.GetCycleCountTaskByTitleAsync(settings, CycleCountTask.Title);
            if (updatedTask != null)
            {
                var oldCountedItems = CycleCountTask.CountedItems;
                var oldItemsWithDiscrepancy = CycleCountTask.ItemsWithDiscrepancy;
                var oldLinesCount = CycleCountTask.Lines.Count;
                
                CycleCountTask = updatedTask;
                
                // Notify all properties that depend on CycleCountTask
                OnPropertyChanged(nameof(CycleCountTask));
                OnPropertyChanged(nameof(TotalLines));
                OnPropertyChanged(nameof(CountedLines));
                OnPropertyChanged(nameof(PendingLines));
                OnPropertyChanged(nameof(LinesWithDiscrepancy));
                OnPropertyChanged(nameof(TotalExpectedQty));
                OnPropertyChanged(nameof(TotalActualQty));
                OnPropertyChanged(nameof(TotalDiscrepancy));
                OnPropertyChanged(nameof(CanStart));
                OnPropertyChanged(nameof(CanSubmit));
                OnPropertyChanged(nameof(CanComplete));
                OnPropertyChanged(nameof(CanPushToErp));
                
                // Log for debugging
                ErrorLogService.LogInfo($"CycleCountTaskDetailViewModel: Refreshed task {CycleCountTask.Title} - " +
                    $"CountedItems: {oldCountedItems} → {CycleCountTask.CountedItems}, " +
                    $"ItemsWithDiscrepancy: {oldItemsWithDiscrepancy} → {CycleCountTask.ItemsWithDiscrepancy}, " +
                    $"Lines: {oldLinesCount} → {CycleCountTask.Lines.Count}");
                
                System.Diagnostics.Debug.WriteLine($"Refreshed Cycle Count Task: {CycleCountTask.Title}, Lines: {CycleCountTask.Lines.Count}");
                if (CycleCountTask.Lines.Count > 0)
                {
                    var linesWithCartonId = CycleCountTask.Lines.Count(l => !string.IsNullOrEmpty(l.CartonId));
                    System.Diagnostics.Debug.WriteLine($"Lines with Carton ID: {linesWithCartonId}");
                }
            }
            else
            {
                ErrorLogService.LogInfo($"CycleCountTaskDetailViewModel: Task {CycleCountTask.Title} not found after refresh");
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error refreshing Cycle Count Task", ex);
            System.Diagnostics.Debug.WriteLine($"Error refreshing: {ex.Message}");
        }
    }

    [RelayCommand]
    private async Task RefreshAsync()
    {
        await RefreshTaskAsync();
    }

    [RelayCommand]
    private async Task PushToErpAsync()
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                MessageBox.Show("Settings not configured", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            var (success, error, erpReference) = await ErpNextWmsSyncApiService.PushCycleCountToErpNextAsync(settings, CycleCountTask);

            if (success)
            {
                if (!string.IsNullOrWhiteSpace(erpReference))
                {
                    await CycleCountTaskDataService.UpdateCycleCountTaskErpReferenceAsync(settings, CycleCountTask.Title, erpReference);
                }
                await RefreshTaskAsync();
                TaskUpdated?.Invoke(this, EventArgs.Empty);

                // Apply cycle count to WMS DB first so the snapshot reflects post-cycle-count state (fixes WMS Stock Balance not updating)
                await StockLedgerService.ApplyCycleCountFromTaskAsync(settings, CycleCountTask);

                // Push WMS snapshot so ERPNext WMS Stock Balance / Ledger stay in sync.
                // Limit to this task's transactions only so we don't send last 5000 (avoids multiple ledger entries).
                var (snapshotSuccess, snapshotError, snapshotResponse) = await WmsSnapshotDataService.BuildAndPushSnapshotWithResponseAsync(settings, stockTransactionReferenceDoc: CycleCountTask.Title);

                var msg = string.IsNullOrWhiteSpace(erpReference)
                    ? "Cycle count pushed to ERPNext successfully."
                    : $"Cycle count pushed to ERPNext. Reference: {erpReference}";
                if (snapshotSuccess)
                {
                    msg += "\n\nWMS snapshot pushed to ERPNext.";
                    if (snapshotResponse?.Processed != null)
                        msg += $"\nStock Balance rows: {snapshotResponse.Processed.CartonStock}, Ledger: {snapshotResponse.Processed.Ledger}, Cartons: {snapshotResponse.Processed.Cartons}.";
                    if (snapshotResponse?.Errors != null && snapshotResponse.Errors.Count > 0)
                    {
                        var errors = snapshotResponse.Errors;
                        var fullLog = string.Join("\n---\n", errors.Select(e => e ?? ""));
                        ErrorLogService.LogError($"ERPNext push_wms_snapshot reported {errors.Count} error(s). Full log:\n{fullLog}", null);

                        msg += $"\n\nERPNext reported {errors.Count} error(s) (full log written to app log):";
                        foreach (var err in errors)
                        {
                            var line = (err ?? "").Replace("\n", " ").Replace("\r", " ").Trim();
                            if (line.Length > 0)
                                msg += "\n• " + (line.Length > 250 ? line.Substring(0, 247) + "..." : line);
                        }
                    }
                }
                else
                    msg += $"\n\nWMS snapshot push failed: {snapshotError ?? "Unknown error"} — you can push manually from Settings.";
                MessageBox.Show(msg, "Success", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            else
            {
                MessageBox.Show(error ?? "Push failed.", "Push to ERPNext", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error pushing cycle count to ERPNext", ex);
            MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }
}

