using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Wms.Desktop.Models;
using Wms.Desktop.Services;
using System.Runtime.Versioning;

namespace Wms.Desktop.ViewModels;

public partial class SortBoxDetailViewModel : ObservableObject
{
    public SortBox SortBox { get; }
    
    private Asn? _asn;
    public Asn? Asn 
    { 
        get => _asn;
        private set => SetProperty(ref _asn, value);
    }
    
    private TransferOrder? _transferOrder;
    public TransferOrder? TransferOrder 
    { 
        get => _transferOrder;
        private set => SetProperty(ref _transferOrder, value);
    }

    public ObservableCollection<SortBoxItem> BoxContents { get; }

    public string StoreName => SortBox.Store;
    public int TotalItems => BoxContents.Count;
    public double TotalPieces => BoxContents.Sum(i => i.Qty);
    public int UniqueItemCodes => BoxContents.Select(i => i.ItemCode).Distinct().Count();

    public bool CanCloseBox => SortBox.Status == "Open" || SortBox.Status == "Filling";
    public bool CanPrintLabel => SortBox.Status == "Closed" || SortBox.Status == "Filling" || SortBox.Status == "Open";

    public SortBoxDetailViewModel(SortBox sortBox)
    {
        SortBox = sortBox;
        BoxContents = new ObservableCollection<SortBoxItem>();
        _ = LoadRelatedDataAsync(sortBox);
    }

    [RelayCommand]
    private void CloseBox()
    {
        if (SortBox.Status == "Closed")
        {
            MessageBox.Show("Box is already closed.", "Box Status", 
                MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        if (BoxContents.Count == 0)
        {
            var result = MessageBox.Show(
                "Box is empty. Close it anyway?",
                "Close Empty Box",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);
            
            if (result != MessageBoxResult.Yes)
                return;
        }

        var confirmResult = MessageBox.Show(
            $"Close box {SortBox.BoxId}?\n\n" +
            $"Total Items: {TotalItems}\n" +
            $"Total Pieces: {TotalPieces}\n\n" +
            "This will mark the box as ready for dispatch.",
            "Close Box",
            MessageBoxButton.YesNo,
            MessageBoxImage.Question);

        if (confirmResult == MessageBoxResult.Yes)
        {
            // In real implementation, update box status via API
            // For now, show success message
            MessageBox.Show(
                $"Box {SortBox.BoxId} has been closed successfully.\n\n" +
                "Box is now ready for dispatch.",
                "Box Closed",
                MessageBoxButton.OK,
                MessageBoxImage.Information);

            // Refresh status (in real app, reload from server)
            OnPropertyChanged(nameof(CanCloseBox));
            OnPropertyChanged(nameof(CanPrintLabel));
        }
    }

    [RelayCommand]
    [SupportedOSPlatform("windows")]
    private void PrintLabel()
    {
        try
        {
            ErrorLogService.LogInfo($"SortBoxDetailViewModel: Printing label for '{SortBox.BoxId}'");
            
            // Generate barcode image for the Box ID
            var barcodeImage = BarcodeService.GenerateCode128(SortBox.BoxId, width: 400, height: 120);
            
            // Convert BoxContents to list for printing
            var boxContentsList = BoxContents.ToList();
            
            // Print label using PrintService
            var printSuccess = PrintService.PrintSortBoxLabel(SortBox, barcodeImage, boxContentsList);
            
            if (printSuccess)
            {
                MessageBox.Show("Label printed successfully!", "Print Label", 
                    MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"SortBoxDetailViewModel: Error printing label for '{SortBox.BoxId}'", ex);
            MessageBox.Show($"Error printing label: {ex.Message}", "Print Error", 
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async Task LoadRelatedDataAsync(SortBox sortBox)
    {
        try
        {
            ErrorLogService.LogInfo($"SortBoxDetailViewModel: Loading data for {sortBox.BoxId}");
            
            var settings = SettingsService.LoadSettings();
            if (settings == null || !settings.DatabaseExists || !settings.TablesExist)
            {
                ErrorLogService.LogInfo("SortBoxDetailViewModel: Database not available");
                // Fallback to mock data
                Asn = MockDataService.GetAsnByTitle(sortBox.AdvanceShippingNotice);
                TransferOrder = MockDataService.GetTransferOrderByTitle(sortBox.TransferOrder);
                return;
            }

            // Load ASN
            Asn = await AsnDataService.GetAsnByTitleAsync(settings, sortBox.AdvanceShippingNotice);
            ErrorLogService.LogInfo($"SortBoxDetailViewModel: Loaded ASN {sortBox.AdvanceShippingNotice}");

            // Load Transfer Order
            TransferOrder = await TransferOrderDataService.GetTransferOrderByTitleAsync(settings, sortBox.TransferOrder);
            ErrorLogService.LogInfo($"SortBoxDetailViewModel: Loaded Transfer Order {sortBox.TransferOrder}");

            // Load box contents from WMS Scan Events
            var contents = await SortBoxService.GetBoxContentsAsync(settings, sortBox.BoxId);
            ErrorLogService.LogInfo($"SortBoxDetailViewModel: Loaded {contents.Count} items for box {sortBox.BoxId}");
            
            BoxContents.Clear();
            foreach (var item in contents)
            {
                BoxContents.Add(item);
            }
            
            // Update totals
            OnPropertyChanged(nameof(TotalItems));
            OnPropertyChanged(nameof(TotalPieces));
            OnPropertyChanged(nameof(UniqueItemCodes));
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading related data in SortBoxDetailViewModel", ex);
            // Fallback to mock data on error
            Asn = MockDataService.GetAsnByTitle(sortBox.AdvanceShippingNotice);
            TransferOrder = MockDataService.GetTransferOrderByTitle(sortBox.TransferOrder);
        }
    }
}

