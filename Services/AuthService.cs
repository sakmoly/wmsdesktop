using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Service for handling user authentication via API
/// </summary>
public static class AuthService
{
    /// <summary>
    /// Authenticate user with username and password
    /// </summary>
    /// <param name="settings">WMS settings containing API endpoint</param>
    /// <param name="userCode">User code/username</param>
    /// <param name="password">User password</param>
    /// <returns>Login result with token if successful</returns>
    public static async Task<LoginResult> LoginAsync(WmsSettings settings, string userCode, string password)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(settings.ApiEndpointUrl))
            {
                return new LoginResult
                {
                    Success = false,
                    ErrorMessage = "API endpoint URL is not configured. Please check settings."
                };
            }

            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);

            var baseUrl = settings.ApiEndpointUrl.TrimEnd('/');
            
            // Build login URL
            string loginUrl;
            if (baseUrl.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
            {
                loginUrl = $"{baseUrl}/auth/login";
            }
            else
            {
                loginUrl = $"{baseUrl}/api/auth/login";
            }

            ErrorLogService.LogInfo($"AuthService: Attempting login to {loginUrl} for user {userCode}");

            var loginPayload = new
            {
                user_code = userCode,
                password = password
            };

            var jsonContent = new StringContent(
                JsonSerializer.Serialize(loginPayload),
                Encoding.UTF8,
                "application/json");

            var response = await httpClient.PostAsync(loginUrl, jsonContent);
            var responseContent = await response.Content.ReadAsStringAsync();

            ErrorLogService.LogInfo($"AuthService: Login response status: {response.StatusCode}");

            if (!response.IsSuccessStatusCode)
            {
                ErrorLogService.LogError($"AuthService: Login failed with status {response.StatusCode}: {responseContent}");
                
                // Try to parse error message from response
                try
                {
                    var errorResponse = JsonSerializer.Deserialize<ApiErrorResponse>(responseContent);
                    return new LoginResult
                    {
                        Success = false,
                        ErrorMessage = errorResponse?.Error?.Message ?? errorResponse?.Message ?? $"Login failed: {response.StatusCode}"
                    };
                }
                catch
                {
                    return new LoginResult
                    {
                        Success = false,
                        ErrorMessage = $"Login failed: {response.StatusCode}"
                    };
                }
            }

            // Parse successful response
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var loginResponse = JsonSerializer.Deserialize<LoginApiResponse>(responseContent, options);

            if (loginResponse == null)
            {
                return new LoginResult
                {
                    Success = false,
                    ErrorMessage = "Invalid response from server"
                };
            }

            // Extract token - could be in different places depending on API response structure
            // API returns: { ok: true, data: { access_token: "...", user: {...} } }
            var token = loginResponse.Data?.AccessToken  // data.access_token (primary)
                ?? loginResponse.Data?.Token             // data.token
                ?? loginResponse.Token                   // token
                ?? loginResponse.AccessToken;            // access_token

            if (string.IsNullOrWhiteSpace(token))
            {
                ErrorLogService.LogError($"AuthService: Login succeeded but no token in response: {responseContent}");
                return new LoginResult
                {
                    Success = false,
                    ErrorMessage = "Login succeeded but no token received"
                };
            }

            ErrorLogService.LogInfo($"AuthService: Login successful for user {userCode}");

            // Extract user info - API returns: data.user.user_code, data.user.name
            var resultUserCode = loginResponse.Data?.User?.UserCode 
                ?? loginResponse.Data?.UserCode 
                ?? loginResponse.UserCode 
                ?? userCode;
            
            var resultUserName = loginResponse.Data?.User?.Name 
                ?? loginResponse.Data?.UserName 
                ?? loginResponse.UserName 
                ?? userCode;
            
            var resultRole = loginResponse.Data?.User?.Role 
                ?? loginResponse.Data?.Role 
                ?? loginResponse.Role;

            return new LoginResult
            {
                Success = true,
                Token = token,
                UserCode = resultUserCode,
                UserName = resultUserName,
                Role = resultRole
            };
        }
        catch (HttpRequestException ex)
        {
            ErrorLogService.LogError($"AuthService: Network error during login: {ex.Message}", ex);
            return new LoginResult
            {
                Success = false,
                ErrorMessage = $"Cannot connect to server: {ex.Message}"
            };
        }
        catch (TaskCanceledException)
        {
            ErrorLogService.LogError("AuthService: Login request timed out");
            return new LoginResult
            {
                Success = false,
                ErrorMessage = "Connection timed out. Please check your network."
            };
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"AuthService: Unexpected error during login: {ex.Message}", ex);
            return new LoginResult
            {
                Success = false,
                ErrorMessage = $"Unexpected error: {ex.Message}"
            };
        }
    }

    /// <summary>
    /// Validate if current token is still valid
    /// </summary>
    public static async Task<bool> ValidateTokenAsync(WmsSettings settings)
    {
        if (string.IsNullOrWhiteSpace(settings.ApiKey))
            return false;

        try
        {
            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(10);
            httpClient.DefaultRequestHeaders.Authorization = 
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", settings.ApiKey);

            var baseUrl = settings.ApiEndpointUrl.TrimEnd('/');
            string validateUrl;
            if (baseUrl.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
            {
                validateUrl = $"{baseUrl}/auth/validate";
            }
            else
            {
                validateUrl = $"{baseUrl}/api/auth/validate";
            }

            var response = await httpClient.GetAsync(validateUrl);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }
}

/// <summary>
/// Result of a login attempt
/// </summary>
public sealed class LoginResult
{
    public bool Success { get; init; }
    public string? Token { get; init; }
    public string? UserCode { get; init; }
    public string? UserName { get; init; }
    public string? Role { get; init; }
    public string? ErrorMessage { get; init; }
}

/// <summary>
/// API login response structure
/// </summary>
internal sealed class LoginApiResponse
{
    [JsonPropertyName("ok")]
    public bool Ok { get; init; }
    
    [JsonPropertyName("token")]
    public string? Token { get; init; }
    
    [JsonPropertyName("access_token")]
    public string? AccessToken { get; init; }
    
    [JsonPropertyName("user_code")]
    public string? UserCode { get; init; }
    
    [JsonPropertyName("user_name")]
    public string? UserName { get; init; }
    
    [JsonPropertyName("role")]
    public string? Role { get; init; }
    
    [JsonPropertyName("data")]
    public LoginDataResponse? Data { get; init; }
}

internal sealed class LoginDataResponse
{
    [JsonPropertyName("token")]
    public string? Token { get; init; }
    
    [JsonPropertyName("access_token")]
    public string? AccessToken { get; init; }
    
    [JsonPropertyName("user_code")]
    public string? UserCode { get; init; }
    
    [JsonPropertyName("user_name")]
    public string? UserName { get; init; }
    
    [JsonPropertyName("role")]
    public string? Role { get; init; }
    
    [JsonPropertyName("user")]
    public LoginUserResponse? User { get; init; }
}

internal sealed class LoginUserResponse
{
    [JsonPropertyName("user_code")]
    public string? UserCode { get; init; }
    
    [JsonPropertyName("name")]
    public string? Name { get; init; }
    
    [JsonPropertyName("role")]
    public string? Role { get; init; }
}

internal sealed class ApiErrorResponse
{
    [JsonPropertyName("error")]
    public ApiErrorDetail? Error { get; init; }
    
    [JsonPropertyName("message")]
    public string? Message { get; init; }
}

internal sealed class ApiErrorDetail
{
    [JsonPropertyName("message")]
    public string? Message { get; init; }
}
