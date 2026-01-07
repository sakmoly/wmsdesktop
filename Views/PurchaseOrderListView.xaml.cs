using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Wms.Desktop.Models;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop.Views;

public partial class PurchaseOrderListView : UserControl
{
    public PurchaseOrderListView()
    {
        InitializeComponent();
        this.Loaded += PurchaseOrderListView_Loaded;
    }

    private async void PurchaseOrderListView_Loaded(object sender, RoutedEventArgs e)
    {
        // Refresh data when view is loaded to ensure latest data from database
        Services.ErrorLogService.LogInfo("PurchaseOrderListView: Loaded event fired, refreshing data");
        if (DataContext is PurchaseOrderListViewModel viewModel)
        {
            Services.ErrorLogService.LogInfo("PurchaseOrderListView: Calling RefreshAsync on ViewModel");
            await viewModel.RefreshAsync();
            Services.ErrorLogService.LogInfo("PurchaseOrderListView: RefreshAsync completed");
        }
        else
        {
            Services.ErrorLogService.LogInfo("PurchaseOrderListView: DataContext is not PurchaseOrderListViewModel");
        }
    }

    private void PurchaseOrdersGrid_OnMouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (PurchaseOrdersGrid.SelectedItem is not PurchaseOrder po)
        {
            return;
        }

        var detailWindow = new PurchaseOrderDetailWindow(po)
        {
            Owner = Window.GetWindow(this)
        };
        detailWindow.ShowDialog();
        
        // Refresh the list after closing detail window in case data was changed
        if (DataContext is PurchaseOrderListViewModel viewModel)
        {
            _ = viewModel.RefreshAsync();
        }
    }
}


