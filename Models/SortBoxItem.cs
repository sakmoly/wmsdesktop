using System;

namespace Wms.Desktop.Models;

/// <summary>
/// Represents an item in a Sort Box (derived from SORT events)
/// </summary>
public sealed class SortBoxItem
{
    public string ItemCode { get; init; } = string.Empty;
    public string? SourceCartonId { get; init; }
    public double Qty { get; init; }
    public DateTime SortedOn { get; init; }
    public string SortedBy { get; init; } = string.Empty;
}

