using System.Collections.ObjectModel;
using System.Threading.Tasks;
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Wms.Desktop.Models;
using Wms.Desktop.Services;
using Wms.Desktop.Windows;

namespace Wms.Desktop.ViewModels;

public partial class SettingsViewModel
{
    [ObservableProperty]
    private ObservableCollection<WmsMobileSessionRow> _activeMobileSessions = new();

    [ObservableProperty]
    private WmsMobileSessionRow? _selectedMobileSession;

    [ObservableProperty]
    private bool _isLoadingMobileSessions;

    [ObservableProperty]
    private string _mobileSessionsMessage =
        "Supervisor or admin WMS token required. Refresh loads active mobile JWT sessions (not revoked, not expired) and carton lock counts.";

    [ObservableProperty]
    private string _manualReleaseUserCode = "";

    [ObservableProperty]
    private string _manualReleaseDeviceId = "";

    [RelayCommand]
    private async Task RefreshMobileSessionsAsync()
    {
        IsLoadingMobileSessions = true;
        try
        {
            var (ok, msg, rows) = await WmsMobileSessionAdminService.ListActiveSessionsAsync(Settings);
            MobileSessionsMessage = msg;
            ActiveMobileSessions.Clear();
            if (ok)
            {
                foreach (var r in rows)
                    ActiveMobileSessions.Add(r);
            }
            else
            {
                MessageBox.Show(msg, "Mobile sessions", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }
        finally
        {
            IsLoadingMobileSessions = false;
        }
    }

    private static string? PromptReleaseReason(Window? owner, string summary)
    {
        var dlg = new MobileSessionReleaseReasonWindow(summary)
        {
            Owner = owner ?? Application.Current.MainWindow,
        };
        var ok = dlg.ShowDialog() == true;
        return ok ? dlg.Reason : null;
    }

    [RelayCommand]
    private async Task ReleaseSelectedMobileSessionAsync()
    {
        var row = SelectedMobileSession;
        if (row == null || string.IsNullOrWhiteSpace(row.Jti))
        {
            MessageBox.Show("Select a session row first.", "Release mobile session", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var reason = PromptReleaseReason(
            Application.Current.MainWindow,
            $"Release session (JTI)\n\nUser: {row.UserCode}\nDevice: {row.DeviceId}\nActive locks: {row.ActiveLocks}");
        if (reason == null)
            return;

        var (ok, msg, _, _) = await WmsMobileSessionAdminService.ReleaseAsync(Settings, "jti", row.Jti, null, null, reason);
        MessageBox.Show(msg, "Release mobile session", MessageBoxButton.OK, ok ? MessageBoxImage.Information : MessageBoxImage.Warning);
        if (ok)
            ErrorLogService.LogInfo($"Mobile session released (jti): {row.Jti} by desktop settings. Reason logged on server.");
        if (ok)
            await RefreshMobileSessionsAsync();
    }

    [RelayCommand]
    private async Task ReleaseMobileSessionsForSelectedUserAsync()
    {
        var row = SelectedMobileSession;
        if (row == null || string.IsNullOrWhiteSpace(row.UserCode))
        {
            MessageBox.Show("Select a session row (for user code) or type a user code below.", "Release mobile session", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        await ReleaseByUserCoreAsync(row.UserCode);
    }

    [RelayCommand]
    private async Task ReleaseMobileSessionsForSelectedDeviceAsync()
    {
        var row = SelectedMobileSession;
        if (row == null || string.IsNullOrWhiteSpace(row.DeviceId))
        {
            MessageBox.Show("Select a session row (for device) or type a device id below.", "Release mobile session", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        await ReleaseByDeviceCoreAsync(row.DeviceId);
    }

    [RelayCommand]
    private async Task ReleaseMobileSessionsByManualUserAsync()
    {
        var u = (ManualReleaseUserCode ?? "").Trim();
        if (string.IsNullOrWhiteSpace(u))
        {
            MessageBox.Show("Enter a user code.", "Release mobile session", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        await ReleaseByUserCoreAsync(u);
    }

    [RelayCommand]
    private async Task ReleaseMobileSessionsByManualDeviceAsync()
    {
        var d = (ManualReleaseDeviceId ?? "").Trim();
        if (string.IsNullOrWhiteSpace(d))
        {
            MessageBox.Show("Enter a device id.", "Release mobile session", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        await ReleaseByDeviceCoreAsync(d);
    }

    private async Task ReleaseByUserCoreAsync(string userCode)
    {
        var confirm = MessageBox.Show(
            $"Release all active mobile sessions for user:\n\n{userCode}\n\nThis revokes every active session for that user and deletes related carton locks on the server. Scan history is not deleted.\n\nContinue?",
            "Release mobile session",
            MessageBoxButton.YesNo,
            MessageBoxImage.Warning,
            MessageBoxResult.No);
        if (confirm != MessageBoxResult.Yes)
            return;

        var reason = PromptReleaseReason(
            Application.Current.MainWindow,
            $"Release all sessions for user\n\n{userCode}");
        if (reason == null)
            return;

        var (ok, msg, _, _) = await WmsMobileSessionAdminService.ReleaseAsync(Settings, "user", null, userCode, null, reason);
        MessageBox.Show(msg, "Release mobile session", MessageBoxButton.OK, ok ? MessageBoxImage.Information : MessageBoxImage.Warning);
        if (ok)
            ErrorLogService.LogInfo($"Mobile sessions released (user): {userCode}. Reason logged on server.");
        if (ok)
            await RefreshMobileSessionsAsync();
    }

    private async Task ReleaseByDeviceCoreAsync(string deviceId)
    {
        var confirm = MessageBox.Show(
            $"Release all active mobile sessions for device:\n\n{deviceId}\n\nThis revokes sessions tied to that device and deletes related carton locks. Scan history is not deleted.\n\nContinue?",
            "Release mobile session",
            MessageBoxButton.YesNo,
            MessageBoxImage.Warning,
            MessageBoxResult.No);
        if (confirm != MessageBoxResult.Yes)
            return;

        var reason = PromptReleaseReason(
            Application.Current.MainWindow,
            $"Release all sessions for device\n\n{deviceId}");
        if (reason == null)
            return;

        var (ok, msg, _, _) = await WmsMobileSessionAdminService.ReleaseAsync(Settings, "device", null, null, deviceId, reason);
        MessageBox.Show(msg, "Release mobile session", MessageBoxButton.OK, ok ? MessageBoxImage.Information : MessageBoxImage.Warning);
        if (ok)
            ErrorLogService.LogInfo($"Mobile sessions released (device): {deviceId}. Reason logged on server.");
        if (ok)
            await RefreshMobileSessionsAsync();
    }
}
