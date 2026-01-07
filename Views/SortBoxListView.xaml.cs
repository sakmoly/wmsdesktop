using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Wms.Desktop.Models;
using Wms.Desktop.Services;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop.Views;

public partial class SortBoxListView : UserControl
{
    public SortBoxListView()
    {
        InitializeComponent();
        Loaded += SortBoxListView_Loaded;
    }

    private async void SortBoxListView_Loaded(object sender, RoutedEventArgs e)
    {
        ErrorLogService.LogInfo("SortBoxListView: Loaded event fired");
        if (DataContext is SortBoxListViewModel viewModel)
        {
            ErrorLogService.LogInfo("SortBoxListView: Calling RefreshAsync on ViewModel");
            await viewModel.RefreshAsync();
            ErrorLogService.LogInfo("SortBoxListView: RefreshAsync completed");
        }
    }

    private void SortBoxGrid_OnMouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (SortBoxGrid.SelectedItem is not SortBox sortBox)
        {
            return;
        }

        var detailWindow = new SortBoxDetailWindow(sortBox)
        {
            Owner = Window.GetWindow(this)
        };
        detailWindow.ShowDialog();
    }
}

