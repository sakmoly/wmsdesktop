using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Builds WMS snapshot payload for push_wms_snapshot API (Offline Sync).
/// Reads from tabStockTransaction, tabCartonStock, tabCarton when available.
/// </summary>
public static class WmsSnapshotDataService
{
    private const string SourceSystem = "WMS_DESKTOP";

    /// <summary>
    /// Build snapshot DTO for push_wms_snapshot. Uses company and warehouse from settings;
    /// generates event_uuid; fills stock_transactions, carton_stock, cartons from DB when tables exist.
    /// When stockTransactionReferenceDoc is set (e.g. cycle count task title), only that task's transactions are included to avoid multiple ledger entries for the same push.
    /// </summary>
    public static async Task<ErpNextWmsSyncApiService.WmsSnapshotRequestDto> BuildSnapshotAsync(WmsSettings settings, string? stockTransactionReferenceDoc = null)
    {
        var eventUuid = $"SYNC-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..4].ToUpperInvariant()}";
        var company = (settings.Company ?? "").Trim();
        if (string.IsNullOrEmpty(company))
        {
            var fromErp = await ErpNextWmsSyncApiService.GetDefaultCompanyFromErpNextAsync(settings);
            company = (fromErp ?? "").Trim();
        }
        if (string.IsNullOrEmpty(company))
            company = "Mohammed Abdullah Almousa Trading Company";

        var warehouseCode = (settings.DefaultReceivingWarehouseForPr ?? settings.DefaultPickingWarehouse ?? "WH-MAIN").Trim();
        var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
        var matched = warehouses.FirstOrDefault(w =>
            string.Equals(w.Code, warehouseCode, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(w.Name, warehouseCode, StringComparison.OrdinalIgnoreCase));
        var warehouse = matched?.Name ?? warehouseCode;
        if (string.IsNullOrEmpty(warehouse))
            warehouse = "Main Warehouse - MAATC";

        var snapshot = new ErpNextWmsSyncApiService.WmsSnapshotRequestDto
        {
            EventUuid = eventUuid,
            Company = company,
            SourceSystem = SourceSystem,
            Warehouse = warehouse,
            StockTransactions = new List<ErpNextWmsSyncApiService.WmsSnapshotStockTransactionDto>(),
            CartonStock = new List<ErpNextWmsSyncApiService.WmsSnapshotCartonStockDto>(),
            Cartons = new List<ErpNextWmsSyncApiService.WmsSnapshotCartonDto>()
        };

        var connectionString = DatabaseService.BuildConnectionString(settings);
        await using var connection = new MySqlConnection(connectionString);
        await connection.OpenAsync();

        if (await CheckTableExistsAsync(connection, "tabStockTransaction"))
        {
            var txns = await ReadStockTransactionsAsync(connection, stockTransactionReferenceDoc);
            snapshot.StockTransactions = txns;
        }

        if (await CheckTableExistsAsync(connection, "tabCartonStock"))
        {
            var hasReservedQty = await CheckColumnExistsAsync(connection, "tabCartonStock", "reserved_qty");
            var hasLastMovedOn = await CheckColumnExistsAsync(connection, "tabCartonStock", "last_moved_on");
            var stock = await ReadCartonStockAsync(connection, hasReservedQty, hasLastMovedOn);
            snapshot.CartonStock = stock;
            // ERPNext Warehouse is a Link: it expects the doc name (e.g. "Main Warehouse - MAATC"), not the code (WH-MAIN). Overwrite so every row uses the resolved name.
            foreach (var row in snapshot.CartonStock)
                row.Warehouse = warehouse;
        }

        if (await CheckTableExistsAsync(connection, "tabCarton"))
        {
            var cartons = await ReadCartonsAsync(connection);
            snapshot.Cartons = cartons;
        }

        return snapshot;
    }

    /// <summary>
    /// Build snapshot and push to ERPNext Offline Sync endpoint. Returns (success, error message).
    /// When stockTransactionReferenceDoc is set (e.g. cycle count task title), only that task's transactions are sent to avoid multiple ledger entries.
    /// </summary>
    public static async Task<(bool Success, string? Error)> BuildAndPushSnapshotAsync(WmsSettings settings, string? stockTransactionReferenceDoc = null)
    {
        var snapshot = await BuildSnapshotAsync(settings, stockTransactionReferenceDoc);
        return await ErpNextWmsSyncApiService.PushWmsSnapshotToErpNextAsync(settings, snapshot);
    }

    /// <summary>
    /// Build snapshot and push to ERPNext, returning the parsed response (processed counts, errors) for troubleshooting.
    /// When stockTransactionReferenceDoc is set (e.g. cycle count task title), only that task's transactions are sent to avoid multiple ledger entries.
    /// </summary>
    public static async Task<(bool Success, string? Error, ErpNextWmsSyncApiService.WmsSnapshotPushResponseDto? Response)> BuildAndPushSnapshotWithResponseAsync(WmsSettings settings, string? stockTransactionReferenceDoc = null)
    {
        var snapshot = await BuildSnapshotAsync(settings, stockTransactionReferenceDoc);
        return await ErpNextWmsSyncApiService.PushWmsSnapshotToErpNextWithResponseAsync(settings, snapshot);
    }

    /// <summary>
    /// Fire-and-forget: push WMS snapshot to ERPNext after a stock-changing transaction.
    /// Call this after Receiving/Putaway/Picking/Cycle Count/Transfer In/MR complete, or after Dispatch.
    /// Logs success or error; does not throw. Does not block the caller.
    /// </summary>
    public static void TryPushSnapshotAfterTransaction(WmsSettings settings)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                var (success, error) = await BuildAndPushSnapshotAsync(settings);
                if (success)
                    ErrorLogService.LogInfo("WmsSnapshotDataService: Snapshot pushed to ERPNext after transaction.");
                else
                    ErrorLogService.LogInfo($"WmsSnapshotDataService: Snapshot push after transaction failed: {error}");
            }
            catch (Exception ex)
            {
                ErrorLogService.LogError("WmsSnapshotDataService: Snapshot push after transaction error", ex);
            }
        });
    }

    private static async Task<List<ErpNextWmsSyncApiService.WmsSnapshotStockTransactionDto>> ReadStockTransactionsAsync(MySqlConnection connection, string? referenceDocFilter = null)
    {
        var list = new List<ErpNextWmsSyncApiService.WmsSnapshotStockTransactionDto>();
        var hasCartonId = await CheckColumnExistsAsync(connection, "tabStockTransaction", "carton_id");
        var hasRefDoc = await CheckColumnExistsAsync(connection, "tabStockTransaction", "reference_doc");

        var whereRef = hasRefDoc && !string.IsNullOrWhiteSpace(referenceDocFilter)
            ? " WHERE reference_doc = @referenceDoc"
            : "";
        var sql = $@"
            SELECT id, transaction_date, transaction_type, item_code, bin_location, target_bin,
                   qty_change, qty_after, reference_doc
                   {(hasCartonId ? ", carton_id" : ", NULL as carton_id")}
            FROM tabStockTransaction
            {whereRef}
            ORDER BY id DESC
            LIMIT {(hasRefDoc && !string.IsNullOrWhiteSpace(referenceDocFilter) ? "500" : "5000")}";

        await using var cmd = new MySqlCommand(sql, connection);
        if (hasRefDoc && !string.IsNullOrWhiteSpace(referenceDocFilter))
            cmd.Parameters.AddWithValue("@referenceDoc", referenceDocFilter.Trim());
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new ErpNextWmsSyncApiService.WmsSnapshotStockTransactionDto
            {
                Id = reader.GetInt64(0),
                TransactionDate = reader.GetDateTime(1).ToString("yyyy-MM-dd HH:mm:ss"),
                TransactionType = reader.GetString(2),
                ItemCode = reader.GetString(3),
                BinLocation = reader.IsDBNull(4) ? null : reader.GetString(4),
                TargetBin = reader.IsDBNull(5) ? null : reader.GetString(5),
                QtyChange = Convert.ToDouble(reader.GetDecimal(6)),
                QtyAfter = Convert.ToDouble(reader.GetDecimal(7)),
                Notes = reader.IsDBNull(8) ? null : reader.GetString(8),
                CartonId = hasCartonId && !reader.IsDBNull(9) ? reader.GetString(9) : null
            });
        }

        // When filtering by task, deduplicate: keep only latest transaction per (item, bin, carton) so we don't send 12 rows from 4 past applies (3 items x 4 = 12).
        if (hasRefDoc && !string.IsNullOrWhiteSpace(referenceDocFilter) && list.Count > 0)
        {
            var byKey = new Dictionary<string, ErpNextWmsSyncApiService.WmsSnapshotStockTransactionDto>();
            foreach (var row in list)
            {
                var key = $"{row.ItemCode}|{row.BinLocation ?? ""}|{row.CartonId ?? ""}";
                if (!byKey.TryGetValue(key, out var existing) || row.Id > existing.Id)
                    byKey[key] = row;
            }
            list = byKey.Values.ToList();
        }

        return list;
    }

    private static async Task<List<ErpNextWmsSyncApiService.WmsSnapshotCartonStockDto>> ReadCartonStockAsync(
        MySqlConnection connection, bool hasReservedQty, bool hasLastMovedOn)
    {
        var list = new List<ErpNextWmsSyncApiService.WmsSnapshotCartonStockDto>();

        var reservedSelect = hasReservedQty ? "reserved_qty" : "0 as reserved_qty";
        var lastMovedSelect = hasLastMovedOn ? "last_moved_on" : "updated_at as last_moved_on";
        var sql = $@"
            SELECT warehouse, item_code, bin_location, carton_id, qty, {reservedSelect}, {lastMovedSelect}
            FROM tabCartonStock
            WHERE qty > 0
            ORDER BY carton_id, item_code
            LIMIT 10000";

        await using var cmd = new MySqlCommand(sql, connection);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var lastMoved = reader.IsDBNull(6) ? null : reader.GetDateTime(6).ToString("yyyy-MM-dd HH:mm:ss");
            list.Add(new ErpNextWmsSyncApiService.WmsSnapshotCartonStockDto
            {
                Warehouse = reader.GetString(0),
                ItemCode = reader.GetString(1),
                BinLocation = reader.IsDBNull(2) ? null : reader.GetString(2),
                CartonId = reader.IsDBNull(3) ? null : reader.GetString(3),
                Qty = Convert.ToDouble(reader.GetDecimal(4)),
                ReservedQty = hasReservedQty ? Convert.ToDouble(reader.GetDecimal(5)) : 0,
                LastMovedOn = lastMoved
            });
        }

        return list;
    }

    private static async Task<List<ErpNextWmsSyncApiService.WmsSnapshotCartonDto>> ReadCartonsAsync(MySqlConnection connection)
    {
        var list = new List<ErpNextWmsSyncApiService.WmsSnapshotCartonDto>();
        var hasCurrentBinId = await CheckColumnExistsAsync(connection, "tabCarton", "current_bin_id");
        var hasRemarks = await CheckColumnExistsAsync(connection, "tabCarton", "remarks");

        var binCol = hasCurrentBinId ? "current_bin_id" : "NULL as current_bin_id";
        var remarksCol = hasRemarks ? "COALESCE(remarks, '')" : "'' as remarks";
        var sql = $@"
            SELECT carton_id, status, {binCol}, {remarksCol}
            FROM tabCarton
            ORDER BY carton_id
            LIMIT 10000";

        await using var cmd = new MySqlCommand(sql, connection);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new ErpNextWmsSyncApiService.WmsSnapshotCartonDto
            {
                CartonId = reader.GetString(0),
                Status = reader.IsDBNull(1) ? null : reader.GetString(1),
                CurrentBinId = reader.IsDBNull(2) ? null : reader.GetString(2),
                Remarks = reader.IsDBNull(3) ? "" : reader.GetString(3)
            });
        }

        return list;
    }

    private static async Task<bool> CheckTableExistsAsync(MySqlConnection connection, string tableName)
    {
        try
        {
            var sql = @"
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(@t)";
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@t", tableName);
            var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            return count > 0;
        }
        catch
        {
            return false;
        }
    }

    private static async Task<bool> CheckColumnExistsAsync(MySqlConnection connection, string tableName, string columnName)
    {
        try
        {
            var sql = @"
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(@t) AND LOWER(COLUMN_NAME) = LOWER(@c)";
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@t", tableName);
            cmd.Parameters.AddWithValue("@c", columnName);
            var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            return count > 0;
        }
        catch
        {
            return false;
        }
    }
}
