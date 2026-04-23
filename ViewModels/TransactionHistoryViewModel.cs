using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Win32;
using Wms.Desktop.Models;
using Wms.Desktop.Services;
using System.IO;
using System.Text;

namespace Wms.Desktop.ViewModels;

public sealed partial class TransactionHistoryViewModel : ObservableObject
{
    public ObservableCollection<TransactionHistoryDisplay> Transactions { get; } = new();

    [ObservableProperty]
    private string _searchItemCode = string.Empty;

    [ObservableProperty]
    private string _searchWarehouse = string.Empty;

    [ObservableProperty]
    private string _searchBinLocation = string.Empty;

    [ObservableProperty]
    private string _searchCartonId = string.Empty;

    [ObservableProperty]
    private string _selectedTransactionType = "All";

    [ObservableProperty]
    private string _selectedStockDirection = "All";

    [ObservableProperty]
    private DateTime? _fromDate;

    [ObservableProperty]
    private DateTime? _toDate;

    [ObservableProperty]
    private bool _isLoading = false;

    [ObservableProperty]
    private int _totalCount = 0;

    public string[] TransactionTypes { get; } = { "All", "Picking", "Putaway", "Dispatch", "CycleCount", "Receiving", "TransferIn", "MaterialRequest" };
    public string[] StockDirections { get; } = { "All", "IN", "OUT", "ADJUSTMENT" };

    public TransactionHistoryViewModel()
    {
        // Set default date range to last 90 days (wider range to catch more data)
        // If no data, user can clear filters or adjust date range
        ToDate = DateTime.Now.Date.AddDays(1); // Include today and tomorrow (timezone safety)
        FromDate = DateTime.Now.Date.AddDays(-90); // Last 90 days
        _ = LoadDataAsync();
    }

    [RelayCommand]
    private async Task SearchAsync()
    {
        await LoadDataAsync();
    }

    [RelayCommand]
    private async Task ClearFiltersAsync()
    {
        SearchItemCode = string.Empty;
        SearchWarehouse = string.Empty;
        SearchBinLocation = string.Empty;
        SearchCartonId = string.Empty;
        SelectedTransactionType = "All";
        SelectedStockDirection = "All";
        // Clear date filters to show all data
        ToDate = null;
        FromDate = null;
        await LoadDataAsync();
    }

    [RelayCommand]
    private async Task RefreshAsync()
    {
        await LoadDataAsync();
    }

    [RelayCommand]
    private async Task LoadAllAsync()
    {
        // Load all data without date filters
        FromDate = null;
        ToDate = null;
        SearchItemCode = string.Empty;
        SearchWarehouse = string.Empty;
        SearchBinLocation = string.Empty;
        SearchCartonId = string.Empty;
        SelectedTransactionType = "All";
        SelectedStockDirection = "All";
        await LoadDataAsync();
    }

    [RelayCommand]
    private async Task ExportToExcelAsync()
    {
        try
        {
            var saveDialog = new SaveFileDialog
            {
                Filter = "CSV Files (*.csv)|*.csv|All Files (*.*)|*.*",
                FileName = $"TransactionHistory_{DateTime.Now:yyyyMMdd_HHmmss}.csv"
            };

            if (saveDialog.ShowDialog() == true)
            {
                var csv = new StringBuilder();
                
                // Header
                csv.AppendLine("Transaction Number,Transaction Date,Transaction Type,Item Code,Item Name,Warehouse,Bin Location,Carton ID,Qty Change,Stock Direction,Qty Before,Qty After,Reference Doc,Performed By,Notes");

                // Data
                foreach (var transaction in Transactions)
                {
                    csv.AppendLine($"{EscapeCsv(transaction.TransactionNumber)}," +
                                 $"{transaction.TransactionDate?.ToString("yyyy-MM-dd HH:mm:ss") ?? ""}," +
                                 $"{EscapeCsv(transaction.TransactionType)}," +
                                 $"{EscapeCsv(transaction.ItemCode)}," +
                                 $"{EscapeCsv(transaction.ItemName ?? "")}," +
                                 $"{EscapeCsv(transaction.Warehouse ?? "")}," +
                                 $"{EscapeCsv(transaction.BinLocation ?? "")}," +
                                 $"{EscapeCsv(transaction.CartonId ?? "")}," +
                                 $"{transaction.QtyChange}," +
                                 $"{EscapeCsv(transaction.StockDirection)}," +
                                 $"{transaction.QtyBefore}," +
                                 $"{transaction.QtyAfter}," +
                                 $"{EscapeCsv(transaction.ReferenceDoc ?? "")}," +
                                 $"{EscapeCsv(transaction.PerformedBy ?? "")}," +
                                 $"{EscapeCsv(transaction.Notes ?? "")}");
                }

                await File.WriteAllTextAsync(saveDialog.FileName, csv.ToString(), Encoding.UTF8);
                
                System.Windows.MessageBox.Show(
                    $"Exported {Transactions.Count} transactions to:\n{saveDialog.FileName}",
                    "Export Successful",
                    System.Windows.MessageBoxButton.OK,
                    System.Windows.MessageBoxImage.Information);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error exporting transaction history", ex);
            System.Windows.MessageBox.Show(
                $"Error exporting: {ex.Message}",
                "Export Error",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Error);
        }
    }

    private string EscapeCsv(string? value)
    {
        if (string.IsNullOrEmpty(value))
            return "";
        
        if (value.Contains(",") || value.Contains("\"") || value.Contains("\n"))
        {
            return $"\"{value.Replace("\"", "\"\"")}\"";
        }
        return value;
    }

    private async Task LoadDataAsync()
    {
        if (IsLoading) return;

        IsLoading = true;
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null || string.IsNullOrEmpty(settings.ApiEndpointUrl))
            {
                Transactions.Clear();
                TotalCount = 0;
                return;
            }

            ErrorLogService.LogInfo($"TransactionHistoryViewModel: Loading data with filters - FromDate: {FromDate?.ToString("yyyy-MM-dd") ?? "null"}, ToDate: {ToDate?.ToString("yyyy-MM-dd") ?? "null"}");
            
            var transactions = await TransactionHistoryService.GetTransactionHistoryAsync(
                settings,
                itemCode: string.IsNullOrWhiteSpace(SearchItemCode) ? null : SearchItemCode,
                warehouse: string.IsNullOrWhiteSpace(SearchWarehouse) ? null : SearchWarehouse,
                binLocation: string.IsNullOrWhiteSpace(SearchBinLocation) ? null : SearchBinLocation,
                cartonId: string.IsNullOrWhiteSpace(SearchCartonId) ? null : SearchCartonId,
                transactionType: SelectedTransactionType == "All" ? null : SelectedTransactionType,
                stockDirection: SelectedStockDirection == "All" ? null : SelectedStockDirection,
                fromDate: FromDate,
                toDate: ToDate,
                limit: 1000 // Optimized limit for better performance (use LoadAll for full export)
            );
            
            ErrorLogService.LogInfo($"TransactionHistoryViewModel: Service returned {transactions?.Count ?? 0} transactions");

            var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);

            // Update UI on UI thread (using Application dispatcher for reliability)
            await Application.Current.Dispatcher.InvokeAsync(() =>
            {
                Transactions.Clear();
                
                if (transactions != null && transactions.Count > 0)
                {
                    ErrorLogService.LogInfo($"TransactionHistoryViewModel: Adding {transactions.Count} transactions to collection on UI thread");
                    
                    foreach (var transaction in transactions)
                    {
                        var warehouseCode = WarehouseDataService.ResolveToCode(
                            transaction.Warehouse ?? transaction.WarehouseName,
                            warehouses);
                        Transactions.Add(new TransactionHistoryDisplay(transaction, warehouseCode));

                        if (Transactions.Count == 1)
                        {
                            ErrorLogService.LogInfo($"TransactionHistoryViewModel: First transaction - ID: {transaction.Id}, TransactionNumber: {transaction.TransactionNumber ?? "NULL"}, TransactionDate: {transaction.TransactionDate?.ToString("yyyy-MM-dd HH:mm:ss") ?? "NULL"}, ItemCode: {transaction.ItemCode ?? "NULL"}, TransactionType: {transaction.TransactionType ?? "NULL"}");
                        }
                    }
                    
                    ErrorLogService.LogInfo($"TransactionHistoryViewModel: Added {Transactions.Count} transactions to ObservableCollection on UI thread");
                }
                else
                {
                    ErrorLogService.LogInfo($"TransactionHistoryViewModel: transactions is null or empty. transactions == null: {transactions == null}, count: {transactions?.Count ?? 0}");
                }

                TotalCount = Transactions.Count;
                
                if (TotalCount == 0)
                {
                    ErrorLogService.LogInfo("TransactionHistoryViewModel: No transactions found. Check API endpoint and filters.");
                }
                else
                {
                    ErrorLogService.LogInfo($"TransactionHistoryViewModel: Loaded {TotalCount} transactions into UI collection");
                }
            }, System.Windows.Threading.DispatcherPriority.Normal);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("TransactionHistoryViewModel: Error loading Transaction History", ex);
            System.Windows.MessageBox.Show(
                $"Error loading transaction history: {ex.Message}\n\nCheck Error Log for details.",
                "Error",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Error);
        }
        finally
        {
            IsLoading = false;
        }
    }
}
