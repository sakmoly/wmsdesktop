using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class CartonDataService
{
    /// <summary>
    /// Get carton by ID
    /// </summary>
    public static async Task<Carton?> GetCartonAsync(WmsSettings settings, string cartonId)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            if (!await CheckTableExistsAsync(connection, "tabCarton"))
            {
                ErrorLogService.LogInfo("CartonDataService: tabCarton table does not exist");
                return null;
            }

            var sql = @"SELECT carton_id, asn_no, supplier_carton_barcode, status, current_bin_id, 
                              warehouse, last_moved_on, created_on, updated_at, remarks
                       FROM tabCarton
                       WHERE carton_id = @cartonId";

            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@cartonId", cartonId);

            await using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                return new Carton
                {
                    CartonId = reader.GetString(0),
                    AsnNo = reader.IsDBNull(1) ? null : reader.GetString(1),
                    SupplierCartonBarcode = reader.IsDBNull(2) ? null : reader.GetString(2),
                    Status = reader.GetString(3),
                    CurrentBinId = reader.IsDBNull(4) ? null : reader.GetString(4),
                    Warehouse = reader.GetString(5),
                    LastMovedOn = reader.IsDBNull(6) ? null : reader.GetDateTime(6),
                    CreatedOn = reader.GetDateTime(7),
                    UpdatedAt = reader.GetDateTime(8),
                    Remarks = reader.IsDBNull(9) ? null : reader.GetString(9)
                };
            }

            return null;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"CartonDataService: Error getting carton {cartonId}", ex);
            return null;
        }
    }

    /// <summary>
    /// Get carton items
    /// </summary>
    public static async Task<List<CartonItem>> GetCartonItemsAsync(WmsSettings settings, string cartonId)
    {
        var items = new List<CartonItem>();

        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            if (!await CheckTableExistsAsync(connection, "tabCartonItem"))
            {
                ErrorLogService.LogInfo("CartonDataService: tabCartonItem table does not exist");
                return items;
            }

            var sql = @"SELECT id, carton_id, item_code, uom, qty, batch_no, serial_no, 
                              is_closed, created_at, updated_at
                       FROM tabCartonItem
                       WHERE carton_id = @cartonId
                       ORDER BY item_code";

            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@cartonId", cartonId);

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                items.Add(new CartonItem
                {
                    Id = reader.GetInt64(0),
                    CartonId = reader.GetString(1),
                    ItemCode = reader.GetString(2),
                    Uom = reader.GetString(3),
                    Qty = reader.GetDouble(4),
                    BatchNo = reader.IsDBNull(5) ? null : reader.GetString(5),
                    SerialNo = reader.IsDBNull(6) ? null : reader.GetString(6),
                    IsClosed = reader.GetBoolean(7),
                    CreatedAt = reader.GetDateTime(8),
                    UpdatedAt = reader.GetDateTime(9)
                });
            }

            return items;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"CartonDataService: Error getting carton items for {cartonId}", ex);
            return items;
        }
    }

    /// <summary>
    /// Get cartons in a bin
    /// </summary>
    public static async Task<List<Carton>> GetCartonsInBinAsync(WmsSettings settings, string binId, string warehouse)
    {
        var cartons = new List<Carton>();

        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            if (!await CheckTableExistsAsync(connection, "tabCarton"))
            {
                return cartons;
            }

            var sql = @"SELECT carton_id, asn_no, supplier_carton_barcode, status, current_bin_id, 
                              warehouse, last_moved_on, created_on, updated_at, remarks
                       FROM tabCarton
                       WHERE current_bin_id = @binId AND warehouse = @warehouse
                       ORDER BY created_on DESC";

            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@binId", binId);
            cmd.Parameters.AddWithValue("@warehouse", warehouse);

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                cartons.Add(new Carton
                {
                    CartonId = reader.GetString(0),
                    AsnNo = reader.IsDBNull(1) ? null : reader.GetString(1),
                    SupplierCartonBarcode = reader.IsDBNull(2) ? null : reader.GetString(2),
                    Status = reader.GetString(3),
                    CurrentBinId = reader.IsDBNull(4) ? null : reader.GetString(4),
                    Warehouse = reader.GetString(5),
                    LastMovedOn = reader.IsDBNull(6) ? null : reader.GetDateTime(6),
                    CreatedOn = reader.GetDateTime(7),
                    UpdatedAt = reader.GetDateTime(8),
                    Remarks = reader.IsDBNull(9) ? null : reader.GetString(9)
                });
            }

            return cartons;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"CartonDataService: Error getting cartons in bin {binId}", ex);
            return cartons;
        }
    }

    /// <summary>
    /// Create or update carton
    /// </summary>
    public static async Task<bool> CreateOrUpdateCartonAsync(
        WmsSettings settings,
        string cartonId,
        string? asnNo,
        string warehouse,
        string? currentBinId = null,
        string status = "RECEIVED_NOT_PUTAWAY")
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            if (!await CheckTableExistsAsync(connection, "tabCarton"))
            {
                ErrorLogService.LogError("CartonDataService: tabCarton table does not exist");
                return false;
            }

            var sql = @"INSERT INTO tabCarton (carton_id, asn_no, warehouse, current_bin_id, status, created_on, updated_at)
                       VALUES (@cartonId, @asnNo, @warehouse, @currentBinId, @status, NOW(), NOW())
                       ON DUPLICATE KEY UPDATE
                           asn_no = COALESCE(@asnNo, asn_no),
                           current_bin_id = COALESCE(@currentBinId, current_bin_id),
                           status = @status,
                           updated_at = NOW()";

            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@cartonId", cartonId);
            cmd.Parameters.AddWithValue("@asnNo", (object?)asnNo ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@warehouse", warehouse);
            cmd.Parameters.AddWithValue("@currentBinId", (object?)currentBinId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@status", status);

            await cmd.ExecuteNonQueryAsync();
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"CartonDataService: Error creating/updating carton {cartonId}", ex);
            return false;
        }
    }

    /// <summary>
    /// Move carton to a different bin
    /// </summary>
    public static async Task<bool> MoveCartonToBinAsync(
        WmsSettings settings,
        string cartonId,
        string toBinId,
        string warehouse)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            if (!await CheckTableExistsAsync(connection, "tabCarton"))
            {
                return false;
            }

            // Get current bin
            var carton = await GetCartonAsync(settings, cartonId);
            if (carton == null)
            {
                ErrorLogService.LogError($"CartonDataService: Carton {cartonId} not found");
                return false;
            }

            var fromBinId = carton.CurrentBinId;

            // Update carton location
            var sql = @"UPDATE tabCarton
                       SET current_bin_id = @toBinId,
                           last_moved_on = NOW(),
                           updated_at = NOW()
                       WHERE carton_id = @cartonId AND warehouse = @warehouse";

            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@cartonId", cartonId);
            cmd.Parameters.AddWithValue("@toBinId", toBinId);
            cmd.Parameters.AddWithValue("@warehouse", warehouse);

            await cmd.ExecuteNonQueryAsync();

            // Update carton stock location
            if (await CheckTableExistsAsync(connection, "tabCartonStock"))
            {
                var updateStockSql = @"UPDATE tabCartonStock
                                      SET bin_location = @toBinId,
                                          last_moved_on = NOW(),
                                          updated_at = NOW()
                                      WHERE carton_id = @cartonId AND warehouse = @warehouse";

                await using var stockCmd = new MySqlCommand(updateStockSql, connection);
                stockCmd.Parameters.AddWithValue("@cartonId", cartonId);
                stockCmd.Parameters.AddWithValue("@toBinId", toBinId);
                stockCmd.Parameters.AddWithValue("@warehouse", warehouse);

                await stockCmd.ExecuteNonQueryAsync();
            }

            ErrorLogService.LogInfo($"CartonDataService: Moved carton {cartonId} from {fromBinId} to {toBinId}");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"CartonDataService: Error moving carton {cartonId} to bin {toBinId}", ex);
            return false;
        }
    }

    /// <summary>
    /// Get carton stock (carton-level inventory)
    /// </summary>
    public static async Task<List<CartonStock>> GetCartonStockAsync(
        WmsSettings settings,
        string? cartonId = null,
        string? itemCode = null,
        string? warehouse = null,
        string? binLocation = null)
    {
        var stock = new List<CartonStock>();

        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            if (!await CheckTableExistsAsync(connection, "tabCartonStock"))
            {
                return stock;
            }

            var conditions = new List<string>();
            var parameters = new List<MySqlParameter>();

            if (!string.IsNullOrEmpty(cartonId))
            {
                conditions.Add("carton_id = @cartonId");
                parameters.Add(new MySqlParameter("@cartonId", cartonId));
            }

            if (!string.IsNullOrEmpty(itemCode))
            {
                conditions.Add("item_code = @itemCode");
                parameters.Add(new MySqlParameter("@itemCode", itemCode));
            }

            if (!string.IsNullOrEmpty(warehouse))
            {
                conditions.Add("warehouse = @warehouse");
                parameters.Add(new MySqlParameter("@warehouse", warehouse));
            }

            if (!string.IsNullOrEmpty(binLocation))
            {
                conditions.Add("bin_location = @binLocation");
                parameters.Add(new MySqlParameter("@binLocation", binLocation));
            }

            var whereClause = conditions.Count > 0 ? "WHERE " + string.Join(" AND ", conditions) : "";

            var sql = $@"SELECT id, carton_id, item_code, warehouse, bin_location, qty, uom, 
                                batch_no, serial_no, status, last_moved_on, created_on, updated_at
                         FROM tabCartonStock
                         {whereClause}
                         ORDER BY carton_id, item_code";

            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddRange(parameters.ToArray());

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                stock.Add(new CartonStock
                {
                    Id = reader.GetInt64(0),
                    CartonId = reader.GetString(1),
                    ItemCode = reader.GetString(2),
                    Warehouse = reader.GetString(3),
                    BinLocation = reader.GetString(4),
                    Qty = reader.GetDouble(5),
                    Uom = reader.IsDBNull(6) ? null : reader.GetString(6),
                    BatchNo = reader.IsDBNull(7) ? null : reader.GetString(7),
                    SerialNo = reader.IsDBNull(8) ? null : reader.GetString(8),
                    Status = reader.GetString(9),
                    LastMovedOn = reader.IsDBNull(10) ? null : reader.GetDateTime(10),
                    CreatedOn = reader.GetDateTime(11),
                    UpdatedAt = reader.GetDateTime(12)
                });
            }

            return stock;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("CartonDataService: Error getting carton stock", ex);
            return stock;
        }
    }

    /// <summary>
    /// Update carton stock (create or update)
    /// </summary>
    public static async Task<bool> UpdateCartonStockAsync(
        WmsSettings settings,
        string cartonId,
        string itemCode,
        string warehouse,
        string binLocation,
        double qtyChange,
        string? uom = null,
        string? batchNo = null,
        string status = "PUTAWAY")
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            if (!await CheckTableExistsAsync(connection, "tabCartonStock"))
            {
                ErrorLogService.LogError("CartonDataService: tabCartonStock table does not exist");
                return false;
            }

            // Get current stock
            var currentStock = await GetCartonStockAsync(settings, cartonId, itemCode, warehouse, binLocation);
            var existingStock = currentStock.FirstOrDefault(s => 
                s.CartonId == cartonId && 
                s.ItemCode == itemCode && 
                s.Warehouse == warehouse && 
                s.BinLocation == binLocation &&
                (batchNo == null || s.BatchNo == batchNo));

            var currentQty = existingStock?.Qty ?? 0;
            var newQty = currentQty + qtyChange;

            if (newQty < 0)
            {
                ErrorLogService.LogError($"CartonDataService: Cannot reduce stock below zero. Current: {currentQty}, Change: {qtyChange}");
                return false;
            }

            // If batch number is provided, use it in unique key
            var uniqueKeyColumns = batchNo != null 
                ? "carton_id, item_code, batch_no" 
                : "carton_id, item_code";

            var sql = $@"INSERT INTO tabCartonStock 
                        (carton_id, item_code, warehouse, bin_location, qty, uom, batch_no, status, created_on, updated_at)
                        VALUES (@cartonId, @itemCode, @warehouse, @binLocation, @qty, @uom, @batchNo, @status, NOW(), NOW())
                        ON DUPLICATE KEY UPDATE
                            qty = @qty,
                            status = @status,
                            updated_at = NOW()";

            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@cartonId", cartonId);
            cmd.Parameters.AddWithValue("@itemCode", itemCode);
            cmd.Parameters.AddWithValue("@warehouse", warehouse);
            cmd.Parameters.AddWithValue("@binLocation", binLocation);
            cmd.Parameters.AddWithValue("@qty", newQty);
            cmd.Parameters.AddWithValue("@uom", (object?)uom ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@batchNo", (object?)batchNo ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@status", status);

            await cmd.ExecuteNonQueryAsync();
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"CartonDataService: Error updating carton stock for {cartonId}", ex);
            return false;
        }
    }

    /// <summary>
    /// Check if a table exists in the database
    /// </summary>
    private static async Task<bool> CheckTableExistsAsync(MySqlConnection connection, string tableName)
    {
        try
        {
            var sql = @"
                SELECT COUNT(*) 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND LOWER(TABLE_NAME) = LOWER(@tableName)";

            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@tableName", tableName);
            var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            return count > 0;
        }
        catch
        {
            return false;
        }
    }
}

