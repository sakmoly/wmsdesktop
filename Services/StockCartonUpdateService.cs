using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Service for updating carton IDs for existing stock
/// This allows retroactively assigning carton IDs to stock that was added without them
/// </summary>
public static class StockCartonUpdateService
{
    /// <summary>
    /// Update carton_id for existing stock in tabStockLedger (if column exists)
    /// </summary>
    /// <param name="settings">WMS Settings</param>
    /// <param name="itemCode">Item code (optional, null = all items)</param>
    /// <param name="binLocation">Bin location (optional, null = all bins)</param>
    /// <param name="cartonId">New carton ID to assign</param>
    /// <param name="warehouse">Warehouse (optional, null = all warehouses)</param>
    /// <returns>Number of records updated</returns>
    public static async Task<int> UpdateCartonIdInStockLedgerAsync(
        WmsSettings settings,
        string cartonId,
        string? itemCode = null,
        string? binLocation = null,
        string? warehouse = null)
    {
        if (string.IsNullOrWhiteSpace(cartonId))
        {
            throw new ArgumentException("Carton ID cannot be null or empty", nameof(cartonId));
        }

        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if carton_id column exists in tabStockLedger
            var hasCartonIdColumn = await CheckColumnExistsAsync(connection, "tabStockLedger", "carton_id");
            
            if (!hasCartonIdColumn)
            {
                ErrorLogService.LogInfo("StockCartonUpdateService: tabStockLedger does not have carton_id column. Cannot update.");
                return 0;
            }

            // Build WHERE clause
            var whereConditions = new List<string> { "carton_id IS NULL OR carton_id = ''" };
            var parameters = new List<(string Name, object? Value)> { ("@cartonId", cartonId) };

            if (!string.IsNullOrWhiteSpace(itemCode))
            {
                whereConditions.Add("item_code = @itemCode");
                parameters.Add(("@itemCode", itemCode));
            }

            if (!string.IsNullOrWhiteSpace(binLocation))
            {
                whereConditions.Add("bin_location = @binLocation");
                parameters.Add(("@binLocation", binLocation));
            }

            if (!string.IsNullOrWhiteSpace(warehouse))
            {
                whereConditions.Add("warehouse = @warehouse");
                parameters.Add(("@warehouse", warehouse));
            }

            var whereClause = string.Join(" AND ", whereConditions);

            var updateSql = $@"
                UPDATE tabStockLedger
                SET carton_id = @cartonId,
                    updated_at = NOW()
                WHERE {whereClause}
                  AND qty > 0";

            await using var cmd = new MySqlCommand(updateSql, connection);
            foreach (var (name, value) in parameters)
            {
                cmd.Parameters.AddWithValue(name, value ?? DBNull.Value);
            }

            var rowsAffected = await cmd.ExecuteNonQueryAsync();
            
            ErrorLogService.LogInfo($"StockCartonUpdateService: Updated {rowsAffected} records in tabStockLedger with carton_id = '{cartonId}'");
            
            return rowsAffected;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"StockCartonUpdateService: Error updating carton_id in tabStockLedger", ex);
            throw;
        }
    }

    /// <summary>
    /// Create or update carton stock entries in tabCartonStock based on existing tabStockLedger data
    /// This is useful when migrating from bin-level to carton-level inventory
    /// </summary>
    /// <param name="settings">WMS Settings</param>
    /// <param name="cartonId">Carton ID to assign</param>
    /// <param name="itemCode">Item code (optional, null = all items)</param>
    /// <param name="binLocation">Bin location (required)</param>
    /// <param name="warehouse">Warehouse (required)</param>
    /// <returns>Number of records created/updated</returns>
    public static async Task<int> CreateCartonStockFromStockLedgerAsync(
        WmsSettings settings,
        string cartonId,
        string binLocation,
        string warehouse,
        string? itemCode = null)
    {
        if (string.IsNullOrWhiteSpace(cartonId))
        {
            throw new ArgumentException("Carton ID cannot be null or empty", nameof(cartonId));
        }

        if (string.IsNullOrWhiteSpace(binLocation))
        {
            throw new ArgumentException("Bin location cannot be null or empty", nameof(binLocation));
        }

        if (string.IsNullOrWhiteSpace(warehouse))
        {
            throw new ArgumentException("Warehouse cannot be null or empty", nameof(warehouse));
        }

        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if tabCartonStock table exists
            var tableExists = await CheckTableExistsAsync(connection, "tabCartonStock");
            
            if (!tableExists)
            {
                ErrorLogService.LogInfo("StockCartonUpdateService: tabCartonStock table does not exist. Cannot create carton stock.");
                return 0;
            }

            // Build WHERE clause for stock ledger query
            var whereConditions = new List<string>
            {
                "warehouse = @warehouse",
                "bin_location = @binLocation",
                "qty > 0"
            };
            var parameters = new List<(string Name, object? Value)>
            {
                ("@warehouse", warehouse),
                ("@binLocation", binLocation)
            };

            if (!string.IsNullOrWhiteSpace(itemCode))
            {
                whereConditions.Add("item_code = @itemCode");
                parameters.Add(("@itemCode", itemCode));
            }

            var whereClause = string.Join(" AND ", whereConditions);

            // Get stock from tabStockLedger
            var selectSql = $@"
                SELECT item_code, qty
                FROM tabStockLedger
                WHERE {whereClause}";

            await using var selectCmd = new MySqlCommand(selectSql, connection);
            foreach (var (name, value) in parameters)
            {
                selectCmd.Parameters.AddWithValue(name, value ?? DBNull.Value);
            }

            var stockItems = new List<(string ItemCode, double Qty)>();
            await using var reader = await selectCmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                stockItems.Add((
                    reader.GetString(0),
                    Convert.ToDouble(reader.GetDecimal(1))
                ));
            }
            await reader.CloseAsync();

            if (stockItems.Count == 0)
            {
                ErrorLogService.LogInfo($"StockCartonUpdateService: No stock found in tabStockLedger for warehouse='{warehouse}', bin='{binLocation}'");
                return 0;
            }

            // Create/update carton stock entries
            int recordsCreated = 0;
            foreach (var stockItem in stockItems)
            {
                var stockItemCode = stockItem.ItemCode;
                var stockItemQty = stockItem.Qty;
                
                // Use INSERT ... ON DUPLICATE KEY UPDATE to handle existing entries
                // Note: created_on has DEFAULT CURRENT_TIMESTAMP, so we don't set it manually
                // updated_at has ON UPDATE CURRENT_TIMESTAMP, but we set it explicitly in ON DUPLICATE KEY UPDATE
                var insertSql = @"
                    INSERT INTO tabCartonStock 
                        (carton_id, item_code, warehouse, bin_location, qty, status)
                    VALUES 
                        (@cartonId, @itemCode, @warehouse, @binLocation, @qty, 'PUTAWAY')
                    ON DUPLICATE KEY UPDATE
                        qty = VALUES(qty),
                        updated_at = NOW(),
                        status = 'PUTAWAY'";

                await using var insertCmd = new MySqlCommand(insertSql, connection);
                insertCmd.Parameters.AddWithValue("@cartonId", cartonId);
                insertCmd.Parameters.AddWithValue("@itemCode", stockItemCode);
                insertCmd.Parameters.AddWithValue("@warehouse", warehouse);
                insertCmd.Parameters.AddWithValue("@binLocation", binLocation);
                insertCmd.Parameters.AddWithValue("@qty", stockItemQty);

                await insertCmd.ExecuteNonQueryAsync();
                recordsCreated++;
            }

            ErrorLogService.LogInfo($"StockCartonUpdateService: Created/updated {recordsCreated} carton stock entries in tabCartonStock for carton_id='{cartonId}', warehouse='{warehouse}', bin='{binLocation}'");
            
            return recordsCreated;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"StockCartonUpdateService: Error creating carton stock from stock ledger", ex);
            throw;
        }
    }

    /// <summary>
    /// Update carton_id for existing entries in tabCartonStock
    /// </summary>
    /// <param name="settings">WMS Settings</param>
    /// <param name="oldCartonId">Old carton ID (if null, updates all entries without carton_id)</param>
    /// <param name="newCartonId">New carton ID to assign</param>
    /// <param name="itemCode">Item code (optional, null = all items)</param>
    /// <param name="binLocation">Bin location (optional, null = all bins)</param>
    /// <returns>Number of records updated</returns>
    public static async Task<int> UpdateCartonIdInCartonStockAsync(
        WmsSettings settings,
        string newCartonId,
        string? oldCartonId = null,
        string? itemCode = null,
        string? binLocation = null)
    {
        if (string.IsNullOrWhiteSpace(newCartonId))
        {
            throw new ArgumentException("New carton ID cannot be null or empty", nameof(newCartonId));
        }

        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if tabCartonStock table exists
            var tableExists = await CheckTableExistsAsync(connection, "tabCartonStock");
            
            if (!tableExists)
            {
                ErrorLogService.LogInfo("StockCartonUpdateService: tabCartonStock table does not exist. Cannot update.");
                return 0;
            }

            // Build WHERE clause
            var whereConditions = new List<string>();
            var parameters = new List<(string Name, object? Value)> { ("@newCartonId", newCartonId) };

            if (!string.IsNullOrWhiteSpace(oldCartonId))
            {
                whereConditions.Add("carton_id = @oldCartonId");
                parameters.Add(("@oldCartonId", oldCartonId));
            }
            else
            {
                whereConditions.Add("(carton_id IS NULL OR carton_id = '')");
            }

            if (!string.IsNullOrWhiteSpace(itemCode))
            {
                whereConditions.Add("item_code = @itemCode");
                parameters.Add(("@itemCode", itemCode));
            }

            if (!string.IsNullOrWhiteSpace(binLocation))
            {
                whereConditions.Add("bin_location = @binLocation");
                parameters.Add(("@binLocation", binLocation));
            }

            whereConditions.Add("qty > 0");

            var whereClause = string.Join(" AND ", whereConditions);

            var updateSql = $@"
                UPDATE tabCartonStock
                SET carton_id = @newCartonId,
                    updated_at = NOW()
                WHERE {whereClause}";

            await using var cmd = new MySqlCommand(updateSql, connection);
            foreach (var (name, value) in parameters)
            {
                cmd.Parameters.AddWithValue(name, value ?? DBNull.Value);
            }

            var rowsAffected = await cmd.ExecuteNonQueryAsync();
            
            ErrorLogService.LogInfo($"StockCartonUpdateService: Updated {rowsAffected} records in tabCartonStock with new carton_id = '{newCartonId}'");
            
            return rowsAffected;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"StockCartonUpdateService: Error updating carton_id in tabCartonStock", ex);
            throw;
        }
    }

    /// <summary>
    /// Batch update: Assign carton IDs to multiple stock items at once
    /// </summary>
    /// <param name="settings">WMS Settings</param>
    /// <param name="updates">List of (itemCode, binLocation, cartonId) tuples</param>
    /// <param name="warehouse">Warehouse (required)</param>
    /// <returns>Number of records updated</returns>
    public static async Task<int> BatchUpdateCartonIdsAsync(
        WmsSettings settings,
        List<(string ItemCode, string BinLocation, string CartonId)> updates,
        string warehouse)
    {
        if (updates == null || updates.Count == 0)
        {
            throw new ArgumentException("Updates list cannot be null or empty", nameof(updates));
        }

        if (string.IsNullOrWhiteSpace(warehouse))
        {
            throw new ArgumentException("Warehouse cannot be null or empty", nameof(warehouse));
        }

        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check which tables have carton_id column
            var hasStockLedgerCartonId = await CheckColumnExistsAsync(connection, "tabStockLedger", "carton_id");
            var hasCartonStockTable = await CheckTableExistsAsync(connection, "tabCartonStock");

            int totalUpdated = 0;

            foreach (var (itemCode, binLocation, cartonId) in updates)
            {
                if (string.IsNullOrWhiteSpace(cartonId))
                {
                    continue; // Skip null/empty carton IDs
                }

                // Update tabStockLedger if column exists
                if (hasStockLedgerCartonId)
                {
                    var updateStockLedgerSql = @"
                        UPDATE tabStockLedger
                        SET carton_id = @cartonId,
                            updated_at = NOW()
                        WHERE item_code = @itemCode
                          AND warehouse = @warehouse
                          AND bin_location = @binLocation
                          AND qty > 0";

                    await using var cmd = new MySqlCommand(updateStockLedgerSql, connection);
                    cmd.Parameters.AddWithValue("@cartonId", cartonId);
                    cmd.Parameters.AddWithValue("@itemCode", itemCode);
                    cmd.Parameters.AddWithValue("@warehouse", warehouse);
                    cmd.Parameters.AddWithValue("@binLocation", binLocation);
                    
                    var rowsAffected = await cmd.ExecuteNonQueryAsync();
                    if (rowsAffected > 0)
                    {
                        totalUpdated++;
                    }
                }

                // Create/update tabCartonStock if table exists
                if (hasCartonStockTable)
                {
                    // First, get current qty from tabStockLedger
                    var getQtySql = @"
                        SELECT qty
                        FROM tabStockLedger
                        WHERE item_code = @itemCode
                          AND warehouse = @warehouse
                          AND bin_location = @binLocation
                        LIMIT 1";

                    await using var getQtyCmd = new MySqlCommand(getQtySql, connection);
                    getQtyCmd.Parameters.AddWithValue("@itemCode", itemCode);
                    getQtyCmd.Parameters.AddWithValue("@warehouse", warehouse);
                    getQtyCmd.Parameters.AddWithValue("@binLocation", binLocation);
                    
                    var qtyResult = await getQtyCmd.ExecuteScalarAsync();
                    if (qtyResult != null && qtyResult != DBNull.Value)
                    {
                        var qty = Convert.ToDouble(qtyResult);
                        
                        // Note: created_on has DEFAULT CURRENT_TIMESTAMP, so we don't set it manually
                        var insertCartonStockSql = @"
                            INSERT INTO tabCartonStock 
                                (carton_id, item_code, warehouse, bin_location, qty, status)
                            VALUES 
                                (@cartonId, @itemCode, @warehouse, @binLocation, @qty, 'PUTAWAY')
                            ON DUPLICATE KEY UPDATE
                                qty = VALUES(qty),
                                updated_at = NOW(),
                                status = 'PUTAWAY'";

                        await using var insertCmd = new MySqlCommand(insertCartonStockSql, connection);
                        insertCmd.Parameters.AddWithValue("@cartonId", cartonId);
                        insertCmd.Parameters.AddWithValue("@itemCode", itemCode);
                        insertCmd.Parameters.AddWithValue("@warehouse", warehouse);
                        insertCmd.Parameters.AddWithValue("@binLocation", binLocation);
                        insertCmd.Parameters.AddWithValue("@qty", qty);

                        await insertCmd.ExecuteNonQueryAsync();
                    }
                }
            }

            ErrorLogService.LogInfo($"StockCartonUpdateService: Batch updated {totalUpdated} records with carton IDs");
            
            return totalUpdated;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"StockCartonUpdateService: Error in batch update", ex);
            throw;
        }
    }

    /// <summary>
    /// Check if a column exists in a table
    /// </summary>
    private static async Task<bool> CheckColumnExistsAsync(MySqlConnection connection, string tableName, string columnName)
    {
        try
        {
            var sql = @"
                SELECT COUNT(*) 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND LOWER(TABLE_NAME) = LOWER(@tableName)
                AND LOWER(COLUMN_NAME) = LOWER(@columnName)";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@tableName", tableName);
            cmd.Parameters.AddWithValue("@columnName", columnName);
            var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            return count > 0;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Check if a table exists
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
