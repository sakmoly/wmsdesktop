using System;
using System.Text.Json.Serialization;

namespace Wms.Desktop.Models;

/// <summary>Row from GET /api/auth/admin/mobile-sessions (active mobile JWT sessions).</summary>
public sealed class WmsMobileSessionRow
{
    [JsonPropertyName("jti")]
    public string Jti { get; set; } = "";

    [JsonPropertyName("user_code")]
    public string UserCode { get; set; } = "";

    [JsonPropertyName("device_id")]
    public string DeviceId { get; set; } = "";

    [JsonPropertyName("created_at")]
    public DateTime? CreatedAt { get; set; }

    [JsonPropertyName("expires_at")]
    public DateTime? ExpiresAt { get; set; }

    [JsonPropertyName("active_locks")]
    public int ActiveLocks { get; set; }

    public string CreatedAtDisplay =>
        CreatedAt is { } d && d.Year > 1 ? d.ToLocalTime().ToString("g") : "—";

    public string ExpiresAtDisplay =>
        ExpiresAt is { } d && d.Year > 1 ? d.ToLocalTime().ToString("g") : "—";
}
