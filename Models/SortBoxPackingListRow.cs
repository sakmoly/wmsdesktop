namespace Wms.Desktop.Models;

/// <summary>
/// One aggregated line for sort-box packing list reports (from tabWmsScanEvent).
/// </summary>
public sealed class SortBoxPackingListRow
{
    public string BoxKey { get; init; } = string.Empty;
    public string TcId { get; init; } = string.Empty;
    public string ItemCode { get; init; } = string.Empty;
    public string? SourceCartonId { get; init; }
    public double Qty { get; init; }
}
