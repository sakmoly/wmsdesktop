using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Wms.Desktop.Models;
using Wms.Desktop.Services;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop.Views;

public partial class TransferCartonListView : UserControl
{
    public TransferCartonListView()
    {
        InitializeComponent();
        Loaded += TransferCartonListView_Loaded;
        TransferCartonGrid.MouseDoubleClick += TransferCartonGrid_OnMouseDoubleClick;
    }

    private async void TransferCartonListView_Loaded(object sender, RoutedEventArgs e)
    {
        ErrorLogService.LogInfo("TransferCartonListView: Loaded event fired");
        if (DataContext is TransferCartonListViewModel viewModel)
        {
            ErrorLogService.LogInfo("TransferCartonListView: Calling RefreshAsync on ViewModel");
            await viewModel.RefreshAsync();
            ErrorLogService.LogInfo("TransferCartonListView: RefreshAsync completed");
        }
    }

    private void TransferCartonGrid_OnMouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (TransferCartonGrid.SelectedItem is not TransferCarton transferCarton)
        {
            return;
        }

        var detailWindow = new TransferCartonDetailWindow(transferCarton)
        {
            Owner = Window.GetWindow(this)
        };
        detailWindow.ShowDialog();
    }
}

