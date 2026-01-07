using System.Linq;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class TransferInDetailViewModel : BaseViewModel
{
    public TransferIn TransferIn { get; }

    public int TotalLines => TransferIn.Items.Count;
    public double TotalQty => TransferIn.Items.Sum(i => i.Qty);

    public TransferInDetailViewModel(TransferIn transferIn)
    {
        TransferIn = transferIn;
    }
}

