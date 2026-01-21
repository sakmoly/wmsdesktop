using System;
using System.Windows;
using System.Windows.Controls;
using Wms.Desktop.Models;
using Wms.Desktop.Windows;

namespace Wms.Desktop.Views;

public partial class RelocationListView : UserControl
{
    public RelocationListView()
    {
        InitializeComponent();
    }

    private void NewFullCartonButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var window = new RelocationSessionDetailWindow(null, "FULL_CARTON");
            window.ShowDialog();
            // Refresh list after window closes
            RefreshButton_Click(sender, e);
        }
        catch (Exception ex)
        {
            Services.ErrorLogService.LogError("Error opening new full carton move", ex);
            MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void NewPartialMoveButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var window = new RelocationSessionDetailWindow(null, "PARTIAL_ITEMS");
            window.ShowDialog();
            // Refresh list after window closes
            RefreshButton_Click(sender, e);
        }
        catch (Exception ex)
        {
            Services.ErrorLogService.LogError("Error opening new partial move", ex);
            MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void NewCartonToCartonButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var window = new RelocationSessionDetailWindow(null, "CARTON_TO_CARTON");
            window.ShowDialog();
            // Refresh list after window closes
            RefreshButton_Click(sender, e);
        }
        catch (Exception ex)
        {
            Services.ErrorLogService.LogError("Error opening new carton-to-carton move", ex);
            MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void RefreshButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            // Reload data
            var viewModel = DataContext as ViewModels.RelocationListViewModel;
            if (viewModel != null)
            {
                // Note: Currently no list endpoint, so this is a placeholder
                // In a real implementation, you'd call an API to get all sessions
            }
        }
        catch (Exception ex)
        {
            Services.ErrorLogService.LogError("Error refreshing relocation sessions", ex);
        }
    }

    private void SessionsGrid_OnMouseDoubleClick(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        try
        {
            if (sender is DataGrid grid && grid.SelectedItem is RelocationSession session)
            {
                var window = new RelocationSessionDetailWindow(session, null);
                window.ShowDialog();
                // Refresh list after window closes
                RefreshButton_Click(sender, e);
            }
        }
        catch (Exception ex)
        {
            Services.ErrorLogService.LogError("Error opening relocation session", ex);
            MessageBox.Show($"Error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }
}
