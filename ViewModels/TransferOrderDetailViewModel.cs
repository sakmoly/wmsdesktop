using System.Linq;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class TransferOrderDetailViewModel : BaseViewModel
{
    public TransferOrder TransferOrder { get; }

    public int TotalLines => TransferOrder.Items.Count;
    public double TotalQty => TransferOrder.Items.Sum(i => i.AllocatedQty);

    public TransferOrderDetailViewModel(TransferOrder transferOrder)
    {
        TransferOrder = transferOrder;
    }
}


