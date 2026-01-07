using System;
using System.IO;
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Win32;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public partial class ImportViewModel : ObservableObject
{
    private readonly WmsSettings _settings;
    private string _asnImportStatus = "Ready to import";
    private string _transferOrderImportStatus = "Ready to import";
    private string _materialRequestImportStatus = "Ready to import";
    private string _transferInImportStatus = "Ready to import";
    private bool _isImportingAsn;
    private bool _isImportingTransferOrder;
    private bool _isImportingMaterialRequest;
    private bool _isImportingTransferIn;

    public string AsnImportStatus
    {
        get => _asnImportStatus;
        set => SetProperty(ref _asnImportStatus, value);
    }

    public string TransferOrderImportStatus
    {
        get => _transferOrderImportStatus;
        set => SetProperty(ref _transferOrderImportStatus, value);
    }

    public bool IsImportingAsn
    {
        get => _isImportingAsn;
        set => SetProperty(ref _isImportingAsn, value);
    }

    public bool IsImportingTransferOrder
    {
        get => _isImportingTransferOrder;
        set => SetProperty(ref _isImportingTransferOrder, value);
    }

    public string MaterialRequestImportStatus
    {
        get => _materialRequestImportStatus;
        set => SetProperty(ref _materialRequestImportStatus, value);
    }

    public bool IsImportingMaterialRequest
    {
        get => _isImportingMaterialRequest;
        set => SetProperty(ref _isImportingMaterialRequest, value);
    }

    public string TransferInImportStatus
    {
        get => _transferInImportStatus;
        set => SetProperty(ref _transferInImportStatus, value);
    }

    public bool IsImportingTransferIn
    {
        get => _isImportingTransferIn;
        set => SetProperty(ref _isImportingTransferIn, value);
    }

    public ImportViewModel(WmsSettings settings)
    {
        _settings = settings;
    }

    [RelayCommand]
    private void DownloadAsnTemplate()
    {
        try
        {
            var dialog = new SaveFileDialog
            {
                Filter = "Excel Files|*.xlsx",
                FileName = "ASN_Import_Template.xlsx",
                Title = "Save ASN Import Template"
            };

            if (dialog.ShowDialog() == true)
            {
                var filePath = ExcelImportService.GenerateAsnTemplate(dialog.FileName);
                MessageBox.Show($"ASN template saved to:\n{filePath}", "Template Generated",
                    MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to generate ASN template", ex);
            MessageBox.Show($"Failed to generate ASN template: {ex.Message}", "Error",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async System.Threading.Tasks.Task ImportAsnAsync()
    {
        if (!_settings.DatabaseExists || !_settings.TablesExist)
        {
            MessageBox.Show("Please create the database and tables first before importing data.",
                "Import ASN", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var dialog = new OpenFileDialog
        {
            Filter = "Excel Files|*.xlsx;*.xls",
            Title = "Select ASN Excel File to Import"
        };

        if (dialog.ShowDialog() != true)
            return;

        if (!File.Exists(dialog.FileName))
        {
            MessageBox.Show("Selected file does not exist.", "Import ASN",
                MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        try
        {
            IsImportingAsn = true;
            AsnImportStatus = "Importing...";

            var (success, message, importedCount) = await ExcelImportService.ImportAsnFromExcelAsync(
                dialog.FileName, _settings);

            AsnImportStatus = success
                ? $"Successfully imported {importedCount} ASN(s)"
                : "Import failed";

            MessageBox.Show(message, "Import ASN",
                MessageBoxButton.OK,
                success ? MessageBoxImage.Information : MessageBoxImage.Error);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to import ASN", ex);
            AsnImportStatus = "Import failed";
            MessageBox.Show($"Failed to import ASN: {ex.Message}", "Import ASN",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsImportingAsn = false;
        }
    }

    [RelayCommand]
    private void DownloadTransferOrderTemplate()
    {
        try
        {
            var dialog = new SaveFileDialog
            {
                Filter = "Excel Files|*.xlsx",
                FileName = "TransferOrder_Import_Template.xlsx",
                Title = "Save Transfer Order Import Template"
            };

            if (dialog.ShowDialog() == true)
            {
                var filePath = ExcelImportService.GenerateTransferOrderTemplate(dialog.FileName);
                MessageBox.Show($"Transfer Order template saved to:\n{filePath}", "Template Generated",
                    MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to generate Transfer Order template", ex);
            MessageBox.Show($"Failed to generate Transfer Order template: {ex.Message}", "Error",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async System.Threading.Tasks.Task ImportTransferOrderAsync()
    {
        if (!_settings.DatabaseExists || !_settings.TablesExist)
        {
            MessageBox.Show("Please create the database and tables first before importing data.",
                "Import Transfer Order", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var dialog = new OpenFileDialog
        {
            Filter = "Excel Files|*.xlsx;*.xls",
            Title = "Select Transfer Order Excel File to Import"
        };

        if (dialog.ShowDialog() != true)
            return;

        if (!File.Exists(dialog.FileName))
        {
            MessageBox.Show("Selected file does not exist.", "Import Transfer Order",
                MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        try
        {
            IsImportingTransferOrder = true;
            TransferOrderImportStatus = "Importing...";

            var (success, message, importedCount) = await ExcelImportService.ImportTransferOrderFromExcelAsync(
                dialog.FileName, _settings);

            TransferOrderImportStatus = success
                ? $"Successfully imported {importedCount} Transfer Order(s)"
                : "Import failed";

            MessageBox.Show(message, "Import Transfer Order",
                MessageBoxButton.OK,
                success ? MessageBoxImage.Information : MessageBoxImage.Error);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to import Transfer Order", ex);
            TransferOrderImportStatus = "Import failed";
            MessageBox.Show($"Failed to import Transfer Order: {ex.Message}", "Import Transfer Order",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsImportingTransferOrder = false;
        }
    }

    [RelayCommand]
    private void DownloadMaterialRequestTemplate()
    {
        try
        {
            var dialog = new SaveFileDialog
            {
                Filter = "Excel Files|*.xlsx",
                FileName = "MaterialRequest_Import_Template.xlsx",
                Title = "Save Material Request Import Template"
            };

            if (dialog.ShowDialog() == true)
            {
                var filePath = ExcelImportService.GenerateMaterialRequestTemplate(dialog.FileName);
                MessageBox.Show($"Material Request template saved to:\n{filePath}", "Template Generated",
                    MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to generate Material Request template", ex);
            MessageBox.Show($"Failed to generate Material Request template: {ex.Message}", "Error",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async System.Threading.Tasks.Task ImportMaterialRequestAsync()
    {
        if (!_settings.DatabaseExists || !_settings.TablesExist)
        {
            MessageBox.Show("Please create the database and tables first before importing data.",
                "Import Material Request", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var dialog = new OpenFileDialog
        {
            Filter = "Excel Files|*.xlsx;*.xls",
            Title = "Select Material Request Excel File to Import"
        };

        if (dialog.ShowDialog() != true)
            return;

        if (!File.Exists(dialog.FileName))
        {
            MessageBox.Show("Selected file does not exist.", "Import Material Request",
                MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        try
        {
            IsImportingMaterialRequest = true;
            MaterialRequestImportStatus = "Importing...";

            var (success, message, importedCount) = await ExcelImportService.ImportMaterialRequestFromExcelAsync(
                dialog.FileName, _settings);

            MaterialRequestImportStatus = success
                ? $"Successfully imported {importedCount} Material Request(s)"
                : "Import failed";

            MessageBox.Show(message, "Import Material Request",
                MessageBoxButton.OK,
                success ? MessageBoxImage.Information : MessageBoxImage.Error);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to import Material Request", ex);
            MaterialRequestImportStatus = "Import failed";
            MessageBox.Show($"Failed to import Material Request: {ex.Message}", "Import Material Request",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsImportingMaterialRequest = false;
        }
    }

    [RelayCommand]
    private void DownloadTransferInTemplate()
    {
        try
        {
            var dialog = new SaveFileDialog
            {
                Filter = "Excel Files|*.xlsx",
                FileName = "TransferIn_Import_Template.xlsx",
                Title = "Save Transfer In Import Template"
            };

            if (dialog.ShowDialog() == true)
            {
                var filePath = ExcelImportService.GenerateTransferInTemplate(dialog.FileName);
                MessageBox.Show($"Transfer In template saved to:\n{filePath}", "Template Generated",
                    MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to generate Transfer In template", ex);
            MessageBox.Show($"Failed to generate Transfer In template: {ex.Message}", "Error",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async System.Threading.Tasks.Task ImportTransferInAsync()
    {
        if (!_settings.DatabaseExists || !_settings.TablesExist)
        {
            MessageBox.Show("Please create the database and tables first before importing data.",
                "Import Transfer In", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var dialog = new OpenFileDialog
        {
            Filter = "Excel Files|*.xlsx;*.xls",
            Title = "Select Transfer In Excel File to Import"
        };

        if (dialog.ShowDialog() != true)
            return;

        if (!File.Exists(dialog.FileName))
        {
            MessageBox.Show("Selected file does not exist.", "Import Transfer In",
                MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        try
        {
            IsImportingTransferIn = true;
            TransferInImportStatus = "Importing...";

            var (success, message, importedCount) = await ExcelImportService.ImportTransferInFromExcelAsync(
                dialog.FileName, _settings);

            TransferInImportStatus = success
                ? $"Successfully imported {importedCount} Transfer In(s)"
                : "Import failed";

            MessageBox.Show(message, "Import Transfer In",
                MessageBoxButton.OK,
                success ? MessageBoxImage.Information : MessageBoxImage.Error);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to import Transfer In", ex);
            TransferInImportStatus = "Import failed";
            MessageBox.Show($"Failed to import Transfer In: {ex.Message}", "Import Transfer In",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsImportingTransferIn = false;
        }
    }
}

