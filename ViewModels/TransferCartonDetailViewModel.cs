using System;
using System.Collections.Generic;
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

public partial class TransferCartonDetailViewModel : ObservableObject
{
    public TransferCarton TransferCarton { get; }
    
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

    public ObservableCollection<TransferCartonItem> CartonContents { get; }

    public string StoreName => TransferCarton.Store;
    public int TotalItems => CartonContents.Count;
    public double TotalPieces => CartonContents.Sum(i => i.Qty);
    public int UniqueItemCodes => CartonContents.Select(i => i.ItemCode).Distinct().Count();

    public bool CanPrintLabel => true; // Can always print label
    public bool CanDispatch => TransferCarton.Status == "Sealed"; // Can dispatch when Sealed

    public TransferCartonDetailViewModel(TransferCarton transferCarton)
    {
        TransferCarton = transferCarton;
        CartonContents = new ObservableCollection<TransferCartonItem>();
        _ = LoadRelatedDataAsync(transferCarton);
    }

    [RelayCommand]
    [SupportedOSPlatform("windows")]
    private void PrintLabel()
    {
        try
        {
            ErrorLogService.LogInfo($"TransferCartonDetailViewModel: Printing label for '{TransferCarton.TcId}'");
            
            // Generate barcode image for the Carton ID
            var barcodeImage = BarcodeService.GenerateCode128(TransferCarton.TcId, width: 400, height: 120);
            
            // Convert CartonContents to list for printing
            var cartonContentsList = CartonContents.ToList();
            
            // Print label using PrintService
            var printSuccess = PrintService.PrintTransferCartonLabel(TransferCarton, barcodeImage, cartonContentsList);
            
            if (printSuccess)
            {
                MessageBox.Show("Label printed successfully!", "Print Label", 
                    MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"TransferCartonDetailViewModel: Error printing label for '{TransferCarton.TcId}'", ex);
            MessageBox.Show($"Error printing label: {ex.Message}", "Print Error", 
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    [SupportedOSPlatform("windows")]
    private async void PrintOutSlip()
    {
        try
        {
            ErrorLogService.LogInfo($"TransferCartonDetailViewModel: Printing out slip for '{TransferCarton.TcId}'");
            
            // Convert CartonContents to list for printing
            var cartonContentsList = CartonContents.ToList();
            
            // Load items dictionary for descriptions
            Dictionary<string, Item>? itemsDict = null;
            try
            {
                var settings = SettingsService.LoadSettings();
                if (settings != null && settings.DatabaseExists && settings.TablesExist)
                {
                    var items = await ItemDataService.GetItemsAsync(settings);
                    itemsDict = items.ToDictionary(i => i.Code, i => i);
                }
            }
            catch (Exception ex)
            {
                ErrorLogService.LogError("TransferCartonDetailViewModel: Error loading items for out slip", ex);
                // Continue without items - will show item codes only
            }
            
            // Print out slip using PrintService
            var printSuccess = PrintService.PrintTransferCartonOutSlip(TransferCarton, cartonContentsList, itemsDict);
            
            if (printSuccess)
            {
                MessageBox.Show("Out slip printed successfully!", "Print Out Slip", 
                    MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"TransferCartonDetailViewModel: Error printing out slip for '{TransferCarton.TcId}'", ex);
            MessageBox.Show($"Error printing out slip: {ex.Message}", "Print Error", 
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async Task DispatchTransferCarton()
    {
        if (TransferCarton.Status != "Sealed")
        {
            MessageBox.Show($"Transfer carton must be Sealed before dispatch. Current status: {TransferCarton.Status}",
                "Dispatch Error", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var confirmResult = MessageBox.Show(
            $"Dispatch transfer carton {TransferCarton.TcId}?\n\n" +
            $"Items: {TotalItems}\n" +
            $"Total Pieces: {TotalPieces}\n\n" +
            "This will mark the carton as Dispatched and reduce stock.\n" +
            "Stock will be reduced from the source locations.",
            "Dispatch Transfer Carton",
            MessageBoxButton.YesNo,
            MessageBoxImage.Question);

        if (confirmResult != MessageBoxResult.Yes)
        {
            return;
        }

        try
        {
            ErrorLogService.LogInfo($"TransferCartonDetailViewModel: Dispatching transfer carton '{TransferCarton.TcId}'");

            var settings = SettingsService.LoadSettings();
            if (settings == null || !settings.DatabaseExists || !settings.TablesExist)
            {
                MessageBox.Show("Database not available. Please check your settings.",
                    "Dispatch Error", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            // Get current user (you may want to get this from a user service)
            var currentUser = Environment.UserName;

            // Dispatch the transfer carton
            var (success, message) = await TransferCartonDataService.DispatchTransferCartonAsync(
                settings, TransferCarton.TcId, currentUser);

            if (success)
            {
                MessageBox.Show($"Transfer carton {TransferCarton.TcId} has been dispatched successfully.\n\n" +
                    "Note: Stock reduction for Material Request transfer cartons should be handled by the API endpoint.",
                    "Dispatch Success",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);

                // Note: TransferCarton is immutable, so we can't update its status here
                // The status will be updated when the window is closed and reopened
                // For now, just update the CanDispatch property to reflect the new state
                OnPropertyChanged(nameof(CanDispatch));
                
                ErrorLogService.LogInfo($"TransferCartonDetailViewModel: Transfer carton {TransferCarton.TcId} dispatched successfully");
            }
            else
            {
                MessageBox.Show($"Failed to dispatch transfer carton:\n\n{message}",
                    "Dispatch Error",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"TransferCartonDetailViewModel: Error dispatching transfer carton '{TransferCarton.TcId}'", ex);
            MessageBox.Show($"Error dispatching transfer carton:\n\n{ex.Message}",
                "Dispatch Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }

    private async Task LoadRelatedDataAsync(TransferCarton transferCarton)
    {
        try
        {
            ErrorLogService.LogInfo($"TransferCartonDetailViewModel: Loading data for {transferCarton.TcId}");
            
            var settings = SettingsService.LoadSettings();
            if (settings == null || !settings.DatabaseExists || !settings.TablesExist)
            {
                ErrorLogService.LogInfo("TransferCartonDetailViewModel: Database not available");
                return;
            }

            // Load ASN
            Asn = await AsnDataService.GetAsnByTitleAsync(settings, transferCarton.AdvanceShippingNotice);
            ErrorLogService.LogInfo($"TransferCartonDetailViewModel: Loaded ASN {transferCarton.AdvanceShippingNotice}");

            // Load Transfer Order
            TransferOrder = await TransferOrderDataService.GetTransferOrderByTitleAsync(settings, transferCarton.TransferOrder);
            ErrorLogService.LogInfo($"TransferCartonDetailViewModel: Loaded Transfer Order {transferCarton.TransferOrder}");

            // Load carton contents from WMS Scan Events
            var contents = await TransferCartonService.GetCartonContentsAsync(settings, transferCarton.TcId);
            ErrorLogService.LogInfo($"TransferCartonDetailViewModel: Loaded {contents.Count} items for transfer carton {transferCarton.TcId}");
            
            CartonContents.Clear();
            foreach (var item in contents)
            {
                CartonContents.Add(item);
            }
            
            // Update totals
            OnPropertyChanged(nameof(TotalItems));
            OnPropertyChanged(nameof(TotalPieces));
            OnPropertyChanged(nameof(UniqueItemCodes));
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading related data in TransferCartonDetailViewModel", ex);
        }
    }
}

