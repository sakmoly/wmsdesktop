namespace Wms.Desktop.Models;

public sealed class WmsActiveUser
{
    public string User { get; init; } = string.Empty;
    public int AssignedItemsCount { get; init; }
    public int CompletedItemsCount { get; init; }
    public string Status { get; init; } = "Active"; // Active / Paused / Signed Out
}


