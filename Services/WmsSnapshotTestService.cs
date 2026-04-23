using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Internal test for Push WMS Snapshot (offline_sync.push_wms_snapshot).
/// Builds snapshot from DB, pushes to ERPNext, and reports processed counts and any errors.
/// </summary>
public static class WmsSnapshotTestService
{
    /// <summary>
    /// Run internal test: build snapshot from current settings/DB and push to Offline Sync endpoint.
    /// Returns steps for config, build, push, and parsed response (ledger/carton_stock/cartons processed, errors).
    /// </summary>
    public static async Task<TestResult> TestPushWmsSnapshotAsync(WmsSettings settings)
    {
        var result = new TestResult
        {
            Success = false,
            Steps = new List<TestStep>()
        };

        try
        {
            result.Steps.Add(new TestStep { Name = "Check Offline Sync endpoint", Status = "Running" });
            var push = settings.PushEndpoints?
                .FirstOrDefault(p => p.Enabled && string.Equals(p.EndpointType, PushEndpointTypeNames.OfflineSync, StringComparison.OrdinalIgnoreCase));
            if (push == null || string.IsNullOrWhiteSpace(push.BaseUrl))
            {
                result.Steps[0].Status = "Failed";
                result.Steps[0].Message = "No enabled Push Endpoint with Type 'Offline Sync' in Settings.";
                return result;
            }
            result.Steps[0].Status = "Passed";
            result.Steps[0].Message = $"Endpoint: {push.BaseUrl.Trim()}, API Key: {(string.IsNullOrEmpty(push.ApiKey) ? "missing" : "set")}";

            result.Steps.Add(new TestStep { Name = "Build snapshot from DB", Status = "Running" });
            ErpNextWmsSyncApiService.WmsSnapshotRequestDto snapshot;
            try
            {
                snapshot = await WmsSnapshotDataService.BuildSnapshotAsync(settings);
            }
            catch (Exception ex)
            {
                result.Steps[1].Status = "Failed";
                result.Steps[1].Message = ex.Message;
                return result;
            }
            result.Steps[1].Status = "Passed";
            result.Steps[1].Message = $"event_uuid={snapshot.EventUuid}, txns={snapshot.StockTransactions.Count}, carton_stock={snapshot.CartonStock.Count}, cartons={snapshot.Cartons.Count}";

            result.Steps.Add(new TestStep { Name = "Push to ERPNext", Status = "Running" });
            var (success, error, response) = await ErpNextWmsSyncApiService.PushWmsSnapshotToErpNextWithResponseAsync(settings, snapshot);
            if (!success)
            {
                result.Steps[2].Status = "Failed";
                result.Steps[2].Message = error ?? "Unknown error";
                return result;
            }
            result.Steps[2].Status = "Passed";
            var msg = "HTTP 200 OK.";
            if (response != null)
            {
                msg += $" ok={response.Ok}";
                if (response.Processed != null)
                    msg += $", processed: ledger={response.Processed.Ledger}, carton_stock={response.Processed.CartonStock}, cartons={response.Processed.Cartons}";
                if (response.Errors != null && response.Errors.Count > 0)
                    msg += $", errors={response.Errors.Count}";
            }
            result.Steps[2].Message = msg;

            result.Steps.Add(new TestStep { Name = "Response summary", Status = "Passed" });
            if (response != null)
            {
                var lines = new List<string>();
                if (response.Processed != null)
                {
                    lines.Add($"tabWMS Stock Balance rows (carton_stock): {response.Processed.CartonStock}");
                    lines.Add($"Ledger entries: {response.Processed.Ledger}, Cartons: {response.Processed.Cartons}");
                }
                if (response.Errors != null && response.Errors.Count > 0)
                {
                    result.Steps[3].Status = "Warning";
                    lines.Add($"Errors from ERPNext: {string.Join("; ", response.Errors)}");
                }
                result.Steps[3].Message = string.Join(" ", lines);
            }
            else
                result.Steps[3].Message = "Response body could not be parsed (check ERPNext API format).";

            result.Success = response?.Ok ?? true;
            result.Message = result.Success ? "Push WMS Snapshot test completed." : "Push succeeded but ERPNext reported ok=false or errors.";
        }
        catch (Exception ex)
        {
            result.Steps.Add(new TestStep { Name = "Test error", Status = "Failed", Message = ex.Message });
            result.Message = ex.Message;
        }

        return result;
    }
}
