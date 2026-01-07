namespace Wms.Desktop.Models;

public sealed class ItemGroup
{
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string? ParentGroup { get; init; }
    public bool IsGroup { get; init; }
}


