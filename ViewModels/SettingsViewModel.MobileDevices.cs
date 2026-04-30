using System.Collections.ObjectModel;
using System.Threading.Tasks;
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public partial class SettingsViewModel
{
    [ObservableProperty]
    private ObservableCollection<WmsRegisteredDeviceRow> _registeredDevices = new();

    [ObservableProperty]
    private string _registeredDevicesMessage =
        "Use Refresh after logging in on this PC (WMS API Key must be an admin token, e.g. sysadmin). Approve pending devices so the mobile app can leave settings-only mode.";

    [ObservableProperty]
    private bool _isLoadingRegisteredDevices;

    /// <summary>Query filter for GET /api/auth/admin/devices: pending, approved, disabled, or all.</summary>
    [ObservableProperty]
    private string _registeredDeviceStatusFilter = "all";

    [RelayCommand]
    private async Task RefreshRegisteredDevicesAsync()
    {
        IsLoadingRegisteredDevices = true;
        try
        {
            var (ok, msg, rows) =
                await WmsMobileDeviceAdminService.ListDevicesAsync(Settings, RegisteredDeviceStatusFilter);
            RegisteredDevicesMessage = msg;
            RegisteredDevices.Clear();
            if (ok)
            {
                foreach (var r in rows)
                    RegisteredDevices.Add(r);
            }
            else
            {
                MessageBox.Show(msg, "Mobile devices", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }
        finally
        {
            IsLoadingRegisteredDevices = false;
        }
    }

    [RelayCommand]
    private async Task ApproveRegisteredDeviceAsync(WmsRegisteredDeviceRow? row)
    {
        if (row == null || !row.CanApprove)
            return;

        var (ok, msg) = await WmsMobileDeviceAdminService.ApproveDeviceAsync(Settings, row.DeviceId);
        MessageBox.Show(
            msg,
            "Mobile devices",
            MessageBoxButton.OK,
            ok ? MessageBoxImage.Information : MessageBoxImage.Warning);
        if (ok)
            await RefreshRegisteredDevicesAsync();
    }

    [RelayCommand]
    private async Task DisableRegisteredDeviceAsync(WmsRegisteredDeviceRow? row)
    {
        if (row == null || !row.CanDisable)
            return;

        var confirm = MessageBox.Show(
            $"Disable this approved device?\n\n{row.DeviceId}\n\nThis marks the device as disabled, ends any active mobile sessions on it, and releases carton locks for those sessions. Use Approve on the row again to re-enable.",
            "Disable mobile device",
            MessageBoxButton.YesNo,
            MessageBoxImage.Warning,
            MessageBoxResult.No);
        if (confirm != MessageBoxResult.Yes)
            return;

        var (ok, msg) = await WmsMobileDeviceAdminService.DisableDeviceAsync(Settings, row.DeviceId);
        MessageBox.Show(
            msg,
            "Mobile devices",
            MessageBoxButton.OK,
            ok ? MessageBoxImage.Information : MessageBoxImage.Warning);
        if (ok)
            await RefreshRegisteredDevicesAsync();
    }

    [RelayCommand]
    private async Task DeleteRegisteredDeviceAsync(WmsRegisteredDeviceRow? row)
    {
        if (row == null || !row.CanDelete)
            return;

        var confirm = MessageBox.Show(
            $"Permanently delete this device from the registry?\n\n{row.DeviceId}\n\nThis cannot be undone. Any active mobile sessions on that device will be ended. The phone can register again on next login (pending approval).",
            "Delete mobile device",
            MessageBoxButton.YesNo,
            MessageBoxImage.Warning,
            MessageBoxResult.No);
        if (confirm != MessageBoxResult.Yes)
            return;

        var (ok, msg) = await WmsMobileDeviceAdminService.DeleteDeviceAsync(Settings, row.DeviceId);
        MessageBox.Show(
            msg,
            "Mobile devices",
            MessageBoxButton.OK,
            ok ? MessageBoxImage.Information : MessageBoxImage.Warning);
        if (ok)
            await RefreshRegisteredDevicesAsync();
    }
}
