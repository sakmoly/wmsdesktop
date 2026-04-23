using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// One bin/location row from ERPNext (resource API or <c>list_locations</c> method).
/// </summary>
public sealed class ErpNextBinLocationRow
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("bin_id")]
    public string? BinId { get; set; }

    [JsonPropertyName("bin_code")]
    public string? BinCode { get; set; }

    [JsonPropertyName("location_id")]
    public string? LocationId { get; set; }

    [JsonPropertyName("warehouse")]
    public string? Warehouse { get; set; }

    [JsonPropertyName("zone")]
    public string? Zone { get; set; }

    [JsonPropertyName("aisle")]
    public string? Aisle { get; set; }

    [JsonPropertyName("rack")]
    public string? Rack { get; set; }

    [JsonPropertyName("level")]
    public string? Level { get; set; }

    [JsonPropertyName("position")]
    public string? Position { get; set; } // or "bin_position" on some sites — optional second pass via raw JSON if needed

    [JsonPropertyName("location_type")]
    public string? LocationType { get; set; }

    [JsonPropertyName("location_type_detailed")]
    public string? LocationTypeDetailed { get; set; }

    [JsonPropertyName("priority")]
    public string? Priority { get; set; }

    /// <summary>ERP Warehouse link name (printechs_wms UI); mapped in list parser.</summary>
    [JsonPropertyName("erp_warehouse")]
    public string? ErpWarehouse { get; set; }
}

internal sealed class ErpNextBinLocationListResponse
{
    [JsonPropertyName("data")]
    public List<ErpNextBinLocationRow>? Data { get; set; }
}

/// <summary>
/// Fetches bin/location master: prefers <c>printechs_wms.api.location.list_locations</c> (same as Postman),
/// then falls back to <c>/api/resource/WMS Bin Location</c>.
/// </summary>
public static class ErpNextBinLocationApiService
{
    public const string BinLocationDocType = "WMS Bin Location";

    /// <summary>Whitelisted method used when Settings → Company is set (must match ERPNext company name).</summary>
    public const string ListLocationsMethod = "printechs_wms.api.location.list_locations";

    private static int _listLocationsSampleKeysLogged;

    /// <summary>Set on failure so UI can show ERPNext response snippet without reading log files.</summary>
    public static string? LastFetchErrorDetail { get; private set; }

    /// <summary>
    /// Paged fetch of all bin locations for one ERPNext endpoint.
    /// Returns (rows, null) on success, or (null, error detail) on total failure.
    /// Tries several <c>fields</c> lists — many sites disallow <c>bin_id</c>/<c>bin_code</c> in list queries.
    /// </summary>
    public static async Task<(List<ErpNextBinLocationRow>? Items, string? ErrorDetail)> FetchBinLocationsFromErpNextAsync(
        WmsSettings settings,
        string? overrideBaseUrl = null,
        string? overrideApiKey = null,
        string? endpointName = null)
    {
        LastFetchErrorDetail = null;
        var erpNextUrl = !string.IsNullOrWhiteSpace(overrideBaseUrl)
            ? overrideBaseUrl
            : (!string.IsNullOrWhiteSpace(settings.ErpNextApiUrl) ? settings.ErpNextApiUrl : settings.ApiEndpointUrl);
        var erpNextApiKey = !string.IsNullOrWhiteSpace(overrideApiKey)
            ? overrideApiKey
            : (!string.IsNullOrWhiteSpace(settings.ErpNextApiKey) ? settings.ErpNextApiKey : settings.ApiKey);
        var label = string.IsNullOrWhiteSpace(endpointName) ? "ERPNext" : endpointName;

        if (string.IsNullOrWhiteSpace(erpNextUrl) || string.IsNullOrWhiteSpace(erpNextApiKey))
        {
            ErrorLogService.LogInfo($"ErpNextBinLocationApiService: {label} API URL or key not configured");
            return (null, "ERPNext URL or API key is empty.");
        }

        var baseUrl = ExtractBaseUrl(erpNextUrl);

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(120);
            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("token", erpNextApiKey);

            var company = (settings.Company ?? string.Empty).Trim();
            if (!string.IsNullOrEmpty(company))
            {
                var (listLoc, errLoc) = await FetchListLocationsMethodAsync(httpClient, baseUrl, company, label);
                // Only stop here when we actually received rows; [] may mean wrong JSON shape — still try resource API.
                if (listLoc != null && listLoc.Count > 0)
                    return (listLoc, null);

                LastFetchErrorDetail = errLoc;
                if (listLoc != null && listLoc.Count == 0)
                {
                    ErrorLogService.LogInfo(
                        $"ErpNextBinLocationApiService: [{label}] list_locations returned 0 rows (empty list or unparsed); trying DocType resource…");
                }
                else
                {
                    ErrorLogService.LogInfo(
                        $"ErpNextBinLocationApiService: [{label}] list_locations failed ({errLoc ?? "?"}); trying DocType resource…");
                }
            }
            else
            {
                ErrorLogService.LogInfo(
                    $"ErpNextBinLocationApiService: [{label}] Settings.Company is empty — skipping list_locations (set Company to match ERPNext, e.g. for list_locations).");
            }

            return await FetchBinLocationsResourceApiAsync(httpClient, baseUrl, label);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ErpNextBinLocationApiService: [{label}] Error: {ex.Message}", ex);
            return (null, ex.Message);
        }
    }

    /// <summary>
    /// GET /api/method/printechs_wms.api.location.list_locations?company=...&page=&page_size=
    /// </summary>
    private static async Task<(List<ErpNextBinLocationRow>? Items, string? ErrorDetail)> FetchListLocationsMethodAsync(
        HttpClient httpClient,
        string baseUrl,
        string company,
        string label)
    {
        const int pageSize = 100;
        var all = new List<ErpNextBinLocationRow>();
        var page = 1;

        while (true)
        {
            var qs =
                $"company={Uri.EscapeDataString(company)}&page={page}&page_size={pageSize}";
            var url = $"{baseUrl}/api/method/{ListLocationsMethod}?{qs}";
            ErrorLogService.LogInfo($"ErpNextBinLocationApiService: [{label}] GET list_locations page={page}");

            var response = await httpClient.GetAsync(url);
            var body = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                LastFetchErrorDetail = Truncate(body, 900);
                return (null, $"{(int)response.StatusCode} list_locations: {LastFetchErrorDetail}");
            }

            var pageRows = TryParseListLocationsResponse(body, out var parseErr);
            if (parseErr != null)
                return (null, parseErr);

            if (pageRows.Count == 0)
            {
                ErrorLogService.LogInfo($"ErpNextBinLocationApiService: [{label}] list_locations total rows: {all.Count}");
                return (all, null);
            }

            all.AddRange(pageRows);
            if (pageRows.Count < pageSize)
            {
                ErrorLogService.LogInfo($"ErpNextBinLocationApiService: [{label}] list_locations total rows: {all.Count}");
                return (all, null);
            }

            page++;
            if (page > 500)
            {
                ErrorLogService.LogInfo($"ErpNextBinLocationApiService: [{label}] list_locations stopped at page cap (500)");
                return (all, null);
            }
        }
    }

    /// <summary>Tries named properties in order; returns first JSON array found.</summary>
    private static bool TryGetFirstArrayProperty(JsonElement obj, out JsonElement array, params string[] propertyNames)
    {
        array = default;
        foreach (var name in propertyNames)
        {
            if (!obj.TryGetProperty(name, out var p))
                continue;
            if (p.ValueKind == JsonValueKind.Array)
            {
                array = p;
                return true;
            }
        }

        return false;
    }

    /// <summary>Parses Frappe method response: message may be array or object with data/locations/items.</summary>
    private static List<ErpNextBinLocationRow> TryParseListLocationsResponse(string body, out string? error)
    {
        error = null;
        var list = new List<ErpNextBinLocationRow>();
        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            if (root.TryGetProperty("exc", out var exc))
            {
                error = $"Server exc: {Truncate(exc.GetRawText(), 500)}";
                return list;
            }

            JsonElement msg;
            if (!root.TryGetProperty("message", out msg))
            {
                // Some whitelisted methods return rows only under root "data"
                if (root.TryGetProperty("data", out var rootData) && rootData.ValueKind == JsonValueKind.Array)
                {
                    foreach (var el in rootData.EnumerateArray())
                        list.Add(MapListLocationElement(el));
                    return list;
                }

                error = "Response has no 'message' or root 'data' array";
                return list;
            }

            JsonElement arrayEl;
            if (msg.ValueKind == JsonValueKind.Array)
                arrayEl = msg;
            else if (msg.ValueKind == JsonValueKind.String)
            {
                var s = msg.GetString()?.Trim() ?? "";
                if (!s.StartsWith('['))
                {
                    error = "message is not a JSON array string";
                    return list;
                }
                using (var inner = JsonDocument.Parse(s))
                {
                    foreach (var el in inner.RootElement.EnumerateArray())
                        list.Add(MapListLocationElement(el));
                }
                return list;
            }
            else if (msg.ValueKind == JsonValueKind.Object)
            {
                arrayEl = default;
                if (TryGetFirstArrayProperty(msg, out var fromKnown,
                        "data", "locations", "items", "results", "rows", "records", "list", "values",
                        "location_list", "locations_list", "bins"))
                    arrayEl = fromKnown;
                else if (msg.TryGetProperty("data", out var dataEl) && dataEl.ValueKind == JsonValueKind.Object)
                {
                    // e.g. message: { "data": { "list": [ ... ] } }
                    if (TryGetFirstArrayProperty(dataEl, out var nested, "list", "rows", "items", "locations", "data"))
                        arrayEl = nested;
                }

                if (arrayEl.ValueKind == JsonValueKind.Undefined)
                {
                    // Any array-valued property on message (custom API shapes)
                    foreach (var prop in msg.EnumerateObject())
                    {
                        if (prop.Value.ValueKind != JsonValueKind.Array)
                            continue;
                        if (prop.Name.Equals("exc", StringComparison.OrdinalIgnoreCase))
                            continue;
                        arrayEl = prop.Value;
                        break;
                    }
                }

                if (arrayEl.ValueKind == JsonValueKind.Undefined)
                {
                    error = "message is object but no array of locations found (expected data/locations/items/… or any array property)";
                    return list;
                }
            }
            else
            {
                error = $"Unexpected message type: {msg.ValueKind}";
                return list;
            }

            foreach (var el in arrayEl.EnumerateArray())
                list.Add(MapListLocationElement(el));

            return list;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return list;
        }
    }

    /// <summary>Reads string-like values; property names are matched case-insensitively (Frappe / Python JSON varies).</summary>
    private static string? ReadStringProp(JsonElement el, params string[] candidateNamesInOrder)
    {
        if (el.ValueKind != JsonValueKind.Object)
            return null;
        foreach (var candidate in candidateNamesInOrder)
        {
            foreach (var prop in el.EnumerateObject())
            {
                if (!string.Equals(prop.Name, candidate, StringComparison.OrdinalIgnoreCase))
                    continue;
                return JsonElementToLocationString(prop.Value);
            }
        }

        return null;
    }

    private static string? JsonElementToLocationString(JsonElement p)
    {
        switch (p.ValueKind)
        {
            case JsonValueKind.String:
                return p.GetString();
            case JsonValueKind.Number:
                return p.GetRawText();
            case JsonValueKind.True:
                return "1";
            case JsonValueKind.False:
                return "0";
            case JsonValueKind.Object:
                // ERPNext Link: { "name": "Main Warehouse - MAATC" } or display name
                if (ReadStringProp(p, "name", "warehouse_name", "label", "title") is { } o)
                    return o;
                return null;
            case JsonValueKind.Array:
                return null;
            default:
                return null;
        }
    }

    /// <summary>Flattens nested objects so <c>physical.zone</c> and <c>zone</c> are both discoverable.</summary>
    private static Dictionary<string, string> BuildFlatStringMap(JsonElement el, int maxDepth = 6)
    {
        var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        void Walk(string prefix, JsonElement node, int depth)
        {
            if (depth > maxDepth || node.ValueKind != JsonValueKind.Object)
                return;
            foreach (var p in node.EnumerateObject())
            {
                var fullKey = string.IsNullOrEmpty(prefix) ? p.Name : prefix + "." + p.Name;
                if (p.Value.ValueKind == JsonValueKind.Object)
                {
                    var linkText = JsonElementToLocationString(p.Value);
                    if (!string.IsNullOrWhiteSpace(linkText))
                    {
                        d[fullKey] = linkText;
                        if (!d.ContainsKey(p.Name))
                            d[p.Name] = linkText;
                    }

                    Walk(fullKey, p.Value, depth + 1);
                }
                else
                {
                    var s = JsonElementToLocationString(p.Value);
                    if (string.IsNullOrWhiteSpace(s))
                        continue;
                    d[fullKey] = s;
                    if (!d.ContainsKey(p.Name))
                        d[p.Name] = s;
                }
            }
        }

        Walk("", el, 0);
        return d;
    }

    private static string? GetFromFlat(Dictionary<string, string> flat, params string[] candidates)
    {
        foreach (var c in candidates)
        {
            if (flat.TryGetValue(c, out var v) && !string.IsNullOrWhiteSpace(v))
                return v.Trim();
        }

        foreach (var c in candidates)
        {
            foreach (var kv in flat)
            {
                if (string.IsNullOrWhiteSpace(kv.Value))
                    continue;
                if (string.Equals(kv.Key, c, StringComparison.OrdinalIgnoreCase))
                    return kv.Value.Trim();
                if (kv.Key.EndsWith("." + c, StringComparison.OrdinalIgnoreCase))
                    return kv.Value.Trim();
            }
        }

        return null;
    }

    private static ErpNextBinLocationRow MapListLocationElement(JsonElement el)
    {
        if (el.ValueKind == JsonValueKind.String)
        {
            var raw = el.GetString();
            if (!string.IsNullOrWhiteSpace(raw))
            {
                var t = raw.TrimStart();
                if (t.StartsWith('{') || t.StartsWith('['))
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(raw);
                        return MapListLocationElement(doc.RootElement);
                    }
                    catch
                    {
                        /* ignore */
                    }
                }
            }
        }

        if (el.ValueKind != JsonValueKind.Object)
            return new ErpNextBinLocationRow();

        var flat = BuildFlatStringMap(el);
        if (Interlocked.Increment(ref _listLocationsSampleKeysLogged) == 1 && flat.Count > 0)
        {
            var sample = string.Join(", ", flat.Keys.Take(80));
            ErrorLogService.LogInfo($"ErpNextBinLocationApiService: list_locations sample flattened keys (for mapping): {sample}");
        }

        string? G(params string[] keys) => GetFromFlat(flat, keys);

        var binKey = G("bin_id", "location_id", "location_code", "location_key", "name", "id");
        var binSlot = G("bin_code", "bin", "slot", "bin_number", "bin_no");
        var wh = G("warehouse", "erp_warehouse", "erp_warehouse_name", "warehouse_name", "warehouse_code",
            "parent_warehouse", "parent", "warehouse_id", "default_warehouse");
        var erpWh = G("erp_warehouse", "erp_warehouse_name");

        var mapped = new ErpNextBinLocationRow
        {
            Name = G("name", "location_name", "title", "label", "location_id"),
            BinId = binKey,
            BinCode = binSlot,
            LocationId = G("location_id", "location_code"),
            Warehouse = wh ?? erpWh,
            ErpWarehouse = erpWh,
            Zone = G("zone", "zone_name", "custom_zone"),
            Aisle = G("aisle", "aisle_code", "aisle_name", "bag_area", "bag", "custom_aisle"),
            Rack = G("rack", "parent_rack", "rack_name", "rack_code", "custom_rack"),
            Level = G("level", "level_code", "level_name", "level_no", "custom_level"),
            Position = G("position", "bin_position"),
            LocationType = G("location_type", "locationType", "type", "bin_type"),
            LocationTypeDetailed = G("location_type_detailed", "locationTypeDetailed", "detailed_type"),
            Priority = G("priority", "sequence", "sort_order")
        };

        return MergeLocationRowFromDeserializeFallback(el, mapped);
    }

    private static readonly JsonSerializerOptions LocationDeserializeFallbackOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    /// <summary>Fills gaps using [JsonPropertyName] mapping when API keys match the DocType field names.</summary>
    private static ErpNextBinLocationRow MergeLocationRowFromDeserializeFallback(JsonElement el, ErpNextBinLocationRow mapped)
    {
        try
        {
            var fb = JsonSerializer.Deserialize<ErpNextBinLocationRow>(el.GetRawText(), LocationDeserializeFallbackOptions);
            if (fb == null)
                return mapped;

            static string? Pick(string? a, string? b) => string.IsNullOrWhiteSpace(a) ? (string.IsNullOrWhiteSpace(b) ? a : b.Trim()) : a;

            return new ErpNextBinLocationRow
            {
                Name = Pick(mapped.Name, fb.Name),
                BinId = Pick(mapped.BinId, fb.BinId),
                BinCode = Pick(mapped.BinCode, fb.BinCode),
                LocationId = Pick(mapped.LocationId, fb.LocationId),
                Warehouse = Pick(mapped.Warehouse, fb.Warehouse),
                ErpWarehouse = Pick(mapped.ErpWarehouse, fb.ErpWarehouse),
                Zone = Pick(mapped.Zone, fb.Zone),
                Aisle = Pick(mapped.Aisle, fb.Aisle),
                Rack = Pick(mapped.Rack, fb.Rack),
                Level = Pick(mapped.Level, fb.Level),
                Position = Pick(mapped.Position, fb.Position),
                LocationType = Pick(mapped.LocationType, fb.LocationType),
                LocationTypeDetailed = Pick(mapped.LocationTypeDetailed, fb.LocationTypeDetailed),
                Priority = Pick(mapped.Priority, fb.Priority)
            };
        }
        catch
        {
            return mapped;
        }
    }

    private static async Task<(List<ErpNextBinLocationRow>? Items, string? ErrorDetail)> FetchBinLocationsResourceApiAsync(
        HttpClient httpClient,
        string baseUrl,
        string label)
    {
        var resourcePath = Uri.EscapeDataString(BinLocationDocType);

        // Order: richest first; fall back if ERPNext returns 417/400 "Field not permitted" or similar.
        var fieldSets = new[]
        {
            "[\"name\",\"bin_id\",\"bin_code\",\"warehouse\"]",
            "[\"name\",\"warehouse\"]",
            "[\"name\"]"
        };

        const int pageLength = 500;

        foreach (var fieldsRaw in fieldSets)
            {
                var fieldsJson = Uri.EscapeDataString(fieldsRaw);
                var filters = Uri.EscapeDataString("[]");
                var all = new List<ErpNextBinLocationRow>();
                var start = 0;

                ErrorLogService.LogInfo($"ErpNextBinLocationApiService: [{label}] Trying fields {fieldsRaw}");

                while (true)
                {
                    var apiUrl =
                        $"{baseUrl}/api/resource/{resourcePath}?fields={fieldsJson}&filters={filters}&limit_page_length={pageLength}&limit_start={start}";

                    var response = await httpClient.GetAsync(apiUrl);
                    var body = await response.Content.ReadAsStringAsync();

                    if (!response.IsSuccessStatusCode)
                    {
                        LastFetchErrorDetail = Truncate(body, 900);
                        ErrorLogService.LogError(
                            $"ErpNextBinLocationApiService: [{label}] fields {fieldsRaw} limit_start={start} → {response.StatusCode}: {body}",
                            null);
                        if (start == 0)
                            break; // try next field set

                        return (null, $"{(int)response.StatusCode} {response.StatusCode}: {LastFetchErrorDetail}");
                    }

                    ErpNextBinLocationListResponse? parsed;
                    try
                    {
                        parsed = JsonSerializer.Deserialize<ErpNextBinLocationListResponse>(body);
                    }
                    catch (Exception ex)
                    {
                        ErrorLogService.LogError($"ErpNextBinLocationApiService: [{label}] Invalid JSON: {ex.Message}", ex);
                        if (start == 0)
                            break;
                        return (null, $"Invalid JSON: {ex.Message}");
                    }

                    var page = parsed?.Data ?? new List<ErpNextBinLocationRow>();
                    if (page.Count == 0)
                    {
                        if (start == 0)
                        {
                            ErrorLogService.LogInfo(
                                $"ErpNextBinLocationApiService: [{label}] 0 rows with fields {fieldsRaw} (OK)");
                            return (all, null);
                        }

                        ErrorLogService.LogInfo($"ErpNextBinLocationApiService: [{label}] Fetched {all.Count} bin location row(s) total");
                        return (all, null);
                    }

                    all.AddRange(page);
                    if (page.Count < pageLength)
                    {
                        ErrorLogService.LogInfo($"ErpNextBinLocationApiService: [{label}] Fetched {all.Count} bin location row(s) total");
                        return (all, null);
                    }

                    start += pageLength;
                }
            }

            return (null,
                $"Could not list '{BinLocationDocType}' with any field set. Last: {LastFetchErrorDetail ?? "unknown"}");
    }

    private static string Truncate(string? s, int maxLen)
    {
        if (string.IsNullOrEmpty(s) || s.Length <= maxLen) return s ?? string.Empty;
        return s.Substring(0, maxLen) + "…";
    }

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
        catch { /* ignore */ }

        var url = input.TrimEnd('/');
        if (url.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
            url = url.Substring(0, url.Length - 4).TrimEnd('/');
        return url;
    }
}
