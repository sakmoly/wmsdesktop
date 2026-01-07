namespace Wms.Desktop.Models;

public sealed class Location
{
    public string LocationId { get; init; } = string.Empty;
    public string Warehouse { get; init; } = string.Empty;
    public string? Zone { get; init; }
    public string? Aisle { get; init; }
    public string? ParentRack { get; init; }
    public string? Level { get; init; }
    public string? BinId { get; init; }
    public string? LocationType { get; init; }
    public bool IsAvailable { get; init; }
    public double? CapacityVolumeWeight { get; init; }
    public string? LocationTypeDetailed { get; init; }
}


