using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class InboundSessionApiService
{
    /// <summary>
    /// Fetch all inbound sessions from backend API
    /// </summary>
    public static async Task<List<ApiInboundSession>?> FetchSessionsFromApiAsync(WmsSettings settings)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiEndpointUrl) || string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            ErrorLogService.LogInfo("InboundSessionApiService: API endpoint or key not configured");
            return null;
        }

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(10); // 10 second timeout
            
            // Set authorization header
            httpClient.DefaultRequestHeaders.Authorization = 
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);
            
            // Build API URL - try common endpoint patterns
            // If your API has a different endpoint, update this
            var baseUrl = settings.ApiEndpointUrl.TrimEnd('/');
            
            // Try different endpoint patterns (update based on your actual API)
            // Option 1: /api/inbound/sessions
            // Option 2: /api/inbound/list
            // Option 3: /api/inbound (if it returns all sessions)
            var apiUrl = $"{baseUrl}/api/inbound/sessions";
            
            // If the endpoint doesn't exist, you may need to create it in the backend
            // Or use an existing endpoint that returns all sessions

            ErrorLogService.LogInfo($"InboundSessionApiService: Fetching sessions from {apiUrl}");

            var response = await httpClient.GetAsync(apiUrl);
            
            if (!response.IsSuccessStatusCode)
            {
                ErrorLogService.LogError($"InboundSessionApiService: API returned {response.StatusCode}", null);
                return null;
            }

            var jsonContent = await response.Content.ReadAsStringAsync();
            
            // Parse response - adjust based on your API response format
            var options = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            };

            // Try to parse as array or object with sessions property
            List<ApiInboundSession>? sessions = null;
            
            try
            {
                // Try parsing as direct array
                sessions = JsonSerializer.Deserialize<List<ApiInboundSession>>(jsonContent, options);
            }
            catch
            {
                // Try parsing as object with sessions property
                try
                {
                    var wrapper = JsonSerializer.Deserialize<ApiResponseWrapper>(jsonContent, options);
                    sessions = wrapper?.Sessions;
                }
                catch (Exception ex)
                {
                    ErrorLogService.LogError($"InboundSessionApiService: Failed to parse API response: {ex.Message}", ex);
                    return null;
                }
            }

            ErrorLogService.LogInfo($"InboundSessionApiService: Fetched {sessions?.Count ?? 0} sessions from API");
            return sessions;
        }
        catch (TaskCanceledException)
        {
            ErrorLogService.LogInfo("InboundSessionApiService: Request timeout - API not available");
            return null;
        }
        catch (HttpRequestException ex)
        {
            ErrorLogService.LogError($"InboundSessionApiService: HTTP error - {ex.Message}", ex);
            return null;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"InboundSessionApiService: Error fetching sessions from API: {ex.Message}", ex);
            return null;
        }
    }

    /// <summary>
    /// API response wrapper (if API returns { sessions: [...] })
    /// </summary>
    private class ApiResponseWrapper
    {
        public List<ApiInboundSession>? Sessions { get; set; }
        public List<ApiInboundSession>? Data { get; set; }
    }
}

/// <summary>
/// Inbound Session model from API
/// </summary>
public sealed class ApiInboundSession
{
    public string InboundSession { get; set; } = string.Empty;
    public string AsnNo { get; set; } = string.Empty;
    public string Status { get; set; } = "Draft";
    public int CompletedCartons { get; set; }
    public int TotalCartons { get; set; }
    public string? TransferOrder { get; set; }
    public string? Dock { get; set; }
    public string StartedBy { get; set; } = string.Empty;
    public string DeviceId { get; set; } = string.Empty;
    public DateTime StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    public DateTime? CompletedOn { get; set; }
    
    [JsonPropertyName("unload_lines")]
    public List<ApiUnloadLine>? UnloadLines { get; set; }
    
    [JsonPropertyName("receive_lines")]
    public List<ApiReceiveLine>? ReceiveLines { get; set; }
}

/// <summary>
/// Unload Line model from API
/// </summary>
public sealed class ApiUnloadLine
{
    [JsonPropertyName("unit_type")]
    public string UnitType { get; set; } = string.Empty;
    
    [JsonPropertyName("unit_id")]
    public string UnitId { get; set; } = string.Empty;
    
    [JsonPropertyName("scanned_on")]
    public DateTime ScannedOn { get; set; }
    
    [JsonPropertyName("scanned_by")]
    public string ScannedBy { get; set; } = string.Empty;
}

/// <summary>
/// Receive Line model from API
/// </summary>
public sealed class ApiReceiveLine
{
    [JsonPropertyName("carton_id")]
    public string CartonId { get; set; } = string.Empty;
    
    [JsonPropertyName("item_code")]
    public string ItemCode { get; set; } = string.Empty;
    
    [JsonPropertyName("expected_qty")]
    public double ExpectedQty { get; set; }
    
    [JsonPropertyName("received_qty")]
    public double ReceivedQty { get; set; }
    
    [JsonPropertyName("condition")]
    public string Condition { get; set; } = "Good";
    
    [JsonPropertyName("remarks")]
    public string? Remarks { get; set; }
}

