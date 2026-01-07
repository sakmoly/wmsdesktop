namespace Wms.Desktop.Models;

public sealed class WmsRolePermission
{
    public string PermissionId { get; init; } = string.Empty;
    public string RoleName { get; init; } = string.Empty;
    public string DocTypeName { get; init; } = string.Empty;
    public int? PermLevel { get; init; }

    public bool AllowRead { get; init; }
    public bool AllowWrite { get; init; }
    public bool AllowCreate { get; init; }
    public bool AllowDelete { get; init; }
    public bool AllowSubmit { get; init; }
    public bool AllowCancel { get; init; }
    public bool AllowAmend { get; init; }
    public bool AllowImport { get; init; }
    public bool AllowExport { get; init; }
    public bool ShowInMenu { get; init; }
}


