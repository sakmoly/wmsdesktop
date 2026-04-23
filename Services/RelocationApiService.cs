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

public static class RelocationApiService
{
    // Options for deserializing responses (camelCase)
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    // Options for serializing requests (no naming policy - preserve dictionary keys as-is)
    private static readonly JsonSerializerOptions RequestJsonOptions = new()
    {
        PropertyNameCaseInsensitive = false,
        PropertyNamingPolicy = null // No naming policy - preserve keys exactly as written
    };

    /// <summary>
    /// Start a relocation session
    /// </summary>
    public static async Task<(bool Success, string Message, RelocationSession? Session)> StartSessionAsync(
        WmsSettings settings, string mode, string warehouseId, string userId, string? deviceId = null)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiEndpointUrl) || string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            return (false, "API endpoint or key not configured", null);
        }

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);
            httpClient.DefaultRequestHeaders.Authorization = 
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);

            var baseUrl = settings.ApiEndpointUrl.TrimEnd('/');
            var apiUrl = $"{baseUrl}/api/relocation/session/start";

            // Validate required fields
            if (string.IsNullOrWhiteSpace(mode) || string.IsNullOrWhiteSpace(warehouseId) || string.IsNullOrWhiteSpace(userId))
            {
                return (false, "mode, warehouse_id, and user_id are required", null);
            }

            // Use Dictionary to ensure snake_case keys are preserved exactly
            var requestBody = new Dictionary<string, object?>
            {
                ["mode"] = mode,
                ["warehouse_id"] = warehouseId,
                ["user_id"] = userId
            };
            if (!string.IsNullOrWhiteSpace(deviceId))
            {
                requestBody["device_id"] = deviceId;
            }

            // Serialize with no naming policy - Dictionary keys are preserved as-is
            var json = JsonSerializer.Serialize(requestBody, new JsonSerializerOptions
            {
                PropertyNamingPolicy = null, // No naming policy for dictionary keys
                DictionaryKeyPolicy = null  // No naming policy for dictionary keys
            });
            
            // Debug: Log the JSON being sent
            System.Diagnostics.Debug.WriteLine($"Relocation API Request: {apiUrl}");
            System.Diagnostics.Debug.WriteLine($"Request Body: {json}");
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await httpClient.PostAsync(apiUrl, content);
            var responseContent = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                var result = JsonSerializer.Deserialize<ApiResponse<RelocationSessionData>>(responseContent, JsonOptions);
                
                if (result?.Ok == true && result.Data != null)
                {
                    var session = new RelocationSession
                    {
                        SessionId = result.Data.SessionId,
                        Mode = result.Data.Mode,
                        Policy = result.Data.Policy,
                        WarehouseId = result.Data.WarehouseId,
                        Status = result.Data.Status
                    };
                    return (true, result.Message ?? "Session started successfully", session);
                }
                else
                {
                    return (false, result?.Error?.Message ?? "Failed to start session", null);
                }
            }
            else
            {
                return (false, $"API error: {response.StatusCode} - {responseContent}", null);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error starting relocation session", ex);
            return (false, $"Error: {ex.Message}", null);
        }
    }

    /// <summary>
    /// Set FROM location for a session
    /// </summary>
    public static async Task<(bool Success, string Message)> SetFromLocationAsync(
        WmsSettings settings, string sessionId, string? fromBin, string? fromCarton)
    {
        return await UpdateLocationAsync(settings, sessionId, "from", fromBin, fromCarton);
    }

    /// <summary>
    /// Set TO location for a session
    /// </summary>
    public static async Task<(bool Success, string Message)> SetToLocationAsync(
        WmsSettings settings, string sessionId, string? toBin, string? toCarton)
    {
        return await UpdateLocationAsync(settings, sessionId, "to", toBin, toCarton);
    }

    private static async Task<(bool Success, string Message)> UpdateLocationAsync(
        WmsSettings settings, string sessionId, string locationType, string? bin, string? carton)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiEndpointUrl) || string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            return (false, "API endpoint or key not configured");
        }

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);
            httpClient.DefaultRequestHeaders.Authorization = 
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);

            var baseUrl = settings.ApiEndpointUrl.TrimEnd('/');
            var apiUrl = $"{baseUrl}/api/relocation/session/{sessionId}/{locationType}";

            // Use snake_case for request body to match backend API
            var requestBody = new Dictionary<string, object?>();
            if (locationType == "from")
            {
                if (bin != null) requestBody["from_bin"] = bin;
                if (carton != null) requestBody["from_carton"] = carton;
            }
            else
            {
                if (bin != null) requestBody["to_bin"] = bin;
                if (carton != null) requestBody["to_carton"] = carton;
            }

            var json = JsonSerializer.Serialize(requestBody, RequestJsonOptions);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await httpClient.PutAsync(apiUrl, content);
            var responseContent = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                var result = JsonSerializer.Deserialize<ApiResponse>(responseContent, JsonOptions);
                return (result?.Ok == true, result?.Message ?? "Location updated successfully");
            }
            else
            {
                return (false, $"API error: {response.StatusCode} - {responseContent}");
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"Error setting {locationType} location", ex);
            return (false, $"Error: {ex.Message}");
        }
    }

    /// <summary>
    /// Get carton contents
    /// </summary>
    public static async Task<(bool Success, string Message, CartonContents? Contents)> GetCartonContentsAsync(
        WmsSettings settings, string cartonId)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiEndpointUrl) || string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            return (false, "API endpoint or key not configured", null);
        }

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);
            httpClient.DefaultRequestHeaders.Authorization = 
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);

            var baseUrl = settings.ApiEndpointUrl.TrimEnd('/');
            // Remove trailing /api if present to avoid double /api/api
            if (baseUrl.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
            {
                baseUrl = baseUrl.Substring(0, baseUrl.Length - 4).TrimEnd('/');
            }
            var apiUrl = $"{baseUrl}/api/carton/{cartonId}/contents";

            var response = await httpClient.GetAsync(apiUrl);
            var responseContent = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                var result = JsonSerializer.Deserialize<ApiResponse<CartonContentsData>>(responseContent, JsonOptions);
                
                if (result?.Ok == true && result.Data != null)
                {
                    var contents = new CartonContents
                    {
                        CartonId = result.Data.CartonId,
                        WarehouseId = result.Data.WarehouseId,
                        BinLocation = result.Data.BinLocation,
                        Status = result.Data.Status,
                        Items = result.Data.Items?.Select(item => new CartonContentsItem
                        {
                            ItemCode = item.ItemCode,
                            Qty = item.Qty,
                            Uom = item.Uom,
                            BatchNo = item.BatchNo,
                            SerialNo = item.SerialNo
                        }).ToArray() ?? Array.Empty<CartonContentsItem>()
                    };
                    return (true, "Carton contents retrieved successfully", contents);
                }
                else
                {
                    return (false, result?.Error?.Message ?? "Failed to get carton contents", null);
                }
            }
            else
            {
                return (false, $"API error: {response.StatusCode} - {responseContent}", null);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error getting carton contents", ex);
            return (false, $"Error: {ex.Message}", null);
        }
    }

    /// <summary>
    /// Scan item for relocation line
    /// </summary>
    public static async Task<(bool Success, string Message)> ScanItemAsync(
        WmsSettings settings, string sessionId, string barcode, double qty)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiEndpointUrl) || string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            return (false, "API endpoint or key not configured");
        }

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);
            httpClient.DefaultRequestHeaders.Authorization = 
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);

            var baseUrl = settings.ApiEndpointUrl.TrimEnd('/');
            var apiUrl = $"{baseUrl}/api/relocation/session/{sessionId}/line-scan";

            // Use snake_case for request body to match backend API
            var requestBody = new Dictionary<string, object?>
            {
                ["barcode"] = barcode,
                ["qty"] = qty
            };

            var json = JsonSerializer.Serialize(requestBody, RequestJsonOptions);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await httpClient.PostAsync(apiUrl, content);
            var responseContent = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                var result = JsonSerializer.Deserialize<ApiResponse>(responseContent, JsonOptions);
                return (result?.Ok == true, result?.Message ?? "Item scanned successfully");
            }
            else
            {
                return (false, $"API error: {response.StatusCode} - {responseContent}");
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error scanning item", ex);
            return (false, $"Error: {ex.Message}");
        }
    }

    /// <summary>
    /// Edit relocation line
    /// </summary>
    public static async Task<(bool Success, string Message)> EditLineAsync(
        WmsSettings settings, string sessionId, string itemCode, double qtyMoved, string? reason = null)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiEndpointUrl) || string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            return (false, "API endpoint or key not configured");
        }

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);
            httpClient.DefaultRequestHeaders.Authorization = 
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);

            var baseUrl = settings.ApiEndpointUrl.TrimEnd('/');
            var apiUrl = $"{baseUrl}/api/relocation/session/{sessionId}/line";

            // Use snake_case for request body to match backend API
            var requestBody = new Dictionary<string, object?>();
            requestBody["item_code"] = itemCode;
            requestBody["qty_moved"] = qtyMoved;
            if (reason != null)
            {
                requestBody["reason"] = reason;
            }

            var json = JsonSerializer.Serialize(requestBody, RequestJsonOptions);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await httpClient.PutAsync(apiUrl, content);
            var responseContent = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                var result = JsonSerializer.Deserialize<ApiResponse>(responseContent, JsonOptions);
                return (result?.Ok == true, result?.Message ?? "Line updated successfully");
            }
            else
            {
                return (false, $"API error: {response.StatusCode} - {responseContent}");
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error editing line", ex);
            return (false, $"Error: {ex.Message}");
        }
    }

    /// <summary>
    /// Commit full carton move
    /// </summary>
    public static async Task<(bool Success, string Message)> CommitFullMoveAsync(
        WmsSettings settings, string sessionId, string? policy = null, string? toCartonMode = null)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiEndpointUrl) || string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            return (false, "API endpoint or key not configured");
        }

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);
            httpClient.DefaultRequestHeaders.Authorization = 
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);

            var baseUrl = settings.ApiEndpointUrl.TrimEnd('/');
            var apiUrl = $"{baseUrl}/api/relocation/session/{sessionId}/commit-full";

            var requestBody = new Dictionary<string, object?>();
            if (!string.IsNullOrWhiteSpace(policy))
                requestBody["policy"] = policy;
            if (!string.IsNullOrWhiteSpace(toCartonMode))
                requestBody["to_carton_mode"] = toCartonMode;

            var json = JsonSerializer.Serialize(requestBody, RequestJsonOptions);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await httpClient.PostAsync(apiUrl, content);
            var responseContent = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                var result = JsonSerializer.Deserialize<ApiResponse>(responseContent, JsonOptions);
                return (result?.Ok == true, result?.Message ?? "Full carton move committed successfully");
            }
            else
            {
                return (false, $"API error: {response.StatusCode} - {responseContent}");
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error committing full move", ex);
            return (false, $"Error: {ex.Message}");
        }
    }

    /// <summary>
    /// Commit partial move
    /// </summary>
    public static async Task<(bool Success, string Message)> CommitPartialMoveAsync(
        WmsSettings settings, string sessionId, List<RelocationLine>? lines = null)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiEndpointUrl) || string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            return (false, "API endpoint or key not configured");
        }

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);
            httpClient.DefaultRequestHeaders.Authorization = 
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);

            var baseUrl = settings.ApiEndpointUrl.TrimEnd('/');
            var apiUrl = $"{baseUrl}/api/relocation/session/{sessionId}/commit-partial";

            // Use snake_case for request body to match backend API
            var requestBody = new Dictionary<string, object?>();
            if (lines != null && lines.Count > 0)
            {
                requestBody["lines"] = lines.Select(line => new Dictionary<string, object?>
                {
                    ["item_code"] = line.ItemCode,
                    ["qty"] = line.QtyMoved
                }).ToList();
            }

            var json = JsonSerializer.Serialize(requestBody, RequestJsonOptions);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await httpClient.PostAsync(apiUrl, content);
            var responseContent = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                var result = JsonSerializer.Deserialize<ApiResponse>(responseContent, JsonOptions);
                return (result?.Ok == true, result?.Message ?? "Partial move committed successfully");
            }
            else
            {
                return (false, $"API error: {response.StatusCode} - {responseContent}");
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error committing partial move", ex);
            return (false, $"Error: {ex.Message}");
        }
    }

    /// <summary>
    /// Get list of all relocation sessions
    /// </summary>
    public static async Task<(bool Success, string Message, List<RelocationSession>? Sessions)> GetSessionsAsync(
        WmsSettings settings, string? status = null, string? mode = null, string? warehouseId = null, int page = 1, int pageSize = 100)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiEndpointUrl) || string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            return (false, "API endpoint or key not configured", null);
        }

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);
            httpClient.DefaultRequestHeaders.Authorization = 
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);

            var baseUrl = settings.ApiEndpointUrl.TrimEnd('/');
            // Remove trailing /api if present to avoid double /api/api
            if (baseUrl.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
            {
                baseUrl = baseUrl.Substring(0, baseUrl.Length - 4).TrimEnd('/');
            }
            
            var queryParams = new List<string>();
            if (!string.IsNullOrWhiteSpace(status)) queryParams.Add($"status={Uri.EscapeDataString(status)}");
            if (!string.IsNullOrWhiteSpace(mode)) queryParams.Add($"mode={Uri.EscapeDataString(mode)}");
            if (!string.IsNullOrWhiteSpace(warehouseId)) queryParams.Add($"warehouse_id={Uri.EscapeDataString(warehouseId)}");
            queryParams.Add($"page={page}");
            queryParams.Add($"page_size={pageSize}");
            
            var apiUrl = $"{baseUrl}/api/relocation/sessions?{string.Join("&", queryParams)}";

            var response = await httpClient.GetAsync(apiUrl);
            var responseContent = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                var result = JsonSerializer.Deserialize<ApiResponse<List<RelocationSessionData>>>(responseContent, JsonOptions);
                
                if (result?.Ok == true && result.Data != null)
                {
                    var sessions = result.Data.Select(data => new RelocationSession
                    {
                        SessionId = data.SessionId,
                        Mode = data.Mode,
                        Policy = data.Policy,
                        WarehouseId = data.WarehouseId,
                        FromBin = data.FromBin,
                        FromCarton = data.FromCarton,
                        ToBin = data.ToBin,
                        ToCarton = data.ToCarton,
                        Status = data.Status,
                        CreatedBy = data.CreatedBy,
                        DeviceId = data.DeviceId,
                        CreatedAt = data.CreatedAt,
                        UpdatedAt = data.UpdatedAt,
                        Lines = data.Lines?.Select(line => new RelocationLine
                        {
                            ItemCode = line.ItemCode,
                            QtyMoved = line.QtyMoved,
                            Barcode = line.Barcode,
                            CreatedAt = line.CreatedAt
                        }).ToArray() ?? Array.Empty<RelocationLine>()
                    }).ToList();
                    
                    return (true, "Sessions retrieved successfully", sessions);
                }
                else
                {
                    return (false, result?.Error?.Message ?? "Failed to get sessions", null);
                }
            }
            else
            {
                return (false, $"API error: {response.StatusCode} - {responseContent}", null);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error getting sessions", ex);
            return (false, $"Error: {ex.Message}", null);
        }
    }

    /// <summary>
    /// Get relocation session details
    /// </summary>
    public static async Task<(bool Success, string Message, RelocationSession? Session)> GetSessionAsync(
        WmsSettings settings, string sessionId)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiEndpointUrl) || string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            return (false, "API endpoint or key not configured", null);
        }

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);
            httpClient.DefaultRequestHeaders.Authorization = 
                new AuthenticationHeaderValue("Bearer", settings.ApiKey);

            var baseUrl = settings.ApiEndpointUrl.TrimEnd('/');
            if (baseUrl.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
            {
                baseUrl = baseUrl.Substring(0, baseUrl.Length - 4).TrimEnd('/');
            }
            var apiUrl = $"{baseUrl}/api/relocation/session/{sessionId}";

            var response = await httpClient.GetAsync(apiUrl);
            var responseContent = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                var result = JsonSerializer.Deserialize<ApiResponse<RelocationSessionData>>(responseContent, JsonOptions);
                
                if (result?.Ok == true && result.Data != null)
                {
                    var data = result.Data;
                    var session = new RelocationSession
                    {
                        SessionId = data.SessionId,
                        Mode = data.Mode,
                        Policy = data.Policy,
                        WarehouseId = data.WarehouseId,
                        FromBin = data.FromBin,
                        FromCarton = data.FromCarton,
                        ToBin = data.ToBin,
                        ToCarton = data.ToCarton,
                        Status = data.Status,
                        CreatedBy = data.CreatedBy,
                        DeviceId = data.DeviceId,
                        CreatedAt = data.CreatedAt,
                        UpdatedAt = data.UpdatedAt,
                        Lines = data.Lines?.Select(line => new RelocationLine
                        {
                            ItemCode = line.ItemCode,
                            QtyMoved = line.QtyMoved,
                            Barcode = line.Barcode,
                            CreatedAt = line.CreatedAt
                        }).ToArray() ?? Array.Empty<RelocationLine>()
                    };
                    return (true, "Session retrieved successfully", session);
                }
                else
                {
                    return (false, result?.Error?.Message ?? "Failed to get session", null);
                }
            }
            else
            {
                return (false, $"API error: {response.StatusCode} - {responseContent}", null);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error getting session", ex);
            return (false, $"Error: {ex.Message}", null);
        }
    }

    // Helper classes for JSON deserialization
    private class ApiResponse
    {
        public bool Ok { get; set; }
        public string? Message { get; set; }
        public ApiError? Error { get; set; }
    }

    private class ApiResponse<T> : ApiResponse
    {
        public T? Data { get; set; }
    }

    private class ApiError
    {
        public string? Message { get; set; }
    }

    private class RelocationSessionData
    {
        [JsonPropertyName("session_id")]
        public string SessionId { get; set; } = string.Empty;
        public string Mode { get; set; } = string.Empty;
        public string Policy { get; set; } = string.Empty;
        [JsonPropertyName("warehouse_id")]
        public string WarehouseId { get; set; } = string.Empty;
        [JsonPropertyName("from_bin")]
        public string? FromBin { get; set; }
        [JsonPropertyName("from_carton")]
        public string? FromCarton { get; set; }
        [JsonPropertyName("to_bin")]
        public string? ToBin { get; set; }
        [JsonPropertyName("to_carton")]
        public string? ToCarton { get; set; }
        public string Status { get; set; } = "IN_PROGRESS";
        [JsonPropertyName("created_by")]
        public string? CreatedBy { get; set; }
        [JsonPropertyName("device_id")]
        public string? DeviceId { get; set; }
        [JsonPropertyName("created_at")]
        public DateTime? CreatedAt { get; set; }
        [JsonPropertyName("updated_at")]
        public DateTime? UpdatedAt { get; set; }
        public List<RelocationLineData>? Lines { get; set; }
    }

    private class RelocationLineData
    {
        [JsonPropertyName("item_code")]
        public string ItemCode { get; set; } = string.Empty;
        [JsonPropertyName("qty_moved")]
        public double QtyMoved { get; set; }
        public string? Barcode { get; set; }
        [JsonPropertyName("created_at")]
        public DateTime? CreatedAt { get; set; }
    }

    private class CartonContentsData
    {
        public string CartonId { get; set; } = string.Empty;
        public string WarehouseId { get; set; } = string.Empty;
        public string? BinLocation { get; set; }
        public string? Status { get; set; }
        public List<CartonContentsItemData>? Items { get; set; }
    }

    private class CartonContentsItemData
    {
        public string ItemCode { get; set; } = string.Empty;
        public double Qty { get; set; }
        public string? Uom { get; set; }
        public string? BatchNo { get; set; }
        public string? SerialNo { get; set; }
    }
}
