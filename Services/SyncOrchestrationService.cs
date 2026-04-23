using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Result of running full Pull + Push (Push & Pull).
/// </summary>
public class PushPullResult
{
    public bool Success { get; set; }
    public List<string> Messages { get; set; } = new();
    public string Summary => string.Join("\n\n", Messages);
}

/// <summary>
/// Runs the full "Push & Pull" sequence: pull ASNs, TOs, MR, Transfer In from ERPNext, then push WMS snapshot and end transit.
/// </summary>
public static class SyncOrchestrationService
{
    public static async Task<PushPullResult> RunPushAndPullAsync(WmsSettings settings)
    {
        var result = new PushPullResult { Success = true };
        if (settings == null)
        {
            result.Success = false;
            result.Messages.Add("Settings not found.");
            return result;
        }
        if (!settings.DatabaseExists || !settings.TablesExist)
        {
            result.Success = false;
            result.Messages.Add("Database not initialized. Please create database and tables first (Settings).");
            return result;
        }

        try
        {
            // —— Pull from ERPNext ——
            var asnResult = await AsnSyncFromErpNextService.SyncAsnsFromErpNextAsync(settings);
            result.Messages.Add($"ASNs: Fetched {asnResult.TotalFetched}, inserted {asnResult.AsnsInserted}, updated {asnResult.AsnsUpdated}" + (asnResult.Success ? "" : " (with errors)"));

            var toResult = await TransferOrderSyncFromErpNextService.SyncTransferOrdersFromErpNextAsync(settings);
            result.Messages.Add($"Transfer Orders: Fetched {toResult.TotalFetched}, inserted {toResult.TosInserted}, updated {toResult.TosUpdated}" + (toResult.Success ? "" : " (with errors)"));

            var mrResult = await MaterialRequestSyncFromErpNextService.SyncMaterialRequestsFromErpNextAsync(settings);
            result.Messages.Add($"Material Requests: Fetched {mrResult.TotalFetched}, inserted {mrResult.MrsInserted}, updated {mrResult.MrsUpdated}" + (mrResult.Success ? "" : " (with errors)"));

            var tiResult = await TransferInSyncFromErpNextService.SyncTransferInFromErpNextAsync(settings);
            result.Messages.Add($"Transfer In: Fetched {tiResult.TotalFetched}, inserted {tiResult.EntriesInserted}, updated {tiResult.EntriesUpdated}" + (tiResult.Success ? "" : " (with errors)"));

            if (!asnResult.Success || !toResult.Success || !mrResult.Success || !tiResult.Success)
                result.Success = false;

            // —— Push to ERPNext: Push WMS Snapshot API (always), then End Transit, then Rebuild Stock Balance ——
            var snapshot = await WmsSnapshotDataService.BuildSnapshotAsync(settings);
            var sentTxns = snapshot?.StockTransactions?.Count ?? 0;
            var sentCartonStock = snapshot?.CartonStock?.Count ?? 0;
            var sentCartons = snapshot?.Cartons?.Count ?? 0;

            var (pushSuccess, pushError, response) = await ErpNextWmsSyncApiService.PushWmsSnapshotToErpNextWithResponseAsync(settings, snapshot!);
            if (!pushSuccess)
            {
                result.Success = false;
                result.Messages.Add("Push WMS Snapshot failed: " + (pushError ?? "Unknown error"));
                return result;
            }

            result.Messages.Add($"Push WMS Snapshot: Sent {sentCartonStock} stock rows, {sentTxns} transactions, {sentCartons} cartons to ERPNext.");
            if (response?.Processed != null)
                result.Messages.Add($"ERPNext processed: {response.Processed.CartonStock} stock, {response.Processed.Ledger} ledger, {response.Processed.Cartons} cartons.");

            // End transit (end_transit_create_receipt API): when Putaway Source Type = TransferIn and status = Completed
            await DatabaseService.EnsurePutawayTaskReceiptStockEntryNoColumnAsync(settings);
            var transferIns = await TransferInDataService.GetTransferInsAsync(settings);
            var completedPutawayTitles = await PutawayTaskDataService.GetTransferInTitlesWithCompletedPutawayAsync(settings);
            var completedSet = new HashSet<string>(completedPutawayTitles, StringComparer.OrdinalIgnoreCase);
            var toEndTransit = transferIns.Where(ti =>
                (string.Equals(ti.Status, "Submitted", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(ti.Status, "Received", StringComparison.OrdinalIgnoreCase)) &&
                completedSet.Contains(ti.Title)).ToList();

            if (toEndTransit.Count > 0)
            {
                var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
                var defaultToWarehouseName = WarehouseDataService.NormalizeWarehouseNameForErpNext(
                    WarehouseDataService.ResolveToName(settings.DefaultReceivingWarehouseForPr ?? "WH-MAIN", warehouses));
                if (string.IsNullOrWhiteSpace(defaultToWarehouseName)) defaultToWarehouseName = "Main Warehouse - MAATC";
                int endTransitOk = 0, endTransitFail = 0;
                foreach (var ti in toEndTransit)
                {
                    var toWarehouseName = WarehouseDataService.ResolveToName(ti.ToWarehouse, warehouses);
                    if (string.IsNullOrWhiteSpace(toWarehouseName)) toWarehouseName = defaultToWarehouseName;
                    else toWarehouseName = WarehouseDataService.NormalizeWarehouseNameForErpNext(toWarehouseName);
                    var (etSuccess, etError, receiptStockEntryNo) = await ErpNextWmsSyncApiService.EndTransitCreateReceiptAsync(settings, ti.Title, toWarehouseName, "Received at warehouse");
                    if (etSuccess)
                    {
                        endTransitOk++;
                        if (!string.IsNullOrWhiteSpace(receiptStockEntryNo))
                            await PutawayTaskDataService.UpdateReceiptStockEntryNoForTransferInAsync(settings, ti.Title, receiptStockEntryNo);
                    }
                    else
                    {
                        endTransitFail++;
                        if (!string.IsNullOrEmpty(etError))
                            ErrorLogService.LogError($"End transit for {ti.Title}: {etError}", null);
                    }
                }
                result.Messages.Add($"End transit: {endTransitOk} succeeded, {endTransitFail} failed (of {toEndTransit.Count} transfer in(s) with completed putaway).");
            }

            // Rebuild WMS stock balance in ERPNext so balance quantity stays correct (always run; failure is reported but does not fail Push & Pull)
            var (rebuildSuccess, rebuildError) = await ErpNextWmsSyncApiService.RebuildWmsStockBalanceAsync(settings);
            if (rebuildSuccess)
                result.Messages.Add("Rebuild WMS stock balance: completed.");
            else
                result.Messages.Add("Rebuild WMS stock balance: " + (rebuildError ?? "failed"));

            // Push completed relocation (bin transfer) sessions to ERPNext (upsert_relocation_session)
            var (reloSuccess, _, reloSessions) = await RelocationApiService.GetSessionsAsync(settings, status: "COMPLETED");
            if (reloSuccess && reloSessions != null && reloSessions.Count > 0)
            {
                int reloOk = 0, reloFail = 0;
                foreach (var session in reloSessions)
                {
                    var (pushOk, pushErr, transactionNo) = await ErpNextWmsSyncApiService.PushRelocationSessionToErpNextAsync(settings, session);
                    if (pushOk)
                    {
                        reloOk++;
                        if (!string.IsNullOrWhiteSpace(transactionNo))
                            await RelocationErpPushDataService.SaveAsync(settings, session.SessionId, transactionNo, null);
                    }
                    else
                    {
                        reloFail++;
                        if (!string.IsNullOrEmpty(pushErr))
                            ErrorLogService.LogError($"Push relocation {session.SessionId}: {pushErr}", null);
                    }
                }
                result.Messages.Add($"Relocation (Bin Transfer): pushed {reloOk} of {reloSessions.Count} completed session(s) to ERPNext" + (reloFail > 0 ? $", {reloFail} failed" : "") + ".");
            }
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Messages.Add("Error: " + ex.Message);
            ErrorLogService.LogError("SyncOrchestrationService: Push & Pull failed", ex);
        }

        return result;
    }
}
