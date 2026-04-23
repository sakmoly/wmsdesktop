using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Diagnostic trace for "why putaway stock balance not updated in ERPNext".
/// Run from Run ASN sync test: logs putaway tasks, tabPutawayLine, tabCartonStock, snapshot payload, and optional push result.
/// </summary>
public static class PutawayStockBalanceTraceService
{
    public const string TracePrefix = "[Putaway→StockBalance]";

    /// <summary>
    /// Run full trace for an ASN: putaway tasks, local DB counts, apply putaway (if completed task found), snapshot build, optional push.
    /// All steps are logged to ErrorLogService so the user can open the log file and trace.
    /// </summary>
    public static async Task<(List<TestStep> Steps, string Summary)> RunTraceAsync(
        WmsSettings settings,
        string asnName,
        bool pushSnapshotAtEnd = false)
    {
        var steps = new List<TestStep>();
        var log = new Action<string>(msg =>
        {
            var line = $"{TracePrefix} {msg}";
            ErrorLogService.LogInfo(line);
        });

        try
        {
            log("========== Putaway → Stock Balance trace start ==========");
            log($"ASN: {asnName}");

            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // ---- Step 1: Putaway tasks for this ASN ----
            steps.Add(new TestStep { Name = "Putaway tasks (local DB)", Status = "Running" });
            var hasAsnCol = await CheckColumnExistsAsync(connection, "tabPutawayTask", "advance_shipping_notice");
            if (!hasAsnCol)
            {
                log("tabPutawayTask has no advance_shipping_notice column.");
                steps[^1].Status = "Skipped";
                steps[^1].Message = "tabPutawayTask.advance_shipping_notice not found.";
                return (steps, "Trace skipped: table structure.");
            }

            var taskTitles = new List<string>();
            var taskStatuses = new Dictionary<string, string>();
            await using (var cmd = new MySqlCommand(
                "SELECT title, status FROM tabPutawayTask WHERE advance_shipping_notice = @asn ORDER BY title",
                connection))
            {
                cmd.Parameters.AddWithValue("@asn", asnName);
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var title = reader.GetString(0);
                    var status = reader.IsDBNull(1) ? "" : reader.GetString(1);
                    taskTitles.Add(title);
                    taskStatuses[title] = status;
                }
            }

            log($"Putaway tasks for {asnName}: {taskTitles.Count}. Titles: {string.Join(", ", taskTitles)}");
            steps[^1].Status = "Passed";
            steps[^1].Message = $"Found {taskTitles.Count} putaway task(s) for {asnName}.";

            var totalLines = 0;
            var cartonStockCountBefore = 0;
            var cartonStockCountAfter = 0;

            if (taskTitles.Count == 0)
            {
                log("No putaway tasks → no putaway lines → ApplyPutawayTaskToLocalStock would have nothing to do.");
                steps.Add(new TestStep { Name = "Putaway lines", Status = "Skipped", Message = "No putaway tasks." });
                steps.Add(new TestStep { Name = "tabCartonStock (before apply)", Status = "Skipped", Message = "N/A" });
                steps.Add(new TestStep { Name = "Apply putaway to local DB", Status = "Skipped", Message = "No completed putaway task." });
                goto BuildSnapshot;
            }

            // ---- Step 2: Putaway lines per task ----
            steps.Add(new TestStep { Name = "Putaway lines", Status = "Running" });
            var lineCounts = new Dictionary<string, int>();
            foreach (var title in taskTitles)
            {
                await using var cmd = new MySqlCommand("SELECT COUNT(*) FROM tabPutawayLine WHERE parent_title = @title", connection);
                cmd.Parameters.AddWithValue("@title", title);
                var c = Convert.ToInt32(await cmd.ExecuteScalarAsync());
                lineCounts[title] = c;
                log($"  Task {title}: {c} lines in tabPutawayLine");
            }
            totalLines = lineCounts.Values.Sum();
            steps[^1].Status = "Passed";
            steps[^1].Message = $"Total putaway lines: {totalLines} across {taskTitles.Count} task(s).";

            // ---- Step 3: tabCartonStock count before apply ----
            steps.Add(new TestStep { Name = "tabCartonStock (before apply)", Status = "Running" });
            if (await CheckTableExistsAsync(connection, "tabCartonStock"))
            {
                await using (var cmd = new MySqlCommand("SELECT COUNT(*) FROM tabCartonStock WHERE qty > 0", connection))
                    cartonStockCountBefore = Convert.ToInt32(await cmd.ExecuteScalarAsync());
                log($"tabCartonStock (qty>0) before apply: {cartonStockCountBefore}");
            }
            else
                log("tabCartonStock table does not exist.");
            steps[^1].Status = "Passed";
            steps[^1].Message = $"tabCartonStock rows (qty>0): {cartonStockCountBefore}.";

            // ---- Step 4: Apply putaway for first *Completed* task ----
            steps.Add(new TestStep { Name = "Apply putaway to local DB", Status = "Running" });
            string? appliedTask = null;
            var completedTasks = taskTitles.Where(t => string.Equals(taskStatuses.GetValueOrDefault(t, ""), "Completed", StringComparison.OrdinalIgnoreCase)).ToList();
            if (completedTasks.Count > 0)
            {
                var warehouseCode = (settings.DefaultReceivingWarehouseForPr ?? settings.DefaultPickingWarehouse ?? "WH-MAIN").Trim();
                var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
                var matched = warehouses.FirstOrDefault(w =>
                    string.Equals(w.Code, warehouseCode, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(w.Name, warehouseCode, StringComparison.OrdinalIgnoreCase));
                var warehouse = !string.IsNullOrEmpty(matched?.Code) ? matched.Code : warehouseCode;
                if (string.IsNullOrEmpty(warehouse)) warehouse = "WH-MAIN";

                appliedTask = completedTasks[0];
                log($"Applying putaway task '{appliedTask}' to local DB (warehouse: {warehouse})...");
                var applyOk = await StockLedgerService.ApplyPutawayTaskToLocalStockAsync(settings, appliedTask, warehouse);
                log($"ApplyPutawayTaskToLocalStockAsync result: {applyOk}");
                steps[^1].Status = applyOk ? "Passed" : "Failed";
                steps[^1].Message = applyOk ? $"Applied task '{appliedTask}'." : "Apply returned false (check Error Log).";
            }
            else
            {
                log("No completed putaway task; skipping apply.");
                steps[^1].Status = "Skipped";
                steps[^1].Message = "No putaway task with status Completed.";
            }

            // ---- Step 5: tabCartonStock count after apply ----
            cartonStockCountAfter = cartonStockCountBefore;
            if (await CheckTableExistsAsync(connection, "tabCartonStock"))
            {
                await using (var cmd = new MySqlCommand("SELECT COUNT(*) FROM tabCartonStock WHERE qty > 0", connection))
                    cartonStockCountAfter = Convert.ToInt32(await cmd.ExecuteScalarAsync());
                log($"tabCartonStock (qty>0) after apply: {cartonStockCountAfter} (before: {cartonStockCountBefore})");
            }

            BuildSnapshot:
            // ---- Step 6: Build snapshot and log payload ----
            steps.Add(new TestStep { Name = "Snapshot payload", Status = "Running" });
            var snapshot = await WmsSnapshotDataService.BuildSnapshotAsync(settings);
            var cartonStockInPayload = snapshot?.CartonStock?.Count ?? 0;
            var txnsInPayload = snapshot?.StockTransactions?.Count ?? 0;
            log($"Snapshot built: carton_stock={cartonStockInPayload}, stock_transactions={txnsInPayload}");
            if (cartonStockInPayload > 0 && snapshot?.CartonStock != null)
            {
                foreach (var row in snapshot.CartonStock)
                    log($"  carton_stock: item={row.ItemCode}, bin={row.BinLocation ?? "(null)"}, carton={row.CartonId ?? "(null)"}, qty={row.Qty}");
            }
            steps[^1].Status = "Passed";
            steps[^1].Message = $"Payload: {cartonStockInPayload} stock rows, {txnsInPayload} transactions. " +
                (cartonStockInPayload == 0 ? "No stock rows → ERPNext WMS Stock Balance will not update from this snapshot." : "");

            if (pushSnapshotAtEnd && snapshot != null)
            {
                steps.Add(new TestStep { Name = "Push snapshot to ERPNext", Status = "Running" });
                var (pushSuccess, pushError, pushResponse) = await ErpNextWmsSyncApiService.PushWmsSnapshotToErpNextWithResponseAsync(settings, snapshot);
                log($"Push result: success={pushSuccess}, error={pushError ?? "none"}");
                if (pushResponse?.Processed != null)
                    log($"ERPNext processed: stock={pushResponse.Processed.CartonStock}, ledger={pushResponse.Processed.Ledger}, cartons={pushResponse.Processed.Cartons}");
                if (pushResponse?.Errors != null && pushResponse.Errors.Count > 0)
                    foreach (var err in pushResponse.Errors) log($"  Error: {err}");
                steps[^1].Status = pushSuccess ? "Passed" : "Failed";
                steps[^1].Message = pushSuccess
                    ? $"Pushed. Processed: {pushResponse?.Processed?.CartonStock ?? 0} stock, {pushResponse?.Processed?.Ledger ?? 0} ledger."
                    : (pushError ?? "Unknown error");
            }

            log("========== Putaway → Stock Balance trace end ==========");

            var summary = $"Putaway tasks: {taskTitles.Count}, lines: {totalLines}, tabCartonStock before: {cartonStockCountBefore}, after: {cartonStockCountAfter}, snapshot stock rows: {snapshot?.CartonStock?.Count ?? 0}.";
            return (steps, summary);
        }
        catch (Exception ex)
        {
            log($"Trace exception: {ex.Message}");
            ErrorLogService.LogError($"{TracePrefix} Trace failed", ex);
            steps.Add(new TestStep { Name = "Trace", Status = "Failed", Message = ex.Message });
            return (steps, $"Trace failed: {ex.Message}");
        }
    }

    private static async Task<bool> CheckTableExistsAsync(MySqlConnection connection, string tableName)
    {
        try
        {
            await using var cmd = new MySqlCommand(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(@t)",
                connection);
            cmd.Parameters.AddWithValue("@t", tableName);
            return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
        }
        catch { return false; }
    }

    private static async Task<bool> CheckColumnExistsAsync(MySqlConnection connection, string tableName, string columnName)
    {
        try
        {
            await using var cmd = new MySqlCommand(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(@t) AND LOWER(COLUMN_NAME) = LOWER(@c)",
                connection);
            cmd.Parameters.AddWithValue("@t", tableName);
            cmd.Parameters.AddWithValue("@c", columnName);
            return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
        }
        catch { return false; }
    }
}
