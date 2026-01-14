using System;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Wms.Desktop.Models;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop;

public partial class CycleCountTaskDetailWindow : Window
{
    private readonly CycleCountTaskDetailViewModel _viewModel;
    private string? _currentBinLocation;

    public CycleCountTaskDetailWindow(CycleCountTask cycleCountTask)
    {
        InitializeComponent();
        _viewModel = new CycleCountTaskDetailViewModel(cycleCountTask);
        DataContext = _viewModel;
        
        // Handle task update event to refresh the window
        _viewModel.TaskUpdated += ViewModel_TaskUpdated;
        
        // Load fresh data when window opens to ensure carton_id is displayed
        Loaded += async (s, e) => 
        {
            try
            {
                await _viewModel.RefreshTaskAsync();
                // Force DataGrid to refresh
                if (CycleCountLinesGrid != null)
                {
                    CycleCountLinesGrid.ItemsSource = null;
                    CycleCountLinesGrid.ItemsSource = _viewModel.CycleCountTask.Lines;
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error refreshing cycle count task: {ex.Message}");
            }
        };
    }

    private async void ViewModel_TaskUpdated(object? sender, EventArgs e)
    {
        // Refresh the task data when updated
        if (_viewModel != null)
        {
            await _viewModel.RefreshTaskAsync();
        }
    }

    private void CycleCountLinesGrid_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_viewModel == null || !_viewModel.IsCartonLevelMode) return;

        var selectedLine = CycleCountLinesGrid.SelectedItem as CycleCountLine;
        if (selectedLine == null || string.IsNullOrEmpty(selectedLine.BinLocation))
        {
            SelectedBinText.Text = "Select a line with Bin Location";
            LoadCartonsButton.Visibility = Visibility.Collapsed;
            ExpectedCartonsGrid.Visibility = Visibility.Collapsed;
            NoCartonsText.Visibility = Visibility.Collapsed;
            return;
        }

        _currentBinLocation = selectedLine.BinLocation;
        SelectedBinText.Text = $"Bin Location: {selectedLine.BinLocation}";
        LoadCartonsButton.Visibility = Visibility.Visible;
    }

    private async void LoadCartonsButton_Click(object sender, RoutedEventArgs e)
    {
        if (_viewModel == null || string.IsNullOrEmpty(_currentBinLocation))
        {
            return;
        }

        try
        {
            LoadCartonsButton.IsEnabled = false;
            LoadCartonsButton.Content = "Loading...";

            var cartons = await _viewModel.GetExpectedCartonsForBinAsync(_currentBinLocation);
            
            if (cartons.Count > 0)
            {
                ExpectedCartonsGrid.ItemsSource = cartons.Select(c => new 
                { 
                    CartonId = c.CartonId, 
                    ItemCode = c.ItemCode, 
                    ExpectedQty = c.ExpectedQty 
                });
                ExpectedCartonsGrid.Visibility = Visibility.Visible;
                NoCartonsText.Visibility = Visibility.Collapsed;
            }
            else
            {
                ExpectedCartonsGrid.Visibility = Visibility.Collapsed;
                NoCartonsText.Visibility = Visibility.Visible;
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error loading cartons: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            ExpectedCartonsGrid.Visibility = Visibility.Collapsed;
            NoCartonsText.Visibility = Visibility.Collapsed;
        }
        finally
        {
            LoadCartonsButton.IsEnabled = true;
            LoadCartonsButton.Content = "Load Expected Cartons";
        }
    }

    protected override void OnClosed(EventArgs e)
    {
        if (_viewModel != null)
        {
            _viewModel.TaskUpdated -= ViewModel_TaskUpdated;
        }
        base.OnClosed(e);
    }
}

