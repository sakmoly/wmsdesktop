using System;

namespace Wms.Desktop.Models;

public sealed class TransferCartonItem
{
    public string ItemCode { get; init; } = string.Empty;
    public string? SourceCartonId { get; init; }
    public double Qty { get; init; }
    public DateTime PackedOn { get; init; }
    public string PackedBy { get; init; } = string.Empty;
}

