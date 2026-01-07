using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Service for creating scan events via the backend API
/// </summary>
public static class EventApiService
{
    private static readonly HttpClient _httpClient = new HttpClient();
    private static string? _baseUrl;
    private static string? _authToken;

    /// <summary>
    /// Initialize the service with API base URL and auth token
    /// </summary>
    public static void Initialize(string baseUrl, string authToken)
    {
        _baseUrl = baseUrl.TrimEnd('/');
        _authToken = authToken;
        _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authToken);
        _httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
    }

    /// <summary>
    /// Send batch of scan events to the API
    /// </summary>
    public static async Task<bool> SendEventsAsync(List<WmsScanEvent> events)
    {
        if (string.IsNullOrEmpty(_baseUrl) || string.IsNullOrEmpty(_authToken))
        {
            throw new InvalidOperationException("EventApiService not initialized. Call Initialize() first.");
        }

        try
        {
            var requestBody = new
            {
                events = events.Select(e => new
                {
                    offline_uuid = e.OfflineUuid,
                    event_type = e.EventType,
                    event_time = e.EventTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                    device_id = e.DeviceId,
                    user_id = e.UserId,
                    advance_shipping_notice = e.AdvanceShippingNotice,
                    transfer_order = e.TransferOrder,
                    inbound_session = e.InboundSession,
                    carton_id = e.CartonId,
                    item_code = e.ItemCode,
                    qty = e.Qty,
                    store = e.Store,
                    box_id = e.BoxId,
                    tc_id = e.TcId,
                    rack = e.Rack,
                    bin = e.Bin,
                    notes = e.Notes
                }).ToArray()
            };

            var json = JsonSerializer.Serialize(requestBody, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });

            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync($"{_baseUrl}/api/events/batch", content);

            if (response.IsSuccessStatusCode)
            {
                var responseContent = await response.Content.ReadAsStringAsync();
                var result = JsonSerializer.Deserialize<EventBatchResponse>(responseContent, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                return result?.Ok == true;
            }
            else
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                ErrorLogService.LogError($"Failed to send events: {response.StatusCode} - {errorContent}", null);
                return false;
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error sending events to API", ex);
            return false;
        }
    }

    /// <summary>
    /// Create a SORT_TO_BOX event
    /// </summary>
    public static WmsScanEvent CreateSortToBoxEvent(
        string deviceId,
        string userId,
        string asnNo,
        string transferOrder,
        string itemCode,
        double qty,
        string store,
        string boxId,
        string? cartonId = null,
        string? inboundSession = null)
    {
        return new WmsScanEvent
        {
            OfflineUuid = Guid.NewGuid().ToString(),
            EventType = "SORT_TO_BOX",
            EventTime = DateTime.UtcNow,
            DeviceId = deviceId,
            UserId = userId,
            AdvanceShippingNotice = asnNo,
            TransferOrder = transferOrder,
            InboundSession = inboundSession,
            CartonId = cartonId,
            ItemCode = itemCode,
            Qty = qty,
            Store = store,
            BoxId = boxId
        };
    }

    /// <summary>
    /// Create a PACK_BOX_TO_TC event (item-level)
    /// </summary>
    public static WmsScanEvent CreatePackBoxToTCEvent(
        string deviceId,
        string userId,
        string asnNo,
        string transferOrder,
        string itemCode,
        double qty,
        string boxId,
        string tcId,
        string? cartonId = null,
        string? store = null,
        string? inboundSession = null)
    {
        return new WmsScanEvent
        {
            OfflineUuid = Guid.NewGuid().ToString(),
            EventType = "PACK_BOX_TO_TC",
            EventTime = DateTime.UtcNow,
            DeviceId = deviceId,
            UserId = userId,
            AdvanceShippingNotice = asnNo,
            TransferOrder = transferOrder,
            InboundSession = inboundSession,
            CartonId = cartonId,
            ItemCode = itemCode,
            Qty = qty,
            Store = store,
            BoxId = boxId,
            TcId = tcId
        };
    }

    /// <summary>
    /// Create a PACK_BOX_TO_TC event (box-level - will be auto-expanded by backend)
    /// </summary>
    public static WmsScanEvent CreatePackBoxToTCEventBoxLevel(
        string deviceId,
        string userId,
        string asnNo,
        string transferOrder,
        string boxId,
        string tcId,
        string? store = null,
        string? inboundSession = null)
    {
        return new WmsScanEvent
        {
            OfflineUuid = Guid.NewGuid().ToString(),
            EventType = "PACK_BOX_TO_TC",
            EventTime = DateTime.UtcNow,
            DeviceId = deviceId,
            UserId = userId,
            AdvanceShippingNotice = asnNo,
            TransferOrder = transferOrder,
            InboundSession = inboundSession,
            CartonId = null,
            ItemCode = null,
            Qty = null, // Box-level event - backend will expand
            Store = store,
            BoxId = boxId,
            TcId = tcId
        };
    }

    private class EventBatchResponse
    {
        public bool Ok { get; set; }
        public string? Message { get; set; }
        public int? InsertedCount { get; set; }
        public int? TotalCount { get; set; }
    }
}

