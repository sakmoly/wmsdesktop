using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public class ErpNextItemGroup
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("parent_item_group")]
    public string? ParentItemGroup { get; set; }

    [JsonPropertyName("is_group")]
    public int IsGroup { get; set; }
}

public class ErpNextItemGroupListResponse
{
    [JsonPropertyName("data")]
    public List<ErpNextItemGroup>? Data { get; set; }
}

public static class ErpNextItemGroupApiService
{
    public static async Task<List<ErpNextItemGroup>?> FetchItemGroupsFromErpNextAsync(
        WmsSettings settings,
        string? overrideBaseUrl = null,
        string? overrideApiKey = null,
        string? endpointName = null)
    {
        var erpNextUrl = !string.IsNullOrWhiteSpace(overrideBaseUrl)
            ? overrideBaseUrl
            : (!string.IsNullOrWhiteSpace(settings.ErpNextApiUrl) ? settings.ErpNextApiUrl : settings.ApiEndpointUrl);
        var erpNextApiKey = !string.IsNullOrWhiteSpace(overrideApiKey)
            ? overrideApiKey
            : (!string.IsNullOrWhiteSpace(settings.ErpNextApiKey) ? settings.ErpNextApiKey : settings.ApiKey);
        var label = string.IsNullOrWhiteSpace(endpointName) ? "ERPNext" : endpointName;

        if (string.IsNullOrWhiteSpace(erpNextUrl) || string.IsNullOrWhiteSpace(erpNextApiKey))
        {
            ErrorLogService.LogInfo($"ErpNextItemGroupApiService: {label} API URL or key not configured");
            return null;
        }

        var baseUrl = ExtractBaseUrl(erpNextUrl);
        var fields = Uri.EscapeDataString("[\"name\",\"parent_item_group\",\"is_group\"]");
        // ERPNext defaults to limit_page_length=20 if omitted — fetch in pages until empty
        const int pageSize = 1000;

        ErrorLogService.LogInfo($"ErpNextItemGroupApiService: [{label}] Fetching item groups (page size {pageSize})");

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(120);
            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("token", erpNextApiKey);

            var all = new List<ErpNextItemGroup>();
            var start = 0;
            while (true)
            {
                var apiUrl =
                    $"{baseUrl}/api/resource/Item%20Group?fields={fields}" +
                    $"&limit_start={start}&limit_page_length={pageSize}";

                var response = await httpClient.GetAsync(apiUrl);
                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    ErrorLogService.LogError($"ErpNextItemGroupApiService: API returned {response.StatusCode}: {errorContent}", null);
                    return start == 0 ? null : all;
                }

                var json = await response.Content.ReadAsStringAsync();
                var listResponse = JsonSerializer.Deserialize<ErpNextItemGroupListResponse>(json);
                var page = listResponse?.Data ?? new List<ErpNextItemGroup>();
                if (page.Count == 0)
                    break;
                all.AddRange(page);
                ErrorLogService.LogInfo($"ErpNextItemGroupApiService: [{label}] Page start={start}, got {page.Count} (total so far {all.Count})");
                if (page.Count < pageSize)
                    break;
                start += pageSize;
            }

            ErrorLogService.LogInfo($"ErpNextItemGroupApiService: [{label}] Fetched {all.Count} item groups total");
            return all;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ErpNextItemGroupApiService: [{label}] Error fetching item groups: {ex.Message}", ex);
            return null;
        }
    }

    private static string ExtractBaseUrl(string apiEndpointUrl)
    {
        var input = apiEndpointUrl?.Trim() ?? string.Empty;
        if (string.IsNullOrEmpty(input)) return input;
        try
        {
            if (Uri.TryCreate(input, UriKind.Absolute, out var uri) &&
                (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
                return uri.GetLeftPart(UriPartial.Authority);
        }
        catch { }
        var url = input.TrimEnd('/');
        if (url.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
            url = url.Substring(0, url.Length - 4).TrimEnd('/');
        return url;
    }
}
