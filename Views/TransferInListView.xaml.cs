using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Wms.Desktop.Models;

namespace Wms.Desktop.Views;

public partial class TransferInListView : UserControl
{
    public TransferInListView()
    {
        InitializeComponent();
    }

    private void TransferInGrid_OnMouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (TransferInGrid.SelectedItem is not TransferIn transferIn)
        {
            return;
        }

        var detailWindow = new TransferInDetailWindow(transferIn)
        {
            Owner = Window.GetWindow(this)
        };
        detailWindow.ShowDialog();
    }
}

