using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class MaterialRequestDetailViewModel : BaseViewModel
{
    public MaterialRequest MaterialRequest { get; }

    public int TotalLines => MaterialRequest.Items.Count;
    public double TotalRequestedQty => MaterialRequest.TotalRequestedQty;
    public double TotalPickedQty => MaterialRequest.TotalPickedQty;

    public MaterialRequestDetailViewModel(MaterialRequest materialRequest)
    {
        MaterialRequest = materialRequest;
    }
}

