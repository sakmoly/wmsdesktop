using System;
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
    public double TotalExpectedQty => CycleCountTask.Lines.Sum(l => l.ExpectedQty);
    public double TotalActualQty => CycleCountTask.Lines.Where(l => l.ActualQty.HasValue).Sum(l => l.ActualQty!.Value);
    public double TotalDiscrepancy => CycleCountTask.Lines.Sum(l => l.Discrepancy);

    public bool CanSubmit => CycleCountTask.Status == "In Progress";
    public bool CanComplete => CycleCountTask.Status == "Review";

    public event EventHandler? TaskUpdated;

    public CycleCountTaskDetailViewModel(CycleCountTask cycleCountTask)
    {
        _cycleCountTask = cycleCountTask;
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

    private async Task RefreshTaskAsync()
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null)
                return;

            var updatedTask = await CycleCountTaskDataService.GetCycleCountTaskByTitleAsync(settings, CycleCountTask.Title);
            if (updatedTask != null)
            {
                CycleCountTask = updatedTask;
                OnPropertyChanged(nameof(TotalLines));
                OnPropertyChanged(nameof(CountedLines));
                OnPropertyChanged(nameof(PendingLines));
                OnPropertyChanged(nameof(LinesWithDiscrepancy));
                OnPropertyChanged(nameof(TotalExpectedQty));
                OnPropertyChanged(nameof(TotalActualQty));
                OnPropertyChanged(nameof(TotalDiscrepancy));
                OnPropertyChanged(nameof(CanSubmit));
                OnPropertyChanged(nameof(CanComplete));
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error refreshing Cycle Count Task", ex);
        }
    }
}

