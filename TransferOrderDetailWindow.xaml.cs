using System.Windows;
using Wms.Desktop.Models;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop;

public partial class TransferOrderDetailWindow : Window
{
    public TransferOrderDetailWindow(TransferOrder transferOrder)
    {
        InitializeComponent();
        DataContext = new TransferOrderDetailViewModel(transferOrder);
    }
}


