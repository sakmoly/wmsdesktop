using System.Linq;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class TransferInDetailViewModel : BaseViewModel
{
    private TransferIn _transferIn;

    public TransferIn TransferIn
    {
        get => _transferIn;
        set
        {
            if (_transferIn != value)
            {
                _transferIn = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(TotalLines));
                OnPropertyChanged(nameof(TotalQty));
                OnPropertyChanged(nameof(CanSubmit));
            }
        }
    }

    public int TotalLines => TransferIn.Items.Count;
    public double TotalQty => TransferIn.Items.Sum(i => i.Qty);

    /// <summary>
    /// Can submit if Transfer In is not already "Received" or "Completed"
    /// </summary>
    public bool CanSubmit => TransferIn.Status != "Received" && 
                             TransferIn.Status != "Completed" &&
                             TransferIn.Status != "Draft";

    public TransferInDetailViewModel(TransferIn transferIn)
    {
        _transferIn = transferIn;
    }
}

