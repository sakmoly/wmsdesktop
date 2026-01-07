namespace Wms.Desktop.Models;

public sealed class ItemLocationStock
{
    public string ItemCode { get; init; } = string.Empty;
    public string ItemName { get; init; } = string.Empty;
    public string Warehouse { get; init; } = string.Empty;
    public string LocationId { get; init; } = string.Empty;
    public string? Zone { get; init; }
    public string? Aisle { get; init; }
    public string? Rack { get; init; }
    public string? Level { get; init; }
    public string? BinId { get; init; }
    public double Qty { get; init; }
}


