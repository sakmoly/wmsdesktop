using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop;

/// <summary>
/// Utility script to automatically update carton IDs for existing stock
/// This script finds all stock without carton IDs and assigns them based on item+bin combinations
/// </summary>
public class UpdateCartonIdsForStock
{
    public static async Task Main(string[] args)
    {
        Console.WriteLine("==========================================");
        Console.WriteLine("Update Carton IDs for Existing Stock");
        Console.WriteLine("==========================================");
        Console.WriteLine();

        try
        {
            // Load settings
            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                Console.WriteLine("ERROR: Settings not found. Please configure database settings first.");
                return;
            }

            Console.WriteLine("Database Connection:");
            Console.WriteLine($"  Host: {settings.DatabaseHost}");
            Console.WriteLine($"  Port: {settings.DatabasePort}");
            Console.WriteLine($"  Database: {settings.DatabaseName}");
            Console.WriteLine($"  User: {settings.DatabaseUserName}");
            Console.WriteLine();

            // Ask for confirmation
            Console.WriteLine("This script will:");
            Console.WriteLine("  1. Find all stock without carton IDs");
            Console.WriteLine("  2. Generate carton IDs based on item+bin combinations");
            Console.WriteLine("  3. Update tabStockLedger (if carton_id column exists)");
            Console.WriteLine("  4. Create entries in tabCartonStock");
            Console.WriteLine();
            Console.Write("Do you want to continue? (yes/no): ");
            var confirmation = Console.ReadLine()?.Trim().ToLower();
            
            if (confirmation != "yes" && confirmation != "y")
            {
                Console.WriteLine("Operation cancelled.");
                return;
            }
            Console.WriteLine();

            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check which tables/columns exist
            var hasStockLedgerCartonId = await CheckColumnExistsAsync(connection, "tabStockLedger", "carton_id");
            var hasCartonStockTable = await CheckTableExistsAsync(connection, "tabCartonStock");

            Console.WriteLine("Database Schema Check:");
            Console.WriteLine($"  tabStockLedger.carton_id column: {(hasStockLedgerCartonId ? "✅ EXISTS" : "❌ NOT FOUND")}");
            Console.WriteLine($"  tabCartonStock table: {(hasCartonStockTable ? "✅ EXISTS" : "❌ NOT FOUND")}");
            Console.WriteLine();

            if (!hasStockLedgerCartonId && !hasCartonStockTable)
            {
                Console.WriteLine("ERROR: Neither tabStockLedger.carton_id column nor tabCartonStock table exists.");
                Console.WriteLine("Cannot proceed with carton ID updates.");
                return;
            }

            // Step 1: Find stock without carton IDs
            Console.WriteLine("Step 1: Finding stock without carton IDs...");
            Console.WriteLine();

            var stockWithoutCartonIds = new List<(string ItemCode, string BinLocation, string Warehouse, double Qty)>();

            if (hasStockLedgerCartonId)
            {
                var findStockSql = @"
                    SELECT item_code, bin_location, warehouse, qty
                    FROM tabStockLedger
                    WHERE (carton_id IS NULL OR carton_id = '')
                      AND qty > 0
                      AND bin_location IS NOT NULL
                    ORDER BY warehouse, bin_location, item_code";

                await using var findCmd = new MySqlCommand(findStockSql, connection);
                await using var findReader = await findCmd.ExecuteReaderAsync();

                while (await findReader.ReadAsync())
                {
                    stockWithoutCartonIds.Add((
                        findReader.GetString(0),
                        findReader.GetString(1),
                        findReader.GetString(2),
                        Convert.ToDouble(findReader.GetDecimal(3))
                    ));
                }
                await findReader.CloseAsync();
            }
            else
            {
                // If no carton_id column in tabStockLedger, check tabStockLedger for all items
                var findStockSql = @"
                    SELECT DISTINCT item_code, bin_location, warehouse, SUM(qty) as qty
                    FROM tabStockLedger
                    WHERE qty > 0
                      AND bin_location IS NOT NULL
                    GROUP BY item_code, bin_location, warehouse
                    ORDER BY warehouse, bin_location, item_code";

                await using var findCmd = new MySqlCommand(findStockSql, connection);
                await using var findReader = await findCmd.ExecuteReaderAsync();

                while (await findReader.ReadAsync())
                {
                    var itemCode = findReader.GetString(0);
                    var binLocation = findReader.GetString(1);
                    var warehouse = findReader.GetString(2);

                    // Check if this item+bin already has carton stock entry
                    if (hasCartonStockTable)
                    {
                        var checkCartonSql = @"
                            SELECT COUNT(*)
                            FROM tabCartonStock
                            WHERE item_code = @itemCode
                              AND bin_location = @binLocation
                              AND warehouse = @warehouse
                              AND carton_id IS NOT NULL
                              AND carton_id != ''";

                        await using var checkCmd = new MySqlCommand(checkCartonSql, connection);
                        checkCmd.Parameters.AddWithValue("@itemCode", itemCode);
                        checkCmd.Parameters.AddWithValue("@binLocation", binLocation);
                        checkCmd.Parameters.AddWithValue("@warehouse", warehouse);
                        var hasCarton = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;

                        if (!hasCarton)
                        {
                            stockWithoutCartonIds.Add((
                                itemCode,
                                binLocation,
                                warehouse,
                                Convert.ToDouble(findReader.GetDecimal(3))
                            ));
                        }
                    }
                    else
                    {
                        stockWithoutCartonIds.Add((
                            itemCode,
                            binLocation,
                            warehouse,
                            Convert.ToDouble(findReader.GetDecimal(3))
                        ));
                    }
                }
                await findReader.CloseAsync();
            }

            if (stockWithoutCartonIds.Count == 0)
            {
                Console.WriteLine("✅ No stock found without carton IDs. All stock already has carton IDs assigned.");
                return;
            }

            Console.WriteLine($"Found {stockWithoutCartonIds.Count} stock entries without carton IDs:");
            Console.WriteLine($"  Items: {stockWithoutCartonIds.Select(s => s.ItemCode).Distinct().Count()}");
            Console.WriteLine($"  Bins: {stockWithoutCartonIds.Select(s => s.BinLocation).Distinct().Count()}");
            Console.WriteLine($"  Warehouses: {stockWithoutCartonIds.Select(s => s.Warehouse).Distinct().Count()}");
            Console.WriteLine();

            // Step 2: Generate carton IDs and update
            Console.WriteLine("Step 2: Generating carton IDs and updating stock...");
            Console.WriteLine();

            int updatedCount = 0;
            int createdCount = 0;
            var cartonIdsGenerated = new Dictionary<string, string>(); // (itemCode_binLocation) -> cartonId

            await using var transaction = await connection.BeginTransactionAsync();

            try
            {
                foreach (var (itemCode, binLocation, warehouse, qty) in stockWithoutCartonIds)
                {
                    // Generate carton ID based on item+bin combination
                    var key = $"{itemCode}_{binLocation}_{warehouse}";
                    if (!cartonIdsGenerated.TryGetValue(key, out var cartonId))
                    {
                        // Generate carton ID: CTN-{ITEM_CODE}-{BIN_LOCATION}-{TIMESTAMP}
                        var binLocationCleaned = binLocation.Replace("-", "").Replace(" ", "").ToUpper();
                        var itemCodeCleaned = itemCode.Replace("-", "").Replace(" ", "").ToUpper();
                        var timestamp = DateTime.Now.ToString("yyyyMMddHHmmss");
                        cartonId = $"CTN-{itemCodeCleaned.Substring(0, Math.Min(10, itemCodeCleaned.Length))}-{binLocationCleaned.Substring(0, Math.Min(15, binLocationCleaned.Length))}-{timestamp.Substring(8)}";
                        cartonIdsGenerated[key] = cartonId;
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
                              AND (carton_id IS NULL OR carton_id = '')
                              AND qty > 0";

                        await using var updateCmd = new MySqlCommand(updateStockLedgerSql, connection, transaction);
                        updateCmd.Parameters.AddWithValue("@cartonId", cartonId);
                        updateCmd.Parameters.AddWithValue("@itemCode", itemCode);
                        updateCmd.Parameters.AddWithValue("@warehouse", warehouse);
                        updateCmd.Parameters.AddWithValue("@binLocation", binLocation);

                        var rowsAffected = await updateCmd.ExecuteNonQueryAsync();
                        if (rowsAffected > 0)
                        {
                            updatedCount++;
                        }
                    }

                    // Create/update tabCartonStock if table exists
                    if (hasCartonStockTable)
                    {
                        // Get total qty for this item+bin combination
                        var getQtySql = @"
                            SELECT COALESCE(SUM(qty), 0)
                            FROM tabStockLedger
                            WHERE item_code = @itemCode
                              AND warehouse = @warehouse
                              AND bin_location = @binLocation
                              AND qty > 0";

                        await using var getQtyCmd = new MySqlCommand(getQtySql, connection, transaction);
                        getQtyCmd.Parameters.AddWithValue("@itemCode", itemCode);
                        getQtyCmd.Parameters.AddWithValue("@warehouse", warehouse);
                        getQtyCmd.Parameters.AddWithValue("@binLocation", binLocation);

                        var totalQtyResult = await getQtyCmd.ExecuteScalarAsync();
                        var totalQty = totalQtyResult != null && totalQtyResult != DBNull.Value 
                            ? Convert.ToDouble(totalQtyResult) 
                            : qty;

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

                        await using var insertCmd = new MySqlCommand(insertCartonStockSql, connection, transaction);
                        insertCmd.Parameters.AddWithValue("@cartonId", cartonId);
                        insertCmd.Parameters.AddWithValue("@itemCode", itemCode);
                        insertCmd.Parameters.AddWithValue("@warehouse", warehouse);
                        insertCmd.Parameters.AddWithValue("@binLocation", binLocation);
                        insertCmd.Parameters.AddWithValue("@qty", totalQty);

                        await insertCmd.ExecuteNonQueryAsync();
                        createdCount++;
                    }

                    // Progress indicator
                    if ((updatedCount + createdCount) % 10 == 0)
                    {
                        Console.Write(".");
                    }
                }

                await transaction.CommitAsync();

                Console.WriteLine();
                Console.WriteLine();
                Console.WriteLine("✅ Update completed successfully!");
                Console.WriteLine();
                Console.WriteLine("Summary:");
                Console.WriteLine($"  Records in tabStockLedger updated: {updatedCount}");
                Console.WriteLine($"  Records in tabCartonStock created/updated: {createdCount}");
                Console.WriteLine($"  Unique carton IDs generated: {cartonIdsGenerated.Count}");
                Console.WriteLine();

                // Show some sample carton IDs
                if (cartonIdsGenerated.Count > 0)
                {
                    Console.WriteLine("Sample carton IDs generated:");
                    var samples = cartonIdsGenerated.Values.Take(5);
                    foreach (var sampleCartonId in samples)
                    {
                        Console.WriteLine($"  - {sampleCartonId}");
                    }
                    if (cartonIdsGenerated.Count > 5)
                    {
                        Console.WriteLine($"  ... and {cartonIdsGenerated.Count - 5} more");
                    }
                    Console.WriteLine();
                }
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                Console.WriteLine();
                Console.WriteLine($"❌ ERROR: Update failed. Transaction rolled back.");
                Console.WriteLine($"Error: {ex.Message}");
                ErrorLogService.LogError("UpdateCartonIdsForStock: Error updating carton IDs", ex);
                throw;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine();
            Console.WriteLine($"❌ ERROR: {ex.Message}");
            ErrorLogService.LogError("UpdateCartonIdsForStock: Fatal error", ex);
        }
        finally
        {
            Console.WriteLine();
            Console.WriteLine("Press any key to exit...");
            Console.ReadKey();
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
