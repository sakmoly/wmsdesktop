using System.Collections.ObjectModel;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class RoleListViewModel : BaseViewModel
{
    public ObservableCollection<WmsRole> Roles { get; } = new();
    public ObservableCollection<WmsRolePermission> Permissions { get; } = new();

    public RoleListViewModel()
    {
        // Mock roles
        Roles.Add(new WmsRole { RoleName = "Warehouse User", IsActive = true, MobileAccess = true });
        Roles.Add(new WmsRole { RoleName = "Warehouse Supervisor", IsActive = true, MobileAccess = true });
        Roles.Add(new WmsRole { RoleName = "Brand Manager", IsActive = true, MobileAccess = false });
        Roles.Add(new WmsRole { RoleName = "System Manager", IsActive = true, MobileAccess = false });

        // Mock permissions (simplified subset)
        Permissions.Add(new WmsRolePermission
        {
            PermissionId = "PERM-ASN-WH-USER",
            RoleName = "Warehouse User",
            DocTypeName = "Advance Shipping Notice",
            PermLevel = 0,
            AllowRead = true,
            AllowWrite = true,
            AllowCreate = false,
            AllowDelete = false,
            AllowSubmit = false,
            AllowCancel = false,
            AllowAmend = false,
            AllowImport = false,
            AllowExport = false,
            ShowInMenu = true
        });

        Permissions.Add(new WmsRolePermission
        {
            PermissionId = "PERM-DP-BM",
            RoleName = "Brand Manager",
            DocTypeName = "Distribution Plan",
            PermLevel = 0,
            AllowRead = true,
            AllowWrite = true,
            AllowCreate = true,
            AllowDelete = false,
            AllowSubmit = true,
            AllowCancel = false,
            AllowAmend = true,
            AllowImport = true,
            AllowExport = true,
            ShowInMenu = true
        });

        Permissions.Add(new WmsRolePermission
        {
            PermissionId = "PERM-SETTINGS-SM",
            RoleName = "System Manager",
            DocTypeName = "Printechs WMS Settings",
            PermLevel = 0,
            AllowRead = true,
            AllowWrite = true,
            AllowCreate = true,
            AllowDelete = true,
            AllowSubmit = false,
            AllowCancel = false,
            AllowAmend = false,
            AllowImport = false,
            AllowExport = false,
            ShowInMenu = true
        });
    }
}


