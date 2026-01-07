using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Wms.Desktop.Models;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop;

public partial class InboundSessionDetailWindow : Window
{
    public InboundSessionDetailWindow(InboundSession session)
    {
        InitializeComponent();
        DataContext = new InboundSessionDetailViewModel(session);
    }

    private void UnloadLinesDataGrid_MouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (sender is DataGrid dataGrid && dataGrid.SelectedItem is InboundUnloadLine unloadLine)
        {
            if (DataContext is InboundSessionDetailViewModel viewModel)
            {
                viewModel.FilterReceiveLinesByUnloadLineCommand.Execute(unloadLine);
            }
        }
    }
}

