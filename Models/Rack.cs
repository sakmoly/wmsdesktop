namespace Wms.Desktop.Models;

public sealed class Rack
{
    public string RackName { get; init; } = string.Empty;
    public string ParentAisle { get; init; } = string.Empty;
    public string? ParentZone { get; init; }
    public string Warehouse { get; init; } = string.Empty;
    public string SystemId { get; init; } = string.Empty;
}


