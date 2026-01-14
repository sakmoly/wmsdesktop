using System;

namespace Wms.Desktop.Models;

/// <summary>
/// Carton-level inventory tracking
/// Tracks stock at: Item + Warehouse + Bin + Carton level
/// </summary>
public sealed class CartonStock
{
    public long Id { get; init; }
    public string CartonId { get; init; } = string.Empty;
    public string ItemCode { get; init; } = string.Empty;
    public string Warehouse { get; init; } = string.Empty;
    public string BinLocation { get; init; } = string.Empty;
    public double Qty { get; init; }
    public string? Uom { get; init; }
    public string? BatchNo { get; init; }
    public string? SerialNo { get; init; }
    public string Status { get; init; } = "PUTAWAY";
    // PUTAWAY, PICKED, SHIPPED, ADJUSTED
    public DateTime? LastMovedOn { get; init; }
    public DateTime CreatedOn { get; init; }
    public DateTime UpdatedAt { get; init; }
}

