using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public sealed partial class StockLedgerListViewModel : ObservableObject
{
    public ObservableCollection<StockLedger> StockLedgers { get; } = new();

    [ObservableProperty]
    private int _currentPage = 1;

    [ObservableProperty]
    private int _pageSize = 100;

    [ObservableProperty]
    private int _totalCount = 0;

    [ObservableProperty]
    private int _totalPages = 0;

    [ObservableProperty]
    private string _searchItemCode = string.Empty;

    [ObservableProperty]
    private DateTime? _fromDate;

    [ObservableProperty]
    private DateTime? _toDate;

    [ObservableProperty]
    private bool _isLoading = false;

    public bool CanGoToPreviousPage => CurrentPage > 1 && !IsLoading;
    public bool CanGoToNextPage => CurrentPage < TotalPages && !IsLoading;
    public string PaginationInfo => TotalCount > 0 
        ? $"Page {CurrentPage} of {TotalPages} (Total: {TotalCount:N0} records)"
        : "No records";

    public StockLedgerListViewModel()
    {
        // Set default date range to last 30 days
        ToDate = DateTime.Now.Date;
        FromDate = DateTime.Now.Date.AddDays(-30);
        _ = LoadDataAsync();
    }

    partial void OnCurrentPageChanged(int value)
    {
        OnPropertyChanged(nameof(CanGoToPreviousPage));
        OnPropertyChanged(nameof(CanGoToNextPage));
        _ = LoadDataAsync();
    }

    partial void OnPageSizeChanged(int value)
    {
        CurrentPage = 1; // Reset to first page when page size changes
        _ = LoadDataAsync();
    }

    partial void OnIsLoadingChanged(bool value)
    {
        OnPropertyChanged(nameof(CanGoToPreviousPage));
        OnPropertyChanged(nameof(CanGoToNextPage));
    }

    [RelayCommand]
    private async Task SearchAsync()
    {
        CurrentPage = 1; // Reset to first page on search
        await LoadDataAsync();
    }

    [RelayCommand]
    private async Task ClearFiltersAsync()
    {
        SearchItemCode = string.Empty;
        ToDate = DateTime.Now.Date;
        FromDate = DateTime.Now.Date.AddDays(-30);
        CurrentPage = 1;
        await LoadDataAsync();
    }

    [RelayCommand]
    private async Task GoToFirstPageAsync()
    {
        if (CurrentPage > 1)
        {
            CurrentPage = 1;
        }
    }

    [RelayCommand]
    private async Task GoToPreviousPageAsync()
    {
        if (CurrentPage > 1)
        {
            CurrentPage--;
        }
    }

    [RelayCommand]
    private async Task GoToNextPageAsync()
    {
        if (CurrentPage < TotalPages)
        {
            CurrentPage++;
        }
    }

    [RelayCommand]
    private async Task GoToLastPageAsync()
    {
        if (CurrentPage < TotalPages)
        {
            CurrentPage = TotalPages;
        }
    }

    [RelayCommand]
    private async Task RefreshAsync()
    {
        await LoadDataAsync();
    }

    private async Task LoadDataAsync()
    {
        if (IsLoading) return;

        IsLoading = true;
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null || !settings.DatabaseExists || !settings.TablesExist)
            {
                StockLedgers.Clear();
                TotalCount = 0;
                TotalPages = 0;
                OnPropertyChanged(nameof(PaginationInfo));
                return;
            }

            var result = await StockLedgerService.GetStockLedgerPagedAsync(
                settings,
                CurrentPage,
                PageSize,
                warehouse: null,
                itemCode: string.IsNullOrWhiteSpace(SearchItemCode) ? null : SearchItemCode,
                fromDate: FromDate,
                toDate: ToDate
            );

            StockLedgers.Clear();
            foreach (var stockLedger in result.Data)
            {
                StockLedgers.Add(stockLedger);
            }

            TotalCount = result.TotalCount;
            TotalPages = result.TotalPages;
            OnPropertyChanged(nameof(PaginationInfo));
            OnPropertyChanged(nameof(CanGoToPreviousPage));
            OnPropertyChanged(nameof(CanGoToNextPage));
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Stock Ledger in ViewModel", ex);
        }
        finally
        {
            IsLoading = false;
        }
    }
}
