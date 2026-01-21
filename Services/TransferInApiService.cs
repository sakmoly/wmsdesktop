using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading.Tasks;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class TransferInApiService
{
    /// <summary>
    /// Complete Transfer In receiving (sets status to "Received" and updates all item statuses)
    /// </summary>
    public static async Task<(bool Success, string Message)> CompleteTransferInAsync(WmsSettings settings, string transferInTitle, string? completedBy = null)
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
            var apiUrl = $"{baseUrl}/api/transfer-in/{transferInTitle}/complete-receiving";
            
            // Build request body
            var requestBody = new
            {
                completed_by = completedBy
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
                    return (true, result.Message ?? "Transfer In completed successfully");
                }
                else
                {
                    return (false, result?.Error?.Message ?? "Failed to complete Transfer In");
                }
            }
            else
            {
                return (false, $"API error: {response.StatusCode} - {responseContent}");
            }
        }
        catch (System.Net.Http.HttpRequestException httpEx)
        {
            ErrorLogService.LogError($"Error completing Transfer In {transferInTitle}", httpEx);
            
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
            ErrorLogService.LogError($"Timeout completing Transfer In {transferInTitle}", timeoutEx);
            return (false, $"Request timed out. The API server may be slow or unreachable.\n\nCurrent URL: {settings.ApiEndpointUrl}");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"Error completing Transfer In {transferInTitle}", ex);
            return (false, $"Error: {ex.Message}");
        }
    }

    private class ApiResponse
    {
        public bool Ok { get; set; }
        public string? Message { get; set; }
        public ApiError? Error { get; set; }
    }

    private class ApiError
    {
        public string? Message { get; set; }
    }
}
