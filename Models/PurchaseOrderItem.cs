namespace Wms.Desktop.Models;

public sealed class PurchaseOrderItem
{
    public string ParentPoId { get; init; } = string.Empty;
    public string ItemCode { get; init; } = string.Empty;
    public string ItemName { get; init; } = string.Empty;
    public double OrderedQty { get; init; }
    public double ReceivedQty { get; init; }
    public string Uom { get; init; } = string.Empty;
    public string TargetWarehouse { get; init; } = string.Empty;
}


