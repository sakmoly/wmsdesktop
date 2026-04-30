using System.Linq;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class TransferOrderDetailViewModel : BaseViewModel
{
    public TransferOrder TransferOrder { get; }

    public int TotalLines => TransferOrder.Items.Count;
    public double TotalQty => TransferOrder.Items.Sum(i => i.AllocatedQty);
    public double TotalSortedQty => TransferOrder.Items.Sum(i => i.SortedQty);
    public double TotalPackedQty => TransferOrder.Items.Sum(i => i.PackedQty);

    public TransferOrderDetailViewModel(TransferOrder transferOrder)
    {
        TransferOrder = transferOrder;
    }
}


