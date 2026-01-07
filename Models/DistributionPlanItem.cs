namespace Wms.Desktop.Models;

public sealed class DistributionPlanItem
{
    public string ItemCode { get; init; } = string.Empty;
    public string ItemName { get; init; } = string.Empty;
    public string StoreWarehouse { get; init; } = string.Empty;
    public double QtyAllocated { get; init; }
}


