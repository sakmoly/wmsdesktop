namespace Wms.Desktop.ViewModels;

/// <summary>
/// One line in the "Items to push to ERPNext" preview (full details per line).
/// </summary>
public sealed class RelocationPushLineDisplay
{
    public string ItemCode { get; init; } = string.Empty;
    public double Qty { get; init; }
    public string? FromBin { get; init; }
    public string? ToBin { get; init; }
    public string? FromCarton { get; init; }
    public string? ToCarton { get; init; }
}
