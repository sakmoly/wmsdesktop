using System.Linq;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class PurchaseOrderDetailViewModel : BaseViewModel
{
    public PurchaseOrder PurchaseOrder { get; }

    public double TotalOrderedQty { get; }
    public double TotalReceivedQty { get; }

    public PurchaseOrderDetailViewModel(PurchaseOrder purchaseOrder)
    {
        PurchaseOrder = purchaseOrder;
        TotalOrderedQty = purchaseOrder.Items.Sum(i => i.OrderedQty);
        TotalReceivedQty = purchaseOrder.Items.Sum(i => i.ReceivedQty);
    }
}


