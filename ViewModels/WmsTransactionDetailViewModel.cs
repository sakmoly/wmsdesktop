using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Wms.Desktop.Models;
using Wms.Desktop.Services;
using Wms.Desktop.Windows;

namespace Wms.Desktop.ViewModels;

    public partial class WmsTransactionDetailViewModel : ObservableObject
    {
        [ObservableProperty]
        private WmsTransaction transaction;

        [ObservableProperty]
        private WmsTransactionItemDetail? selectedItem;

        public int TotalLines => Transaction?.Details.Count ?? 0;
        public double TotalQty => Transaction?.Details.Sum(d => d.Qty) ?? 0;

        public WmsTransactionDetailViewModel(WmsTransaction transaction)
        {
            Transaction = transaction;
        }

        partial void OnTransactionChanged(WmsTransaction value)
        {
            OnPropertyChanged(nameof(TotalLines));
            OnPropertyChanged(nameof(TotalQty));
            UpdateCompletionProgress();
        }

        partial void OnSelectedItemChanged(WmsTransactionItemDetail? value)
        {
            // Update completion when item selection changes
            UpdateCompletionProgress();
        }

    [RelayCommand]
    private void SwitchToReceiving() => SetOperation(OperationType.Receiving);

    [RelayCommand]
    private void SwitchToPutaway() => SetOperation(OperationType.Putaway);

    [RelayCommand]
    private void SwitchToPicking() => SetOperation(OperationType.Picking);

    [RelayCommand]
    private void SwitchToCycleCount() => SetOperation(OperationType.CycleCount);

    private void SetOperation(OperationType op)
    {
        Transaction.OperationType = op;

        // Recompute discrepancy for Cycle Count
        if (op == OperationType.CycleCount)
        {
            foreach (var line in Transaction.Details)
            {
                line.ActualQtyCounted ??= line.Qty; // demo
                line.Discrepancy = (line.ActualQtyCounted ?? 0) - line.Qty;
            }
        }

        // Set operation-specific defaults
        if (op == OperationType.Putaway)
        {
            Transaction.PutawayStrategy = "Nearest Empty Bin";
            Transaction.SuggestBins = true;
        }
        if (op == OperationType.Picking)
        {
            Transaction.PickingWave = "WAVE-001";
            Transaction.PickRoute = "ROUTE-A";
        }
        if (op == OperationType.Receiving)
        {
            Transaction.ReceivingDock = "DOCK-01";
            Transaction.RequireQC = true;
        }
        if (op == OperationType.CycleCount)
        {
            Transaction.CycleCountZone = "ZONE-A";
            Transaction.FreezeStockDuringCount = true;
        }

        OnPropertyChanged(nameof(Transaction));
    }

    [RelayCommand]
    private async Task SaveTransaction()
    {
        try
        {
            UpdateCompletionProgress();
            
            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                MessageBox.Show(
                    "Please configure database settings first.",
                    "Settings Required",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
                return;
            }
            
            var success = await WmsTransactionDataService.SaveWmsTransactionAsync(settings, Transaction);
            
            if (success)
            {
                MessageBox.Show(
                    $"Transaction {Transaction.Title} saved successfully.",
                    "Success",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);
            }
            else
            {
                MessageBox.Show(
                    "Failed to save transaction. Please check the error logs.",
                    "Error",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"Error saving transaction {Transaction.Title}", ex);
            MessageBox.Show(
                $"Error saving transaction: {ex.Message}",
                "Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private void AssignSelectedItems()
    {
        if (SelectedItem == null)
        {
            MessageBox.Show(
                "Please select an item from the list first.",
                "No Selection",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            return;
        }

        // Simple input dialog
        var operatorName = InputDialog.Show(
            "Enter operator name:",
            SelectedItem.AssignedOperator,
            Application.Current.MainWindow);

        if (!string.IsNullOrWhiteSpace(operatorName) && SelectedItem != null)
        {
            SelectedItem.AssignedOperator = operatorName;
            if (SelectedItem.AssignmentStatus == "Pending")
            {
                SelectedItem.AssignmentStatus = "Assigned";
            }
            
            UpdateCompletionProgress();
            OnPropertyChanged(nameof(Transaction));
        }
    }

    [RelayCommand]
    private void MarkSelectedDone()
    {
        if (SelectedItem == null)
        {
            MessageBox.Show(
                "Please select an item from the list first.",
                "No Selection",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            return;
        }

        SelectedItem.AssignmentStatus = "Done";
        SelectedItem.ActualCompletionTime = DateTime.Now;
        
        UpdateCompletionProgress();
        OnPropertyChanged(nameof(Transaction));
    }

    private void UpdateCompletionProgress()
    {
        if (Transaction == null || Transaction.Details == null || Transaction.Details.Count == 0)
        {
            if (Transaction != null)
            {
                Transaction.CompletionProgress = 0;
            }
            return;
        }

        var totalItems = Transaction.Details.Count;
        var completedItems = Transaction.Details.Count(d => d.AssignmentStatus == "Done");
        
        Transaction.CompletionProgress = totalItems > 0 
            ? Math.Round((completedItems / (double)totalItems) * 100, 2)
            : 0;

        // Update transaction status based on completion
        if (Transaction.CompletionProgress == 100)
        {
            Transaction.TransactionStatus = "Completed";
            Transaction.Status = "Completed";
        }
        else if (Transaction.CompletionProgress > 0 && Transaction.CompletionProgress < 100)
        {
            Transaction.TransactionStatus = "Partial";
        }
        else if (Transaction.CompletionProgress == 0 && Transaction.TransactionStatus == "Draft")
        {
            Transaction.TransactionStatus = "In Progress";
        }

        OnPropertyChanged(nameof(Transaction));
    }
}


