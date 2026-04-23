using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Result from ERPNext API fetch
/// </summary>
public class ErpNextFetchResult
{
    public List<ErpNextItem> Items { get; set; } = new();
    public string? MaxCustomWmsModified { get; set; }
    public bool HasMore { get; set; }
}

/// <summary>
/// Service for fetching items from ERPNext API
/// </summary>
public static class ErpNextItemApiService
{
    /// <summary>
    /// Set when <see cref="FetchItemsFromErpNextAsync"/> returns null so callers (e.g. Test Sync) can show the reason without reading log files.
    /// </summary>
    public static string? LastFetchError { get; private set; }

    /// <summary>
    /// Fetch items from ERPNext API with paging support
    /// </summary>
    /// <param name="settings">WMS settings containing ERPNext API endpoint</param>
    /// <param name="limit">Number of items per page (default: 100)</param>
    /// <param name="offset">Offset for paging (default: 0)</param>
    /// <param name="maxModified">Optional: Only fetch items modified after this date (for incremental sync)</param>
    /// <param name="overrideBaseUrl">Optional: Use this URL instead of settings (for multiple endpoints)</param>
    /// <param name="overrideApiKey">Optional: Use this API key instead of settings (for multiple endpoints)</param>
    /// <param name="endpointName">Optional: Label for logs (e.g. endpoint name)</param>
    /// <returns>Fetch result with items and metadata, or null if error</returns>
    public static async Task<ErpNextFetchResult?> FetchItemsFromErpNextAsync(
        WmsSettings settings,
        int limit = 100,
        int offset = 0,
        DateTime? maxModified = null,
        string? overrideBaseUrl = null,
        string? overrideApiKey = null,
        string? endpointName = null)
    {
        // When multiple endpoints: use override URL/key; else use settings
        var erpNextUrl = !string.IsNullOrWhiteSpace(overrideBaseUrl)
            ? overrideBaseUrl
            : (!string.IsNullOrWhiteSpace(settings.ErpNextApiUrl) ? settings.ErpNextApiUrl : settings.ApiEndpointUrl);
        var erpNextApiKey = !string.IsNullOrWhiteSpace(overrideApiKey)
            ? overrideApiKey
            : (!string.IsNullOrWhiteSpace(settings.ErpNextApiKey) ? settings.ErpNextApiKey : settings.ApiKey);
        var label = string.IsNullOrWhiteSpace(endpointName) ? "ERPNext" : endpointName;

        if (string.IsNullOrWhiteSpace(erpNextUrl) || string.IsNullOrWhiteSpace(erpNextApiKey))
        {
            LastFetchError = "ERPNext API URL or API key is empty.";
            ErrorLogService.LogInfo($"ErpNextItemApiService: {label} API URL or key not configured");
            return null;
        }

        LastFetchError = null;
        var apiKeyPreview = erpNextApiKey.Length > 20 ? erpNextApiKey.Substring(0, 20) + "..." : erpNextApiKey;
        ErrorLogService.LogInfo($"ErpNextItemApiService: [{label}] Using URL: {erpNextUrl}, Key: {apiKeyPreview}");

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30); // 30 second timeout for ERPNext
            
            // ERPNext uses "token" authentication (not "Bearer") for API Key:Secret format
            // Format: Authorization: token api-key:api-secret
            // The ErpNextApiKey should be in format: "api-key:api-secret"
            if (!string.IsNullOrWhiteSpace(erpNextApiKey))
            {
                httpClient.DefaultRequestHeaders.Authorization = 
                    new AuthenticationHeaderValue("token", erpNextApiKey);
                
                // Log the authorization header format (for debugging)
                var authHeader = $"token {erpNextApiKey}";
                var authPreview = authHeader.Length > 50 
                    ? authHeader.Substring(0, 50) + "..." 
                    : authHeader;
                ErrorLogService.LogInfo($"ErpNextItemApiService: Authorization header: {authPreview}");
            }
            else
            {
                LastFetchError = "API key is empty after resolution.";
                ErrorLogService.LogError("ErpNextItemApiService: API key is empty, cannot set authorization header", null);
                return null;
            }
            
            // ERPNext API endpoint format: http://host:port/api/method/method_name
            // Extract base URL from ErpNextApiUrl (e.g., http://192.168.103.187:88)
            var baseUrl = ExtractErpNextBaseUrl(erpNextUrl);

            // Same shape as Postman: GET .../get_items_compact?fields=[...]&filters=[[...]]&limit=&offset=
            var apiUrl = $"{baseUrl}/api/method/printechs_wms.api.item.get_items_compact";

            Dictionary<string, string>? filtersDict = ParseItemSyncFiltersFlat(settings.ItemSyncFilters);

            var defaultFields = DefaultItemSyncFieldList();
            List<string> fieldsList;
            if (!string.IsNullOrWhiteSpace(settings.ItemSyncFields))
            {
                try
                {
                    fieldsList = JsonSerializer.Deserialize<List<string>>(settings.ItemSyncFields.Trim())
                        ?? new List<string>(defaultFields);
                }
                catch (Exception ex)
                {
                    ErrorLogService.LogInfo(
                        $"ErpNextItemApiService: ItemSyncFields is not valid JSON array ({ex.Message}). Fix Settings → Sync → Fields. Using default field list.");
                    fieldsList = new List<string>(defaultFields);
                }
            }
            else
            {
                fieldsList = new List<string>(defaultFields);
            }

            EnsureCompactFilterFieldsPresent(fieldsList, filtersDict, settings.ItemSyncAttributeFilters);

            var filtersJson = BuildCompactFiltersJson(settings);

            ErrorLogService.LogInfo($"ErpNextItemApiService: [{label}] GET get_items_compact — fields: [{string.Join(", ", fieldsList)}], flatten_attributes: {(settings.ItemSyncFlattenAttributes ? 1 : 0)}");

            var fieldsJson = JsonSerializer.Serialize(fieldsList);
            var query = new StringBuilder();
            query.Append("fields=").Append(Uri.EscapeDataString(fieldsJson));
            query.Append("&filters=").Append(Uri.EscapeDataString(filtersJson));
            query.Append("&limit=").Append(limit);
            query.Append("&offset=").Append(offset);
            query.Append("&flatten_attributes=").Append(settings.ItemSyncFlattenAttributes ? 1 : 0);
            if (maxModified.HasValue)
            {
                query.Append("&custom_wms_modified_after=").Append(Uri.EscapeDataString(maxModified.Value.ToString("yyyy-MM-dd HH:mm:ss.ffffff")));
                ErrorLogService.LogInfo($"ErpNextItemApiService: Incremental sync custom_wms_modified_after: {maxModified.Value:yyyy-MM-dd HH:mm:ss}");
            }

            var requestUri = $"{apiUrl}?{query}";
            ErrorLogService.LogInfo($"ErpNextItemApiService: [{label}] Request GET get_items_compact (limit={limit}, offset={offset})");

            var response = await httpClient.GetAsync(requestUri);
            
            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                LastFetchError = $"HTTP {(int)response.StatusCode} {response.StatusCode}: {Truncate(errorContent, 800)}";
                ErrorLogService.LogError($"ErpNextItemApiService: API returned {response.StatusCode}: {errorContent}", null);
                return null;
            }

            var responseContent = await response.Content.ReadAsStringAsync();
            
            // Log raw response for debugging (first 500 chars to avoid huge logs)
            var responsePreview = responseContent.Length > 500 
                ? responseContent.Substring(0, 500) + "..." 
                : responseContent;
            ErrorLogService.LogInfo($"ErpNextItemApiService: Raw response (preview): {responsePreview}");

            if (!TryParseItemsResponse(responseContent, out var items, out var maxCustomWmsModified, out var hasMore, out var parseError))
            {
                LastFetchError = parseError ?? "Unknown parse error";
                ErrorLogService.LogError($"ErpNextItemApiService: {LastFetchError} Preview: {responsePreview}", null);
                return null;
            }
            
            if (items.Count > 0)
            {
                ErrorLogService.LogInfo($"ErpNextItemApiService: Fetched {items.Count} item(s) from ERPNext (offset={offset})");
            }
            else
            {
                ErrorLogService.LogInfo($"ErpNextItemApiService: No items returned from ERPNext (offset={offset})");
            }
            
            if (!string.IsNullOrWhiteSpace(maxCustomWmsModified))
            {
                ErrorLogService.LogInfo($"ErpNextItemApiService: Response max_custom_wms_modified: {maxCustomWmsModified}");
            }

            return new ErpNextFetchResult
            {
                Items = items ?? new List<ErpNextItem>(),
                MaxCustomWmsModified = maxCustomWmsModified,
                HasMore = hasMore
            };
        }
        catch (HttpRequestException httpEx)
        {
            LastFetchError ??= $"HTTP request failed: {httpEx.Message}";
            ErrorLogService.LogError($"ErpNextItemApiService: HTTP error connecting to ERPNext: {httpEx.Message}", httpEx);
            return null;
        }
        catch (TaskCanceledException)
        {
            LastFetchError ??= "Request timed out (exceeded HttpClient timeout).";
            ErrorLogService.LogError("ErpNextItemApiService: Request timed out", null);
            return null;
        }
        catch (Exception ex)
        {
            LastFetchError ??= ex.Message;
            ErrorLogService.LogError("ErpNextItemApiService: Error fetching items from ERPNext", ex);
            return null;
        }
    }

    /// <summary>
    /// Builds Frappe list-style filters JSON: [["field","op",value],...] from flat Filters + Attribute Filters (object or array).
    /// </summary>
    private static string BuildCompactFiltersJson(WmsSettings settings)
    {
        var triplets = new List<object[]>();

        var flat = ParseItemSyncFiltersFlat(settings.ItemSyncFilters);
        if (flat != null)
        {
            foreach (var kv in flat)
                triplets.Add(new object[] { kv.Key, "=", kv.Value });
        }

        var attrRaw = settings.ItemSyncAttributeFilters?.Trim();
        if (string.IsNullOrEmpty(attrRaw) || attrRaw == "{}" || attrRaw.Equals("null", StringComparison.OrdinalIgnoreCase))
            return JsonSerializer.Serialize(triplets);

        try
        {
            using var doc = JsonDocument.Parse(attrRaw);
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.Array)
            {
                foreach (var row in root.EnumerateArray())
                {
                    if (row.ValueKind != JsonValueKind.Array || row.GetArrayLength() < 3)
                        continue;
                    var parts = row.EnumerateArray().ToArray();
                    var triplet = new object[parts.Length];
                    for (var i = 0; i < parts.Length; i++)
                        triplet[i] = JsonElementToFilterPart(parts[i]);
                    triplets.Add(triplet);
                }
            }
            else if (root.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in root.EnumerateObject())
                {
                    var v = prop.Value;
                    if (v.ValueKind == JsonValueKind.Array && v.GetArrayLength() >= 2)
                    {
                        var a = v.EnumerateArray().ToArray();
                        var op = a[0].ValueKind == JsonValueKind.String ? a[0].GetString()! : a[0].GetRawText().Trim('"');
                        triplets.Add(new object[] { prop.Name, op, JsonElementToFilterPart(a[1]) });
                    }
                    else if (v.ValueKind == JsonValueKind.String)
                        triplets.Add(new object[] { prop.Name, "=", v.GetString()! });
                    else if (v.ValueKind == JsonValueKind.Number)
                        triplets.Add(new object[] { prop.Name, "=", JsonSerializer.Deserialize<object>(v.GetRawText())! });
                    else if (v.ValueKind == JsonValueKind.True)
                        triplets.Add(new object[] { prop.Name, "=", 1 });
                    else if (v.ValueKind == JsonValueKind.False)
                        triplets.Add(new object[] { prop.Name, "=", 0 });
                }
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ErpNextItemApiService: Failed to build compact filters from ItemSyncAttributeFilters: {ex.Message}", ex);
        }

        return JsonSerializer.Serialize(triplets);
    }

    private static object JsonElementToFilterPart(JsonElement el)
    {
        return el.ValueKind switch
        {
            JsonValueKind.String => el.GetString()!,
            JsonValueKind.Number => el.TryGetInt64(out var l) ? l : el.GetDouble(),
            JsonValueKind.True => 1,
            JsonValueKind.False => 0,
            JsonValueKind.Null => null!,
            _ => el.GetRawText()
        };
    }

    /// <summary>
    /// Ensures any DocType field referenced in filters is present in <c>fields</c> (server may return no rows otherwise).
    /// </summary>
    private static void EnsureCompactFilterFieldsPresent(List<string> fieldsList, Dictionary<string, string>? flat, string? attrRaw)
    {
        var existing = new HashSet<string>(fieldsList, StringComparer.OrdinalIgnoreCase);

        void AddField(string? name)
        {
            if (string.IsNullOrWhiteSpace(name) || existing.Contains(name))
                return;
            fieldsList.Add(name);
            existing.Add(name);
            ErrorLogService.LogInfo($"ErpNextItemApiService: Auto-added '{name}' to fields list (used in filters).");
        }

        if (flat != null)
        {
            foreach (var k in flat.Keys)
                AddField(k);
        }

        if (string.IsNullOrWhiteSpace(attrRaw))
            return;

        try
        {
            using var doc = JsonDocument.Parse(attrRaw.Trim());
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.Object)
            {
                foreach (var p in root.EnumerateObject())
                    AddField(p.Name);
            }
            else if (root.ValueKind == JsonValueKind.Array)
            {
                foreach (var row in root.EnumerateArray())
                {
                    if (row.ValueKind == JsonValueKind.Array && row.GetArrayLength() > 0 && row[0].ValueKind == JsonValueKind.String)
                        AddField(row[0].GetString());
                }
            }
        }
        catch
        {
            /* ignore */
        }
    }

    private static List<string> DefaultItemSyncFieldList() => new()
    {
        "name", "item_code", "item_name", "disabled", "item_group", "stock_uom", "brand",
        "has_variants", "variant_of", "modified",
        "year", "season", "is_stock", "barcode", "custom_wms_modified"
    };

    /// <summary>
    /// ItemSyncFilters must deserialize to Dictionary&lt;string,string&gt; (flat equality filters).
    /// If the user puts array values (e.g. like) here by mistake, Dictionary deserialization throws — we parse manually and skip non-strings with a hint.
    /// </summary>
    private static Dictionary<string, string>? ParseItemSyncFiltersFlat(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return null;

        var trimmed = raw.Trim();
        if (trimmed == "{}" || trimmed.Equals("null", StringComparison.OrdinalIgnoreCase))
            return null;

        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, string>>(trimmed);
        }
        catch
        {
            // Common mistake: {"field":["like","%x%"]} or non-object JSON
        }

        try
        {
            using var doc = JsonDocument.Parse(trimmed);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                ErrorLogService.LogInfo(
                    "ErpNextItemApiService: ItemSyncFilters must be a JSON object like {\"custom_dcs\":\"VALUE\"}, not an array. " +
                    "Use Attribute Filters for operators (e.g. {\"custom_dcs\":[\"like\",\"%BAG%\"]}). Ignoring ItemSyncFilters.");
                return null;
            }

            var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                switch (prop.Value.ValueKind)
                {
                    case JsonValueKind.String:
                        dict[prop.Name] = prop.Value.GetString() ?? string.Empty;
                        break;
                    case JsonValueKind.Number:
                        dict[prop.Name] = prop.Value.GetRawText();
                        break;
                    case JsonValueKind.True:
                        dict[prop.Name] = "1";
                        break;
                    case JsonValueKind.False:
                        dict[prop.Name] = "0";
                        break;
                    default:
                        ErrorLogService.LogInfo(
                            $"ErpNextItemApiService: ItemSyncFilters['{prop.Name}'] is not a string (use Attribute Filters for [\"like\",...] / operators). Skipped.");
                        break;
                }
            }

            if (dict.Count == 0)
                ErrorLogService.LogInfo(
                    "ErpNextItemApiService: ItemSyncFilters had no usable string fields. Use Attribute Filters for non-equality filters.");

            return dict.Count > 0 ? dict : null;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ErpNextItemApiService: Invalid ItemSyncFilters JSON: {ex.Message}", ex);
            return null;
        }
    }

    private static string Truncate(string? s, int maxLen)
    {
        if (string.IsNullOrEmpty(s) || s.Length <= maxLen) return s ?? string.Empty;
        return s.Substring(0, maxLen) + "...";
    }

    /// <summary>
    /// Frappe may return errors in "exc", or "message" as string/array/object. Parses all common shapes.
    /// </summary>
    private static bool TryParseItemsResponse(
        string responseContent,
        out List<ErpNextItem> items,
        out string? maxCustomWmsModified,
        out bool hasMore,
        out string? error)
    {
        items = new List<ErpNextItem>();
        maxCustomWmsModified = null;
        hasMore = false;
        error = null;

        try
        {
            using var doc = JsonDocument.Parse(responseContent);
            var root = doc.RootElement;

            if (root.TryGetProperty("exc", out var exc))
            {
                error = $"ERPNext server error (exc): {Truncate(exc.GetRawText(), 600)}";
                return false;
            }

            if (root.TryGetProperty("exception", out var exn))
            {
                error = $"ERPNext exception: {Truncate(exn.GetRawText(), 600)}";
                return false;
            }

            if (!root.TryGetProperty("message", out var msg))
            {
                error = "Response has no 'message' field (expected Frappe API shape).";
                return false;
            }

            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

            switch (msg.ValueKind)
            {
                case JsonValueKind.String:
                    error = $"ERPNext returned text message: {msg.GetString()}";
                    return false;
                case JsonValueKind.Array:
                    items = JsonSerializer.Deserialize<List<ErpNextItem>>(msg.GetRawText(), options) ?? new List<ErpNextItem>();
                    return true;
                case JsonValueKind.Object:
                    {
                        var msgObj = JsonSerializer.Deserialize<ErpNextMessage>(msg.GetRawText(), options);
                        if (msgObj == null)
                        {
                            error = "Could not deserialize message object.";
                            return false;
                        }
                        items = msgObj.Data ?? msgObj.Items ?? new List<ErpNextItem>();
                        maxCustomWmsModified = msgObj.MaxCustomWmsModified;
                        hasMore = msgObj.HasMore ?? false;
                        return true;
                    }
                default:
                    error = $"Unexpected JSON type for 'message': {msg.ValueKind}";
                    return false;
            }
        }
        catch (JsonException jx)
        {
            error = $"Invalid JSON response: {jx.Message}";
            return false;
        }
    }

    /// <summary>
    /// Use only scheme + host + port so item method path is never appended to a full URL.
    /// E.g. http://host:88/api/method/... or http://host:88/api/resource/... -> http://host:88
    /// </summary>
    private static string ExtractErpNextBaseUrl(string apiEndpointUrl)
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

/// <summary>
/// ERPNext API response wrapper
/// </summary>
public class ErpNextApiResponse
{
    [JsonPropertyName("message")]
    public ErpNextMessage? Message { get; set; }
}

/// <summary>
/// ERPNext message wrapper containing data
/// </summary>
public class ErpNextMessage
{
    [JsonPropertyName("data")]
    public List<ErpNextItem>? Data { get; set; }
    
    [JsonPropertyName("items")]
    public List<ErpNextItem>? Items { get; set; }
    
    [JsonPropertyName("limit")]
    public int? Limit { get; set; }
    
    [JsonPropertyName("offset")]
    public int? Offset { get; set; }
    
    [JsonPropertyName("has_more")]
    public bool? HasMore { get; set; }
    
    [JsonPropertyName("max_custom_wms_modified")]
    public string? MaxCustomWmsModified { get; set; } // For incremental sync cursor
    
    [JsonPropertyName("max_modified")]
    public string? MaxModified { get; set; } // Kept for backward compatibility
}

/// <summary>
/// Item model from ERPNext API
/// </summary>
public class ErpNextItem
{
    [JsonPropertyName("item_code")]
    public string ItemCode { get; set; } = string.Empty;
    
    [JsonPropertyName("item_name")]
    public string ItemName { get; set; } = string.Empty;
    
    [JsonPropertyName("item_group")]
    public string? ItemGroup { get; set; }
    
    [JsonPropertyName("color")]
    public string? Color { get; set; }
    
    [JsonPropertyName("size")]
    public string? Size { get; set; }
    
    [JsonPropertyName("year")]
    public string? Year { get; set; }
    
    [JsonPropertyName("season")]
    public string? Season { get; set; }
    
    [JsonPropertyName("brand")]
    public string? Brand { get; set; }
    
    [JsonPropertyName("stock_uom")]
    public string? StockUom { get; set; }
    
    [JsonPropertyName("is_stock")]
    public int IsStockItem { get; set; } // 0 or 1 (field name is "is_stock" in ERPNext API)
    
    [JsonPropertyName("disabled")]
    public int Disabled { get; set; } // 0 or 1
    
    [JsonPropertyName("barcode")]
    public string? Barcode { get; set; }
    
    [JsonPropertyName("custom_wms_modified")]
    public string? CustomWmsModified { get; set; } // DateTime string from ERPNext (for incremental sync cursor)
    
    [JsonPropertyName("modified")]
    public string? Modified { get; set; } // DateTime string from ERPNext (kept for backward compatibility)
}
