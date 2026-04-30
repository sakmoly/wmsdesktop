using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// WMS API admin calls for mobile device registration (uses Settings.ApiKey as Bearer JWT).
/// </summary>
public static class WmsMobileDeviceAdminService
{
    /// <summary>
    /// Normalizes settings URL to .../api (handles both http://host:3000 and http://host:3000/api).
    /// </summary>
    public static string GetWmsApiBase(WmsSettings settings)
    {
        var b = (settings.ApiEndpointUrl ?? "").TrimEnd('/');
        if (string.IsNullOrWhiteSpace(b))
            return "";
        if (b.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
            return b;
        return $"{b}/api";
    }

    public static async Task<(bool Ok, string Message, IReadOnlyList<WmsRegisteredDeviceRow> Rows)> ListDevicesAsync(
        WmsSettings settings,
        string statusFilter = "all")
    {
        if (string.IsNullOrWhiteSpace(settings.ApiKey) || settings.ApiKey.Contains("MOCK-KEY", StringComparison.OrdinalIgnoreCase))
            return (false, "WMS API Key is not set. Log in on this desktop and ensure the token is saved under Settings → WMS API Key.", Array.Empty<WmsRegisteredDeviceRow>());

        var apiBase = GetWmsApiBase(settings);
        if (string.IsNullOrWhiteSpace(apiBase))
            return (false, "WMS API Endpoint URL is not configured.", Array.Empty<WmsRegisteredDeviceRow>());

        var safe = Uri.EscapeDataString(statusFilter);
        var url = $"{apiBase}/auth/admin/devices?status={safe}";

        try
        {
            using var http = new HttpClient();
            http.Timeout = TimeSpan.FromSeconds(30);
            http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);

            var response = await http.GetAsync(url);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
                return (false, $"API error ({(int)response.StatusCode}): {body}", Array.Empty<WmsRegisteredDeviceRow>());

            var env = JsonSerializer.Deserialize<DeviceListEnvelope>(body, JsonOptions());
            if (env?.Data?.Devices == null)
                return (false, "Unexpected response from server.", Array.Empty<WmsRegisteredDeviceRow>());

            var rows = new List<WmsRegisteredDeviceRow>();
            foreach (var d in env.Data.Devices)
            {
                rows.Add(new WmsRegisteredDeviceRow
                {
                    DeviceId = d.DeviceId ?? "",
                    Status = d.Status ?? "",
                    Label = d.Label,
                    CreatedAtDisplay = FormatApiDate(d.CreatedAt),
                    ApprovedAtDisplay = FormatApiDate(d.ApprovedAt),
                });
            }

            return (true, $"Loaded {rows.Count} device(s).", rows);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("WmsMobileDeviceAdminService.ListDevicesAsync", ex);
            return (false, ex.Message, Array.Empty<WmsRegisteredDeviceRow>());
        }
    }

    public static async Task<(bool Ok, string Message)> ApproveDeviceAsync(WmsSettings settings, string deviceId)
    {
        if (string.IsNullOrWhiteSpace(deviceId))
            return (false, "Device id is required.");

        if (string.IsNullOrWhiteSpace(settings.ApiKey) || settings.ApiKey.Contains("MOCK-KEY", StringComparison.OrdinalIgnoreCase))
            return (false, "WMS API Key is not set.");

        var apiBase = GetWmsApiBase(settings);
        if (string.IsNullOrWhiteSpace(apiBase))
            return (false, "WMS API Endpoint URL is not configured.");

        var enc = Uri.EscapeDataString(deviceId);
        var url = $"{apiBase}/auth/admin/devices/{enc}/approve";

        try
        {
            using var http = new HttpClient();
            http.Timeout = TimeSpan.FromSeconds(30);
            http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);

            var response = await http.PostAsync(url, new StringContent("{}", System.Text.Encoding.UTF8, "application/json"));
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
                return (false, $"API error ({(int)response.StatusCode}): {body}");

            try
            {
                var node = JsonNode.Parse(body);
                var changed = node?["data"]?["approved"]?.GetValue<bool>() ?? false;
                return changed
                    ? (true, "Device approved (or re-enabled from disabled).")
                    : (true, "No change: device may already be approved, or device_id was not found.");
            }
            catch
            {
                return (true, "Request completed.");
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("WmsMobileDeviceAdminService.ApproveDeviceAsync", ex);
            return (false, ex.Message);
        }
    }

    public static async Task<(bool Ok, string Message)> DisableDeviceAsync(WmsSettings settings, string deviceId)
    {
        if (string.IsNullOrWhiteSpace(deviceId))
            return (false, "Device id is required.");

        if (string.IsNullOrWhiteSpace(settings.ApiKey) || settings.ApiKey.Contains("MOCK-KEY", StringComparison.OrdinalIgnoreCase))
            return (false, "WMS API Key is not set.");

        var apiBase = GetWmsApiBase(settings);
        if (string.IsNullOrWhiteSpace(apiBase))
            return (false, "WMS API Endpoint URL is not configured.");

        var enc = Uri.EscapeDataString(deviceId);
        var url = $"{apiBase}/auth/admin/devices/{enc}/disable";

        try
        {
            using var http = new HttpClient();
            http.Timeout = TimeSpan.FromSeconds(30);
            http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);

            var response = await http.PostAsync(url, new StringContent("{}", System.Text.Encoding.UTF8, "application/json"));
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
                return (false, $"API error ({(int)response.StatusCode}): {body}");

            return (true, "Device disabled. Active sessions on that device have been ended.");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("WmsMobileDeviceAdminService.DisableDeviceAsync", ex);
            return (false, ex.Message);
        }
    }

    public static async Task<(bool Ok, string Message)> DeleteDeviceAsync(WmsSettings settings, string deviceId)
    {
        if (string.IsNullOrWhiteSpace(deviceId))
            return (false, "Device id is required.");

        if (string.IsNullOrWhiteSpace(settings.ApiKey) || settings.ApiKey.Contains("MOCK-KEY", StringComparison.OrdinalIgnoreCase))
            return (false, "WMS API Key is not set.");

        var apiBase = GetWmsApiBase(settings);
        if (string.IsNullOrWhiteSpace(apiBase))
            return (false, "WMS API Endpoint URL is not configured.");

        var enc = Uri.EscapeDataString(deviceId);
        var url = $"{apiBase}/auth/admin/devices/{enc}";

        try
        {
            using var http = new HttpClient();
            http.Timeout = TimeSpan.FromSeconds(30);
            http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);

            var response = await http.DeleteAsync(url);
            var body = await response.Content.ReadAsStringAsync();
            if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
                return (false, "Device was not found (already removed).");
            if (!response.IsSuccessStatusCode)
                return (false, $"API error ({(int)response.StatusCode}): {body}");

            return (true, "Device removed from the registry. Active sessions on that device were ended.");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("WmsMobileDeviceAdminService.DeleteDeviceAsync", ex);
            return (false, ex.Message);
        }
    }

    private static JsonSerializerOptions JsonOptions() =>
        new()
        {
            PropertyNameCaseInsensitive = true,
        };

    private static string? FormatApiDate(DateTime? dt)
    {
        if (!dt.HasValue) return null;
        var v = dt.Value;
        if (v.Year < 2) return null;
        return v.ToLocalTime().ToString("g");
    }

    private sealed class DeviceListEnvelope
    {
        public bool Ok { get; set; }
        public DeviceListData? Data { get; set; }
    }

    private sealed class DeviceListData
    {
        public List<DeviceDto>? Devices { get; set; }
    }

    private sealed class DeviceDto
    {
        [JsonPropertyName("device_id")]
        public string? DeviceId { get; set; }

        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("label")]
        public string? Label { get; set; }

        [JsonPropertyName("created_at")]
        public DateTime? CreatedAt { get; set; }

        [JsonPropertyName("approved_at")]
        public DateTime? ApprovedAt { get; set; }
    }
}
