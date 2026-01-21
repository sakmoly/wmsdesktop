using System;
using System.Collections.Generic;

namespace Wms.Desktop.Models;

public sealed class RelocationSession
{
    public string SessionId { get; init; } = string.Empty;
    public string Mode { get; init; } = string.Empty; // FULL_CARTON | PARTIAL_ITEMS | CARTON_TO_CARTON
    public string Policy { get; init; } = string.Empty; // BLIND | VERIFIED
    public string WarehouseId { get; init; } = string.Empty;
    public string? FromBin { get; init; }
    public string? FromCarton { get; init; }
    public string? ToBin { get; init; }
    public string? ToCarton { get; init; }
    public string Status { get; init; } = "IN_PROGRESS"; // IN_PROGRESS | COMPLETED | CANCELLED
    public string? CreatedBy { get; init; }
    public string? DeviceId { get; init; }
    public DateTime? CreatedAt { get; init; }
    public DateTime? UpdatedAt { get; init; }
    
    public IReadOnlyList<RelocationLine> Lines { get; init; } = Array.Empty<RelocationLine>();
}

public sealed class RelocationLine
{
    public string ItemCode { get; init; } = string.Empty;
    public double QtyMoved { get; init; }
    public string? Barcode { get; init; }
    public DateTime? CreatedAt { get; init; }
}

public sealed class CartonContents
{
    public string CartonId { get; init; } = string.Empty;
    public string WarehouseId { get; init; } = string.Empty;
    public string? BinLocation { get; init; }
    public string? Status { get; init; }
    public IReadOnlyList<CartonContentsItem> Items { get; init; } = Array.Empty<CartonContentsItem>();
}

public sealed class CartonContentsItem
{
    public string ItemCode { get; init; } = string.Empty;
    public double Qty { get; init; }
    public string? Uom { get; init; }
    public string? BatchNo { get; init; }
    public string? SerialNo { get; init; }
}
