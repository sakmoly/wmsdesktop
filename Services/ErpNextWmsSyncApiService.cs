using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

#region ASN (get_asns_for_wms)

/// <summary>ASN item from ERPNext get_asns_for_wms (include_items=1).</summary>
public class ErpNextAsnItemDto
{
    [JsonPropertyName("item_code")]
    public string ItemCode { get; set; } = string.Empty;

    [JsonPropertyName("po_item_reference")]
    public string? PoItemReference { get; set; }

    [JsonPropertyName("shipped_qty")]
    public double ShippedQty { get; set; }

    [JsonPropertyName("carton_id")]
    public string? CartonId { get; set; }
}

/// <summary>ASN header + items from ERPNext get_asns_for_wms.</summary>
public class ErpNextAsnDto
{
    [JsonPropertyName("title")]
    public string? Title { get; set; }

    /// <summary>ERPNext often returns document id as "name"; used when title is empty.</summary>
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("status")]
    public string? Status { get; set; }

    [JsonPropertyName("purchase_order")]
    public string? PurchaseOrder { get; set; }

    [JsonPropertyName("supplier")]
    public string? Supplier { get; set; }

    [JsonPropertyName("shipment_date")]
    public string? ShipmentDate { get; set; }

    [JsonPropertyName("posting_date")]
    public string? PostingDate { get; set; }

    [JsonPropertyName("expected_arrival_date")]
    public string? ExpectedArrivalDate { get; set; }

    /// <summary>API often returns expected_arrival (not expected_arrival_date).</summary>
    [JsonPropertyName("expected_arrival")]
    public string? ExpectedArrival { get; set; }

    [JsonPropertyName("delivery_date")]
    public string? DeliveryDate { get; set; }

    [JsonPropertyName("total_shipped_qty")]
    public double TotalShippedQty { get; set; }

    [JsonPropertyName("airway_bill_no")]
    public string? AirwayBillNo { get; set; }

    [JsonPropertyName("shipment_type")]
    public string? ShipmentType { get; set; }

    /// <summary>Some API responses use camelCase.</summary>
    [JsonPropertyName("shipmentType")]
    public string? ShipmentTypeCamel { get; set; }

    /// <summary>Alternate name used in some ERPNext/custom APIs.</summary>
    [JsonPropertyName("shipping_type")]
    public string? ShippingType { get; set; }

    /// <summary>Resolved shipment type: shipment_type, shipmentType, or shipping_type (first non-empty).</summary>
    [JsonIgnore]
    public string? ResolvedShipmentType => !string.IsNullOrWhiteSpace(ShipmentType) ? ShipmentType.Trim()
        : !string.IsNullOrWhiteSpace(ShipmentTypeCamel) ? ShipmentTypeCamel.Trim()
        : !string.IsNullOrWhiteSpace(ShippingType) ? ShippingType.Trim() : null;

    [JsonPropertyName("wms_export_status")]
    public string? WmsExportStatus { get; set; }

    [JsonPropertyName("items")]
    public List<ErpNextAsnItemDto>? Items { get; set; }
}

#endregion

#region TO (get_tos_for_wms)

/// <summary>TO item from ERPNext get_tos_for_wms (include_items=1).</summary>
public class ErpNextToItemDto
{
    [JsonPropertyName("store")]
    public string? Store { get; set; }

    [JsonPropertyName("warehouse")]
    public string? Warehouse { get; set; }

    [JsonPropertyName("target_warehouse")]
    public string? TargetWarehouse { get; set; }

    [JsonPropertyName("item_code")]
    public string? ItemCode { get; set; }

    [JsonPropertyName("allocated_qty")]
    public double AllocatedQty { get; set; }

    [JsonPropertyName("sorted_qty")]
    public double SortedQty { get; set; }

    [JsonPropertyName("packed_qty")]
    public double PackedQty { get; set; }

    [JsonPropertyName("pending_qty")]
    public double PendingQty { get; set; }

    [JsonPropertyName("remarks")]
    public string? Remarks { get; set; }
}

/// <summary>TO header + items from ERPNext get_tos_for_wms.</summary>
public class ErpNextToDto
{
    [JsonPropertyName("transfer_order")]
    public string? TransferOrder { get; set; }

    /// <summary>ERPNext often returns document id as "name"; used when transfer_order is empty.</summary>
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("status")]
    public string? Status { get; set; }

    [JsonPropertyName("asn_no")]
    public string? AsnNo { get; set; }

    /// <summary>API often returns ASN as "asn" (not asn_no).</summary>
    [JsonPropertyName("asn")]
    public string? Asn { get; set; }

    [JsonPropertyName("from_warehouse")]
    public string? FromWarehouse { get; set; }

    /// <summary>API returns warehouse code (e.g. WH-MAIN); desktop should use this for from_warehouse.</summary>
    [JsonPropertyName("from_warehouse_code")]
    public string? FromWarehouseCode { get; set; }

    [JsonPropertyName("prepared_by")]
    public string? PreparedBy { get; set; }

    [JsonPropertyName("required_date")]
    public string? RequiredDate { get; set; }

    [JsonPropertyName("total_allocated_qty")]
    public double TotalAllocatedQty { get; set; }

    [JsonPropertyName("wms_export_status")]
    public string? WmsExportStatus { get; set; }

    [JsonPropertyName("items")]
    public List<ErpNextToItemDto>? Items { get; set; }

    /// <summary>API may return items as item_details.</summary>
    [JsonPropertyName("item_details")]
    public List<ErpNextToItemDto>? ItemDetails { get; set; }
}

#endregion

#region Material Request (get_material_transfer_requests)

/// <summary>Material Request item from ERPNext get_material_transfer_requests (include_items=1).</summary>
public class ErpNextMaterialRequestItemDto
{
    [JsonPropertyName("item_code")]
    public string? ItemCode { get; set; }

    [JsonPropertyName("qty")]
    public double Qty { get; set; }

    [JsonPropertyName("requested_qty")]
    public double RequestedQty { get; set; }

    [JsonPropertyName("picked_qty")]
    public double PickedQty { get; set; }

    [JsonPropertyName("stock_uom")]
    public string? StockUom { get; set; }

    [JsonPropertyName("uom")]
    public string? Uom { get; set; }
}

/// <summary>Material Request header + items from ERPNext get_material_transfer_requests.</summary>
public class ErpNextMaterialRequestDto
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("material_request")]
    public string? MaterialRequest { get; set; }

    /// <summary>API returns doc name as "material_request_no" in message.data[].</summary>
    [JsonPropertyName("material_request_no")]
    public string? MaterialRequestNo { get; set; }

    [JsonPropertyName("status")]
    public string? Status { get; set; }

    [JsonPropertyName("from_warehouse")]
    public string? FromWarehouse { get; set; }

    [JsonPropertyName("from_warehouse_name")]
    public string? FromWarehouseName { get; set; }

    [JsonPropertyName("from_warehouse_code")]
    public string? FromWarehouseCode { get; set; }

    [JsonPropertyName("to_warehouse")]
    public string? ToWarehouse { get; set; }

    [JsonPropertyName("to_warehouse_name")]
    public string? ToWarehouseName { get; set; }

    [JsonPropertyName("to_warehouse_code")]
    public string? ToWarehouseCode { get; set; }

    [JsonPropertyName("to_showroom")]
    public string? ToShowroom { get; set; }

    [JsonPropertyName("requested_date")]
    public string? RequestedDate { get; set; }

    [JsonPropertyName("required_date")]
    public string? RequiredDate { get; set; }

    [JsonPropertyName("requested_by")]
    public string? RequestedBy { get; set; }

    [JsonPropertyName("total_requested_qty")]
    public double TotalRequestedQty { get; set; }

    [JsonPropertyName("total_picked_qty")]
    public double TotalPickedQty { get; set; }

    [JsonPropertyName("items")]
    public List<ErpNextMaterialRequestItemDto>? Items { get; set; }
}

#endregion

#region Transfer In Stock Entry (get_material_transfer_stock_entries)

/// <summary>Transfer In Stock Entry item from get_material_transfer_stock_entries. Store fields use code only.</summary>
public class ErpNextTransferInStockEntryItemDto
{
    [JsonPropertyName("idx")]
    public int Idx { get; set; }

    [JsonPropertyName("item_code")]
    public string? ItemCode { get; set; }

    [JsonPropertyName("item_name")]
    public string? ItemName { get; set; }

    [JsonPropertyName("qty")]
    public double Qty { get; set; }

    [JsonPropertyName("uom")]
    public string? Uom { get; set; }

    [JsonPropertyName("s_warehouse_code")]
    public string? SWarehouseCode { get; set; }

    [JsonPropertyName("t_warehouse_code")]
    public string? TWarehouseCode { get; set; }

    [JsonPropertyName("basic_rate")]
    public double BasicRate { get; set; }

    [JsonPropertyName("basic_amount")]
    public double BasicAmount { get; set; }

    [JsonPropertyName("serial_no")]
    public string? SerialNo { get; set; }

    [JsonPropertyName("batch_no")]
    public string? BatchNo { get; set; }
}

/// <summary>Transfer In Stock Entry header from get_material_transfer_stock_entries. Store fields use code only.</summary>
public class ErpNextTransferInStockEntryDto
{
    [JsonPropertyName("stock_entry_no")]
    public string? StockEntryNo { get; set; }

    [JsonPropertyName("stock_entry_type")]
    public string? StockEntryType { get; set; }

    [JsonPropertyName("company")]
    public string? Company { get; set; }

    [JsonPropertyName("posting_date")]
    public string? PostingDate { get; set; }

    [JsonPropertyName("posting_time")]
    public string? PostingTime { get; set; }

    [JsonPropertyName("docstatus")]
    public int Docstatus { get; set; }

    [JsonPropertyName("from_warehouse_code")]
    public string? FromWarehouseCode { get; set; }

    [JsonPropertyName("to_warehouse_code")]
    public string? ToWarehouseCode { get; set; }

    /// <summary>Receiving warehouse (final destination); use this for "To Warehouse" when present (e.g. Add to Transit).</summary>
    [JsonPropertyName("custom_receiving_warehouse")]
    public string? CustomReceivingWarehouse { get; set; }

    [JsonPropertyName("custom_receiving_warehouse_code")]
    public string? CustomReceivingWarehouseCode { get; set; }

    [JsonPropertyName("remarks")]
    public string? Remarks { get; set; }

    [JsonPropertyName("owner")]
    public string? Owner { get; set; }

    [JsonPropertyName("creation")]
    public string? Creation { get; set; }

    [JsonPropertyName("modified")]
    public string? Modified { get; set; }

    [JsonPropertyName("items")]
    public List<ErpNextTransferInStockEntryItemDto>? Items { get; set; }

    /// <summary>Some APIs return line items as "item_details".</summary>
    [JsonPropertyName("item_details")]
    public List<ErpNextTransferInStockEntryItemDto>? ItemDetails { get; set; }
}

#endregion

/// <summary>ERPNext wrapper: {"message": [...]}.</summary>
public class ErpNextMessageListWrapper<T>
{
    [JsonPropertyName("message")]
    public List<T>? Message { get; set; }
}

/// <summary>
/// Fetches ASNs and Transfer Orders from ERPNext wms_sync methods
/// (get_asns_for_wms, get_tos_for_wms). Uses token auth like warehouse sync.
/// </summary>
public static class ErpNextWmsSyncApiService
{
    /// <summary>
    /// Fetch ASNs from ERPNext: get_asns_for_wms?export_pending=1&include_items=1
    /// </summary>
    public static async Task<List<ErpNextAsnDto>?> FetchAsnsFromErpNextAsync(
        WmsSettings settings,
        string? overrideBaseUrl = null,
        string? overrideApiKey = null,
        string? endpointName = null)
    {
        var (baseUrl, apiKey, label) = ResolveEndpoint(settings, overrideBaseUrl, overrideApiKey, endpointName);
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(apiKey))
        {
            ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: {label} API URL or key not configured");
            return null;
        }

        var apiUrl = $"{baseUrl}/api/method/printechs_wms.api.wms_sync.get_asns_for_wms?export_pending=1&include_items=1";
        return await FetchMessageListAsync<ErpNextAsnDto>(apiUrl, apiKey, label, "ASNs");
    }

    /// <summary>
    /// Fetch current ASN item codes from ERPNext get_asn_items_for_wms. Use to filter payload so we only send items that exist in ERPNext (avoids sending deleted/stale local items).
    /// Returns null if fetch fails; then caller uses all local details.
    /// </summary>
    public static async Task<HashSet<string>?> FetchAsnItemCodesFromErpNextAsync(WmsSettings settings, string asnName)
    {
        if (string.IsNullOrWhiteSpace(asnName)) return null;
        var (baseUrl, apiKey, label) = ResolveEndpoint(settings, null, null, null);
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(apiKey)) return null;
        var encoded = Uri.EscapeDataString(asnName.Trim());
        var apiUrl = $"{baseUrl}/api/method/printechs_wms.api.wms_sync.get_asn_items_for_wms?asn_name={encoded}";
        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);
            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("token", apiKey);
            var response = await httpClient.GetAsync(apiUrl);
            if (!response.IsSuccessStatusCode) return null;
            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!root.TryGetProperty("message", out var msg) || msg.ValueKind != JsonValueKind.Object) return null;
            if (!msg.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array) return null;
            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in items.EnumerateArray())
            {
                if (item.TryGetProperty("item_code", out var ic))
                {
                    var code = ic.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(code)) set.Add(code);
                }
            }
            ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: Fetched {set.Count} item code(s) from ERPNext for ASN {asnName} (use as filter for PR/received qty).");
            return set;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ErpNextWmsSyncApiService: FetchAsnItemCodes for {asnName}: {ex.Message}", ex);
            return null;
        }
    }

    /// <summary>
    /// Fetch Transfer Orders from ERPNext: get_tos_for_wms?export_pending=1&include_items=1&docstatus=1
    /// export_pending=1 so only TOs not yet Exported are returned (matches Postman; avoids "updated: 1" when all are Exported).
    /// </summary>
    public static async Task<List<ErpNextToDto>?> FetchTransferOrdersFromErpNextAsync(
        WmsSettings settings,
        string? overrideBaseUrl = null,
        string? overrideApiKey = null,
        string? endpointName = null)
    {
        var (baseUrl, apiKey, label) = ResolveEndpoint(settings, overrideBaseUrl, overrideApiKey, endpointName);
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(apiKey))
        {
            ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: {label} API URL or key not configured");
            return null;
        }

        var apiUrl = $"{baseUrl}/api/method/printechs_wms.api.wms_sync.get_tos_for_wms?export_pending=1&include_items=1&docstatus=1";
        return await FetchMessageListAsync<ErpNextToDto>(apiUrl, apiKey, label, "Transfer Orders");
    }

    /// <summary>
    /// Fetch Material Requests from ERPNext get_material_transfer_requests.
    /// When fullRequestUrl contains "get_material_transfer_requests" or "material_request", it is used as-is (with your from_warehouse, state, docstatus, include_items, limit).
    /// Otherwise builds URL from base + default path (for fallback).
    /// </summary>
    public static async Task<List<ErpNextMaterialRequestDto>?> FetchMaterialRequestsFromErpNextAsync(
        WmsSettings settings,
        string fullRequestUrlOrBase,
        string apiKey,
        string label)
    {
        if (string.IsNullOrWhiteSpace(fullRequestUrlOrBase) || string.IsNullOrWhiteSpace(apiKey))
        {
            ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: {label} API URL or key not configured");
            return null;
        }
        var url = fullRequestUrlOrBase.Trim();
        var isFullUrl = url.IndexOf("get_material_transfer_requests", StringComparison.OrdinalIgnoreCase) >= 0
            || url.IndexOf("material_request", StringComparison.OrdinalIgnoreCase) >= 0;
        if (!isFullUrl)
        {
            var baseUrl = ExtractBaseUrl(url);
            if (string.IsNullOrWhiteSpace(baseUrl)) baseUrl = url.TrimEnd('/');
            // docstatus=1 = Submitted only (exclude Draft). Use full URL with docstatus=0 in sync endpoint if you need drafts.
            url = $"{baseUrl}/api/method/printechs_wms.api.material_request.get_material_transfer_requests?from_warehouse=Main%20Warehouse%20-%20MAATC&state=Pending&docstatus=1&include_items=1&limit=200";
        }
        return await FetchMessageListAsync<ErpNextMaterialRequestDto>(url, apiKey, label, "Material Requests");
    }

    /// <summary>
    /// Fetch Transfer In Stock Entries from ERPNext get_material_transfer_stock_entries.
    /// When fullRequestUrl contains "get_material_transfer_stock_entries" or "transfer_in_sync", it is used as-is.
    /// Otherwise builds URL from base + default path with add_to_transit=1 and custom_receiving_warehouse (receiving warehouse).
    /// </summary>
    public static async Task<List<ErpNextTransferInStockEntryDto>?> FetchTransferInStockEntriesFromErpNextAsync(
        WmsSettings settings,
        string fullRequestUrlOrBase,
        string apiKey,
        string label)
    {
        if (string.IsNullOrWhiteSpace(fullRequestUrlOrBase) || string.IsNullOrWhiteSpace(apiKey))
        {
            ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: {label} API URL or key not configured");
            return null;
        }
        var url = fullRequestUrlOrBase.Trim();
        var isFullUrl = url.IndexOf("get_material_transfer_stock_entries", StringComparison.OrdinalIgnoreCase) >= 0
            || url.IndexOf("transfer_in_sync", StringComparison.OrdinalIgnoreCase) >= 0;
        if (!isFullUrl)
        {
            var baseUrl = ExtractBaseUrl(url);
            if (string.IsNullOrWhiteSpace(baseUrl)) baseUrl = url.TrimEnd('/');
            // Transfer In API: add_to_transit=1, custom_receiving_warehouse = receiving warehouse (to_warehouse in API terms)
            url = $"{baseUrl}/api/method/printechs_wms.api.transfer_in_sync.get_material_transfer_stock_entries?add_to_transit=1&custom_receiving_warehouse=Main%20Warehouse%20-%20MAATC&docstatus=1";
        }
        return await FetchMessageListAsync<ErpNextTransferInStockEntryDto>(url, apiKey, label, "Transfer In Stock Entries");
    }

    private static async Task<List<T>?> FetchMessageListAsync<T>(string apiUrl, string apiKey, string label, string entityName)
    {
        ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: [{label}] Fetching {entityName} from {apiUrl}");
        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(60);
            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("token", apiKey);

            var response = await httpClient.GetAsync(apiUrl);
            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                ErrorLogService.LogError($"ErpNextWmsSyncApiService: API returned {response.StatusCode}: {errorContent}", null);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync();
            var list = ParseMessageList<T>(json, label, entityName);
            ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: [{label}] Fetched {list?.Count ?? 0} {entityName}");
            return list ?? new List<T>();
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ErpNextWmsSyncApiService: [{label}] Error fetching {entityName}: {ex.Message}", ex);
            return null;
        }
    }

    /// <summary>
    /// Parse API response: {"message": [...]} or {"message": {"data": [...]}} or [...] or {"message": "error"}.
    /// ERPNext can return message as array, object with nested array, or string/null.
    /// </summary>
    private static List<T>? ParseMessageList<T>(string json, string label, string entityName)
    {
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        if (string.IsNullOrWhiteSpace(json)) return new List<T>();

        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            if (root.ValueKind == JsonValueKind.Array)
            {
                var list = JsonSerializer.Deserialize<List<T>>(root.GetRawText(), options);
                return list ?? new List<T>();
            }

            if (root.ValueKind != JsonValueKind.Object) return new List<T>();

            if (!root.TryGetProperty("message", out var messageEl))
            {
                // No "message" - try deserialize whole as list (unlikely)
                var list = JsonSerializer.Deserialize<List<T>>(json, options);
                return list ?? new List<T>();
            }

            switch (messageEl.ValueKind)
            {
                case JsonValueKind.Array:
                    return JsonSerializer.Deserialize<List<T>>(messageEl.GetRawText(), options) ?? new List<T>();
                case JsonValueKind.Object:
                    // Prefer "data" (material_request get_material_transfer_requests), "rows" (wms_sync), then first array
                    if (messageEl.TryGetProperty("data", out var dataEl) && dataEl.ValueKind == JsonValueKind.Array)
                        return JsonSerializer.Deserialize<List<T>>(dataEl.GetRawText(), options) ?? new List<T>();
                    if (messageEl.TryGetProperty("rows", out var rowsEl) && rowsEl.ValueKind == JsonValueKind.Array)
                        return JsonSerializer.Deserialize<List<T>>(rowsEl.GetRawText(), options) ?? new List<T>();
                    foreach (var prop in messageEl.EnumerateObject())
                    {
                        if (prop.Value.ValueKind == JsonValueKind.Array)
                            return JsonSerializer.Deserialize<List<T>>(prop.Value.GetRawText(), options) ?? new List<T>();
                    }
                    ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: [{label}] message is object but no array property found. Keys: {string.Join(", ", messageEl.EnumerateObject().Select(p => p.Name))}");
                    return new List<T>();
                case JsonValueKind.String:
                    var msg = messageEl.GetString();
                    ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: [{label}] API message (string): {msg}");
                    return new List<T>();
                case JsonValueKind.Null:
                case JsonValueKind.Undefined:
                    return new List<T>();
                default:
                    ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: [{label}] message value kind: {messageEl.ValueKind}");
                    return new List<T>();
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ErpNextWmsSyncApiService: [{label}] Error parsing {entityName} JSON: {ex.Message}", ex);
            return null;
        }
    }

    private static (string? baseUrl, string? apiKey, string label) ResolveEndpoint(
        WmsSettings settings,
        string? overrideBaseUrl,
        string? overrideApiKey,
        string? endpointName)
    {
        var url = !string.IsNullOrWhiteSpace(overrideBaseUrl)
            ? overrideBaseUrl
            : (!string.IsNullOrWhiteSpace(settings.ErpNextApiUrl) ? settings.ErpNextApiUrl : settings.ApiEndpointUrl);
        var key = !string.IsNullOrWhiteSpace(overrideApiKey)
            ? overrideApiKey
            : (!string.IsNullOrWhiteSpace(settings.ErpNextApiKey) ? settings.ErpNextApiKey : settings.ApiKey);
        var label = string.IsNullOrWhiteSpace(endpointName) ? "ERPNext" : endpointName;
        var baseUrl = ExtractBaseUrl(url ?? string.Empty);
        return (baseUrl, key, label);
    }

    private static string ExtractBaseUrl(string apiEndpointUrl)
    {
        var input = apiEndpointUrl?.Trim() ?? string.Empty;
        if (string.IsNullOrEmpty(input)) return input;
        try
        {
            if (Uri.TryCreate(input, UriKind.Absolute, out var uri) &&
                (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
            {
                var authority = uri.GetLeftPart(UriPartial.Authority);
                if (!string.IsNullOrEmpty(authority)) return authority;
            }
        }
        catch { }
        if (input.StartsWith("/", StringComparison.Ordinal))
            return string.Empty;
        var url = input.TrimEnd('/');
        if (url.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
            url = url.Substring(0, url.Length - 4).TrimEnd('/');
        return url;
    }

    #region Push status to ERPNext (update_asn_wms_status / update_transfer_order_wms_status)

    /// <summary>
    /// Generate WMS reference for status push: BATCH-{yyyyMMdd}-{HHmmss} (unique per call).
    /// Can be overridden by caller (e.g. BATCH-20260201-01).
    /// </summary>
    public static string GenerateWmsRef(DateTime? at = null)
    {
        var t = at ?? DateTime.UtcNow;
        return $"BATCH-{t:yyyyMMdd}-{t:HHmmss}";
    }

    /// <summary>
    /// POST to ERPNext update_asns_wms_status (batch). Params: asn_names=ASN-0003,ASN-0004&status=Exported.
    /// Call this right after ASN sync with the list of ASN names just synced.
    /// </summary>
    public static async Task<(bool Success, int? UpdatedCount, string? Error)> UpdateAsnsWmsStatusAsync(
        WmsSettings settings,
        IReadOnlyList<string> asnNames,
        string status = "Exported",
        string? wmsRef = null)
    {
        if (asnNames == null || asnNames.Count == 0)
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: UpdateAsnsWmsStatus skipped (no ASN names).");
            return (true, 0, null);
        }
        var (baseUrl, apiKey, _) = ResolveEndpoint(settings, null, null, null);
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(apiKey))
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: UpdateAsnsWmsStatus API URL or key not configured");
            return (false, null, "ERPNext API URL or key not configured");
        }
        var url = $"{baseUrl}/api/method/printechs_wms.api.wms_sync.update_asns_wms_status";
        var asnNamesParam = string.Join(",", asnNames.Select(n => (n ?? "").Trim()).Where(n => n.Length > 0));
        if (string.IsNullOrEmpty(asnNamesParam))
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: UpdateAsnsWmsStatus skipped (no valid ASN names).");
            return (true, 0, null);
        }
        var refValue = string.IsNullOrWhiteSpace(wmsRef) ? GenerateWmsRef() : wmsRef.Trim();
        var form = new Dictionary<string, string>
        {
            { "asn_names", asnNamesParam },
            { "status", (status ?? "Exported").Trim() },
            { "wms_ref", refValue }
        };
        var (success, error) = await PostFormAsync(url, apiKey, form, "ASNs status (batch)");
        if (success)
            ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: ASN status posted to ERPNext: {asnNames.Count} ASN(s), status={status}");
        return (success, success ? asnNames.Count : null, error);
    }

    /// <summary>
    /// POST to ERPNext update_asn_wms_status (single). Uses overrideBaseUrl/overrideApiKey if provided, else ErpNextApiUrl/ErpNextApiKey or ApiEndpointUrl/ApiKey.
    /// Pass the same endpoint URL/key used for ASN pull so push goes to the same ERPNext server.
    /// </summary>
    public static async Task<(bool Success, string? Error)> UpdateAsnWmsStatusAsync(
        WmsSettings settings,
        string asnName,
        string status = "Exported",
        string? wmsRef = null,
        string? overrideBaseUrl = null,
        string? overrideApiKey = null)
    {
        var (baseUrl, apiKey, _) = ResolveEndpoint(settings, overrideBaseUrl, overrideApiKey, null);
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(apiKey))
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: UpdateAsnWmsStatus API URL or key not configured");
            return (false, "ERPNext API URL or key not configured");
        }
        var url = $"{baseUrl}/api/method/printechs_wms.api.wms_sync.update_asn_wms_status";
        ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: Posting ASN {asnName} status={status} to {url}");
        var refValue = string.IsNullOrWhiteSpace(wmsRef) ? GenerateWmsRef() : wmsRef.Trim();
        var form = new Dictionary<string, string>
        {
            { "asn_name", (asnName ?? "").Trim() },
            { "status", (status ?? "Exported").Trim() },
            { "wms_ref", refValue }
        };
        return await PostFormAsync(url, apiKey, form, "ASN status");
    }

    /// <summary>
    /// POST to ERPNext update_transfer_order_wms_status (single). Params: to_name, status, wms_ref, exported_by.
    /// Uses overrideBaseUrl/overrideApiKey if provided, else ErpNextApiUrl/ErpNextApiKey or ApiEndpointUrl/ApiKey.
    /// </summary>
    public static async Task<(bool Success, string? Error)> UpdateTransferOrderWmsStatusAsync(
        WmsSettings settings,
        string toName,
        string status = "Exported",
        string? wmsRef = null,
        string? exportedBy = null,
        string? overrideBaseUrl = null,
        string? overrideApiKey = null)
    {
        var (baseUrl, apiKey, _) = ResolveEndpoint(settings, overrideBaseUrl, overrideApiKey, null);
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(apiKey))
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: UpdateTransferOrderWmsStatus API URL or key not configured");
            return (false, "ERPNext API URL or key not configured");
        }
        var url = $"{baseUrl}/api/method/printechs_wms.api.wms_sync.update_transfer_order_wms_status";
        var refValue = string.IsNullOrWhiteSpace(wmsRef) ? GenerateWmsRef() : wmsRef.Trim();
        var form = new Dictionary<string, string>
        {
            { "to_name", (toName ?? "").Trim() },
            { "status", (status ?? "Exported").Trim() },
            { "wms_ref", refValue }
        };
        if (!string.IsNullOrWhiteSpace(exportedBy))
            form["exported_by"] = exportedBy.Trim();
        return await PostFormAsync(url, apiKey, form, "TO status");
    }

    /// <summary>
    /// POST to ERPNext mark_asns_exported (bulk). Params: asn_names, export_status, wms_batch_id.
    /// Use after syncing many ASNs in one go.
    /// </summary>
    public static async Task<(bool Success, int? UpdatedCount, string? Error)> MarkAsnsExportedAsync(
        WmsSettings settings,
        IReadOnlyList<string> asnNames,
        string exportStatus = "Exported",
        string? wmsBatchId = null)
    {
        if (asnNames == null || asnNames.Count == 0)
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: MarkAsnsExported skipped (no ASN names).");
            return (true, 0, null);
        }
        var (baseUrl, apiKey, _) = ResolveEndpoint(settings, null, null, null);
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(apiKey))
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: MarkAsnsExported API URL or key not configured");
            return (false, null, "ERPNext API URL or key not configured");
        }
        var url = $"{baseUrl}/api/method/printechs_wms.api.wms_sync.mark_asns_exported";
        var asnNamesParam = string.Join(",", asnNames.Select(n => (n ?? "").Trim()).Where(n => n.Length > 0));
        if (string.IsNullOrEmpty(asnNamesParam))
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: MarkAsnsExported skipped (no valid ASN names).");
            return (true, 0, null);
        }
        var batchId = string.IsNullOrWhiteSpace(wmsBatchId) ? GenerateWmsRef() : wmsBatchId.Trim();
        var form = new Dictionary<string, string>
        {
            { "asn_names", asnNamesParam },
            { "export_status", (exportStatus ?? "Exported").Trim() },
            { "wms_batch_id", batchId }
        };
        var (success, error) = await PostFormAsync(url, apiKey, form, "ASNs bulk (mark_asns_exported)");
        if (success)
            ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: ASNs marked exported: {asnNames.Count}, status={exportStatus}");
        return (success, success ? asnNames.Count : null, error);
    }

    /// <summary>
    /// POST to ERPNext mark_tos_exported (bulk). Params: to_names, export_status, wms_batch_id.
    /// Use after syncing many TOs in one go.
    /// </summary>
    public static async Task<(bool Success, int? UpdatedCount, string? Error)> MarkTosExportedAsync(
        WmsSettings settings,
        IReadOnlyList<string> toNames,
        string exportStatus = "Exported",
        string? wmsBatchId = null)
    {
        if (toNames == null || toNames.Count == 0)
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: MarkTosExported skipped (no TO names).");
            return (true, 0, null);
        }
        var (baseUrl, apiKey, _) = ResolveEndpoint(settings, null, null, null);
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(apiKey))
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: MarkTosExported API URL or key not configured");
            return (false, null, "ERPNext API URL or key not configured");
        }
        var url = $"{baseUrl}/api/method/printechs_wms.api.wms_sync.mark_tos_exported";
        var toNamesParam = string.Join(",", toNames.Select(n => (n ?? "").Trim()).Where(n => n.Length > 0));
        if (string.IsNullOrEmpty(toNamesParam))
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: MarkTosExported skipped (no valid TO names).");
            return (true, 0, null);
        }
        var batchId = string.IsNullOrWhiteSpace(wmsBatchId) ? GenerateWmsRef() : wmsBatchId.Trim();
        var form = new Dictionary<string, string>
        {
            { "to_names", toNamesParam },
            { "export_status", (exportStatus ?? "Exported").Trim() },
            { "wms_batch_id", batchId }
        };
        var (success, error) = await PostFormAsync(url, apiKey, form, "TOs bulk (mark_tos_exported)");
        if (success)
            ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: TOs marked exported: {toNames.Count}, status={exportStatus}");
        return (success, success ? toNames.Count : null, error);
    }

    private static async Task<(bool Success, string? Error)> PostFormAsync(string url, string apiKey, Dictionary<string, string> form, string label)
    {
        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);
            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("token", apiKey);
            using var content = new FormUrlEncodedContent(form);
            var response = await httpClient.PostAsync(url, content);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync();
                ErrorLogService.LogError($"ErpNextWmsSyncApiService: {label} API returned {response.StatusCode}: {body}", null);
                return (false, $"{response.StatusCode}: {body}");
            }
            ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: {label} updated successfully.");
            return (true, null);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ErpNextWmsSyncApiService: {label} error: {ex.Message}", ex);
            return (false, ex.Message);
        }
    }

    #endregion

    #region ASN Received Qty Push (update_asn_received_qty)

    /// <summary>Request line for update_asn_received_qty (and PR) API. Serializes as received_qty per API contract.</summary>
    public class AsnReceivedQtyLineDto
    {
        [JsonPropertyName("item_code")]
        public string ItemCode { get; set; } = string.Empty;

        /// <summary>When set, ERP can match this line to the correct ASN row when item_code repeats.</summary>
        [JsonPropertyName("carton_id")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? CartonId { get; set; }

        [JsonPropertyName("po_item_reference")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? PoItemReference { get; set; }

        [JsonPropertyName("inbound_session")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? InboundSession { get; set; }

        [JsonPropertyName("received_qty")]
        public int ReceivedQty { get; set; }
    }

    /// <summary>Request body for update_asn_received_qty API.</summary>
    public class AsnReceivedQtyRequestDto
    {
        [JsonPropertyName("asn_no")]
        public string AsnNo { get; set; } = string.Empty;

        [JsonPropertyName("mode")]
        public string Mode { get; set; } = "increment";

        [JsonPropertyName("update_status")]
        public int UpdateStatus { get; set; } = 1;

        /// <summary>Default receiving warehouse code (or name) for the ASN. Populated from Settings DefaultReceivingWarehouseForPr.</summary>
        [JsonPropertyName("default_receiving_warehouse_code")]
        public string? DefaultReceivingWarehouseCode { get; set; }

        [JsonPropertyName("lines")]
        public List<AsnReceivedQtyLineDto> Lines { get; set; } = new();
    }

    /// <summary>
    /// One API line per WMS ASN detail row. The same <c>item_code</c> may repeat with different <c>carton_id</c>
    /// (and optional <c>po_item_reference</c> / <c>inbound_session</c>) so ERPNext can match each ASN child line.
    /// </summary>
    private static List<AsnReceivedQtyLineDto> BuildPerDetailReceivedQtyLines(IEnumerable<AsnItemDetails> detailsToUse)
    {
        return detailsToUse
            .Where(d => !string.IsNullOrWhiteSpace(d.ItemCode))
            .Select(d => new AsnReceivedQtyLineDto
            {
                ItemCode = (d.ItemCode ?? "").Trim(),
                CartonId = string.IsNullOrWhiteSpace(d.CartonId) ? null : d.CartonId.Trim(),
                PoItemReference = string.IsNullOrWhiteSpace(d.PoItemReference) ? null : d.PoItemReference.Trim(),
                InboundSession = string.IsNullOrWhiteSpace(d.InboundSession) ? null : d.InboundSession.Trim(),
                ReceivedQty = (int)Math.Round(d.ReceivedQty)
            })
            .Where(l => l.ReceivedQty > 0)
            .ToList();
    }

    /// <summary>
    /// Parses <c>update_asn_received_qty</c> success response for ERP ASN document status.
    /// Returns <c>true</c> when status is Received, <c>false</c> when another status string was found, <c>null</c> when not found (extend ERP response if needed).
    /// </summary>
    public static bool? TryParseErpAsnStatusIsReceivedFromUpdateQtyResponse(string? responseBody)
    {
        if (string.IsNullOrWhiteSpace(responseBody)) return null;
        try
        {
            using var doc = JsonDocument.Parse(responseBody);
            var root = doc.RootElement;
            var status = ExtractStatusStringFromFrappePayload(root);
            if (string.IsNullOrWhiteSpace(status)) return null;
            return string.Equals(status.Trim(), "Received", StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return null;
        }
    }

    private static string? ExtractStatusStringFromFrappePayload(JsonElement root)
    {
        // printechs_wms shape: message.{status,name}, root status/asn_status/wms_asn_status, header.new_status
        if (TryGetJsonPropertyIgnoreCase(root, "message", out var msg))
        {
            if (msg.ValueKind == JsonValueKind.String)
            {
                var raw = msg.GetString()?.Trim();
                if (!string.IsNullOrEmpty(raw) && raw.Length >= 2 && raw[0] == '{' && raw[^1] == '}')
                {
                    try
                    {
                        using var inner = JsonDocument.Parse(raw);
                        var innerStatus = ExtractStatusStringFromFrappePayload(inner.RootElement);
                        if (!string.IsNullOrWhiteSpace(innerStatus))
                            return innerStatus;
                    }
                    catch
                    {
                        /* use raw string below */
                    }
                }
                if (!string.IsNullOrWhiteSpace(raw))
                    return raw;
            }
            if (msg.ValueKind == JsonValueKind.Object)
            {
                foreach (var key in new[] { "status", "asn_status", "wms_asn_status", "docstatus", "doc_status" })
                {
                    if (TryGetJsonPropertyIgnoreCase(msg, key, out var el) && el.ValueKind == JsonValueKind.String)
                        return el.GetString();
                }
                if (TryGetJsonPropertyIgnoreCase(msg, "data", out var data) && data.ValueKind == JsonValueKind.Object)
                {
                    foreach (var key in new[] { "status", "asn_status", "wms_asn_status" })
                    {
                        if (TryGetJsonPropertyIgnoreCase(data, key, out var el) && el.ValueKind == JsonValueKind.String)
                            return el.GetString();
                    }
                }
                var deep = FindAsnStatusStringRecursive(msg, depth: 0, maxDepth: 14);
                if (!string.IsNullOrWhiteSpace(deep))
                    return deep;
            }
            else if (msg.ValueKind == JsonValueKind.Array)
            {
                var deep = FindAsnStatusStringRecursive(msg, 0, 14);
                if (!string.IsNullOrWhiteSpace(deep))
                    return deep;
            }
        }
        if (TryGetJsonPropertyIgnoreCase(root, "header", out var header) && header.ValueKind == JsonValueKind.Object)
        {
            if (TryGetJsonPropertyIgnoreCase(header, "new_status", out var ns) && ns.ValueKind == JsonValueKind.String)
                return ns.GetString();
        }
        foreach (var key in new[] { "status", "asn_status", "wms_asn_status" })
        {
            if (TryGetJsonPropertyIgnoreCase(root, key, out var el) && el.ValueKind == JsonValueKind.String)
                return el.GetString();
        }
        return FindAsnStatusStringRecursive(root, 0, 10);
    }

    private static bool TryGetJsonPropertyIgnoreCase(JsonElement obj, string name, out JsonElement value)
    {
        value = default;
        if (obj.ValueKind != JsonValueKind.Object) return false;
        foreach (var p in obj.EnumerateObject())
        {
            if (string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                value = p.Value;
                return true;
            }
        }
        return false;
    }

    private static bool IsAsnStatusJsonPropertyName(string name) =>
        string.Equals(name, "status", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(name, "asn_status", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(name, "wms_asn_status", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(name, "doc_status", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(name, "new_status", StringComparison.OrdinalIgnoreCase);

    /// <summary>Depth-first search for a string property named status / asn_status / etc. (ERPNext often nests under message.doc).</summary>
    private static string? FindAsnStatusStringRecursive(JsonElement el, int depth, int maxDepth)
    {
        if (depth > maxDepth) return null;
        switch (el.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var p in el.EnumerateObject())
                {
                    if (IsAsnStatusJsonPropertyName(p.Name) && p.Value.ValueKind == JsonValueKind.String)
                    {
                        var s = p.Value.GetString();
                        if (!string.IsNullOrWhiteSpace(s))
                            return s;
                    }
                }
                foreach (var p in el.EnumerateObject())
                {
                    if (p.Value.ValueKind is JsonValueKind.Object or JsonValueKind.Array)
                    {
                        var inner = FindAsnStatusStringRecursive(p.Value, depth + 1, maxDepth);
                        if (!string.IsNullOrWhiteSpace(inner))
                            return inner;
                    }
                }
                break;
            case JsonValueKind.Array:
                foreach (var item in el.EnumerateArray())
                {
                    if (item.ValueKind is JsonValueKind.Object or JsonValueKind.Array)
                    {
                        var inner = FindAsnStatusStringRecursive(item, depth + 1, maxDepth);
                        if (!string.IsNullOrWhiteSpace(inner))
                            return inner;
                    }
                }
                break;
        }
        return null;
    }

    /// <summary>
    /// POST ASN received qty to ERPNext using the configured Push Endpoint (ASN Status).
    /// Sends one line per local ASN detail with received_qty; includes carton/session/PO ref when present so ERP can match repeated item_code lines.
    /// Third tuple value: whether ERP reports ASN status Received (from JSON response); null if not present in payload.
    /// </summary>
    public static async Task<(bool Success, string? Error, bool? ErpAsnStatusIsReceived)> PushAsnReceivedQtyToErpNextAsync(WmsSettings settings, Asn asn)
    {
        if (asn == null)
        {
            return (false, "ASN data not available.", null);
        }
        if (!string.Equals(asn.Status, "Received", StringComparison.OrdinalIgnoreCase))
        {
            ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: PushAsnReceivedQty rejected — ASN status is '{asn.Status}', must be 'Received'.");
            return (false, $"ASN status must be 'Received' to send received qty to ERPNext. Current status is '{asn.Status}'.", null);
        }
        if (asn.Details == null || asn.Details.Count == 0)
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: PushAsnReceivedQty skipped (no details).");
            return (false, "ASN has no item details to send.", null);
        }

        var push = settings.PushEndpoints?
            .FirstOrDefault(p => p.Enabled && string.Equals(p.EndpointType, PushEndpointTypeNames.AsnStatus, StringComparison.OrdinalIgnoreCase));
        if (push == null || string.IsNullOrWhiteSpace(push.BaseUrl))
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: Push ASN received qty - no enabled ASN Status push endpoint configured.");
            return (false, "Configure an enabled Push Endpoint with Type 'ASN Status' in Settings.", null);
        }

        var asnNo = (asn.Title ?? "").Trim();
        if (string.IsNullOrEmpty(asnNo))
        {
            return (false, "ASN has no title.", null);
        }

        // Resolve default receiving warehouse (code) for default_receiving_warehouse_code in ASN update payload
        var defaultReceivingWarehouseCode = (settings.DefaultReceivingWarehouseForPr ?? settings.DefaultPickingWarehouse ?? "").Trim();
        var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
        var matchedWh = warehouses.FirstOrDefault(w =>
            string.Equals(w.Code, defaultReceivingWarehouseCode, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(w.Name, defaultReceivingWarehouseCode, StringComparison.OrdinalIgnoreCase));
        if (matchedWh != null)
            defaultReceivingWarehouseCode = matchedWh.Code;
        else         if (string.IsNullOrEmpty(defaultReceivingWarehouseCode))
            defaultReceivingWarehouseCode = "WH-MAIN"; // fallback code when no setting

        // Use ERPNext as source of truth: only send items that exist in current ASN (avoids sending deleted/stale local items).
        var erpItemCodes = await FetchAsnItemCodesFromErpNextAsync(settings, asnNo);
        var detailsToUse = erpItemCodes != null && erpItemCodes.Count > 0
            ? asn.Details.Where(d => erpItemCodes.Contains((d.ItemCode ?? "").Trim())).ToList()
            : asn.Details;

        var lines = BuildPerDetailReceivedQtyLines(detailsToUse);

        var payload = new AsnReceivedQtyRequestDto
        {
            AsnNo = asnNo,
            Mode = "increment",
            UpdateStatus = 1,
            DefaultReceivingWarehouseCode = defaultReceivingWarehouseCode,
            Lines = lines
        };

        var url = push.BaseUrl.Trim();
        var apiKey = (push.ApiKey ?? "").Trim();
        if (string.IsNullOrEmpty(apiKey))
        {
            return (false, "Push endpoint API Key is empty.", null);
        }

        ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: Pushing ASN received qty for {asnNo}, {lines.Count} line(s) (one per WMS detail row). Summary: [{string.Join(", ", lines.Select(l => $"{l.ItemCode}:{l.ReceivedQty}{(string.IsNullOrEmpty(l.CartonId) ? "" : $"(ctn:{l.CartonId})")}"))}], to {url}");
        var asnJsonOpts = new JsonSerializerOptions { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
        var (success, error, body) = await PostJsonAndGetBodyAsync(url, apiKey, payload, "ASN received qty", asnJsonOpts);
        if (!success)
            return (false, error, null);
        await AsnDataService.SetAsnWarehouseAsync(settings, asnNo, defaultReceivingWarehouseCode);
        var erpReceived = TryParseErpAsnStatusIsReceivedFromUpdateQtyResponse(body);
        if (erpReceived.HasValue)
            ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: Parsed ERP ASN status from update_asn_received_qty response: Received={erpReceived.Value}.");
        else
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: update_asn_received_qty succeeded but no string status/asn_status found in JSON; check Error Log preview below or extend ERP response.");
            if (!string.IsNullOrEmpty(body))
            {
                var preview = body.Length > 800 ? body.Substring(0, 800) + "..." : body;
                ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: update_asn_received_qty response preview (status parse): {preview}");
            }
        }
        return (true, null, erpReceived);
    }

    private static async Task<(bool Success, string? Error)> PostJsonAsync<T>(string url, string apiKey, T payload, string label, JsonSerializerOptions? jsonOptions = null)
    {
        var (success, error, _) = await PostJsonAndGetBodyAsync(url, apiKey, payload, label, jsonOptions);
        return (success, error);
    }

    private static async Task<(bool Success, string? Error, string? ResponseBody)> PostJsonAndGetBodyAsync<T>(string url, string apiKey, T payload, string label, JsonSerializerOptions? jsonOptions = null)
    {
        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);
            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("token", apiKey);
            var json = jsonOptions != null ? JsonSerializer.Serialize(payload, jsonOptions) : JsonSerializer.Serialize(payload);
            using var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            var response = await httpClient.PostAsync(url, content);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                ErrorLogService.LogError($"ErpNextWmsSyncApiService: {label} API returned {response.StatusCode}: {body}", null);
                return (false, $"{response.StatusCode}: {body}", null);
            }
            ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: {label} updated successfully.");
            return (true, null, body);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ErpNextWmsSyncApiService: {label} error: {ex.Message}", ex);
            return (false, ex.Message, null);
        }
    }

    #endregion

    #region Cycle Count Push (sync_task_capture_only)

    /// <summary>Line item for cycle count sync_task_capture_only payload.</summary>
    public class CycleCountPushLineDto
    {
        [JsonPropertyName("item_code")]
        public string ItemCode { get; set; } = string.Empty;

        [JsonPropertyName("bin_location")]
        public string BinLocation { get; set; } = string.Empty;

        [JsonPropertyName("carton_id")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? CartonId { get; set; }

        [JsonPropertyName("counted_qty")]
        public double CountedQty { get; set; }

        [JsonPropertyName("uom")]
        public string Uom { get; set; } = "Nos";
    }

    /// <summary>Inner payload for sync_task_capture_only (company, warehouse, lines, etc.).</summary>
    public class CycleCountPushPayloadDto
    {
        [JsonPropertyName("company")]
        public string Company { get; set; } = string.Empty;

        [JsonPropertyName("warehouse")]
        public string Warehouse { get; set; } = string.Empty;

        [JsonPropertyName("warehouse_code")]
        public string WarehouseCode { get; set; } = string.Empty;

        [JsonPropertyName("posting_date")]
        public string PostingDate { get; set; } = string.Empty;

        [JsonPropertyName("external_ref")]
        public string ExternalRef { get; set; } = string.Empty;

        [JsonPropertyName("bin_location")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? BinLocation { get; set; }

        [JsonPropertyName("opening_stock")]
        public int OpeningStock { get; set; }

        [JsonPropertyName("counted_by")]
        public string CountedBy { get; set; } = string.Empty;

        [JsonPropertyName("counted_on")]
        public string CountedOn { get; set; } = string.Empty;

        [JsonPropertyName("lines")]
        public List<CycleCountPushLineDto> Lines { get; set; } = new();
    }

    /// <summary>Request body for sync_task_capture_only: { "payload": { ... } }.</summary>
    public class CycleCountPushRequestDto
    {
        [JsonPropertyName("payload")]
        public CycleCountPushPayloadDto Payload { get; set; } = new();
    }

    /// <summary>
    /// Push cycle count task to ERPNext (sync_task_capture_only). Uses Push Endpoint Type "Cycle Count".
    /// Returns (success, errorMessage, erpReference from response).
    /// </summary>
    public static async Task<(bool Success, string? Error, string? ErpReference)> PushCycleCountToErpNextAsync(WmsSettings settings, CycleCountTask task)
    {
        if (task == null)
        {
            return (false, "Task is null.", null);
        }
        if (task.Lines == null || task.Lines.Count == 0)
        {
            return (false, "No counted lines to send.", null);
        }

        var push = settings.PushEndpoints?
            .FirstOrDefault(p => p.Enabled && (
                string.Equals(p.EndpointType, PushEndpointTypeNames.CycleCount, StringComparison.OrdinalIgnoreCase) ||
                (string.Equals(p.EndpointType, PushEndpointTypeNames.Custom, StringComparison.OrdinalIgnoreCase) &&
                 (p.Name?.Contains("Cycle Count", StringComparison.OrdinalIgnoreCase) == true || (p.BaseUrl?.Contains("sync_task_capture_only", StringComparison.OrdinalIgnoreCase) == true)))));
        if (push == null || string.IsNullOrWhiteSpace(push.BaseUrl))
        {
            return (false, "Configure an enabled Push Endpoint with Type 'Cycle Count' (or Custom with sync_task_capture_only URL) in Settings.", null);
        }

        var company = (settings.Company ?? "").Trim();
        if (string.IsNullOrEmpty(company))
        {
            company = await GetDefaultCompanyFromErpNextAsync(settings) ?? "Mohammed Abdullah Almousa Trading Company";
        }

        // Resolve warehouse name and code (task.Warehouse may be code e.g. WH-MAIN or name)
        // ERPNext expects the full warehouse document name (e.g. "Main Warehouse - MAATC"), not the short WMS name ("Main Warehouse")
        var warehouseCode = (task.Warehouse ?? "").Trim();
        var warehouseName = warehouseCode;
        var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
        var wh = warehouses.FirstOrDefault(w =>
            string.Equals(w.Code, warehouseCode, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(w.Name, warehouseCode, StringComparison.OrdinalIgnoreCase));
        if (wh != null)
        {
            warehouseCode = wh.Code ?? warehouseCode;
            warehouseName = wh.Name ?? warehouseName;
        }
        // ERPNext needs the full warehouse document name (e.g. "Main Warehouse - MAATC"), not the short WMS name ("Main Warehouse")
        var defaultErpWarehouseName = (settings.DefaultReceivingWarehouseForPr ?? settings.DefaultPickingWarehouse ?? "").Trim();
        if (!string.IsNullOrEmpty(defaultErpWarehouseName))
        {
            var defaultWh = warehouses.FirstOrDefault(w =>
                string.Equals(w.Name, defaultErpWarehouseName, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(w.Code, defaultErpWarehouseName, StringComparison.OrdinalIgnoreCase));
            bool useErpName = defaultWh != null && (string.Equals(warehouseCode, defaultWh.Code, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(warehouseName, defaultWh.Name, StringComparison.OrdinalIgnoreCase));
            if (!useErpName && (string.Equals(warehouseCode, "WH-MAIN", StringComparison.OrdinalIgnoreCase) ||
                (warehouseName?.Contains("Main Warehouse", StringComparison.OrdinalIgnoreCase) == true)))
            {
                useErpName = true;
            }
            if (useErpName)
                warehouseName = defaultErpWarehouseName;
        }
        // If we still have a short name (no " - ") that ERPNext may not accept, use setting or common fallback
        if (warehouseName?.Contains(" - ", StringComparison.Ordinal) != true)
        {
            var erpStyleName = (settings.DefaultReceivingWarehouseForPr ?? settings.DefaultPickingWarehouse ?? "").Trim();
            if (!string.IsNullOrEmpty(erpStyleName) && erpStyleName.Contains(" - ", StringComparison.Ordinal) &&
                (string.Equals(warehouseCode, "WH-MAIN", StringComparison.OrdinalIgnoreCase) ||
                 (warehouseName?.StartsWith("Main Warehouse", StringComparison.OrdinalIgnoreCase) == true)))
            {
                warehouseName = erpStyleName;
            }
            else if (string.Equals(warehouseCode, "WH-MAIN", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(warehouseName, "Main Warehouse", StringComparison.OrdinalIgnoreCase))
            {
                // Fallback when settings are not configured: ERPNext often uses "Main Warehouse - MAATC" for WH-MAIN
                warehouseName = "Main Warehouse - MAATC";
            }
        }

        var taskZone = (task.Zone ?? "").Trim();
        var firstLine = task.Lines.FirstOrDefault(l => l.ActualQty.HasValue);
        var countedBy = firstLine?.CountedBy ?? task.AssignedTo ?? task.CreatedBy ?? "";
        var countedOn = firstLine?.CountedOn ?? DateTime.UtcNow;
        var countedOnStr = countedOn.ToString("yyyy-MM-dd HH:mm:ss");

        // Final payload format: no bin_location at header; each line has item_code, bin_location, carton_id, counted_qty, uom.
        // When the task has a zone (single-bin cycle count), send that bin on every line for ERP. Otherwise a typo or
        // stale bin on individual lines (e.g. OWPALI vs OWPALT) causes LinkValidationError in ERPNext.
        var lines = task.Lines
            .Where(l => l.ActualQty.HasValue)
            .Select(l =>
            {
                var lineBin = (l.BinLocation ?? "").Trim();
                var binForErp = !string.IsNullOrWhiteSpace(taskZone)
                    ? taskZone
                    : lineBin;
                return new CycleCountPushLineDto
                {
                    ItemCode = (l.ItemCode ?? "").Trim(),
                    BinLocation = binForErp,
                    CartonId = string.IsNullOrWhiteSpace(l.CartonId) ? null : (l.CartonId ?? "").Trim(),
                    CountedQty = l.ActualQty ?? 0,
                    Uom = "Nos"
                };
            })
            .ToList();

        var payload = new CycleCountPushRequestDto
        {
            Payload = new CycleCountPushPayloadDto
            {
                Company = company,
                Warehouse = warehouseName,
                WarehouseCode = warehouseCode,
                PostingDate = task.CountDate.ToString("yyyy-MM-dd"),
                ExternalRef = task.Title ?? "",
                BinLocation = null,
                OpeningStock = task.IsOpeningStock ? 1 : 0,
                CountedBy = countedBy,
                CountedOn = countedOnStr,
                Lines = lines
            }
        };

        var url = push.BaseUrl.Trim();
        var apiKey = (push.ApiKey ?? "").Trim();
        if (string.IsNullOrEmpty(apiKey))
        {
            return (false, "Cycle Count push endpoint API Key is empty.", null);
        }

        ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: Pushing cycle count {task.Title} to ERPNext, {lines.Count} line(s).");
        var (success, error, responseBody) = await PostJsonAndGetBodyAsync(url, apiKey, payload, "Cycle count");
        if (!success)
        {
            return (false, error, null);
        }

        string? erpRef = null;
        if (!string.IsNullOrWhiteSpace(responseBody))
        {
            try
            {
                using var doc = JsonDocument.Parse(responseBody);
                var root = doc.RootElement;
                if (root.TryGetProperty("message", out var msg))
                {
                    if (msg.ValueKind == JsonValueKind.Object)
                    {
                        // sync_task_capture_only returns "task" (ERP doc name); also support "name" / "reference"
                        if (msg.TryGetProperty("task", out var taskEl) && taskEl.ValueKind == JsonValueKind.String)
                            erpRef = taskEl.GetString();
                        else if (msg.TryGetProperty("name", out var nameEl) && nameEl.ValueKind == JsonValueKind.String)
                            erpRef = nameEl.GetString();
                        else if (msg.TryGetProperty("reference", out var refEl) && refEl.ValueKind == JsonValueKind.String)
                            erpRef = refEl.GetString();
                    }
                    else if (msg.ValueKind == JsonValueKind.String)
                    {
                        erpRef = msg.GetString();
                    }
                }
            }
            catch
            {
                // Ignore parse errors; erpRef remains null
            }
        }

        return (true, null, erpRef);
    }

    #endregion

    #region WMS Snapshot Push (push_wms_snapshot)

    /// <summary>One stock transaction for push_wms_snapshot API.</summary>
    public class WmsSnapshotStockTransactionDto
    {
        [JsonPropertyName("id")]
        public long Id { get; set; }

        [JsonPropertyName("transaction_date")]
        public string TransactionDate { get; set; } = string.Empty;

        [JsonPropertyName("transaction_type")]
        public string TransactionType { get; set; } = string.Empty;

        [JsonPropertyName("item_code")]
        public string ItemCode { get; set; } = string.Empty;

        [JsonPropertyName("bin_location")]
        public string? BinLocation { get; set; }

        [JsonPropertyName("target_bin")]
        public string? TargetBin { get; set; }

        [JsonPropertyName("carton_id")]
        public string? CartonId { get; set; }

        [JsonPropertyName("qty_change")]
        public double QtyChange { get; set; }

        [JsonPropertyName("qty_after")]
        public double QtyAfter { get; set; }

        [JsonPropertyName("notes")]
        public string? Notes { get; set; }
    }

    /// <summary>One carton stock row for push_wms_snapshot API.</summary>
    public class WmsSnapshotCartonStockDto
    {
        [JsonPropertyName("warehouse")]
        public string Warehouse { get; set; } = string.Empty;

        [JsonPropertyName("item_code")]
        public string ItemCode { get; set; } = string.Empty;

        [JsonPropertyName("bin_location")]
        public string? BinLocation { get; set; }

        [JsonPropertyName("carton_id")]
        public string? CartonId { get; set; }

        [JsonPropertyName("qty")]
        public double Qty { get; set; }

        [JsonPropertyName("reserved_qty")]
        public double ReservedQty { get; set; }

        [JsonPropertyName("last_moved_on")]
        public string? LastMovedOn { get; set; }
    }

    /// <summary>One carton for push_wms_snapshot API.</summary>
    public class WmsSnapshotCartonDto
    {
        [JsonPropertyName("carton_id")]
        public string CartonId { get; set; } = string.Empty;

        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("current_bin_id")]
        public string? CurrentBinId { get; set; }

        [JsonPropertyName("remarks")]
        public string? Remarks { get; set; }
    }

    /// <summary>Request body for push_wms_snapshot API (offline_sync).</summary>
    public class WmsSnapshotRequestDto
    {
        [JsonPropertyName("event_uuid")]
        public string EventUuid { get; set; } = string.Empty;

        [JsonPropertyName("company")]
        public string Company { get; set; } = string.Empty;

        [JsonPropertyName("source_system")]
        public string SourceSystem { get; set; } = "WMS_DESKTOP";

        [JsonPropertyName("warehouse")]
        public string Warehouse { get; set; } = string.Empty;

        [JsonPropertyName("stock_transactions")]
        public List<WmsSnapshotStockTransactionDto> StockTransactions { get; set; } = new();

        [JsonPropertyName("carton_stock")]
        public List<WmsSnapshotCartonStockDto> CartonStock { get; set; } = new();

        [JsonPropertyName("cartons")]
        public List<WmsSnapshotCartonDto> Cartons { get; set; } = new();
    }

    /// <summary>Resolve URL and API key for push_wms_snapshot: Offline Sync push endpoint, then ErpNext API URL + key, then Api Endpoint URL + key (same server).</summary>
    private static (string? Url, string? ApiKey, string? Error) GetPushWmsSnapshotEndpoint(WmsSettings settings)
    {
        var push = settings.PushEndpoints?
            .FirstOrDefault(p => p.Enabled && string.Equals(p.EndpointType, PushEndpointTypeNames.OfflineSync, StringComparison.OrdinalIgnoreCase));
        if (push != null && !string.IsNullOrWhiteSpace(push.BaseUrl) && !string.IsNullOrWhiteSpace(push.ApiKey))
            return (push.BaseUrl.Trim(), (push.ApiKey ?? "").Trim(), null);

        var baseUrl = (settings.ErpNextApiUrl ?? "").Trim();
        var apiKey = (settings.ErpNextApiKey ?? "").Trim();
        if (string.IsNullOrEmpty(baseUrl))
        {
            baseUrl = (settings.ApiEndpointUrl ?? "").Trim();
            if (string.IsNullOrEmpty(apiKey))
                apiKey = (settings.ApiKey ?? "").Trim();
        }
        if (string.IsNullOrEmpty(baseUrl) || string.IsNullOrEmpty(apiKey))
            return (null, null, "Configure Settings: add Push Endpoint Type 'Offline Sync', or set ERPNext API URL + API Key (or API Endpoint URL + API Key if same server).");

        var url = baseUrl.TrimEnd('/');
        if (!url.EndsWith("push_wms_snapshot", StringComparison.OrdinalIgnoreCase))
            url = url + "/api/method/printechs_wms.api.offline_sync.push_wms_snapshot";
        return (url, apiKey, null);
    }

    /// <summary>
    /// POST WMS snapshot to ERPNext using the configured Offline Sync push endpoint (push_wms_snapshot), or ErpNext API URL + key as fallback.
    /// </summary>
    public static async Task<(bool Success, string? Error)> PushWmsSnapshotToErpNextAsync(WmsSettings settings, WmsSnapshotRequestDto snapshot)
    {
        var (url, apiKey, err) = GetPushWmsSnapshotEndpoint(settings);
        if (url == null || apiKey == null)
        {
            ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: Push WMS snapshot - {err}");
            return (false, err ?? "Push endpoint not configured.");
        }

        ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: Pushing WMS snapshot (event_uuid={snapshot.EventUuid}, {snapshot.StockTransactions.Count} txns, {snapshot.CartonStock.Count} carton_stock, {snapshot.Cartons.Count} cartons) to {url}");
        return await PostJsonAsync(url, apiKey, snapshot, "WMS snapshot");
    }

    /// <summary>Response from push_wms_snapshot API (for internal test).</summary>
    public class WmsSnapshotPushResponseDto
    {
        [JsonPropertyName("ok")]
        public bool Ok { get; set; }

        [JsonPropertyName("event_uuid")]
        public string? EventUuid { get; set; }

        [JsonPropertyName("event_type")]
        public string? EventType { get; set; }

        [JsonPropertyName("processed")]
        public WmsSnapshotProcessedDto? Processed { get; set; }

        [JsonPropertyName("errors")]
        public List<string>? Errors { get; set; }
    }

    public class WmsSnapshotProcessedDto
    {
        [JsonPropertyName("ledger")]
        public int Ledger { get; set; }

        [JsonPropertyName("carton_stock")]
        public int CartonStock { get; set; }

        [JsonPropertyName("cartons")]
        public int Cartons { get; set; }
    }

    /// <summary>
    /// Push WMS snapshot and return parsed response (for internal test). Uses same endpoint as PushWmsSnapshotToErpNextAsync (with fallback to ErpNext URL + key).
    /// </summary>
    public static async Task<(bool Success, string? Error, WmsSnapshotPushResponseDto? Response)> PushWmsSnapshotToErpNextWithResponseAsync(WmsSettings settings, WmsSnapshotRequestDto snapshot)
    {
        var (url, apiKey, err) = GetPushWmsSnapshotEndpoint(settings);
        if (url == null || apiKey == null)
            return (false, err ?? "Push endpoint not configured.", null);

        var (success, error, body) = await PostJsonAndGetBodyAsync(url, apiKey, snapshot, "WMS snapshot");
        if (!success || string.IsNullOrWhiteSpace(body))
            return (success, error, null);

        WmsSnapshotPushResponseDto? response = null;
        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            // ERPNext often returns { "message": { "ok": true, "processed": {...}, "errors": [] } }
            var toParse = root;
            if (root.TryGetProperty("message", out var msg) && msg.ValueKind == JsonValueKind.Object)
                toParse = msg;
            response = JsonSerializer.Deserialize<WmsSnapshotPushResponseDto>(toParse.GetRawText());
            if (response != null && response.Processed == null && toParse.TryGetProperty("processed", out var p))
                response.Processed = JsonSerializer.Deserialize<WmsSnapshotProcessedDto>(p.GetRawText());
        }
        catch
        {
            // leave response null; success/error still valid
        }
        return (success, error, response);
    }

    #endregion

    #region Rebuild WMS Stock Balance (rebuild_wms_stock_balance)

    /// <summary>Request body for rebuild_wms_stock_balance: corrects WMS stock balance in ERPNext for the given company and warehouse.</summary>
    public class RebuildWmsStockBalanceRequestDto
    {
        [JsonPropertyName("company")]
        public string Company { get; set; } = string.Empty;

        [JsonPropertyName("warehouse")]
        public string Warehouse { get; set; } = string.Empty;
    }

    /// <summary>
    /// Calls ERPNext rebuild_wms_stock_balance to fix balance quantity after push. Uses settings Company and DefaultReceivingWarehouseForPr (resolved to ERPNext warehouse name).
    /// </summary>
    public static async Task<(bool Success, string? Error)> RebuildWmsStockBalanceAsync(WmsSettings settings)
    {
        var (baseUrl, apiKey, _) = ResolveEndpoint(settings, null, null, null);
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(apiKey))
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: Rebuild WMS stock balance skipped - ERPNext API URL or key not configured.");
            return (false, "ERPNext API URL or API Key not configured.");
        }

        var company = (settings.Company ?? "").Trim();
        if (string.IsNullOrEmpty(company))
            company = await GetDefaultCompanyFromErpNextAsync(settings) ?? "Mohammed Abdullah Almousa Trading Company";

        var warehouseCode = (settings.DefaultReceivingWarehouseForPr ?? settings.DefaultPickingWarehouse ?? "WH-MAIN").Trim();
        var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
        var warehouseName = WarehouseDataService.NormalizeWarehouseNameForErpNext(
            WarehouseDataService.ResolveToName(warehouseCode, warehouses));
        if (string.IsNullOrWhiteSpace(warehouseName))
            warehouseName = "Main Warehouse - MAATC";

        var url = baseUrl.TrimEnd('/') + "/api/method/printechs_wms.api.rebuild_stock_balance.rebuild_wms_stock_balance";
        var payload = new RebuildWmsStockBalanceRequestDto { Company = company, Warehouse = warehouseName };
        ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: Calling rebuild_wms_stock_balance for company={company}, warehouse={warehouseName}");
        var (success, error) = await PostJsonAsync(url, apiKey, payload, "rebuild_wms_stock_balance");
        if (success)
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: rebuild_wms_stock_balance completed successfully.");
        return (success, error);
    }

    #endregion

    #region End Transit Create Receipt (intransit_transfer.end_transit_create_receipt)

    /// <summary>Payload for end_transit_create_receipt: receive in-transit stock at warehouse.</summary>
    public class EndTransitCreateReceiptPayloadDto
    {
        [JsonPropertyName("in_transit_stock_entry")]
        public string InTransitStockEntry { get; set; } = string.Empty;

        /// <summary>Receiving warehouse (ERPNext API expects this key).</summary>
        [JsonPropertyName("receiving_warehouse")]
        public string ReceivingWarehouse { get; set; } = string.Empty;

        [JsonPropertyName("to_warehouse")]
        public string ToWarehouse { get; set; } = string.Empty;

        [JsonPropertyName("remarks")]
        public string Remarks { get; set; } = "Received at warehouse";
    }

    /// <summary>Request body for end_transit_create_receipt (nested under "payload").</summary>
    public class EndTransitCreateReceiptRequestDto
    {
        [JsonPropertyName("payload")]
        public EndTransitCreateReceiptPayloadDto Payload { get; set; } = new();
    }

    /// <summary>
    /// Call end_transit_create_receipt to receive in-transit transfer stock at the warehouse in ERPNext.
    /// Returns the created receipt Stock Entry name (e.g. MAT-REC-2026-00001) so we can store it on the putaway task and avoid duplicate calls.
    /// </summary>
    public static async Task<(bool Success, string? Error, string? ReceiptStockEntryNo)> EndTransitCreateReceiptAsync(
        WmsSettings settings,
        string inTransitStockEntry,
        string toWarehouseName,
        string? remarks = null)
    {
        if (string.IsNullOrWhiteSpace(inTransitStockEntry))
            return (false, "in_transit_stock_entry is required.", null);
        var (baseUrl, apiKey, label) = ResolveEndpoint(settings, null, null, null);
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(apiKey))
            return (false, "ERPNext API URL or API Key not configured.", null);
        var url = baseUrl.TrimEnd('/') + "/api/method/printechs_wms.api.intransit_transfer.end_transit_create_receipt";
        var warehouse = (toWarehouseName ?? "Main Warehouse - MAATC").Trim();
        var request = new EndTransitCreateReceiptRequestDto
        {
            Payload = new EndTransitCreateReceiptPayloadDto
            {
                InTransitStockEntry = inTransitStockEntry.Trim(),
                ReceivingWarehouse = warehouse,
                ToWarehouse = warehouse,
                Remarks = (remarks ?? "Received at warehouse").Trim()
            }
        };
        ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: Calling end_transit_create_receipt for {inTransitStockEntry} -> {warehouse}");
        var (success, error, body) = await PostJsonAndGetBodyAsync(url, apiKey, request, "end_transit_create_receipt");
        var receiptNo = success && !string.IsNullOrWhiteSpace(body) ? TryParseStockEntryNoFromResponse(body) : null;
        if (success && !string.IsNullOrEmpty(receiptNo))
            ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: end_transit_create_receipt created Stock Entry: {receiptNo}");
        return (success, error, receiptNo);
    }

    private static string? TryParseStockEntryNoFromResponse(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            // message (object) - e.g. {"message": {"ok": true, "stock_entry": "MAT-STE-2026-00008", "message": {"name": "..."}, "data": {"name": "..."}}}
            if (root.TryGetProperty("message", out var msg) && msg.ValueKind == JsonValueKind.Object)
            {
                if (msg.TryGetProperty("stock_entry", out var mse) && mse.ValueKind == JsonValueKind.String)
                {
                    var s = mse.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(s)) return s;
                }
                if (msg.TryGetProperty("receipt_stock_entry", out var rse) && rse.ValueKind == JsonValueKind.String)
                {
                    var s = rse.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(s)) return s;
                }
                if (msg.TryGetProperty("data", out var msgData) && msgData.TryGetProperty("name", out var dataName) && dataName.ValueKind == JsonValueKind.String)
                {
                    var s = dataName.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(s)) return s;
                }
                if (msg.TryGetProperty("message", out var innerMsg) && innerMsg.ValueKind == JsonValueKind.Object && innerMsg.TryGetProperty("name", out var innerName) && innerName.ValueKind == JsonValueKind.String)
                {
                    var s = innerName.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(s)) return s;
                }
                if (msg.TryGetProperty("name", out var name) && name.ValueKind == JsonValueKind.String)
                {
                    var s = name.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(s)) return s;
                }
            }
            // message as string (doc name)
            if (root.TryGetProperty("message", out var msgStr) && msgStr.ValueKind == JsonValueKind.String)
            {
                var s = msgStr.GetString()?.Trim();
                if (!string.IsNullOrEmpty(s) && (s.StartsWith("MAT-", StringComparison.OrdinalIgnoreCase) || s.StartsWith("STE-", StringComparison.OrdinalIgnoreCase)))
                    return s;
            }
            // data.name
            if (root.TryGetProperty("data", out var data) && data.TryGetProperty("name", out var rootDataName) && rootDataName.ValueKind == JsonValueKind.String)
            {
                var s = rootDataName.GetString()?.Trim();
                if (!string.IsNullOrEmpty(s)) return s;
            }
            // root-level keys
            if (root.TryGetProperty("stock_entry", out var se) && se.ValueKind == JsonValueKind.String)
            {
                var s = se.GetString()?.Trim();
                if (!string.IsNullOrEmpty(s)) return s;
            }
            if (root.TryGetProperty("receipt_stock_entry", out var rseRoot) && rseRoot.ValueKind == JsonValueKind.String)
            {
                var s = rseRoot.GetString()?.Trim();
                if (!string.IsNullOrEmpty(s)) return s;
            }
            if (root.TryGetProperty("name", out var nameRoot) && nameRoot.ValueKind == JsonValueKind.String)
            {
                var s = nameRoot.GetString()?.Trim();
                if (!string.IsNullOrEmpty(s) && (s.StartsWith("MAT-", StringComparison.OrdinalIgnoreCase) || s.StartsWith("STE-", StringComparison.OrdinalIgnoreCase)))
                    return s;
            }
        }
        catch { }
        return null;
    }

    #endregion

    #region Create Purchase Receipt (receive_asn_and_create_purchase_receipt)

    /// <summary>Request body for receive_asn_and_create_purchase_receipt API.</summary>
    public class CreatePurchaseReceiptRequestDto
    {
        [JsonPropertyName("asn_no")]
        public string AsnNo { get; set; } = string.Empty;

        /// <summary>Backend expects asn_name (e.g. ASN-0003) to create/link PR when purchase_receipt_name is not sent. Sent with same value as AsnNo.</summary>
        [JsonPropertyName("asn_name")]
        public string? AsnName { get; set; }

        /// <summary>When set, backend should UPDATE this existing PR (replace/merge lines) instead of creating or appending. Prevents duplicate rows on repeated "Update to ERPNext" clicks.</summary>
        [JsonPropertyName("purchase_receipt_name")]
        public string? PurchaseReceiptName { get; set; }

        [JsonPropertyName("warehouse")]
        public string Warehouse { get; set; } = string.Empty;

        [JsonPropertyName("mode")]
        public string Mode { get; set; } = "increment";

        [JsonPropertyName("update_asn")]
        public int UpdateAsn { get; set; } = 1;

        [JsonPropertyName("update_status")]
        public int UpdateStatus { get; set; } = 1;

        [JsonPropertyName("make_pr")]
        public int MakePr { get; set; } = 1;

        [JsonPropertyName("lines")]
        public List<AsnReceivedQtyLineDto> Lines { get; set; } = new();
    }

    /// <summary>
    /// Call receive_asn_and_create_purchase_receipt. Uses Push Endpoint type "Purchase Receipt".
    /// Returns the created Purchase Receipt number if the API returns it (e.g. in message or data.name).
    /// </summary>
    public static async Task<(bool Success, string? Error, string? PurchaseReceiptNo)> CreatePurchaseReceiptFromAsnAsync(WmsSettings settings, Asn asn)
    {
        if (asn == null || asn.Details == null || asn.Details.Count == 0)
        {
            return (false, "ASN has no item details.", null);
        }

        var push = settings.PushEndpoints?
            .FirstOrDefault(p => p.Enabled && string.Equals(p.EndpointType, PushEndpointTypeNames.PurchaseReceipt, StringComparison.OrdinalIgnoreCase));
        if (push == null || string.IsNullOrWhiteSpace(push.BaseUrl))
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: Create PR - no enabled Purchase Receipt push endpoint configured.");
            return (false, "Configure an enabled Push Endpoint with Type 'Purchase Receipt' in Settings (URL: receive_asn_and_create_purchase_receipt).", null);
        }

        var asnNo = (asn.Title ?? "").Trim();
        if (string.IsNullOrEmpty(asnNo))
            return (false, "ASN has no title.", null);

        var warehouse = (settings.DefaultReceivingWarehouseForPr ?? settings.DefaultPickingWarehouse ?? "").Trim();
        if (string.IsNullOrEmpty(warehouse))
            warehouse = "Main Warehouse - MAATC"; // Default warehouse name for receive_asn_and_create_purchase_receipt JSON body

        // ERPNext receive_asn_and_create_purchase_receipt expects warehouse by name (e.g. "Main Warehouse - MAATC"), not code (e.g. "WH-MAIN"). Resolve from synced tabWarehouse.
        var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
        var matched = warehouses.FirstOrDefault(w =>
            string.Equals(w.Code, warehouse, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(w.Name, warehouse, StringComparison.OrdinalIgnoreCase));
        var warehouseCodeForDb = matched?.Code ?? "WH-MAIN"; // for saving to tabAdvanceShippingNotice.warehouse
        if (matched != null)
            warehouse = matched.Name;
        else if (string.IsNullOrEmpty(warehouse))
            warehouse = "Main Warehouse - MAATC";

        // ERPNext Warehouse doc name is often "Main Warehouse - MAATC"; synced tabWarehouse may have name "Main Warehouse". Normalize so API finds the warehouse.
        if (string.Equals(warehouse, "Main Warehouse", StringComparison.OrdinalIgnoreCase))
            warehouse = "Main Warehouse - MAATC";

        // Use ERPNext as source of truth: only send items that exist in current ASN (avoids sending deleted/stale local items).
        var erpItemCodes = await FetchAsnItemCodesFromErpNextAsync(settings, asnNo);
        var detailsToUse = erpItemCodes != null && erpItemCodes.Count > 0
            ? asn.Details.Where(d => erpItemCodes.Contains((d.ItemCode ?? "").Trim())).ToList()
            : asn.Details;

        var lines = BuildPerDetailReceivedQtyLines(detailsToUse);

        // When ASN already has a PR, send it so backend UPDATES that PR (replace/merge lines) instead of appending — prevents duplicate rows when user clicks "Update to ERPNext" again.
        var existingPrNo = (asn.PurchaseReceiptNo ?? "").Trim();
        var payload = new CreatePurchaseReceiptRequestDto
        {
            AsnNo = asnNo,
            AsnName = asnNo,
            PurchaseReceiptName = string.IsNullOrEmpty(existingPrNo) ? null : existingPrNo,
            Warehouse = warehouse,
            Mode = "increment",
            UpdateAsn = 1,
            UpdateStatus = 1,
            MakePr = 1,
            Lines = lines
        };

        var url = push.BaseUrl.Trim();
        var apiKey = (push.ApiKey ?? "").Trim();
        if (string.IsNullOrEmpty(apiKey))
            return (false, "Push endpoint API Key is empty.", null);

        ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: Creating Purchase Receipt for ASN {asnNo}, warehouse {warehouse}, {lines.Count} line(s). Item codes: [{string.Join(", ", lines.Select(l => $"{l.ItemCode}:{l.ReceivedQty}"))}]");
        var (success, error, prNo) = await PostJsonAndParsePurchaseReceiptNoAsync(url, apiKey, payload, "Create Purchase Receipt");
        if (success)
            await AsnDataService.SetAsnWarehouseAsync(settings, asnNo, warehouseCodeForDb);
        return (success, error, prNo);
    }

    private static async Task<(bool Success, string? Error, string? PurchaseReceiptNo)> PostJsonAndParsePurchaseReceiptNoAsync<T>(string url, string apiKey, T payload, string label)
    {
        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(60);
            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("token", apiKey);
            // Omit null properties so the body matches Postman (e.g. no purchase_receipt_name key when not sent).
            var jsonOptions = new JsonSerializerOptions { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
            var json = JsonSerializer.Serialize(payload, jsonOptions);
            using var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            var response = await httpClient.PostAsync(url, content);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                ErrorLogService.LogError($"ErpNextWmsSyncApiService: {label} API returned {response.StatusCode}: {body}", null);
                return (false, $"{response.StatusCode}: {body}", null);
            }
            var prNo = TryParsePurchaseReceiptNoFromResponse(body);
            if (string.IsNullOrEmpty(prNo))
                ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: {label} succeeded but could not parse PR number from response. Response (first 400 chars): {(body.Length > 400 ? body.AsSpan(0, 400).ToString() : body)}");
            else
                ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: {label} succeeded. Purchase Receipt: {prNo}");
            return (true, null, prNo);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ErpNextWmsSyncApiService: {label} error: {ex.Message}", ex);
            return (false, ex.Message, null);
        }
    }

    private static string? TryParsePurchaseReceiptNoFromResponse(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            // API returns root-level "purchase_receipt": pr_name (receive_asn_and_create_purchase_receipt)
            if (root.TryGetProperty("purchase_receipt", out var purchaseReceipt) && purchaseReceipt.ValueKind == JsonValueKind.String)
            {
                var s = purchaseReceipt.GetString()?.Trim();
                if (!string.IsNullOrEmpty(s)) return s;
            }

            // data.name or data.purchase_receipt_no (explicit PR field)
            if (root.TryGetProperty("data", out var data))
            {
                if (data.TryGetProperty("name", out var name) && name.ValueKind == JsonValueKind.String)
                {
                    var s = name.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(s)) return s;
                }
                if (data.TryGetProperty("purchase_receipt_no", out var prNo) && prNo.ValueKind == JsonValueKind.String)
                {
                    var s = prNo.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(s)) return s;
                }
                if (data.TryGetProperty("purchase_receipt_name", out var prName) && prName.ValueKind == JsonValueKind.String)
                {
                    var s = prName.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(s)) return s;
                }
            }

            // message as string: use as-is if doc name, else extract PR-XXXXX
            if (root.TryGetProperty("message", out var msg))
            {
                if (msg.ValueKind == JsonValueKind.String)
                {
                    var s = msg.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(s))
                    {
                        if (s.StartsWith("PR-", StringComparison.OrdinalIgnoreCase) && s.Length <= 20)
                            return s;
                        var extracted = System.Text.RegularExpressions.Regex.Match(s, @"(PR-\d[\w-]*)");
                        if (extracted.Success)
                            return extracted.Groups[1].Value;
                        return s;
                    }
                }
                // message as object (e.g. {"purchase_receipt": "PR-ASN-ASN-0003", ...} from receive_asn_and_create_purchase_receipt)
                if (msg.ValueKind == JsonValueKind.Object)
                {
                    if (msg.TryGetProperty("purchase_receipt", out var prInMsg) && prInMsg.ValueKind == JsonValueKind.String)
                    {
                        var s = prInMsg.GetString()?.Trim();
                        if (!string.IsNullOrEmpty(s)) return s;
                    }
                    if (msg.TryGetProperty("name", out var name) && name.ValueKind == JsonValueKind.String)
                    {
                        var s = name.GetString()?.Trim();
                        if (!string.IsNullOrEmpty(s)) return s;
                    }
                    if (msg.TryGetProperty("purchase_receipt_no", out var prNo) && prNo.ValueKind == JsonValueKind.String)
                    {
                        var s = prNo.GetString()?.Trim();
                        if (!string.IsNullOrEmpty(s)) return s;
                    }
                }
            }

            // Scan any root-level string value that looks like PR-XXXXX
            foreach (var prop in root.EnumerateObject())
            {
                if (prop.Value.ValueKind == JsonValueKind.String)
                {
                    var s = prop.Value.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(s) && s.StartsWith("PR-", StringComparison.OrdinalIgnoreCase) && s.Length <= 20)
                        return s;
                }
            }
        }
        catch { }
        return null;
    }

    #endregion

    #region Transfer Carton — PR status and Create Stock Entry

    /// <summary>Response from get_pr_status_for_asn (message object).</summary>
    public class PrStatusForAsnResponse
    {
        [JsonPropertyName("ok")]
        public bool Ok { get; set; }

        [JsonPropertyName("asn_no")]
        public string? AsnNo { get; set; }

        [JsonPropertyName("purchase_receipt")]
        public string? PurchaseReceipt { get; set; }

        [JsonPropertyName("docstatus")]
        public int Docstatus { get; set; }

        [JsonPropertyName("purchase_receipt_created")]
        public bool PurchaseReceiptCreated { get; set; }

        [JsonPropertyName("purchase_receipt_submitted")]
        public bool PurchaseReceiptSubmitted { get; set; }
    }

    /// <summary>Get default company from ERPNext instance (e.g. from Global Defaults). Returns company name or null.</summary>
    public static async Task<string?> GetDefaultCompanyFromErpNextAsync(WmsSettings settings)
    {
        var (baseUrl, apiKey, _) = ResolveEndpoint(settings, null, null, null);
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(apiKey))
            return null;
        var apiUrl = $"{baseUrl}/api/method/printechs_wms.api.desktop_stock_entry.get_default_company";
        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(15);
            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("token", apiKey);
            var response = await httpClient.GetAsync(apiUrl);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
                return null;
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (root.TryGetProperty("message", out var msg))
            {
                if (msg.ValueKind == JsonValueKind.String)
                {
                    var s = msg.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(s)) return s;
                }
                if (msg.ValueKind == JsonValueKind.Object && msg.TryGetProperty("default_company", out var dc) && dc.ValueKind == JsonValueKind.String)
                {
                    var s = dc.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(s)) return s;
                }
            }
            return null;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ErpNextWmsSyncApiService: GetDefaultCompany error: {ex.Message}", ex);
            return null;
        }
    }

    /// <summary>Call get_pr_status_for_asn(asn_no). On failure, ErrorDetail explains HTTP/parse issues for the UI.</summary>
    public static async Task<(PrStatusForAsnResponse? Status, string? ErrorDetail)> GetPrStatusForAsnAsync(WmsSettings settings, string asnNo)
    {
        static string Truncate(string? s, int max)
        {
            if (string.IsNullOrEmpty(s)) return string.Empty;
            var t = s.Trim();
            return t.Length <= max ? t : t.Substring(0, max) + "…";
        }

        if (string.IsNullOrWhiteSpace(asnNo))
            return (null, null);
        var (baseUrl, apiKey, _) = ResolveEndpoint(settings, null, null, null);
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(apiKey))
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: GetPrStatusForAsn API URL or key not configured");
            return (null, "ERPNext URL or API key is empty in Settings (ErpNext API URL / ErpNext API key).");
        }
        var encoded = Uri.EscapeDataString(asnNo.Trim());
        var apiUrl = $"{baseUrl}/api/method/printechs_wms.api.asn_to_purchase_receipt.get_pr_status_for_asn?asn_no={encoded}";
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

        PrStatusForAsnResponse? TryDeserializeMessage(JsonElement msgEl)
        {
            if (msgEl.ValueKind == JsonValueKind.Object)
                return JsonSerializer.Deserialize<PrStatusForAsnResponse>(msgEl.GetRawText(), options);
            if (msgEl.ValueKind == JsonValueKind.String)
            {
                var s = msgEl.GetString()?.Trim();
                if (string.IsNullOrEmpty(s)) return null;
                try
                {
                    using var inner = JsonDocument.Parse(s);
                    if (inner.RootElement.ValueKind == JsonValueKind.Object)
                        return JsonSerializer.Deserialize<PrStatusForAsnResponse>(inner.RootElement.GetRawText(), options);
                }
                catch { /* handled below */ }
            }
            return null;
        }

        try
        {
            ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: GetPrStatusForAsn GET {apiUrl}");
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);
            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("token", apiKey);
            var response = await httpClient.GetAsync(apiUrl);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                ErrorLogService.LogError($"ErpNextWmsSyncApiService: GetPrStatusForAsn returned {response.StatusCode}: {body}", null);
                return (null,
                    $"{(int)response.StatusCode} {response.ReasonPhrase}. URL: {apiUrl}\nResponse: {Truncate(body, 600)}");
            }

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (root.TryGetProperty("exc", out var excEl) &&
                excEl.ValueKind != JsonValueKind.Null &&
                excEl.ValueKind != JsonValueKind.Undefined &&
                excEl.ValueKind != JsonValueKind.Array &&
                !(excEl.ValueKind == JsonValueKind.String && string.IsNullOrWhiteSpace(excEl.GetString())))
                return (null, $"Server exception (exc): {Truncate(excEl.GetRawText(), 400)}");

            if (!root.TryGetProperty("message", out var msg))
                return (null, $"No \"message\" in ERPNext JSON. Raw: {Truncate(body, 500)}");

            var parsed = TryDeserializeMessage(msg);
            if (parsed != null)
                return (parsed, null);

            return (null,
                $"Could not parse \"message\" as PR status object (got {msg.ValueKind}). Expected JSON object inside message (or JSON string). Raw: {Truncate(body, 600)}");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ErpNextWmsSyncApiService: GetPrStatusForAsn error: {ex.Message}", ex);
            return (null, $"{ex.Message} (GET {Truncate(apiUrl, 200)})");
        }
    }

    /// <summary>Item line for create_stock_entry_from_transfer_carton payload.</summary>
    public class StockEntryItemDto
    {
        [JsonPropertyName("item_code")]
        public string ItemCode { get; set; } = string.Empty;

        [JsonPropertyName("qty")]
        public int Qty { get; set; }

        [JsonPropertyName("uom")]
        public string? Uom { get; set; }

        [JsonPropertyName("source_carton")]
        public string? SourceCarton { get; set; }
    }

    /// <summary>Payload for create_stock_entry_from_transfer_carton (nested under "payload"). Intransit: from_warehouse -> to_warehouse (Goods In Transit) -> custom_receiving_warehouse.</summary>
    public class CreateStockEntryPayloadDto
    {
        [JsonPropertyName("company")]
        public string Company { get; set; } = string.Empty;

        [JsonPropertyName("material_request")]
        public string? MaterialRequest { get; set; }

        [JsonPropertyName("from_warehouse")]
        public string FromWarehouse { get; set; } = string.Empty;

        [JsonPropertyName("to_warehouse")]
        public string ToWarehouse { get; set; } = string.Empty;

        [JsonPropertyName("custom_receiving_warehouse")]
        public string CustomReceivingWarehouse { get; set; } = string.Empty;

        [JsonPropertyName("remarks")]
        public string? Remarks { get; set; }

        [JsonPropertyName("external_ref")]
        public string ExternalRef { get; set; } = string.Empty;

        [JsonPropertyName("submit")]
        public int Submit { get; set; } = 1;

        [JsonPropertyName("items")]
        public List<StockEntryItemDto> Items { get; set; } = new();
    }

    /// <summary>Wrapper for create_stock_entry_from_transfer_carton request body.</summary>
    public class CreateStockEntryRequestDto
    {
        [JsonPropertyName("payload")]
        public CreateStockEntryPayloadDto Payload { get; set; } = new();
    }

    /// <summary>Response message from create_stock_entry_from_transfer_carton.</summary>
    public class CreateStockEntryResponseMessage
    {
        [JsonPropertyName("ok")]
        public bool Ok { get; set; }

        [JsonPropertyName("stock_entry_no")]
        public string? StockEntryNo { get; set; }

        [JsonPropertyName("docstatus")]
        public int Docstatus { get; set; }

        [JsonPropertyName("submitted")]
        public bool Submitted { get; set; }
    }

    /// <summary>Call create_stock_entry_from_transfer_carton. Returns (success, error, stock_entry_no).</summary>
    public static async Task<(bool Success, string? Error, string? StockEntryNo)> CreateStockEntryFromTransferCartonAsync(
        WmsSettings settings, CreateStockEntryPayloadDto payload)
    {
        var (baseUrl, apiKey, _) = ResolveEndpoint(settings, null, null, null);
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(apiKey))
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: CreateStockEntry API URL or key not configured");
            return (false, "ERPNext API URL or key not configured.", null);
        }
        var url = $"{baseUrl}/api/method/printechs_wms.api.desktop_stock_entry.create_stock_entry_from_transfer_carton";
        var request = new CreateStockEntryRequestDto { Payload = payload };
        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(60);
            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("token", apiKey);
            var options = new JsonSerializerOptions { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
            var json = JsonSerializer.Serialize(request, options);
            using var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            var response = await httpClient.PostAsync(url, content);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                ErrorLogService.LogError($"ErpNextWmsSyncApiService: CreateStockEntry returned {response.StatusCode}: {body}", null);
                return (false, $"{response.StatusCode}: {body}", null);
            }
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (root.TryGetProperty("message", out var msg) && msg.ValueKind == JsonValueKind.Object)
            {
                var ok = msg.TryGetProperty("ok", out var okEl) && okEl.GetBoolean();
                // API may return stock_entry_no or stock_entry (e.g. idempotent response uses "stock_entry")
                var stockEntryNo = msg.TryGetProperty("stock_entry_no", out var seEl) ? seEl.GetString()?.Trim() : null
                    ?? (msg.TryGetProperty("stock_entry", out var seEl2) ? seEl2.GetString()?.Trim() : null);
                return (ok, ok ? null : "API returned ok=false.", stockEntryNo);
            }
            return (false, "Unexpected API response format.", null);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ErpNextWmsSyncApiService: CreateStockEntry error: {ex.Message}", ex);
            return (false, ex.Message, null);
        }
    }

    #endregion

    #region Material Request – Add to Transit (create_material_transfer_add_to_transit)

    /// <summary>Item line for create_material_transfer_add_to_transit payload.</summary>
    public class AddToTransitItemDto
    {
        [JsonPropertyName("item_code")]
        public string ItemCode { get; set; } = string.Empty;

        [JsonPropertyName("qty")]
        public double Qty { get; set; }
    }

    /// <summary>Payload for create_material_transfer_add_to_transit (nested under "payload").</summary>
    public class CreateMaterialTransferAddToTransitPayloadDto
    {
        [JsonPropertyName("company")]
        public string Company { get; set; } = string.Empty;

        [JsonPropertyName("material_request")]
        public string MaterialRequest { get; set; } = string.Empty;

        [JsonPropertyName("from_warehouse")]
        public string FromWarehouse { get; set; } = string.Empty;

        [JsonPropertyName("to_warehouse")]
        public string ToWarehouse { get; set; } = "Goods In Transit - MAATC";

        [JsonPropertyName("custom_receiving_warehouse")]
        public string CustomReceivingWarehouse { get; set; } = string.Empty;

        [JsonPropertyName("remarks")]
        public string? Remarks { get; set; }

        [JsonPropertyName("submit")]
        public int Submit { get; set; } = 1;

        [JsonPropertyName("items")]
        public List<AddToTransitItemDto> Items { get; set; } = new();
    }

    /// <summary>Wrapper for create_material_transfer_add_to_transit request body.</summary>
    public class CreateMaterialTransferAddToTransitRequestDto
    {
        [JsonPropertyName("payload")]
        public CreateMaterialTransferAddToTransitPayloadDto Payload { get; set; } = new();
    }

    /// <summary>
    /// Call create_material_transfer_add_to_transit. Returns (success, error, stock_entry_no).
    /// Uses same ERPNext base URL/API key as other desktop APIs (e.g. from Push endpoints or ErpNext URL).
    /// </summary>
    public static async Task<(bool Success, string? Error, string? StockEntryNo)> CreateMaterialTransferAddToTransitAsync(
        WmsSettings settings, CreateMaterialTransferAddToTransitPayloadDto payload)
    {
        var (baseUrl, apiKey, _) = ResolveEndpoint(settings, null, null, null);
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(apiKey))
        {
            ErrorLogService.LogInfo("ErpNextWmsSyncApiService: Add to Transit API URL or key not configured");
            return (false, "ERPNext API URL or key not configured.", null);
        }
        var url = $"{baseUrl.TrimEnd('/')}/api/method/printechs_wms.api.intransit_transfer.create_material_transfer_add_to_transit";
        var request = new CreateMaterialTransferAddToTransitRequestDto { Payload = payload };
        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(90);
            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("token", apiKey);
            var options = new JsonSerializerOptions { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
            var json = JsonSerializer.Serialize(request, options);
            using var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            var response = await httpClient.PostAsync(url, content);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                ErrorLogService.LogError($"ErpNextWmsSyncApiService: CreateMaterialTransferAddToTransit returned {response.StatusCode}: {body}", null);
                return (false, $"{response.StatusCode}: {body}", null);
            }
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (root.TryGetProperty("message", out var msg) && msg.ValueKind == JsonValueKind.Object)
            {
                var ok = msg.TryGetProperty("ok", out var okEl) && okEl.GetBoolean();
                var stockEntryNo = msg.TryGetProperty("stock_entry_no", out var seEl) ? seEl.GetString()?.Trim() : null
                    ?? (msg.TryGetProperty("stock_entry", out var seEl2) ? seEl2.GetString()?.Trim() : null);
                return (ok, ok ? null : "API returned ok=false.", stockEntryNo);
            }
            return (false, "Unexpected API response format.", null);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ErpNextWmsSyncApiService: CreateMaterialTransferAddToTransit error: {ex.Message}", ex);
            return (false, ex.Message, null);
        }
    }

    #endregion

    #region Relocation / Bin Transfer — upsert_relocation_session

    /// <summary>Line for upsert_relocation_session API.</summary>
    private class UpsertRelocationLineDto
    {
        [JsonPropertyName("line_uuid")]
        public string LineUuid { get; set; } = string.Empty;

        [JsonPropertyName("item_code")]
        public string ItemCode { get; set; } = string.Empty;

        [JsonPropertyName("qty")]
        public double Qty { get; set; }

        [JsonPropertyName("from_bin")]
        public string? FromBin { get; set; }

        [JsonPropertyName("to_bin")]
        public string? ToBin { get; set; }

        [JsonPropertyName("from_carton")]
        public string? FromCarton { get; set; }

        [JsonPropertyName("to_carton")]
        public string? ToCarton { get; set; }
    }

    /// <summary>Payload for upsert_relocation_session (printechs_wms.api.relocation.upsert_relocation_session).</summary>
    private class UpsertRelocationSessionRequestDto
    {
        [JsonPropertyName("company")]
        public string Company { get; set; } = string.Empty;

        [JsonPropertyName("external_session_id")]
        public string ExternalSessionId { get; set; } = string.Empty;

        [JsonPropertyName("warehouse")]
        public string Warehouse { get; set; } = string.Empty;

        [JsonPropertyName("from_warehouse")]
        public string FromWarehouse { get; set; } = string.Empty;

        [JsonPropertyName("to_warehouse")]
        public string ToWarehouse { get; set; } = string.Empty;

        [JsonPropertyName("mode")]
        public string Mode { get; set; } = string.Empty;

        [JsonPropertyName("policy")]
        public string Policy { get; set; } = string.Empty;

        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;

        [JsonPropertyName("posting_date")]
        public string PostingDate { get; set; } = string.Empty;

        [JsonPropertyName("remarks")]
        public string? Remarks { get; set; }

        [JsonPropertyName("lines")]
        public List<UpsertRelocationLineDto> Lines { get; set; } = new();
    }

    /// <summary>
    /// Push a completed relocation session to ERPNext via upsert_relocation_session. Uses Push Endpoint type "Relocation".
    /// Returns the transaction/document number returned by ERPNext (e.g. Stock Entry or Relocation doc name).
    /// When linesOverride is provided and has items, those lines are used instead of session.Lines or carton contents (avoids double fetch when UI already loaded preview).
    /// </summary>
    public static async Task<(bool Success, string? Error, string? TransactionNo)> PushRelocationSessionToErpNextAsync(WmsSettings settings, RelocationSession session, List<RelocationLine>? linesOverride = null)
    {
        if (session == null)
        {
            return (false, "Session is null.", null);
        }

        var push = settings.PushEndpoints?
            .FirstOrDefault(p => p.Enabled && string.Equals(p.EndpointType, PushEndpointTypeNames.Relocation, StringComparison.OrdinalIgnoreCase));
        if (push == null || string.IsNullOrWhiteSpace(push.BaseUrl))
        {
            return (false, "Configure an enabled Push Endpoint with Type 'Relocation' in Settings (URL: printechs_wms.api.relocation.upsert_relocation_session).", null);
        }

        var sessionId = (session.SessionId ?? "").Trim();
        if (string.IsNullOrEmpty(sessionId))
            return (false, "Session has no SessionId.", null);

        if (!string.Equals(session.Status, "COMPLETED", StringComparison.OrdinalIgnoreCase))
            return (false, "Only COMPLETED relocation sessions can be pushed to ERPNext.", null);

        var company = (settings.Company ?? "").Trim();
        if (string.IsNullOrEmpty(company))
            company = await GetDefaultCompanyFromErpNextAsync(settings) ?? "Mohammed Abdullah Almousa Trading Company";

        var warehouseCode = (session.WarehouseId ?? settings.DefaultPickingWarehouse ?? settings.DefaultReceivingWarehouseForPr ?? "WH-MAIN").Trim();
        var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
        var warehouseName = WarehouseDataService.NormalizeWarehouseNameForErpNext(
            WarehouseDataService.ResolveToName(warehouseCode, warehouses));
        if (string.IsNullOrWhiteSpace(warehouseName))
            warehouseName = "Main Warehouse - MAATC";

        var fromBin = (session.FromBin ?? "").Trim();
        var toBin = (session.ToBin ?? "").Trim();
        var fromCarton = (session.FromCarton ?? "").Trim();
        var toCarton = (session.ToCarton ?? "").Trim();

        var lines = (linesOverride != null && linesOverride.Count > 0)
            ? linesOverride
            : (session.Lines ?? Array.Empty<RelocationLine>()).ToList();
        // When no lines override and WMS API does not return lines (e.g. CARTON_TO_CARTON), build lines from FROM carton contents
        if (lines.Count == 0 && !string.IsNullOrEmpty(fromCarton))
        {
            var (contentsOk, _, contents) = await RelocationApiService.GetCartonContentsAsync(settings, fromCarton);
            if (contentsOk && contents?.Items != null && contents.Items.Count > 0)
            {
                lines = contents.Items
                    .Where(item => !string.IsNullOrWhiteSpace(item.ItemCode))
                    .Select(item => new RelocationLine
                    {
                        ItemCode = item.ItemCode,
                        QtyMoved = item.Qty,
                        Barcode = null,
                        CreatedAt = null
                    })
                    .ToList();
                ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: Push Relocation - built {lines.Count} line(s) from FROM carton contents (session had no lines).");
            }
        }

        if (lines.Count == 0)
            return (false, "Session has no lines to push. Ensure the session has line items or a FROM carton with contents.", null);

        var lineDtos = new List<UpsertRelocationLineDto>();
        for (var i = 0; i < lines.Count; i++)
        {
            var line = lines[i];
            var itemCode = (line.ItemCode ?? "").Trim();
            if (string.IsNullOrEmpty(itemCode)) continue;
            lineDtos.Add(new UpsertRelocationLineDto
            {
                LineUuid = $"{sessionId}-{i + 1}",
                ItemCode = itemCode,
                Qty = line.QtyMoved,
                FromBin = string.IsNullOrEmpty(fromBin) ? null : fromBin,
                ToBin = string.IsNullOrEmpty(toBin) ? null : toBin,
                FromCarton = string.IsNullOrEmpty(fromCarton) ? null : fromCarton,
                ToCarton = string.IsNullOrEmpty(toCarton) ? null : toCarton
            });
        }

        if (lineDtos.Count == 0)
            return (false, "No valid lines (item_code required).", null);

        var payload = new UpsertRelocationSessionRequestDto
        {
            Company = company,
            ExternalSessionId = sessionId,
            Warehouse = warehouseName,
            FromWarehouse = warehouseName,
            ToWarehouse = warehouseName,
            Mode = (session.Mode ?? "CARTON_TO_CARTON").Trim(),
            Policy = (session.Policy ?? "BLIND").Trim(),
            Status = "COMPLETED",
            PostingDate = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            Remarks = "Posted from desktop",
            Lines = lineDtos
        };

        var url = push.BaseUrl.Trim();
        var apiKey = (push.ApiKey ?? "").Trim();
        if (string.IsNullOrEmpty(apiKey))
            return (false, "Push endpoint API Key is empty.", null);

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(60);
            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("token", apiKey);
            var options = new JsonSerializerOptions { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
            var json = JsonSerializer.Serialize(payload, options);
            using var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            var response = await httpClient.PostAsync(url, content);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                ErrorLogService.LogError($"ErpNextWmsSyncApiService: Push Relocation API returned {response.StatusCode}: {body}", null);
                return (false, $"{response.StatusCode}: {body}", null);
            }
            var transactionNo = TryParseTransactionNoFromRelocationResponse(body);
            if (!string.IsNullOrEmpty(transactionNo))
                ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: Push Relocation succeeded. Transaction: {transactionNo}");
            else
                ErrorLogService.LogInfo($"ErpNextWmsSyncApiService: Push Relocation succeeded but could not parse transaction number from response.");
            return (true, null, transactionNo);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ErpNextWmsSyncApiService: Push Relocation error: {ex.Message}", ex);
            return (false, ex.Message, null);
        }
    }

    private static string? TryParseTransactionNoFromRelocationResponse(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var msg = root;
            if (root.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.Object)
                msg = m;
            if (msg.TryGetProperty("name", out var name) && name.ValueKind == JsonValueKind.String)
            {
                var s = name.GetString()?.Trim();
                if (!string.IsNullOrEmpty(s)) return s;
            }
            if (msg.TryGetProperty("transaction_no", out var tno) && tno.ValueKind == JsonValueKind.String)
            {
                var s = tno.GetString()?.Trim();
                if (!string.IsNullOrEmpty(s)) return s;
            }
            if (msg.TryGetProperty("doc", out var docEl) && docEl.ValueKind == JsonValueKind.Object && docEl.TryGetProperty("name", out var docName) && docName.ValueKind == JsonValueKind.String)
            {
                var s = docName.GetString()?.Trim();
                if (!string.IsNullOrEmpty(s)) return s;
            }
            if (msg.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Object && data.TryGetProperty("name", out var dataName) && dataName.ValueKind == JsonValueKind.String)
            {
                var s = dataName.GetString()?.Trim();
                if (!string.IsNullOrEmpty(s)) return s;
            }
            if (msg.TryGetProperty("stock_entry", out var se) && se.ValueKind == JsonValueKind.String)
            {
                var s = se.GetString()?.Trim();
                if (!string.IsNullOrEmpty(s)) return s;
            }
        }
        catch { }
        return null;
    }

    #endregion
}
