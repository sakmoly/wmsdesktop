using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Wms.Desktop.Models;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop.Views;

public partial class PutawayTaskListView : UserControl
{
    public PutawayTaskListView()
    {
        InitializeComponent();
        this.Loaded += PutawayTaskListView_Loaded;
    }

    private async void PutawayTaskListView_Loaded(object sender, RoutedEventArgs e)
    {
        // Refresh putaway tasks when view is loaded to get latest data from database
        if (DataContext is PutawayTaskListViewModel viewModel)
        {
            await viewModel.RefreshDataAsync();
        }
    }

    private void PutawayTaskGrid_OnMouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (PutawayTaskGrid.SelectedItem is not PutawayTask task)
        {
            return;
        }

        // Show detail window
        var detailWindow = new PutawayTaskDetailWindow(task);
        detailWindow.Owner = Window.GetWindow(this);
        detailWindow.ShowDialog();
    }
}

