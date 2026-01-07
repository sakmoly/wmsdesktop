using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Wms.Desktop.Models;

namespace Wms.Desktop.Views;

public partial class TransferOrderListView : UserControl
{
    public TransferOrderListView()
    {
        InitializeComponent();
    }

    private void TransferOrdersGrid_OnMouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (TransferOrdersGrid.SelectedItem is not TransferOrder to)
        {
            return;
        }

        var detailWindow = new TransferOrderDetailWindow(to)
        {
            Owner = Window.GetWindow(this)
        };
        detailWindow.ShowDialog();
    }
}


