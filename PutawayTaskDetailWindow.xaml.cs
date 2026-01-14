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
}

