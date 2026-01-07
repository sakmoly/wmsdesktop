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

public sealed partial class CreateSortBoxViewModel : ObservableObject
{
    [ObservableProperty]
    private string advanceShippingNotice = string.Empty;

    [ObservableProperty]
    private string transferOrder = string.Empty;

    [ObservableProperty]
    private string store = string.Empty;

    [ObservableProperty]
    private Warehouse? selectedWarehouse;

    [ObservableProperty]
    private ObservableCollection<Warehouse> warehouses = new();

    [ObservableProperty]
    private string purpose = "STORE";

    [ObservableProperty]
    private string? remarks;

    [ObservableProperty]
    private string generatedBoxId = string.Empty;

    [ObservableProperty]
    private bool isCreating;

    [ObservableProperty]
    private bool canPrintBarcode;

    private SortBox? createdSortBox;

    public WmsSettings Settings { get; }

    public CreateSortBoxViewModel(WmsSettings settings)
    {
        Settings = settings;
        _ = LoadWarehousesAsync();
    }

    private async Task LoadWarehousesAsync()
    {
        try
        {
            var warehousesList = await WarehouseDataService.GetWarehousesAsync(Settings);
            foreach (var warehouse in warehousesList.OrderBy(w => w.Code))
            {
                Warehouses.Add(warehouse);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading warehouses for Create Sort Box", ex);
            // Fallback to mock data if database fails
            Warehouses.Add(new Warehouse { Code = "WAREHOUSE", Name = "WAREHOUSE", IsStore = false });
            Warehouses.Add(new Warehouse { Code = "SR-01", Name = "Store 01", IsStore = true });
            Warehouses.Add(new Warehouse { Code = "SR-02", Name = "Store 02", IsStore = true });
        }
    }

    partial void OnSelectedWarehouseChanged(Warehouse? value)
    {
        if (value != null)
        {
            Store = value.Code;
        }
        else
        {
            Store = string.Empty;
        }
    }

    [RelayCommand]
    private async Task GenerateBoxIdAsync()
    {
        if (string.IsNullOrWhiteSpace(Store))
        {
            MessageBox.Show("Please enter a Store identifier first.", "Generate Box ID",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        try
        {
            GeneratedBoxId = await SortBoxDataService.GenerateBoxIdAsync(Settings, Store);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error generating Box ID", ex);
            MessageBox.Show($"Error generating Box ID:\n\n{ex.Message}", "Error",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async Task CreateBoxAsync()
    {
        // Validate required fields
        if (string.IsNullOrWhiteSpace(AdvanceShippingNotice))
        {
            MessageBox.Show("Please enter an ASN number.", "Create Sort Box",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (string.IsNullOrWhiteSpace(Store) || SelectedWarehouse == null)
        {
            MessageBox.Show("Please select a Store.", "Create Sort Box",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        // Auto-generate Box ID if not already generated
        if (string.IsNullOrWhiteSpace(GeneratedBoxId))
        {
            try
            {
                GeneratedBoxId = await SortBoxDataService.GenerateBoxIdAsync(Settings, Store);
            }
            catch (Exception ex)
            {
                ErrorLogService.LogError("Error auto-generating Box ID", ex);
                MessageBox.Show($"Error generating Box ID:\n\n{ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }
        }

        try
        {
            IsCreating = true;

            // Get current user (you may want to get this from a user service)
            var currentUser = Environment.UserName; // Or get from settings/user service

            var sortBox = new SortBox
            {
                BoxId = GeneratedBoxId,
                Status = "Open",
                AdvanceShippingNotice = AdvanceShippingNotice.Trim(),
                TransferOrder = TransferOrder?.Trim() ?? string.Empty,
                Store = Store.Trim(),
                Purpose = Purpose.Trim(),
                CreatedBy = currentUser,
                CreatedOn = DateTime.Now,
                Remarks = Remarks?.Trim()
            };

            // Save to database
            var success = await SortBoxDataService.CreateSortBoxAsync(Settings, sortBox);

            if (success)
            {
                ErrorLogService.LogInfo($"Successfully created sort box '{GeneratedBoxId}'");
                
                // Store the created box for printing
                createdSortBox = sortBox;
                CanPrintBarcode = true;

                MessageBox.Show($"Sort Box '{GeneratedBoxId}' created successfully!",
                    "Success", MessageBoxButton.OK, MessageBoxImage.Information);

                // Don't close the dialog - allow user to print barcode
                // CloseDialog?.Invoke(true);
            }
            else
            {
                MessageBox.Show("Failed to create Sort Box. Please check the error log for details.",
                    "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error creating Sort Box", ex);
            MessageBox.Show($"Error creating Sort Box:\n\n{ex.Message}", "Error",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsCreating = false;
        }
    }

    [RelayCommand]
    [SupportedOSPlatform("windows")]
    private void PrintBarcode()
    {
        if (createdSortBox == null || string.IsNullOrWhiteSpace(GeneratedBoxId))
        {
            MessageBox.Show("Please create the box first before printing the barcode.",
                "Print Barcode", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        try
        {
            // Generate barcode
            var barcodeImage = BarcodeService.GenerateCode128(GeneratedBoxId, width: 400, height: 120);
            
            // Print label (box contents will be empty for newly created box)
            var printSuccess = PrintService.PrintSortBoxLabel(createdSortBox, barcodeImage, boxContents: null);
            
            if (printSuccess)
            {
                MessageBox.Show($"Barcode label for '{GeneratedBoxId}' printed successfully!",
                    "Print Barcode", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            else
            {
                MessageBox.Show("Print was cancelled or failed. You can print the label later from the detail view.",
                    "Print Barcode", MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error printing barcode", ex);
            MessageBox.Show($"Error printing barcode:\n\n{ex.Message}", "Error",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private void Cancel()
    {
        CloseDialog?.Invoke(false);
    }

    // Event to signal dialog should close
    public event Action<bool>? CloseDialog;
}

