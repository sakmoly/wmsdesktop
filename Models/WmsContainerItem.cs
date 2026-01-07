namespace Wms.Desktop.Models;

public sealed class WmsContainerItem
{
    public string Item { get; init; } = string.Empty; // Item code
    public double Quantity { get; init; }
    public string Uom { get; init; } = string.Empty;
    public string? BatchNoSerialNo { get; init; }
}


