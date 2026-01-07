using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Wms.Desktop.Models;

namespace Wms.Desktop.Views;

public partial class InboundSessionListView : UserControl
{
    public InboundSessionListView()
    {
        InitializeComponent();
        this.Loaded += InboundSessionListView_Loaded;
    }

    private async void InboundSessionListView_Loaded(object sender, RoutedEventArgs e)
    {
        // Refresh data when view is loaded to ensure latest data from sync
        Services.ErrorLogService.LogInfo("InboundSessionListView: Loaded event fired");
        
        if (DataContext is ViewModels.InboundSessionListViewModel viewModel)
        {
            Services.ErrorLogService.LogInfo("InboundSessionListView: Calling RefreshAsync on ViewModel");
            await viewModel.RefreshAsync();
            Services.ErrorLogService.LogInfo("InboundSessionListView: RefreshAsync completed");
        }
        else
        {
            Services.ErrorLogService.LogInfo("InboundSessionListView: DataContext is not InboundSessionListViewModel");
        }
    }

    private void SessionGrid_OnMouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (SessionGrid.SelectedItem is not InboundSession session)
        {
            return;
        }

        var detailWindow = new InboundSessionDetailWindow(session)
        {
            Owner = Window.GetWindow(this)
        };
        detailWindow.ShowDialog();
    }
}

