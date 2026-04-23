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

    public bool CanPrintPackingList => true;

    /// <summary>True when a Stock Entry has been created for this transfer carton (Warehouse Transfer number is set).</summary>
    public bool CanPrintOutSlip => !string.IsNullOrWhiteSpace(_warehouseTransferDisplay);

    public bool CanDispatch => TransferCarton.Status == "Sealed"; // Can dispatch when Sealed

    /// <summary>Refresh PR status from ERPNext. Disabled once a Stock Entry exists — PR is already past that stage and the action confuses users.</summary>
    public bool CanGetPurchaseReceipt =>
        !string.IsNullOrWhiteSpace(TransferCarton.AdvanceShippingNotice)
        && string.IsNullOrWhiteSpace(_warehouseTransferDisplay);

    private bool _purchaseReceiptSubmitted;
    public bool PurchaseReceiptSubmitted
    {
        get => _purchaseReceiptSubmitted;
        private set => SetProperty(ref _purchaseReceiptSubmitted, value);
    }

    private string? _purchaseReceiptDisplay;
    public string? PurchaseReceiptDisplay
    {
        get => _purchaseReceiptDisplay;
        private set => SetProperty(ref _purchaseReceiptDisplay, value);
    }

    private string? _warehouseTransferDisplay;
    public string? WarehouseTransferDisplay
    {
        get => _warehouseTransferDisplay;
        private set
        {
            if (SetProperty(ref _warehouseTransferDisplay, value))
            {
                OnPropertyChanged(nameof(CanPrintOutSlip));
                OnPropertyChanged(nameof(CanGetPurchaseReceipt));
                OnPropertyChanged(nameof(CanGenerateStockEntry));
            }
        }
    }

    public bool CanGenerateStockEntry => CanGetPurchaseReceipt && _purchaseReceiptSubmitted && string.IsNullOrWhiteSpace(_warehouseTransferDisplay);

    public TransferCartonDetailViewModel(TransferCarton transferCarton)
    {
        TransferCarton = transferCarton;
        CartonContents = new ObservableCollection<TransferCartonItem>();
        // Submitted if flag is true or ERPNext docstatus is 1 (Submitted)
        _purchaseReceiptSubmitted = transferCarton.PurchaseReceiptSubmitted == true || transferCarton.PurchaseReceiptDocstatus == 1;
        _purchaseReceiptDisplay = string.IsNullOrWhiteSpace(transferCarton.PurchaseReceiptNo) ? null : $"{transferCarton.PurchaseReceiptNo} ({(_purchaseReceiptSubmitted ? "Submitted" : "Not submitted")})";
        _warehouseTransferDisplay = transferCarton.WarehouseTransferNo;
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
    private async Task PrintOutSlip()
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
    [SupportedOSPlatform("windows")]
    private async Task PrintPackingList()
    {
        try
        {
            var lines = CartonContents.ToList();
            if (lines.Count == 0)
            {
                MessageBox.Show(
                    "There are no lines in Carton Contents yet for this transfer carton.\n\nWait for data to load, or ensure PACK_BOX_TO_TC / PACK_ITEM_TO_TC events exist for this carton.",
                    "Print Packing List",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);
                return;
            }

            var settings = SettingsService.LoadSettings();
            if (settings == null || !settings.DatabaseExists || !settings.TablesExist)
            {
                MessageBox.Show("Database is not available. Configure settings before printing.",
                    "Print Packing List", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            Dictionary<string, Item>? itemsDict = null;
            try
            {
                var items = await ItemDataService.GetItemsAsync(settings);
                itemsDict = items.ToDictionary(i => i.Code, i => i);
            }
            catch (Exception ex)
            {
                ErrorLogService.LogError("TransferCartonDetailViewModel: Could not load items for packing list", ex);
            }

            ErrorLogService.LogInfo($"TransferCartonDetailViewModel: Print carton contents (this carton only) for '{TransferCarton.TcId}'");
            var ok = PrintService.PrintSingleTransferCartonContentsList(TransferCarton, lines, itemsDict);
            if (ok)
            {
                MessageBox.Show("Transfer carton contents sent to printer.", "Print Packing List",
                    MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"TransferCartonDetailViewModel: Print packing list failed for '{TransferCarton.TcId}'", ex);
            MessageBox.Show($"Could not print: {ex.Message}", "Print Packing List",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async Task GetPurchaseReceipt()
    {
        var asnNo = (TransferCarton.AdvanceShippingNotice ?? "").Trim();
        if (string.IsNullOrEmpty(asnNo))
        {
            MessageBox.Show("No ASN linked to this transfer carton.", "Get Purchase Receipt", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        var settings = SettingsService.LoadSettings();
        if (settings == null)
        {
            MessageBox.Show("Settings not available.", "Get Purchase Receipt", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        try
        {
            var (prStatus, prErr) = await ErpNextWmsSyncApiService.GetPrStatusForAsnAsync(settings, asnNo);
            if (prStatus == null)
            {
                var hint = string.IsNullOrWhiteSpace(prErr)
                    ? "Configure ErpNextApiUrl + ErpNextApiKey (same host/key as Postman)."
                    : prErr;
                MessageBox.Show(
                    $"Could not get Purchase Receipt status from ERPNext.\n\n{hint}",
                    "Get Purchase Receipt", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }
            var prNo = (prStatus.PurchaseReceipt ?? "").Trim();
            // ERPNext: docstatus 0=Draft, 1=Submitted, 2=Cancelled. Treat docstatus==1 as submitted if API doesn't set purchase_receipt_submitted
            var submitted = prStatus.PurchaseReceiptSubmitted || prStatus.Docstatus == 1;
            var saved = await TransferCartonDataService.UpdateTransferCartonPrStatusAsync(settings, TransferCarton.TcId,
                prNo, prStatus.Docstatus, prStatus.PurchaseReceiptCreated, submitted);
            if (saved)
            {
                PurchaseReceiptSubmitted = submitted;
                PurchaseReceiptDisplay = string.IsNullOrEmpty(prNo) ? "Not created" : $"{prNo} ({(submitted ? "Submitted" : "Not submitted")})";
                OnPropertyChanged(nameof(CanGenerateStockEntry));
                if (string.IsNullOrEmpty(prNo))
                    MessageBox.Show("Purchase Receipt not created yet for this ASN.", "Get Purchase Receipt", MessageBoxButton.OK, MessageBoxImage.Information);
                else if (!submitted)
                    MessageBox.Show($"Purchase Receipt {prNo} exists but is not submitted.", "Get Purchase Receipt", MessageBoxButton.OK, MessageBoxImage.Warning);
                else
                    MessageBox.Show($"Purchase Receipt {prNo} is submitted.", "Get Purchase Receipt", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            else
                MessageBox.Show("Failed to save PR status to transfer carton.", "Get Purchase Receipt", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("TransferCartonDetailViewModel: GetPurchaseReceipt error", ex);
            MessageBox.Show($"Error: {ex.Message}", "Get Purchase Receipt", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async Task GenerateStockEntry()
    {
        if (!CanGenerateStockEntry)
            return;
        var settings = SettingsService.LoadSettings();
        if (settings == null || !settings.DatabaseExists || !settings.TablesExist)
        {
            MessageBox.Show("Settings or database not available.", "Generate Stock Entry", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        // Prefer default company from ERPNext instance; fall back to Settings
        var company = (await ErpNextWmsSyncApiService.GetDefaultCompanyFromErpNextAsync(settings))?.Trim();
        if (string.IsNullOrEmpty(company))
            company = (settings.Company ?? "").Trim();
        if (string.IsNullOrEmpty(company))
        {
            MessageBox.Show("Company could not be resolved from ERPNext and is not set in Settings.", "Generate Stock Entry", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
        var fromWarehouseCodeOrName = (settings.DefaultReceivingWarehouseForPr ?? settings.DefaultPickingWarehouse ?? "WH-MAIN").Trim();
        var fromWarehouseName = WarehouseDataService.NormalizeWarehouseNameForErpNext(
            WarehouseDataService.ResolveToName(fromWarehouseCodeOrName, warehouses));
        var storeCodeOrName = (TransferCarton.Store ?? "").Trim();
        if (string.IsNullOrEmpty(storeCodeOrName))
        {
            MessageBox.Show("Transfer carton has no Store (custom_receiving_warehouse).", "Generate Stock Entry", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        var customReceivingWarehouseName = WarehouseDataService.NormalizeWarehouseNameForErpNext(
            WarehouseDataService.ResolveToName(storeCodeOrName, warehouses));
        var toWarehouseName = WarehouseDataService.NormalizeWarehouseNameForErpNext(
            (settings.IntransitWarehouseName ?? "Goods In Transit - MAATC").Trim());
        var payload = new ErpNextWmsSyncApiService.CreateStockEntryPayloadDto
        {
            Company = company,
            MaterialRequest = string.IsNullOrWhiteSpace(settings.MaterialRequestForTransferCarton) ? null : settings.MaterialRequestForTransferCarton.Trim(),
            FromWarehouse = fromWarehouseName,
            ToWarehouse = toWarehouseName,
            CustomReceivingWarehouse = customReceivingWarehouseName,
            Remarks = string.IsNullOrWhiteSpace(TransferCarton.Remarks) ? null : TransferCarton.Remarks.Trim(),
            ExternalRef = TransferCarton.TcId,
            Submit = 1,
            Items = await BuildStockEntryItemsAsync(settings)
        };
        if (payload.Items.Count == 0)
        {
            MessageBox.Show("No items in carton contents.", "Generate Stock Entry", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        try
        {
            (bool success, string? error, string? stockEntryNo) = await ErpNextWmsSyncApiService.CreateStockEntryFromTransferCartonAsync(settings, payload);
            if (success && !string.IsNullOrWhiteSpace(stockEntryNo))
            {
                var saved = await TransferCartonDataService.UpdateTransferCartonWarehouseTransferAsync(settings, TransferCarton.TcId, stockEntryNo);
                if (saved)
                {
                    WarehouseTransferDisplay = stockEntryNo;
                    MessageBox.Show($"Stock Entry {stockEntryNo} created and submitted.", "Generate Stock Entry", MessageBoxButton.OK, MessageBoxImage.Information);
                }
                else
                    MessageBox.Show($"Stock Entry created: {stockEntryNo}, but failed to save to transfer carton.", "Generate Stock Entry", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
            else
                MessageBox.Show(error ?? "Failed to create Stock Entry.", "Generate Stock Entry", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("TransferCartonDetailViewModel: GenerateStockEntry error", ex);
            MessageBox.Show($"Error: {ex.Message}", "Generate Stock Entry", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    /// <summary>Build stock entry item DTOs with UOM from item master (default "Nos").</summary>
    private async Task<List<ErpNextWmsSyncApiService.StockEntryItemDto>> BuildStockEntryItemsAsync(WmsSettings settings)
    {
        var itemCodes = CartonContents.Select(i => i.ItemCode).Distinct().ToList();
        var itemsByCode = new Dictionary<string, Item>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var allItems = await ItemDataService.GetItemsAsync(settings);
            foreach (var item in allItems)
                if (!string.IsNullOrEmpty(item.Code) && !itemsByCode.ContainsKey(item.Code))
                    itemsByCode[item.Code] = item;
        }
        catch
        {
            // ignore; we'll use "Nos" for all
        }
        return CartonContents.Select(i => new ErpNextWmsSyncApiService.StockEntryItemDto
        {
            ItemCode = i.ItemCode,
            Qty = (int)Math.Round(i.Qty),
            Uom = itemsByCode.TryGetValue(i.ItemCode, out var item) ? (item.StockUom ?? "Nos") : "Nos",
            SourceCarton = i.SourceCartonId
        }).ToList();
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
            var asnTitle = transferCarton.AdvanceShippingNotice ?? "";
            Asn = await AsnDataService.GetAsnByTitleAsync(settings, asnTitle);
            ErrorLogService.LogInfo($"TransferCartonDetailViewModel: Loaded ASN {asnTitle}");

            // Load Transfer Order
            var toTitle = transferCarton.TransferOrder ?? "";
            TransferOrder = await TransferOrderDataService.GetTransferOrderByTitleAsync(settings, toTitle);
            ErrorLogService.LogInfo($"TransferCartonDetailViewModel: Loaded Transfer Order {toTitle}");

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

            // Refresh PR status from ERPNext so we show "Submitted" if user submitted in ERPNext
            if (!string.IsNullOrWhiteSpace(asnTitle))
            {
                try
                {
                    var (prStatus, prErr) = await ErpNextWmsSyncApiService.GetPrStatusForAsnAsync(settings, asnTitle);
                    if (!string.IsNullOrWhiteSpace(prErr))
                        ErrorLogService.LogInfo($"TransferCartonDetailViewModel: PR status refresh for {asnTitle}: {prErr}");
                    if (prStatus != null)
                    {
                        var prNo = (prStatus.PurchaseReceipt ?? "").Trim();
                        var submitted = prStatus.PurchaseReceiptSubmitted || prStatus.Docstatus == 1;
                        await TransferCartonDataService.UpdateTransferCartonPrStatusAsync(settings, transferCarton.TcId,
                            prNo, prStatus.Docstatus, prStatus.PurchaseReceiptCreated, submitted);
                        PurchaseReceiptSubmitted = submitted;
                        PurchaseReceiptDisplay = string.IsNullOrEmpty(prNo) ? null : $"{prNo} ({(submitted ? "Submitted" : "Not submitted")})";
                        OnPropertyChanged(nameof(CanGenerateStockEntry));
                    }
                }
                catch (Exception prEx)
                {
                    ErrorLogService.LogError($"TransferCartonDetailViewModel: Refresh PR status for {asnTitle}", prEx);
                }
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading related data in TransferCartonDetailViewModel", ex);
        }
    }
}

