using System;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Wms.Desktop.Models;
using Wms.Desktop.Services;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop;

public partial class RelocationSessionDetailWindow : Window
{
    private readonly RelocationSessionDetailViewModel _viewModel;
    private readonly RelocationSession? _existingSession;
    private readonly string? _mode;

    public RelocationSessionDetailWindow(RelocationSession? existingSession = null, string? mode = null)
    {
        InitializeComponent();
        _existingSession = existingSession;
        _mode = mode;
        _viewModel = new RelocationSessionDetailViewModel(existingSession, mode);
        DataContext = _viewModel;

        if (existingSession == null && !string.IsNullOrWhiteSpace(mode))
        {
            // New session - need to start it
            _ = StartNewSessionAsync();
        }
        else if (existingSession != null)
        {
            // Load existing session
            _ = LoadSessionAsync();
        }
    }

    private async Task StartNewSessionAsync()
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                MessageBox.Show("Settings not found. Please configure API settings first.", "Error", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
                Close();
                return;
            }

            // Get warehouse ID (you might want to add a selection UI)
            var warehouseId = settings.DefaultPickingWarehouse ?? "WH-MAIN";
            // Use real operator user_id instead of "SYSTEM" for accountability
            // TODO: In future, integrate with actual user authentication system to get current logged-in user
            // For now, use SYSTEM as default (can be enhanced later with user session management)
            var userId = "SYSTEM";
            Services.ErrorLogService.LogInfo($"RelocationSessionDetailWindow: Starting session with userId: {userId} (TODO: integrate with user authentication)");

            // Validate required fields
            if (string.IsNullOrWhiteSpace(_mode))
            {
                MessageBox.Show("Mode is required.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                Close();
                return;
            }

            if (string.IsNullOrWhiteSpace(warehouseId))
            {
                MessageBox.Show("Warehouse ID is required. Please configure Default Picking Warehouse in Settings.", "Error", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
                Close();
                return;
            }

            (bool success, string message, RelocationSession? session) = await RelocationApiService.StartSessionAsync(
                settings, _mode, warehouseId, userId);

            if (success && session != null)
            {
                _viewModel.Session = session;
                _viewModel.WarehouseId = warehouseId;
            }
            else
            {
                MessageBox.Show($"Failed to start session:\n\n{message}", "Error", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
                Close();
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error starting relocation session", ex);
            MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            Close();
        }
    }

    private async Task LoadSessionAsync()
    {
        if (_existingSession == null) return;

        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null) return;

            var (success, message, session) = await RelocationApiService.GetSessionAsync(
                settings, _existingSession.SessionId);

            if (success && session != null)
            {
                _viewModel.Session = session;
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading relocation session", ex);
        }
    }

    private async void SetFromLocation_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null || _viewModel.Session == null)
            {
                MessageBox.Show("Settings not found or session not initialized.", "Error", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            var (success, message) = await RelocationApiService.SetFromLocationAsync(
                settings, _viewModel.Session.SessionId, _viewModel.FromBin, _viewModel.FromCarton);

            if (success)
            {
                MessageBox.Show("FROM location set successfully.", "Success", 
                    MessageBoxButton.OK, MessageBoxImage.Information);
                await LoadSessionAsync();
            }
            else
            {
                MessageBox.Show($"Failed to set FROM location:\n\n{message}", "Error", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error setting FROM location", ex);
            MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void SetToLocation_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null || _viewModel.Session == null)
            {
                MessageBox.Show("Settings not found or session not initialized.", "Error", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            var (success, message) = await RelocationApiService.SetToLocationAsync(
                settings, _viewModel.Session.SessionId, _viewModel.ToBin, _viewModel.ToCarton);

            if (success)
            {
                MessageBox.Show("TO location set successfully.", "Success", 
                    MessageBoxButton.OK, MessageBoxImage.Information);
                await LoadSessionAsync();
            }
            else
            {
                MessageBox.Show($"Failed to set TO location:\n\n{message}", "Error", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error setting TO location", ex);
            MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void ViewFromCartonContents_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(_viewModel.FromCarton))
        {
            MessageBox.Show("Please enter a carton ID first.", "Info", 
                MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        await ViewCartonContentsAsync(_viewModel.FromCarton, true);
    }

    private async void ViewToCartonContents_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(_viewModel.ToCarton))
        {
            MessageBox.Show("Please enter a carton ID first.", "Info", 
                MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        await ViewCartonContentsAsync(_viewModel.ToCarton, false);
    }

    private async Task ViewCartonContentsAsync(string cartonId, bool isFromCarton)
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                MessageBox.Show("Settings not found.", "Error", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            var (success, message, contents) = await RelocationApiService.GetCartonContentsAsync(
                settings, cartonId);

            if (success && contents != null)
            {
                if (isFromCarton)
                {
                    _viewModel.FromCartonContents = contents;
                }
                else
                {
                    _viewModel.ToCartonContents = contents;
                }

                var itemsList = string.Join("\n", contents.Items.Select(item => 
                    $"{item.ItemCode}: {item.Qty} {item.Uom ?? ""}"));

                MessageBox.Show($"Carton {cartonId} Contents:\n\n{itemsList}", 
                    "Carton Contents", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            else
            {
                MessageBox.Show($"Failed to get carton contents:\n\n{message}", "Error", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error viewing carton contents", ex);
            MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void ScanItem_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var barcode = BarcodeTextBox.Text?.Trim();
            var qtyText = QtyTextBox.Text?.Trim();

            if (string.IsNullOrWhiteSpace(barcode))
            {
                MessageBox.Show("Please enter a barcode.", "Info", 
                    MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            if (!double.TryParse(qtyText, out var qty) || qty <= 0)
            {
                MessageBox.Show("Please enter a valid quantity.", "Info", 
                    MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            var settings = SettingsService.LoadSettings();
            if (settings == null || _viewModel.Session == null)
            {
                MessageBox.Show("Settings not found or session not initialized.", "Error", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            var (success, message) = await RelocationApiService.ScanItemAsync(
                settings, _viewModel.Session.SessionId, barcode, qty);

            if (success)
            {
                MessageBox.Show("Item scanned successfully.", "Success", 
                    MessageBoxButton.OK, MessageBoxImage.Information);
                
                // Clear inputs
                BarcodeTextBox.Text = string.Empty;
                QtyTextBox.Text = "1";
                BarcodeTextBox.Focus();

                // Reload session to get updated lines
                await LoadSessionAsync();
            }
            else
            {
                MessageBox.Show($"Failed to scan item:\n\n{message}", "Error", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error scanning item", ex);
            MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void BarcodeTextBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            ScanItem_Click(sender, e);
        }
    }

    private async void CommitFullMove_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null || _viewModel.Session == null)
            {
                MessageBox.Show("Settings not found or session not initialized.", "Error", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }
            
            // Warn if FULL_CARTON mode has to_carton set (should use CARTON_TO_CARTON instead)
            if (_viewModel.Mode == "FULL_CARTON" && !string.IsNullOrWhiteSpace(_viewModel.ToCarton) && 
                _viewModel.ToCarton != _viewModel.FromCarton)
            {
                var warningResult = MessageBox.Show(
                    "FULL_CARTON mode is for bin relocation only.\n\n" +
                    "For carton-to-carton merge, please create a new session with CARTON_TO_CARTON mode.\n\n" +
                    "Do you want to continue with bin relocation only?",
                    "Mode Warning",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Warning);
                
                if (warningResult == MessageBoxResult.No)
                {
                    return;
                }
            }

            var result = MessageBox.Show(
                $"Are you sure you want to commit this full carton move?\n\n" +
                $"From: {_viewModel.FromCarton} ({_viewModel.FromBin})\n" +
                $"To: {_viewModel.ToBin}\n\n" +
                $"This action cannot be undone.",
                "Confirm Commit",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);

            if (result != MessageBoxResult.Yes) return;

            // Get to_carton_mode from ComboBox
            var toCartonMode = "KEEP_SAME"; // Default
            if (ToCartonModeComboBox?.SelectedItem is System.Windows.Controls.ComboBoxItem selectedItem)
            {
                toCartonMode = selectedItem.Tag?.ToString() ?? "KEEP_SAME";
            }
            
            var (success, message) = await RelocationApiService.CommitFullMoveAsync(
                settings, _viewModel.Session.SessionId, _viewModel.Policy, toCartonMode);

            if (success)
            {
                MessageBox.Show("Full carton move committed successfully.", "Success", 
                    MessageBoxButton.OK, MessageBoxImage.Information);
                await LoadSessionAsync();
            }
            else
            {
                MessageBox.Show($"Failed to commit move:\n\n{message}", "Error", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error committing full move", ex);
            MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void CommitPartialMove_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null || _viewModel.Session == null)
            {
                MessageBox.Show("Settings not found or session not initialized.", "Error", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            var linesCount = _viewModel.Lines.Count;
            var result = MessageBox.Show(
                $"Are you sure you want to commit this partial move?\n\n" +
                $"From: {_viewModel.FromCarton} ({_viewModel.FromBin})\n" +
                $"To: {_viewModel.ToCarton} ({_viewModel.ToBin})\n" +
                $"Items: {linesCount}\n\n" +
                $"This action cannot be undone.",
                "Confirm Commit",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);

            if (result != MessageBoxResult.Yes) return;

            var lines = _viewModel.Lines.ToList();
            var (success, message) = await RelocationApiService.CommitPartialMoveAsync(
                settings, _viewModel.Session.SessionId, lines.Count > 0 ? lines : null);

            if (success)
            {
                MessageBox.Show("Partial move committed successfully.", "Success", 
                    MessageBoxButton.OK, MessageBoxImage.Information);
                await LoadSessionAsync();
            }
            else
            {
                MessageBox.Show($"Failed to commit move:\n\n{message}", "Error", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error committing partial move", ex);
            MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }
}
