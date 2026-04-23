using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Warehouse record from ERPNext Warehouse resource API.
/// Many sites disallow querying field <c>code</c>; we use <c>name</c> (document ID) as the local warehouse key.
/// </summary>
public class ErpNextWarehouse
{
    /// <summary>ERPNext document name (primary key), e.g. WH-MAIN or Main Warehouse - MAATC.</summary>
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    /// <summary>Optional; not always permitted in API <c>fields</c> — prefer <see cref="Name"/> when empty.</summary>
    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;

    [JsonPropertyName("warehouse_name")]
    public string WarehouseName { get; set; } = string.Empty;

    [JsonPropertyName("warehouse_type")]
    public string? WarehouseType { get; set; }

    /// <summary>Stable key for tabWarehouse.code: code if set, else document name.</summary>
    public string ResolvedCode =>
        !string.IsNullOrWhiteSpace(Code) ? Code.Trim() : Name.Trim();
}

/// <summary>
/// Response from ERPNext resource list (GET /api/resource/Warehouse)
/// </summary>
public class ErpNextWarehouseListResponse
{
    [JsonPropertyName("data")]
    public List<ErpNextWarehouse>? Data { get; set; }
}

/// <summary>
/// Fetches warehouses from ERPNext API (resource list: code, warehouse_name, warehouse_type; filter is_group=0, warehouse_type in Store/Warehouse)
/// </summary>
public static class ErpNextWarehouseApiService
{
    /// <summary>
    /// Fetch warehouses from ERPNext. Uses <c>name</c> (not <c>code</c>) in <c>fields</c> because many sites return
    /// "Field not permitted in query: code". Paged with <c>limit_page_length</c> (default API max is 20 without it).
    /// </summary>
    public static async Task<List<ErpNextWarehouse>?> FetchWarehousesFromErpNextAsync(
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
            ErrorLogService.LogInfo($"ErpNextWarehouseApiService: {label} API URL or key not configured");
            return null;
        }

        var baseUrl = ExtractBaseUrl(erpNextUrl);
        // Prefer "code" in fields (short key, e.g. 001-Unaizah) so tabWarehouse.code differs from warehouse_name.
        // Some sites reject "code" in GET; on HTTP failure we retry once without it (document name becomes ResolvedCode).
        const string fieldsJsonWithCode = "[\"name\",\"code\",\"warehouse_name\",\"warehouse_type\"]";
        const string fieldsJsonNoCode = "[\"name\",\"warehouse_name\",\"warehouse_type\"]";
        var filtersStrict = Uri.EscapeDataString("[[\"is_group\",\"=\",0],[\"warehouse_type\",\"in\",[\"Store\",\"Warehouse\"]]]");
        const int pageLen = 500;

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(60);
            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("token", erpNextApiKey);

            async Task<List<ErpNextWarehouse>?> TryFetch(string filtersEncoded, string filterLabel, bool includeCodeField)
            {
                var fieldsEncoded = Uri.EscapeDataString(includeCodeField ? fieldsJsonWithCode : fieldsJsonNoCode);
                var all = new List<ErpNextWarehouse>();
                var start = 0;
                while (true)
                {
                    var apiUrl =
                        $"{baseUrl}/api/resource/Warehouse?fields={fieldsEncoded}&filters={filtersEncoded}&limit_page_length={pageLen}&limit_start={start}";
                    ErrorLogService.LogInfo($"ErpNextWarehouseApiService: [{label}] Fetching warehouses ({filterLabel}) limit_start={start}");

                    var response = await httpClient.GetAsync(apiUrl);
                    var body = await response.Content.ReadAsStringAsync();
                    if (!response.IsSuccessStatusCode)
                    {
                        if (includeCodeField)
                        {
                            ErrorLogService.LogInfo(
                                $"ErpNextWarehouseApiService: [{label}] Warehouse GET failed with field code ({response.StatusCode}); retrying without code field.");
                            return await TryFetch(filtersEncoded, filterLabel + " (no code field)", includeCodeField: false);
                        }
                        ErrorLogService.LogError(
                            $"ErpNextWarehouseApiService: [{label}] API returned {response.StatusCode}: {body}", null);
                        return null;
                    }

                    var listResponse = JsonSerializer.Deserialize<ErpNextWarehouseListResponse>(body);
                    var page = listResponse?.Data ?? new List<ErpNextWarehouse>();
                    if (page.Count == 0)
                        break;
                    all.AddRange(page);
                    if (page.Count < pageLen)
                        break;
                    start += pageLen;
                }

                ErrorLogService.LogInfo($"ErpNextWarehouseApiService: [{label}] Fetched {all.Count} warehouses ({filterLabel})");
                return all;
            }

            var strict = await TryFetch(filtersStrict, "is_group=0 + type Store/Warehouse", includeCodeField: true);
            if (strict != null && strict.Count > 0)
                return strict;

            // Retry with looser filter if strict returned nothing (or failed) — some sites use other warehouse_type values.
            if (strict == null)
                return null;

            var filtersLoose = Uri.EscapeDataString("[[\"is_group\",\"=\",0]]");
            return await TryFetch(filtersLoose, "is_group=0 only", includeCodeField: true);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ErpNextWarehouseApiService: [{label}] Error fetching warehouses: {ex.Message}", ex);
            return null;
        }
    }

    /// <summary>
    /// Use only scheme + host + port so Warehouse path is never appended to a full item/resource URL.
    /// E.g. http://host:88/api/method/... or http://host:88/api/resource/Warehouse?... -> http://host:88
    /// </summary>
    private static string ExtractBaseUrl(string apiEndpointUrl)
    {
        var input = apiEndpointUrl?.Trim() ?? string.Empty;
        if (string.IsNullOrEmpty(input))
            return input;
        try
        {
            if (Uri.TryCreate(input, UriKind.Absolute, out var uri) &&
                (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
                return uri.GetLeftPart(UriPartial.Authority);
        }
        catch { /* fallback */ }
        var url = input.TrimEnd('/');
        if (url.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
            url = url.Substring(0, url.Length - 4).TrimEnd('/');
        return url;
    }
}
