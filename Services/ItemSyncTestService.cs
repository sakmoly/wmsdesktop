using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Test service to diagnose item sync issues
/// </summary>
public static class ItemSyncTestService
{
    /// <summary>
    /// Test ERPNext API connection and response parsing
    /// </summary>
    public static async Task<TestResult> TestErpNextConnectionAsync(WmsSettings settings)
    {
        var result = new TestResult
        {
            Success = false,
            Steps = new List<TestStep>()
        };

        try
        {
            // Step 1: Check settings
            result.Steps.Add(new TestStep
            {
                Name = "Check Settings",
                Status = "Running"
            });

            var erpNextUrl = !string.IsNullOrWhiteSpace(settings.ErpNextApiUrl) 
                ? settings.ErpNextApiUrl 
                : settings.ApiEndpointUrl;

            if (string.IsNullOrWhiteSpace(erpNextUrl))
            {
                result.Steps[0].Status = "Failed";
                result.Steps[0].Message = "ERPNext API URL is not configured";
                return result;
            }

            // ERPNext item API uses ErpNextApiKey first, then falls back to ApiKey (same as ErpNextItemApiService)
            var apiKeyForErp = !string.IsNullOrWhiteSpace(settings.ErpNextApiKey) ? settings.ErpNextApiKey : settings.ApiKey;
            if (string.IsNullOrWhiteSpace(apiKeyForErp))
            {
                result.Steps[0].Status = "Failed";
                result.Steps[0].Message = "Neither ErpNextApiKey nor ApiKey is configured (ERPNext token required for item sync)";
                return result;
            }

            result.Steps[0].Status = "Passed";
            var keyPreview = apiKeyForErp.Length > 10 ? apiKeyForErp.Substring(0, 10) + "..." : apiKeyForErp;
            result.Steps[0].Message = $"ERPNext URL: {erpNextUrl}, API Key: {keyPreview} (using {(string.IsNullOrWhiteSpace(settings.ErpNextApiKey) ? "ApiKey" : "ErpNextApiKey")})";

            // Step 2: Test API call
            result.Steps.Add(new TestStep
            {
                Name = "Test API Call",
                Status = "Running"
            });

            var fetchResult = await ErpNextItemApiService.FetchItemsFromErpNextAsync(
                settings,
                limit: 10,
                offset: 0,
                maxModified: null
            );

            if (fetchResult == null)
            {
                result.Steps[1].Status = "Failed";
                var detail = ErpNextItemApiService.LastFetchError;
                result.Steps[1].Message = string.IsNullOrWhiteSpace(detail)
                    ? "API call returned null. Check error logs for details."
                    : detail;
                return result;
            }

            var items = fetchResult.Items;
            result.Steps[1].Status = "Passed";
            result.Steps[1].Message = $"API call successful. Received {items.Count} item(s)";

            // Step 3: Validate items
            result.Steps.Add(new TestStep
            {
                Name = "Validate Items",
                Status = "Running"
            });

            if (items.Count == 0)
            {
                result.Steps[2].Status = "Warning";
                result.Steps[2].Message = "No items returned. This might be correct if filter doesn't match any items.";
                result.Success = true; // Still a success, just no items
                return result;
            }

            var validationErrors = new List<string>();
            foreach (var item in items)
            {
                if (string.IsNullOrWhiteSpace(item.ItemCode))
                {
                    validationErrors.Add("Item with empty item_code found");
                }
                if (string.IsNullOrWhiteSpace(item.ItemName))
                {
                    validationErrors.Add($"Item {item.ItemCode} has empty item_name");
                }
            }

            if (validationErrors.Count > 0)
            {
                result.Steps[2].Status = "Warning";
                result.Steps[2].Message = $"Validation issues: {string.Join(", ", validationErrors)}";
            }
            else
            {
                result.Steps[2].Status = "Passed";
                result.Steps[2].Message = $"All {items.Count} item(s) are valid";
            }

            // Step 4: Test database connection
            result.Steps.Add(new TestStep
            {
                Name = "Test Database Connection",
                Status = "Running"
            });

            try
            {
                var connectionString = DatabaseService.BuildConnectionString(settings);
                await using var connection = new MySql.Data.MySqlClient.MySqlConnection(connectionString);
                await connection.OpenAsync();
                result.Steps[3].Status = "Passed";
                result.Steps[3].Message = "Database connection successful";
            }
            catch (Exception dbEx)
            {
                result.Steps[3].Status = "Failed";
                result.Steps[3].Message = $"Database connection failed: {dbEx.Message}";
                return result;
            }

            // Step 5: Test sync process
            result.Steps.Add(new TestStep
            {
                Name = "Test Sync Process",
                Status = "Running"
            });

            var syncResult = await ItemSyncService.SyncItemsFromErpNextAsync(settings, incrementalSync: false);

            if (!syncResult.Success)
            {
                result.Steps[4].Status = "Failed";
                result.Steps[4].Message = $"Sync failed: {string.Join(", ", syncResult.Errors)}";
                return result;
            }

            result.Steps[4].Status = "Passed";
            result.Steps[4].Message = $"Sync successful: {syncResult.Inserted} inserted, {syncResult.Updated} updated, {syncResult.TotalFetched} total fetched";

            result.Success = true;
            result.Message = $"All tests passed! Synced {syncResult.TotalFetched} item(s)";
        }
        catch (Exception ex)
        {
            result.Steps.Add(new TestStep
            {
                Name = "Exception",
                Status = "Failed",
                Message = $"Unexpected error: {ex.Message}"
            });
        }

        return result;
    }
}

/// <summary>
/// Test result with detailed steps
/// </summary>
public class TestResult
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public List<TestStep> Steps { get; set; } = new();
}

/// <summary>
/// Individual test step
/// </summary>
public class TestStep
{
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty; // Running, Passed, Failed, Warning
    public string Message { get; set; } = string.Empty;
}
