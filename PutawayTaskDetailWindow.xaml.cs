using System.Linq;
using System.Windows;
using System.Windows.Controls;
using Wms.Desktop.Models;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop;

public partial class PutawayTaskDetailWindow : Window
{
    private PutawayTaskDetailViewModel? _viewModel;

    public PutawayTaskDetailWindow(PutawayTask putawayTask)
    {
        InitializeComponent();
        _viewModel = new PutawayTaskDetailViewModel(putawayTask);
        DataContext = _viewModel;
    }

    private void PutawayLinesGrid_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_viewModel == null || !_viewModel.IsCartonLevelMode) return;

        var selectedLine = PutawayLinesGrid.SelectedItem as PutawayLine;
        if (selectedLine == null || string.IsNullOrEmpty(selectedLine.CartonId))
        {
            SelectedCartonIdText.Text = "Select a line with Carton ID";
            CartonInfoPanel.Visibility = System.Windows.Visibility.Collapsed;
            return;
        }

        var cartonId = selectedLine.CartonId;
        SelectedCartonIdText.Text = $"Carton ID: {cartonId}";
        
        var carton = _viewModel.GetCarton(cartonId);
        if (carton != null)
        {
            CartonCurrentBinText.Text = carton.CurrentBinId ?? "N/A";
            CartonStatusText.Text = carton.Status;
            
            var items = _viewModel.GetCartonItems(cartonId);
            CartonItemsGrid.ItemsSource = items;
            
            CartonInfoPanel.Visibility = System.Windows.Visibility.Visible;
        }
        else
        {
            CartonCurrentBinText.Text = "Loading...";
            CartonStatusText.Text = "Loading...";
            CartonItemsGrid.ItemsSource = null;
            CartonInfoPanel.Visibility = System.Windows.Visibility.Visible;
        }
    }

    private void LocationIdTextBox_GotFocus(object sender, RoutedEventArgs e)
    {
        // Clear text when focused to allow fresh scan
        if (sender is System.Windows.Controls.TextBox textBox)
        {
            textBox.SelectAll();
        }
    }

    private void LocationIdTextBox_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        // On Enter key, trigger update (but don't auto-submit - user must click button)
        // This allows barcode scanner to fill the text box, but requires explicit submit
        if (e.Key == System.Windows.Input.Key.Enter)
        {
            // Just move focus away or do nothing - user must click Submit button
            // This ensures explicit confirmation before updating database
            e.Handled = true;
        }
    }
}

