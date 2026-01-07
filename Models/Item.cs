using System;

namespace Wms.Desktop.Models;

public sealed class Item
{
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string? ItemGroup { get; init; }
    public string? Brand { get; init; }
    public string? DefaultUom { get; init; }
    public string? StockUom { get; init; }
    public string? Barcode { get; init; }
    public bool MaintainStock { get; init; }
    public double StockQty { get; init; }
    public double ReservedQty { get; init; }
    public double AvailableQty => StockQty - ReservedQty;
    public DateTime? UpdatedOn { get; init; } // For sync operations
}


