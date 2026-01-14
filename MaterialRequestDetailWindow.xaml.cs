using System;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Wms.Desktop.Models;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop;

public partial class MaterialRequestDetailWindow : Window
{
    private MaterialRequestDetailViewModel? _viewModel;
    private string? _currentItemCode;
    private string? _currentSourceBin;

    public MaterialRequestDetailWindow(MaterialRequest materialRequest)
    {
        InitializeComponent();
        _viewModel = new MaterialRequestDetailViewModel(materialRequest);
        DataContext = _viewModel;
    }

    private void ItemLinesGrid_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_viewModel == null || !_viewModel.IsCartonLevelMode) return;

        var selectedItem = ItemLinesGrid.SelectedItem as MaterialRequestItem;
        if (selectedItem == null)
        {
            SelectedItemText.Text = "Select an item to see available cartons";
            SourceBinPrompt.Visibility = Visibility.Collapsed;
            SourceBinTextBox.Visibility = Visibility.Collapsed;
            AvailableCartonsGrid.Visibility = Visibility.Collapsed;
            NoCartonsText.Visibility = Visibility.Collapsed;
            return;
        }

        _currentItemCode = selectedItem.ItemCode;
        SelectedItemText.Text = $"Item: {selectedItem.ItemCode}\nPending: {selectedItem.PendingQty:N2}";
        
        SourceBinPrompt.Visibility = Visibility.Visible;
        SourceBinTextBox.Visibility = Visibility.Visible;
        SourceBinTextBox.Text = _currentSourceBin ?? "";
        
        if (!string.IsNullOrEmpty(_currentSourceBin))
        {
            _ = LoadAvailableCartonsAsync();
        }
    }

    private async void SourceBinTextBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_viewModel == null || !_viewModel.IsCartonLevelMode) return;

        var textBox = sender as TextBox;
        if (textBox == null) return;

        _currentSourceBin = textBox.Text?.Trim();
        
        if (string.IsNullOrEmpty(_currentSourceBin) || string.IsNullOrEmpty(_currentItemCode))
        {
            AvailableCartonsGrid.Visibility = Visibility.Collapsed;
            NoCartonsText.Visibility = Visibility.Collapsed;
            return;
        }

        await LoadAvailableCartonsAsync();
    }

    private async Task LoadAvailableCartonsAsync()
    {
        if (_viewModel == null || string.IsNullOrEmpty(_currentItemCode) || string.IsNullOrEmpty(_currentSourceBin))
        {
            return;
        }

        try
        {
            var cartons = await _viewModel.GetAvailableCartonsAsync(_currentItemCode, _currentSourceBin);
            
            if (cartons.Count > 0)
            {
                AvailableCartonsGrid.ItemsSource = cartons.Select(c => new { CartonId = c.CartonId, AvailableQty = c.AvailableQty });
                AvailableCartonsGrid.Visibility = Visibility.Visible;
                NoCartonsText.Visibility = Visibility.Collapsed;
            }
            else
            {
                AvailableCartonsGrid.Visibility = Visibility.Collapsed;
                NoCartonsText.Visibility = Visibility.Visible;
            }
        }
        catch
        {
            AvailableCartonsGrid.Visibility = Visibility.Collapsed;
            NoCartonsText.Text = "Error loading available cartons";
            NoCartonsText.Visibility = Visibility.Visible;
        }
    }
}

