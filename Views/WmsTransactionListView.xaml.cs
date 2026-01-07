using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Wms.Desktop.Models;

namespace Wms.Desktop.Views;

public partial class WmsTransactionListView : UserControl
{
    public WmsTransactionListView()
    {
        InitializeComponent();
    }

    private void TransactionsGrid_OnMouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (TransactionsGrid.SelectedItem is not WmsTransaction tx)
        {
            return;
        }

        var window = new WmsTransactionDetailWindow(tx)
        {
            Owner = Window.GetWindow(this)
        };
        window.ShowDialog();
    }
}


