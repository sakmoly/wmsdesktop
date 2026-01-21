using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class TransferOrderApiService
{
    /// <summary>
    /// Fetch all transfer orders from backend API
    /// </summary>
    public static async Task<List<ApiTransferOrder>?> FetchTransferOrdersFromApiAsync(WmsSettings settings)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiEndpointUrl) || string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            ErrorLogService.LogInfo("TransferOrderApiService: API endpoint or key not configured");
            return null;
        }

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(10); // 10 second timeout
            
            // Set authorization header
            httpClient.DefaultRequestHeaders.Authorization = 
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);
            
            var baseUrl = settings.ApiEndpointUrl.TrimEnd('/');
            var apiUrl = $"{baseUrl}/api/master/transfer-orders";
            
            ErrorLogService.LogInfo($"TransferOrderApiService: Fetching transfer orders from {apiUrl}");

            var response = await httpClient.GetAsync(apiUrl);
            
            if (!response.IsSuccessStatusCode)
            {
                ErrorLogService.LogError($"TransferOrderApiService: API returned {response.StatusCode}", null);
                return null;
            }

            var jsonContent = await response.Content.ReadAsStringAsync();
            
            var options = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            };

            var transferOrders = JsonSerializer.Deserialize<List<ApiTransferOrder>>(jsonContent, options);
            
            if (transferOrders != null)
            {
                ErrorLogService.LogInfo($"TransferOrderApiService: Fetched {transferOrders.Count} transfer order(s) from API");
            }
            
            return transferOrders;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("TransferOrderApiService: Error fetching transfer orders from API", ex);
            return null;
        }
    }
}

/// <summary>
/// API response model for Transfer Order
/// </summary>
public class ApiTransferOrder
{
    [JsonPropertyName("transfer_order")]
    public string TransferOrder { get; set; } = string.Empty;
    
    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;
    
    [JsonPropertyName("asn_no")]
    public string? AsnNo { get; set; }
    
    [JsonPropertyName("from_warehouse")]
    public string? FromWarehouse { get; set; }
    
    [JsonPropertyName("prepared_by")]
    public string? PreparedBy { get; set; }
    
    [JsonPropertyName("required_date")]
    public string? RequiredDate { get; set; }
    
    [JsonPropertyName("total_allocated_qty")]
    public double TotalAllocatedQty { get; set; }
    
    [JsonPropertyName("created_at")]
    public string? CreatedAt { get; set; }
    
    [JsonPropertyName("updated_at")]
    public string? UpdatedAt { get; set; }
}
