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
            
            var url = $"{baseUrl}{endpointPath}?format=grouped";

            ErrorLogService.LogInfo($"ItemLocationStockService: Calling API: {url}");

            var responseMessage = await httpClient.GetAsync(url);
            
            if (!responseMessage.IsSuccessStatusCode)
            {
                var errorContent = await responseMessage.Content.ReadAsStringAsync();
                ErrorLogService.LogError($"ItemLocationStockService: API returned {responseMessage.StatusCode}: {errorContent}");
                responseMessage.EnsureSuccessStatusCode();
            }
            
            var response = await responseMessage.Content.ReadAsStringAsync();
            
            // API returns array directly (not wrapped in { ok: true, data: [...] })
            var jsonOptions = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            };
            
            var stockData = JsonSerializer.Deserialize<List<ItemLocationStockApiResponse>>(response, jsonOptions);
            
            ErrorLogService.LogInfo($"ItemLocationStockService: Received {stockData?.Count ?? 0} location(s) from API");
            
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
    
    [JsonPropertyName("cartons")]
    public List<CartonInfo>? Cartons { get; init; }
    
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
