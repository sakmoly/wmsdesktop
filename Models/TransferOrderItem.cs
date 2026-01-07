namespace Wms.Desktop.Models;

public sealed class TransferOrderItem
{
    public string Store { get; init; } = string.Empty;
    public string ItemCode { get; init; } = string.Empty;
    public double AllocatedQty { get; init; }
    public double SortedQty { get; init; }
    public double PackedQty { get; init; }
    public double PendingQty { get; init; }
    public string? Remarks { get; init; }
}


