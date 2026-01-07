using System.Linq;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class AsnDetailViewModel : BaseViewModel
{
    public Asn Asn { get; }

    // Calculate total from carton details for display purposes
    public double TotalQtyExpected => Asn.Details.Sum(d => d.ShippedQty);
    
    // Calculate total received quantity from receive lines
    public double TotalQtyReceived => Asn.Details.Sum(d => d.ReceivedQty);

    public AsnDetailViewModel(Asn asn)
    {
        Asn = asn;
    }
}


