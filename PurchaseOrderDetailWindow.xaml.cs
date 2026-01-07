using System.Windows;
using Wms.Desktop.Models;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop;

public partial class PurchaseOrderDetailWindow : Window
{
    public PurchaseOrderDetailWindow(PurchaseOrder purchaseOrder)
    {
        InitializeComponent();
        DataContext = new PurchaseOrderDetailViewModel(purchaseOrder);
    }
}


