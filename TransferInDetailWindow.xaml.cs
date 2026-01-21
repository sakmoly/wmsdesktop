using System;
using System.Threading.Tasks;
using System.Windows;
using Wms.Desktop.Models;
using Wms.Desktop.Services;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop;

public partial class TransferInDetailWindow : Window
{
    private readonly TransferIn _transferIn;
    private readonly TransferInDetailViewModel _viewModel;

    public TransferInDetailWindow(TransferIn transferIn)
    {
        InitializeComponent();
        _transferIn = transferIn;
        _viewModel = new TransferInDetailViewModel(transferIn);
        DataContext = _viewModel;
    }

    private async void BtnSubmit_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            // Disable button during submission
            var submitButton = sender as System.Windows.Controls.Button;
            if (submitButton != null)
            {
                submitButton.IsEnabled = false;
            }

            // Get settings
            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                MessageBox.Show("Settings not found. Please configure API settings first.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            // Show confirmation
            var result = MessageBox.Show(
                $"Are you sure you want to submit Transfer In {_transferIn.Title}?\n\nThis will mark it as 'Received' and finalize all items.",
                "Confirm Submit",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);

            if (result != MessageBoxResult.Yes)
            {
                if (submitButton != null)
                {
                    submitButton.IsEnabled = true;
                }
                return;
            }

            // Call API to complete Transfer In
            (bool success, string message) = await TransferInApiService.CompleteTransferInAsync(
                settings,
                _transferIn.Title,
                completedBy: "SYSTEM");

            if (success)
            {
                MessageBox.Show(
                    $"Transfer In {_transferIn.Title} submitted successfully.\n\nThe window will now be read-only.",
                    "Success",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);

                // Reload Transfer In data to reflect changes
                await ReloadTransferInAsync(settings);

                // Make window read-only (disable submit button)
                if (submitButton != null)
                {
                    submitButton.IsEnabled = false;
                }
            }
            else
            {
                MessageBox.Show(
                    $"Failed to submit Transfer In:\n\n{message}",
                    "Submit Failed",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);

                if (submitButton != null)
                {
                    submitButton.IsEnabled = true;
                }
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error submitting Transfer In", ex);
            MessageBox.Show(
                $"An error occurred while submitting Transfer In:\n\n{ex.Message}",
                "Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);

            var submitButton = sender as System.Windows.Controls.Button;
            if (submitButton != null)
            {
                submitButton.IsEnabled = true;
            }
        }
    }

    private async Task ReloadTransferInAsync(WmsSettings settings)
    {
        try
        {
            var updatedTransferIn = await TransferInDataService.GetTransferInByTitleAsync(settings, _transferIn.Title);
            if (updatedTransferIn != null)
            {
                // Update the view model with new data
                _viewModel.TransferIn = updatedTransferIn;
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error reloading Transfer In", ex);
            // Don't show error to user - just log it
        }
    }
}

