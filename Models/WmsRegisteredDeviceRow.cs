namespace Wms.Desktop.Models;

/// <summary>
/// One row from WMS API GET /api/auth/admin/devices (mobile device registry).
/// </summary>
public sealed class WmsRegisteredDeviceRow
{
    public string DeviceId { get; set; } = "";

    public string Status { get; set; } = "";

    public string? Label { get; set; }

    public string? CreatedAtDisplay { get; set; }

    public string? ApprovedAtDisplay { get; set; }

    /// <summary>Approve first-time (pending) or re-enable after admin disabled the device.</summary>
    public bool CanApprove =>
        string.Equals(Status, "pending", System.StringComparison.OrdinalIgnoreCase)
        || string.Equals(Status, "disabled", System.StringComparison.OrdinalIgnoreCase);

    /// <summary>Disable only when the device is currently approved and in use path.</summary>
    public bool CanDisable =>
        string.Equals(Status, "approved", System.StringComparison.OrdinalIgnoreCase);

    /// <summary>Permanently remove this device row from the server registry (admin).</summary>
    public bool CanDelete => !string.IsNullOrWhiteSpace(DeviceId);
}
