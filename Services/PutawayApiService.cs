using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading.Tasks;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class PutawayApiService
{
    /// <summary>
    /// Complete a Putaway Task (changes status to "Completed" and updates stock)
    /// </summary>
    public static async Task<(bool Success, string Message)> CompletePutawayAsync(WmsSettings settings, string putawayTask, string? performedBy = null)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiEndpointUrl) || string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            return (false, "API endpoint or key not configured");
        }

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);
            
            // Set authorization header
            httpClient.DefaultRequestHeaders.Authorization = 
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);
            
            var baseUrl = settings.ApiEndpointUrl.TrimEnd('/');
            var apiUrl = $"{baseUrl}/api/putaway/complete";
            
            // Build request body
            var requestBody = new
            {
                putaway_task = putawayTask,
                performed_by = performedBy
            };
            
            var json = JsonSerializer.Serialize(requestBody);
            var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            
            var response = await httpClient.PostAsync(apiUrl, content);
            var responseContent = await response.Content.ReadAsStringAsync();
            
            if (response.IsSuccessStatusCode)
            {
                var result = JsonSerializer.Deserialize<ApiResponse>(responseContent, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                
                if (result?.Ok == true)
                {
                    return (true, result.Message ?? "Putaway Task completed successfully");
                }
                else
                {
                    return (false, result?.Error?.Message ?? "Failed to complete Putaway Task");
                }
            }
            else
            {
                return (false, $"API error: {response.StatusCode} - {responseContent}");
            }
        }
        catch (System.Net.Http.HttpRequestException httpEx)
        {
            ErrorLogService.LogError($"Error completing Putaway Task {putawayTask}", httpEx);
            
            // Check for DNS/connection errors
            if (httpEx.Message.Contains("no data of the requested type") || 
                httpEx.Message.Contains("Name or service not known") ||
                httpEx.Message.Contains("Could not resolve host"))
            {
                return (false, $"Cannot connect to API server. Please check your API endpoint URL in Settings.\n\nCurrent URL: {settings.ApiEndpointUrl}\n\nError: {httpEx.Message}");
            }
            
            if (httpEx.Message.Contains("Connection refused") || httpEx.Message.Contains("No connection could be made"))
            {
                return (false, $"Cannot connect to API server. The server may be down or the URL is incorrect.\n\nCurrent URL: {settings.ApiEndpointUrl}");
            }
            
            return (false, $"Network error: {httpEx.Message}");
        }
        catch (TaskCanceledException timeoutEx) when (timeoutEx.InnerException is TimeoutException)
        {
            ErrorLogService.LogError($"Timeout completing Putaway Task {putawayTask}", timeoutEx);
            return (false, $"Request timed out. The API server may be slow or unreachable.\n\nCurrent URL: {settings.ApiEndpointUrl}");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"Error completing Putaway Task {putawayTask}", ex);
            return (false, $"Error: {ex.Message}");
        }
    }

    private class ApiResponse
    {
        public bool Ok { get; set; }
        public string? Message { get; set; }
        public ApiError? Error { get; set; }
    }

    /// <summary>
    /// Update Putaway Task location (assigns location to all items in the task)
    /// </summary>
    public static async Task<(bool Success, string Message)> UpdatePutawayLocationAsync(
        WmsSettings settings, 
        string putawayTask, 
        string locationId,
        string? userId = null)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiEndpointUrl) || string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            return (false, "API endpoint or key not configured");
        }

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);
            
            // Set authorization header
            httpClient.DefaultRequestHeaders.Authorization = 
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);
            
            var baseUrl = settings.ApiEndpointUrl.TrimEnd('/');
            var apiUrl = $"{baseUrl}/api/putaway/scan-transfer-carton";
            
            // Build request body - only putaway_task and location_id (no box_id/tc_id)
            var requestBody = new
            {
                putaway_task = putawayTask,
                location_id = locationId,
                user_id = userId
            };
            
            var json = JsonSerializer.Serialize(requestBody);
            var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            
            var response = await httpClient.PostAsync(apiUrl, content);
            var responseContent = await response.Content.ReadAsStringAsync();
            
            if (response.IsSuccessStatusCode)
            {
                var result = JsonSerializer.Deserialize<ApiResponse>(responseContent, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                
                if (result?.Ok == true)
                {
                    return (true, result.Message ?? "Location updated successfully");
                }
                else
                {
                    return (false, result?.Error?.Message ?? "Failed to update location");
                }
            }
            else
            {
                return (false, $"API error: {response.StatusCode} - {responseContent}");
            }
        }
        catch (System.Net.Http.HttpRequestException httpEx)
        {
            ErrorLogService.LogError($"Error updating Putaway Task location {putawayTask}", httpEx);
            
            if (httpEx.Message.Contains("no data of the requested type") || 
                httpEx.Message.Contains("Name or service not known") ||
                httpEx.Message.Contains("Could not resolve host"))
            {
                return (false, $"Cannot connect to API server. Please check your API endpoint URL in Settings.\n\nCurrent URL: {settings.ApiEndpointUrl}\n\nError: {httpEx.Message}");
            }
            
            if (httpEx.Message.Contains("Connection refused") || httpEx.Message.Contains("No connection could be made"))
            {
                return (false, $"Cannot connect to API server. The server may be down or the URL is incorrect.\n\nCurrent URL: {settings.ApiEndpointUrl}");
            }
            
            return (false, $"Network error: {httpEx.Message}");
        }
        catch (TaskCanceledException timeoutEx) when (timeoutEx.InnerException is TimeoutException)
        {
            ErrorLogService.LogError($"Timeout updating Putaway Task location {putawayTask}", timeoutEx);
            return (false, $"Request timed out. The API server may be slow or unreachable.\n\nCurrent URL: {settings.ApiEndpointUrl}");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"Error updating Putaway Task location {putawayTask}", ex);
            return (false, $"Error: {ex.Message}");
        }
    }

    private class ApiError
    {
        public string? Message { get; set; }
    }
}
