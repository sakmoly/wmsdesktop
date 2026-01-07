namespace Wms.Desktop.Models;

public sealed class WmsRole
{
    public string RoleName { get; init; } = string.Empty;
    public bool IsActive { get; init; }
    public bool MobileAccess { get; init; }
}


