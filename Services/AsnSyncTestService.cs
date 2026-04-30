using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Automated test for ASN sync and WMS export status push.
/// Runs full ASN pull + local DB update, then tests status push to ERPNext.
/// </summary>
public static class AsnSyncTestService
{
    /// <summary>
    /// Run ASN sync and optional status-push test. Returns detailed steps (settings, pull, push).
    /// If status push fails with ERPNext "update_modified" error, adds a step with fix instructions.
    /// </summary>
    public static async Task<TestResult> RunAsnSyncTestAsync(WmsSettings settings)
    {
        var result = new TestResult
        {
            Success = false,
            Steps = new List<TestStep>()
        };

        try
        {
            // Step 1: Check settings and build endpoint list (same logic as AsnSyncFromErpNextService)
            result.Steps.Add(new TestStep { Name = "Check Settings", Status = "Running" });

            var endpoints = new List<(string Name, string BaseUrl, string ApiKey)>();
            if (settings.SyncEndpoints != null)
            {
                foreach (var ep in settings.SyncEndpoints)
                {
                    if (!ep.Enabled || string.IsNullOrWhiteSpace(ep.BaseUrl) || string.IsNullOrWhiteSpace(ep.ApiKey)) continue;
                    if (string.Equals(ep.SyncType, SyncTypeNames.All, StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(ep.SyncType, SyncTypeNames.Asn, StringComparison.OrdinalIgnoreCase))
                        endpoints.Add((ep.Name, ep.BaseUrl.Trim(), ep.ApiKey));
                }
            }
            if (endpoints.Count == 0)
            {
                var url = !string.IsNullOrWhiteSpace(settings.ErpNextApiUrl) ? settings.ErpNextApiUrl : settings.ApiEndpointUrl;
                var key = !string.IsNullOrWhiteSpace(settings.ErpNextApiKey) ? settings.ErpNextApiKey : settings.ApiKey;
                if (!string.IsNullOrWhiteSpace(url) && !string.IsNullOrWhiteSpace(key))
                    endpoints.Add(("Default", url.Trim(), key));
            }
            if (endpoints.Count == 0)
            {
                result.Steps[0].Status = "Failed";
                result.Steps[0].Message = "No sync endpoints configured. Add an endpoint with Sync type All or ASN in Settings > Sync, or set ERPNext API URL and Key.";
                return result;
            }

            result.Steps[0].Status = "Passed";
            result.Steps[0].Message = $"{endpoints.Count} sync endpoint(s) configured.";

            // Step 2: Ensure ASN tables exist
            result.Steps.Add(new TestStep { Name = "ASN Tables", Status = "Running" });
            await DatabaseService.EnsureTabAsnTablesExistAsync(settings);
            result.Steps[1].Status = "Passed";
            result.Steps[1].Message = "ASN tables ready.";

            // Step 3: Run full ASN sync (pull + local DB)
            result.Steps.Add(new TestStep { Name = "ASN Sync (Pull + DB)", Status = "Running" });
            var syncResult = await AsnSyncFromErpNextService.SyncAsnsFromErpNextAsync(settings);

            if (!syncResult.Success)
            {
                result.Steps[2].Status = "Failed";
                result.Steps[2].Message = syncResult.Errors != null && syncResult.Errors.Count > 0
                    ? string.Join("; ", syncResult.Errors)
                    : "Sync failed.";
                return result;
            }

            result.Steps[2].Status = "Passed";
            result.Steps[2].Message = $"Fetched (processed): {syncResult.TotalFetched}, skipped terminal in WMS: {syncResult.AsnsSkippedLocalTerminal}, inserted: {syncResult.AsnsInserted}, updated: {syncResult.AsnsUpdated}, items: {syncResult.ItemsInserted}, errors: {syncResult.Errors?.Count ?? 0}.";

            if (syncResult.TotalFetched == 0)
            {
                result.Steps.Add(new TestStep
                {
                    Name = "Status Push",
                    Status = "Skipped",
                    Message = "No ASNs to test status push."
                });
                result.Success = true;
                result.Message = "ASN sync test passed (no ASNs to push).";
                return result;
            }

            // Resolve first ASN name for trace and status push
            string? firstAsnName = null;
            string? pushBaseUrl = null;
            string? pushApiKey = null;
            foreach (var (epName, epUrl, epKey) in endpoints)
            {
                var list = await ErpNextWmsSyncApiService.FetchAsnsFromErpNextAsync(settings, epUrl, epKey, epName);
                if (list != null && list.Count > 0)
                {
                    var asn = list[0];
                    firstAsnName = (asn.Title ?? asn.Name ?? "").Trim();
                    pushBaseUrl = epUrl;
                    pushApiKey = epKey;
                    if (!string.IsNullOrEmpty(firstAsnName)) break;
                }
            }

            // Step 4: Putaway → Stock Balance trace (diagnostic for "why putaway stock not updated in ERPNext")
            ErrorLogService.LogInfo("ASN sync test: Running Putaway→Stock Balance trace (see log file for full detail).");
            result.Steps.Add(new TestStep { Name = "Putaway→Stock Balance trace", Status = "Running" });
            try
            {
                var (traceSteps, traceSummary) = await PutawayStockBalanceTraceService.RunTraceAsync(
                    settings,
                    firstAsnName ?? "",
                    pushSnapshotAtEnd: false);
                result.Steps.AddRange(traceSteps);
                result.Steps[3].Status = "Passed";
                result.Steps[3].Message = traceSummary + " Check app Error Log for [Putaway→StockBalance] lines.";
            }
            catch (Exception traceEx)
            {
                ErrorLogService.LogError("ASN sync test: Putaway→Stock Balance trace failed", traceEx);
                result.Steps[3].Status = "Warning";
                result.Steps[3].Message = $"Trace failed: {traceEx.Message}. See Error Log.";
            }

            if (string.IsNullOrEmpty(firstAsnName))
            {
                result.Steps.Add(new TestStep { Name = "Status Push", Status = "Skipped", Message = "Could not get an ASN name to test push." });
                result.Success = true;
                result.Message = "ASN sync test passed; status push not tested.";
                return result;
            }

            // Step 5: Test status push for one ASN
            result.Steps.Add(new TestStep { Name = "Status Push (ERPNext)", Status = "Running" });

            var (pushSuccess, pushError) = await ErpNextWmsSyncApiService.UpdateAsnWmsStatusAsync(
                settings, firstAsnName, "Exported", null, pushBaseUrl, pushApiKey);

            var statusPushStepIndex = result.Steps.Count - 1;

            if (pushSuccess)
            {
                result.Steps[statusPushStepIndex].Status = "Passed";
                result.Steps[statusPushStepIndex].Message = $"Status push OK for {firstAsnName}.";
                result.Success = true;
                result.Message = "ASN sync and status push test passed.";
                return result;
            }

            // Push failed – detect known ERPNext error
            var isUpdateModifiedError = pushError != null &&
                (pushError.Contains("update_modified", StringComparison.OrdinalIgnoreCase) ||
                 pushError.Contains("Document._save()", StringComparison.OrdinalIgnoreCase));

            if (isUpdateModifiedError)
            {
                result.Steps[statusPushStepIndex].Status = "Failed";
                result.Steps[statusPushStepIndex].Message = "ERPNext server error: doc.save(update_modified=True) is not supported in this Frappe version.";
                result.Steps.Add(new TestStep
                {
                    Name = "Fix (ERPNext)",
                    Status = "Warning",
                    Message = "On ERPNext server, edit printechs_wms/api/wms_sync.py line ~222: change doc.save(update_modified=True) to doc.save(). See ERPNext_WMS_EXPORT_STATUS_FIX.md."
                });
            }
            else
            {
                result.Steps[statusPushStepIndex].Status = "Failed";
                result.Steps[statusPushStepIndex].Message = pushError ?? "Unknown error.";
            }

            result.Success = false;
            result.Message = "ASN sync passed; status push to ERPNext failed.";
        }
        catch (Exception ex)
        {
            result.Steps.Add(new TestStep
            {
                Name = "Exception",
                Status = "Failed",
                Message = ex.Message
            });
        }

        return result;
    }
}
