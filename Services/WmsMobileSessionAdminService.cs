using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// WMS API admin/supervisor: list active mobile sessions and release (revoke + carton locks + audit).
/// </summary>
public static class WmsMobileSessionAdminService
{
    public static async Task<(bool Ok, string Message, IReadOnlyList<WmsMobileSessionRow> Rows)> ListActiveSessionsAsync(
        WmsSettings settings)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiKey) || settings.ApiKey.Contains("MOCK-KEY", StringComparison.OrdinalIgnoreCase))
            return (false, "WMS API Key is not set. Log in on this desktop with an admin or supervisor account.", Array.Empty<WmsMobileSessionRow>());

        var apiBase = WmsMobileDeviceAdminService.GetWmsApiBase(settings);
        if (string.IsNullOrWhiteSpace(apiBase))
            return (false, "WMS API Endpoint URL is not configured.", Array.Empty<WmsMobileSessionRow>());

        var url = $"{apiBase}/auth/admin/mobile-sessions";
        try
        {
            using var http = new HttpClient();
            http.Timeout = TimeSpan.FromSeconds(30);
            http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);

            var response = await http.GetAsync(url);
            var body = await response.Content.ReadAsStringAsync();
            if (response.StatusCode == System.Net.HttpStatusCode.Forbidden)
                return (false, "Administrator or supervisor role required for this WMS API token.", Array.Empty<WmsMobileSessionRow>());
            if (!response.IsSuccessStatusCode)
                return (false, $"API error ({(int)response.StatusCode}): {body}", Array.Empty<WmsMobileSessionRow>());

            var env = JsonSerializer.Deserialize<SessionListEnvelope>(body, JsonOptions());
            if (env?.Data?.Sessions == null)
                return (false, "Unexpected response from server.", Array.Empty<WmsMobileSessionRow>());

            return (true, $"Loaded {env.Data.Sessions.Count} active session(s).", env.Data.Sessions);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("WmsMobileSessionAdminService.ListActiveSessionsAsync", ex);
            return (false, ex.Message, Array.Empty<WmsMobileSessionRow>());
        }
    }

    /// <param name="scope">jti | user | device</param>
    public static async Task<(bool Ok, string Message, int SessionsRevoked, int LocksDeleted)> ReleaseAsync(
        WmsSettings settings,
        string scope,
        string? jti,
        string? userCode,
        string? deviceId,
        string reason)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiKey) || settings.ApiKey.Contains("MOCK-KEY", StringComparison.OrdinalIgnoreCase))
            return (false, "WMS API Key is not set.", 0, 0);

        var apiBase = WmsMobileDeviceAdminService.GetWmsApiBase(settings);
        if (string.IsNullOrWhiteSpace(apiBase))
            return (false, "WMS API Endpoint URL is not configured.", 0, 0);

        var url = $"{apiBase}/auth/admin/mobile-sessions/release";
        var payload = new Dictionary<string, object?>
        {
            ["scope"] = scope.Trim().ToLowerInvariant(),
            ["reason"] = reason.Trim(),
        };
        if (!string.IsNullOrWhiteSpace(jti)) payload["jti"] = jti.Trim();
        if (!string.IsNullOrWhiteSpace(userCode)) payload["user_code"] = userCode.Trim();
        if (!string.IsNullOrWhiteSpace(deviceId)) payload["device_id"] = deviceId.Trim();

        var json = JsonSerializer.Serialize(payload);
        try
        {
            using var http = new HttpClient();
            http.Timeout = TimeSpan.FromSeconds(30);
            http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);

            using var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await http.PostAsync(url, content);
            var body = await response.Content.ReadAsStringAsync();
            if (response.StatusCode == System.Net.HttpStatusCode.Forbidden)
                return (false, "Administrator or supervisor role required.", 0, 0);
            if (!response.IsSuccessStatusCode)
                return (false, $"API error ({(int)response.StatusCode}): {body}", 0, 0);

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (!root.TryGetProperty("data", out var data))
                return (true, "Release completed.", 0, 0);
            var sr = data.TryGetProperty("sessions_revoked", out var s) ? s.GetInt32() : 0;
            var ld = data.TryGetProperty("locks_deleted", out var l) ? l.GetInt32() : 0;
            return (true, $"Released: {sr} session(s), {ld} carton lock row(s) removed.", sr, ld);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("WmsMobileSessionAdminService.ReleaseAsync", ex);
            return (false, ex.Message, 0, 0);
        }
    }

    private static JsonSerializerOptions JsonOptions() =>
        new() { PropertyNameCaseInsensitive = true };

    private sealed class SessionListEnvelope
    {
        public bool Ok { get; set; }
        public SessionListData? Data { get; set; }
    }

    private sealed class SessionListData
    {
        public List<WmsMobileSessionRow>? Sessions { get; set; }
    }
}
