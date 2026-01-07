namespace Wms.Desktop.Models;

public sealed class Bin
{
    public string BinName { get; init; } = string.Empty;
    public string ParentRack { get; init; } = string.Empty;
    public string Warehouse { get; init; } = string.Empty;
    public string SystemId { get; init; } = string.Empty;
}

