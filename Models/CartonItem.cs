using System;

namespace Wms.Desktop.Models;

/// <summary>
/// Items contained in a carton
/// </summary>
public sealed class CartonItem
{
    public long Id { get; init; }
    public string CartonId { get; init; } = string.Empty;
    public string ItemCode { get; init; } = string.Empty;
    public string Uom { get; init; } = string.Empty;
    public double Qty { get; init; }
    public string? BatchNo { get; init; }
    public string? SerialNo { get; init; }
    public bool IsClosed { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
}

