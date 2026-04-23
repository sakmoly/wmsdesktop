using System;
using System.Windows;
using System.Windows.Data;
using Wms.Desktop.Models;
using Wms.Desktop.Services;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop;

public partial class AsnDetailWindow : Window
{
    private readonly string _asnTitle;

    public AsnDetailWindow(Asn asn)
    {
        InitializeComponent();
        _asnTitle = asn.Title;
        DataContext = CreateViewModel(asn);
        this.Loaded += AsnDetailWindow_Loaded;
        this.Activated += AsnDetailWindow_Activated;
    }

    private async void AsnDetailWindow_Loaded(object sender, RoutedEventArgs e)
    {
        await RefreshAsnAsync();
    }

    private async void AsnDetailWindow_Activated(object? sender, EventArgs e)
    {
        await RefreshAsnAsync();
    }

    private async void PrimaryErpAsnActionButton_Click(object sender, RoutedEventArgs e)
    {
        var settings = SettingsService.LoadSettings();
        if (settings == null)
        {
            MessageBox.Show("Settings not available.", "ERPNext", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        var vm = DataContext as AsnDetailViewModel;
        var asn = vm?.Asn;
        if (vm == null || asn == null)
        {
            MessageBox.Show("ASN data not available.", "ERPNext", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        if (!string.Equals(asn.Status, "Received", StringComparison.OrdinalIgnoreCase))
        {
            MessageBox.Show(
                $"ASN status must be 'Received' in WMS before syncing with ERPNext. Current status is '{asn.Status}'.",
                "ERPNext",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            return;
        }

        var generatePr = vm.ErpNextAwaitingPurchaseReceipt && string.IsNullOrWhiteSpace(asn.PurchaseReceiptNo);

        try
        {
            UpdateReceivedQtyToErpNextButton.IsEnabled = false;

            if (generatePr)
            {
                var (prSuccess, prError, createdPrNo) = await ErpNextWmsSyncApiService.CreatePurchaseReceiptFromAsnAsync(settings, asn);
                if (prSuccess && !string.IsNullOrWhiteSpace(createdPrNo))
                {
                    var prNo = createdPrNo.Trim();
                    var saved = await AsnDataService.SetAsnPurchaseReceiptNoAsync(settings, _asnTitle, prNo);
                    if (!saved)
                        ErrorLogService.LogError($"AsnDetailWindow: Failed to save Purchase Receipt number {prNo} to ASN {_asnTitle}.", null);
                    AsnPushStateService.SetErpReadyForPurchaseReceipt(_asnTitle, false);
                    await RefreshAsnAsync();
                    RefreshPrimaryErpAsnActionButtonBindings();
                    MessageBox.Show(
                        $"Purchase Receipt created in ERPNext.\n\nDocument: {prNo}",
                        "Generate Purchase Receipt",
                        MessageBoxButton.OK,
                        MessageBoxImage.Information);
                }
                else
                {
                    await RefreshAsnAsync();
                    RefreshPrimaryErpAsnActionButtonBindings();
                    MessageBox.Show(
                        string.IsNullOrWhiteSpace(prError)
                            ? "Purchase Receipt was not created (no document number returned). Check ERPNext and try again."
                            : $"Purchase Receipt was not created:\n{prError}",
                        "Generate Purchase Receipt",
                        MessageBoxButton.OK,
                        MessageBoxImage.Warning);
                }
            }
            else
            {
                var (success, error, erpAsnReceived) = await ErpNextWmsSyncApiService.PushAsnReceivedQtyToErpNextAsync(settings, asn);
                if (success)
                {
                    AsnPushStateService.RecordLastPushed(_asnTitle, DateTime.UtcNow);
                    var hadPrBeforePush = !string.IsNullOrWhiteSpace(asn.PurchaseReceiptNo);
                    // Only offer "Generate Purchase Receipt" when ERP is Received and WMS has no PR number yet.
                    if (erpAsnReceived == true && !hadPrBeforePush)
                        AsnPushStateService.SetErpReadyForPurchaseReceipt(_asnTitle, true);
                    else
                        AsnPushStateService.SetErpReadyForPurchaseReceipt(_asnTitle, false);

                    await RefreshAsnAsync();
                    RefreshPrimaryErpAsnActionButtonBindings();

                    var msg = $"ASN {_asnTitle}: received quantities were sent to ERPNext.";
                    var vmAfter = DataContext as AsnDetailViewModel;
                    if (erpAsnReceived == true)
                    {
                        if (vmAfter?.HasPurchaseReceipt == true)
                        {
                            msg += "\n\nERPNext reports ASN status Received. This ASN already has Purchase Receipt ";
                            msg += $"{vmAfter.Asn.PurchaseReceiptNo?.Trim()} in WMS. The primary button shows \"Generate Purchase Receipt\" and is disabled.";
                        }
                        else
                        {
                            msg += "\n\nERPNext reports ASN status Received. The primary button is now \"Generate Purchase Receipt\" — click it when you are ready to create the PR in ERPNext and save the document number here.";
                        }
                    }
                    else if (erpAsnReceived == false)
                        msg += "\n\nERPNext reports ASN status is not Received yet. The Purchase Receipt step will appear only after ERP returns status Received (try Update again later).";
                    else
                        msg += "\n\nThe ERP response did not include a recognizable status field. Extend update_asn_received_qty to return \"status\" or \"asn_status\" in JSON, or confirm in ERPNext before generating a Purchase Receipt.";
                    MessageBox.Show(msg, "Update Received Qty to ERPNext", MessageBoxButton.OK, MessageBoxImage.Information);
                }
                else
                {
                    MessageBox.Show($"Failed to update ERPNext: {error}", "Update Received Qty to ERPNext", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("AsnDetailWindow: ERPNext ASN action failed", ex);
            MessageBox.Show($"Error: {ex.Message}", "ERPNext", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            UpdateReceivedQtyToErpNextButton.IsEnabled = true;
        }
    }

    private async void MarkAsReceivedButton_Click(object sender, RoutedEventArgs e)
    {
        var settings = SettingsService.LoadSettings();
        if (settings == null || !settings.DatabaseExists || !settings.TablesExist)
        {
            MessageBox.Show("Settings or database not available.", "Mark as Received", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        try
        {
            MarkAsReceivedButton.IsEnabled = false;
            var updated = await AsnDataService.SetAsnStatusAsync(settings, _asnTitle, "Received");
            if (updated)
            {
                await RefreshAsnAsync();
                MessageBox.Show($"ASN {_asnTitle} status set to Received. Use \"Update Received Qty to ERPNext\" first; after ERP returns Received, use \"Generate Purchase Receipt\" (disabled if a PR is already linked).", "Mark as Received", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            else
                MessageBox.Show($"Could not update status for ASN {_asnTitle}.", "Mark as Received", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("AsnDetailWindow: Mark as Received failed", ex);
            MessageBox.Show($"Error: {ex.Message}", "Mark as Received", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            MarkAsReceivedButton.IsEnabled = true;
        }
    }

    private async void MarkAsExportedButton_Click(object sender, RoutedEventArgs e)
    {
        var settings = SettingsService.LoadSettings();
        if (settings == null || !settings.DatabaseExists || !settings.TablesExist)
        {
            MessageBox.Show("Settings or database not available.", "Mark as Exported", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        try
        {
            MarkAsExportedButton.IsEnabled = false;
            var (success, error) = await ErpNextWmsSyncApiService.UpdateAsnWmsStatusAsync(settings, _asnTitle, "Exported");
            if (success)
            {
                await AsnDataService.SetAsnWmsExportStatusAsync(settings, _asnTitle, "Exported");
                await RefreshAsnAsync();
                MessageBox.Show($"ASN {_asnTitle} marked as Exported in ERPNext and locally.", "Mark as Exported", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            else
                MessageBox.Show($"Failed to update ERPNext: {error}", "Mark as Exported", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("AsnDetailWindow: Mark as Exported failed", ex);
            MessageBox.Show($"Error: {ex.Message}", "Mark as Exported", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            MarkAsExportedButton.IsEnabled = true;
        }
    }

    private async System.Threading.Tasks.Task RefreshAsnAsync()
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings != null && settings.DatabaseExists && settings.TablesExist)
            {
                var refreshedAsn = await AsnDataService.GetAsnByTitleAsync(settings, _asnTitle);
                if (refreshedAsn != null)
                {
                    // If fully received but status still Draft, auto-set to Received so "Update Received Qty to ERPNext" enables
                    var statusUpdated = await AsnDataService.TrySetAsnStatusToReceivedWhenFullyReceivedAsync(settings, refreshedAsn);
                    if (statusUpdated)
                        refreshedAsn = await AsnDataService.GetAsnByTitleAsync(settings, _asnTitle);
                    if (refreshedAsn != null)
                        DataContext = CreateViewModel(refreshedAsn);
                }
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error refreshing ASN data in AsnDetailWindow", ex);
        }
    }

    /// <summary>Forces Content/ToolTip bindings to re-read the ViewModel after <see cref="RefreshAsnAsync"/> replaces <see cref="FrameworkElement.DataContext"/>.</summary>
    private void RefreshPrimaryErpAsnActionButtonBindings()
    {
        BindingOperations.GetBindingExpression(UpdateReceivedQtyToErpNextButton, System.Windows.Controls.ContentControl.ContentProperty)?.UpdateTarget();
        BindingOperations.GetBindingExpression(UpdateReceivedQtyToErpNextButton, FrameworkElement.ToolTipProperty)?.UpdateTarget();
    }

    private static AsnDetailViewModel CreateViewModel(Asn asn)
    {
        var lastSent = AsnPushStateService.GetLastPushed(asn.Title);
        var erpReadyForPr = AsnPushStateService.IsErpReadyForPurchaseReceipt(asn.Title);
        if (!string.IsNullOrWhiteSpace(asn.PurchaseReceiptNo))
            erpReadyForPr = false;
        return new AsnDetailViewModel(asn, lastSent, erpReadyForPr);
    }
}


