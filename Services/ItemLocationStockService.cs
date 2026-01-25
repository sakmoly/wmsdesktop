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

/// <summary>
/// Service for fetching item location stock from API
/// Uses GET /api/stock/item/{item_code}/warehouse/{warehouse} endpoint
/// </summary>
public static class ItemLocationStockService
{
    /// <summary>
    /// Get item location stock breakdown from API
    /// </summary>
    public static async Task<List<ItemLocationStockApiResponse>> GetItemLocationStockAsync(
        WmsSettings settings,
        string itemCode,
        string warehouse)
    {
        try
        {
            // Validate API key before making request
            if (string.IsNullOrWhiteSpace(settings.ApiKey) || 
                settings.ApiKey.Contains("MOCK-KEY") || 
                settings.ApiKey.Contains("******"))
            {
                ErrorLogService.LogError("ItemLocationStockService: Invalid API key in settings. Please login to get a valid token.");
                throw new InvalidOperationException("API key is missing or invalid. Please login to get a valid token.");
            }
            
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);
            httpClient.DefaultRequestHeaders.Authorization = 
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);

            var baseUrl = settings.ApiEndpointUrl.TrimEnd('/');
            
            // Handle base URL that already includes /api
            string endpointPath;
            if (baseUrl.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
            {
                endpointPath = $"/stock/item/{Uri.EscapeDataString(itemCode)}/warehouse/{Uri.EscapeDataString(warehouse)}";
            }
            else
            {
                endpointPath = $"/api/stock/item/{Uri.EscapeDataString(itemCode)}/warehouse/{Uri.EscapeDataString(warehouse)}";
            }
            
            var url = $"{baseUrl}{endpointPath}?format=flat";

            ErrorLogService.LogInfo($"ItemLocationStockService: Calling API: {url}");

            var responseMessage = await httpClient.GetAsync(url);
            
            if (!responseMessage.IsSuccessStatusCode)
            {
                var errorContent = await responseMessage.Content.ReadAsStringAsync();
                ErrorLogService.LogError($"ItemLocationStockService: API returned {responseMessage.StatusCode}: {errorContent}");
                
                if (responseMessage.StatusCode == System.Net.HttpStatusCode.Forbidden)
                {
                    var errorMsg = "ItemLocationStockService: 403 Forbidden - API token is invalid or expired.\n" +
                                   "To fix: Run .\\SCRIPTS\\GetApiToken.ps1 -UserCode \"YOUR_USER\" -Password \"YOUR_PASSWORD\" or login via Postman and update wms_settings.json";
                    ErrorLogService.LogError(errorMsg);
                }
                
                responseMessage.EnsureSuccessStatusCode();
            }
            
            var response = await responseMessage.Content.ReadAsStringAsync();
            
            ErrorLogService.LogInfo($"ItemLocationStockService: API Response received (length: {response.Length})");
            ErrorLogService.LogInfo($"ItemLocationStockService: API Response preview (first 500 chars): {response.Substring(0, Math.Min(500, response.Length))}");
            
            // API returns array directly (not wrapped in { ok: true, data: [...] })
            var jsonOptions = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            };
            
            var stockData = JsonSerializer.Deserialize<List<ItemLocationStockApiResponse>>(response, jsonOptions);
            
            ErrorLogService.LogInfo($"ItemLocationStockService: Received {stockData?.Count ?? 0} location(s) from API");
            
            // Log first location for debugging
            if (stockData != null && stockData.Count > 0)
            {
                var first = stockData[0];
                ErrorLogService.LogInfo($"ItemLocationStockService: First location - BinLocation: {first.BinLocation ?? "NULL"}, LocationId: {first.LocationId ?? "NULL"}, TotalQty: {first.TotalQty}, AvailableQty: {first.AvailableQty}, Cartons: {first.Cartons?.Count ?? 0}");
            }
            else
            {
                ErrorLogService.LogInfo($"ItemLocationStockService: stockData is null or empty. stockData == null: {stockData == null}, count: {stockData?.Count ?? 0}");
            }
            
            return stockData ?? new List<ItemLocationStockApiResponse>();
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"ItemLocationStockService: Failed to fetch item location stock: {ex.Message}", ex);
            return new List<ItemLocationStockApiResponse>();
        }
    }
}

/// <summary>
/// API response model for item location stock
/// </summary>
public sealed class ItemLocationStockApiResponse
{
    [JsonPropertyName("item_code")]
    public string ItemCode { get; init; } = string.Empty;
    
    [JsonPropertyName("warehouse")]
    public string Warehouse { get; init; } = string.Empty;
    
    [JsonPropertyName("bin_location")]
    public string? BinLocation { get; init; }
    
    [JsonPropertyName("location_id")]
    public string? LocationId { get; init; }
    
    [JsonPropertyName("zone")]
    public string? Zone { get; init; }
    
    [JsonPropertyName("aisle")]
    public string? Aisle { get; init; }
    
    [JsonPropertyName("rack")]
    public string? Rack { get; init; }
    
    [JsonPropertyName("level")]
    public string? Level { get; init; }
    
    [JsonPropertyName("bin")]
    public string? Bin { get; init; }
    
    [JsonPropertyName("carton_id")]
    public string? CartonId { get; init; }
    
    [JsonPropertyName("cartons")]
    public List<CartonInfo>? Cartons { get; init; }
    
    [JsonPropertyName("qty")]
    public double Qty { get; init; }
    
    [JsonPropertyName("total_qty")]
    public double TotalQty { get; init; }
    
    [JsonPropertyName("reserved_qty")]
    public double ReservedQty { get; init; }
    
    [JsonPropertyName("blocked_qty")]
    public double BlockedQty { get; init; }
    
    [JsonPropertyName("available_qty")]
    public double AvailableQty { get; init; }
    
    [JsonPropertyName("calculation_log")]
    public List<string>? CalculationLog { get; init; }
}

public sealed class CartonInfo
{
    [JsonPropertyName("carton_id")]
    public string? CartonId { get; init; }
    
    [JsonPropertyName("qty")]
    public double Qty { get; init; }
    
    [JsonPropertyName("status")]
    public string? Status { get; init; }
}
