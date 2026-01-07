using System.Windows;
using Wms.Desktop.Models;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop;

public partial class WmsTransactionDetailWindow : Window
{
    public WmsTransactionDetailWindow(WmsTransaction transaction)
    {
        InitializeComponent();
        DataContext = new WmsTransactionDetailViewModel(transaction);
    }
}


