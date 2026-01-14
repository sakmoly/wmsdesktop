using System;

namespace Wms.Desktop.Models;

/// <summary>
/// Bin master - physical storage locations in warehouse
/// </summary>
public sealed class Bin
{
    public string BinId { get; init; } = string.Empty;
    public string WarehouseId { get; init; } = string.Empty;
    public string? Zone { get; init; }
    public string? Aisle { get; init; }
    public string? Rack { get; init; }
    public string? Level { get; init; }
    public string? Position { get; init; }
    public string? Barcode { get; init; }
    public bool IsActive { get; init; } = true;
    public string BinType { get; init; } = "STORAGE";
    // STORAGE, DOCK, STAGING, PICK, DAMAGE, QA
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
}
