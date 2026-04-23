using System;

namespace Wms.Desktop.Models;

public sealed class TransferCartonItem
{
    public string ItemCode { get; init; } = string.Empty;
    /// <summary>Inbound carton from scan events (carton_id). Kept for diagnostics; UI prefers <see cref="BoxId"/>.</summary>
    public string? SourceCartonId { get; init; }
    /// <summary>Sort box id from scan events (box_id) when packing into this transfer carton.</summary>
    public string? BoxId { get; init; }
    public string BoxIdForDisplay => string.IsNullOrWhiteSpace(BoxId) ? "—" : BoxId.Trim();
    public double Qty { get; init; }
    public DateTime PackedOn { get; init; }
    public string PackedBy { get; init; } = string.Empty;
}

