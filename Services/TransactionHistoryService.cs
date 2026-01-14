using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading.Tasks;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class TransactionHistoryService
{
    /// <summary>
    /// Get transaction history from API
    /// </summary>
    public static async Task<List<TransactionHistory>> GetTransactionHistoryAsync(
        WmsSettings settings,
        string? itemCode = null,
        string? warehouse = null,
        string? binLocation = null,
        string? cartonId = null,
        string? transactionType = null,
        string? stockDirection = null,
        string? referenceDoc = null,
        DateTime? fromDate = null,
        DateTime? toDate = null,
        int limit = 1000)
    {
        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30); // 30 second timeout
            httpClient.DefaultRequestHeaders.Authorization = 
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", settings.ApiKey);

            var queryParams = new List<string>();
            
            if (!string.IsNullOrEmpty(itemCode))
                queryParams.Add($"item_code={Uri.EscapeDataString(itemCode)}");
            
            if (!string.IsNullOrEmpty(warehouse))
                queryParams.Add($"warehouse={Uri.EscapeDataString(warehouse)}");
            
            if (!string.IsNullOrEmpty(binLocation))
                queryParams.Add($"bin_location={Uri.EscapeDataString(binLocation)}");
            
            if (!string.IsNullOrEmpty(cartonId))
                queryParams.Add($"carton_id={Uri.EscapeDataString(cartonId)}");
            
            if (!string.IsNullOrEmpty(transactionType))
                queryParams.Add($"transaction_type={Uri.EscapeDataString(transactionType)}");
            
            if (!string.IsNullOrEmpty(stockDirection))
                queryParams.Add($"stock_direction={Uri.EscapeDataString(stockDirection)}");
            
            if (!string.IsNullOrEmpty(referenceDoc))
                queryParams.Add($"reference_doc={Uri.EscapeDataString(referenceDoc)}");
            
            if (fromDate.HasValue)
                queryParams.Add($"from_date={fromDate.Value:yyyy-MM-dd}");
            
            if (toDate.HasValue)
                queryParams.Add($"to_date={toDate.Value:yyyy-MM-dd}");
            
            queryParams.Add($"limit={limit}");

            var queryString = string.Join("&", queryParams);
            var baseUrl = settings.ApiEndpointUrl.TrimEnd('/');
            
            // Handle base URL that already includes /api
            string endpointPath;
            if (baseUrl.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
            {
                // Base URL already has /api, just append the endpoint
                endpointPath = "/transaction-history";
            }
            else
            {
                // Base URL doesn't have /api, add it
                endpointPath = "/api/transaction-history";
            }
            
            var url = $"{baseUrl}{endpointPath}?{queryString}";

            ErrorLogService.LogInfo($"TransactionHistoryService: Calling API: {url}");

            HttpResponseMessage responseMessage;
            try
            {
                responseMessage = await httpClient.GetAsync(url);
            }
            catch (HttpRequestException httpEx)
            {
                ErrorLogService.LogError($"TransactionHistoryService: HTTP request failed: {httpEx.Message}", httpEx);
                throw;
            }
            
            if (!responseMessage.IsSuccessStatusCode)
            {
                var errorContent = await responseMessage.Content.ReadAsStringAsync();
                ErrorLogService.LogError($"TransactionHistoryService: API returned {responseMessage.StatusCode}: {errorContent}");
                
                if (responseMessage.StatusCode == System.Net.HttpStatusCode.Forbidden)
                {
                    ErrorLogService.LogError("TransactionHistoryService: 403 Forbidden - Check if API key is valid. You may need to login to get a new token.");
                }
                
                responseMessage.EnsureSuccessStatusCode(); // This will throw the exception
            }
            
            var response = await responseMessage.Content.ReadAsStringAsync();
            
            ErrorLogService.LogInfo($"TransactionHistoryService: API Response received (length: {response.Length})");
            
            // Parse JSON response (API returns { ok: true, data: [...] })
            var jsonDoc = JsonDocument.Parse(response);
            
            if (jsonDoc.RootElement.TryGetProperty("ok", out var okElement) && okElement.GetBoolean())
            {
                if (jsonDoc.RootElement.TryGetProperty("data", out var dataElement))
                {
                    var jsonOptions = new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    };
                    
                    // Log first transaction for debugging
                    if (dataElement.ValueKind == System.Text.Json.JsonValueKind.Array && dataElement.GetArrayLength() > 0)
                    {
                        var firstTransaction = dataElement[0];
                        var sampleJson = firstTransaction.GetRawText();
                        ErrorLogService.LogInfo($"TransactionHistoryService: Sample transaction from API (first 500 chars): {sampleJson.Substring(0, Math.Min(500, sampleJson.Length))}");
                    }
                    
                    var transactions = JsonSerializer.Deserialize<List<TransactionHistory>>(dataElement.GetRawText(), jsonOptions);
                    
                    // Log deserialized data for debugging
                    if (transactions != null && transactions.Count > 0)
                    {
                        var first = transactions[0];
                        ErrorLogService.LogInfo($"TransactionHistoryService: Deserialized first transaction - ID: {first.Id}, TransactionNumber: {first.TransactionNumber}, TransactionDate: {first.TransactionDate}, ItemCode: {first.ItemCode}, TransactionType: {first.TransactionType}");
                    }
                    
                    var count = transactions?.Count ?? 0;
                    ErrorLogService.LogInfo($"TransactionHistoryService: Parsed {count} transactions from API response");
                    
                    return transactions ?? new List<TransactionHistory>();
                }
                else
                {
                    ErrorLogService.LogError("TransactionHistoryService: API response has 'ok: true' but no 'data' property");
                }
            }
            else
            {
                // Check for error in response
                if (jsonDoc.RootElement.TryGetProperty("error", out var errorElement))
                {
                    var errorMessage = errorElement.GetRawText();
                    ErrorLogService.LogError($"TransactionHistoryService: API returned error: {errorMessage}");
                }
                else
                {
                    ErrorLogService.LogError($"TransactionHistoryService: API response format unexpected. Response: {response.Substring(0, Math.Min(500, response.Length))}");
                }
            }
            
            // Fallback: try to parse as direct array
            try
            {
                var transactionsFallback = JsonSerializer.Deserialize<List<TransactionHistory>>(response, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                
                var count = transactionsFallback?.Count ?? 0;
                ErrorLogService.LogInfo($"TransactionHistoryService: Fallback parsing returned {count} transactions");
                
                return transactionsFallback ?? new List<TransactionHistory>();
            }
            catch (Exception fallbackEx)
            {
                ErrorLogService.LogError($"TransactionHistoryService: Fallback parsing failed: {fallbackEx.Message}");
                return new List<TransactionHistory>();
            }
        }
        catch (HttpRequestException httpEx)
        {
            ErrorLogService.LogError($"TransactionHistoryService: HTTP error fetching transaction history: {httpEx.Message}", httpEx);
            return new List<TransactionHistory>();
        }
        catch (TaskCanceledException timeoutEx)
        {
            ErrorLogService.LogError($"TransactionHistoryService: Request timeout fetching transaction history: {timeoutEx.Message}", timeoutEx);
            return new List<TransactionHistory>();
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"TransactionHistoryService: Failed to fetch transaction history: {ex.Message}", ex);
            ErrorLogService.LogError($"TransactionHistoryService: Stack trace: {ex.StackTrace}", null);
            return new List<TransactionHistory>();
        }
    }
}
