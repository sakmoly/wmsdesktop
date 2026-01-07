using System.Collections.Generic;

namespace Wms.Desktop.Models;

public sealed class WmsContainer
{
    public string ContainerId { get; init; } = string.Empty;
    public string ContainerType { get; init; } = string.Empty; // Carton / Pallet / Tote
    public string Status { get; init; } = string.Empty; // Empty / Loaded / Staged / Shipped
    public string? CurrentBin { get; init; }
    public double? TareWeight { get; init; }

    public IReadOnlyList<WmsContainerItem> Contents { get; init; } = new List<WmsContainerItem>();
}


