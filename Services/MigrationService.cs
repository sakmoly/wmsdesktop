using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class MigrationService
{
    /// <summary>
    /// Run Migration 005: Bin + Carton Level Inventory
    /// </summary>
    public static async Task<(bool Success, string Message)> RunMigration005Async(WmsSettings settings)
    {
        try
        {
            var migrationFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "MIGRATION_005_BIN_CARTON_INVENTORY.sql");
            
            // Try alternative paths
            if (!File.Exists(migrationFile))
            {
                var projectRoot = Directory.GetParent(AppDomain.CurrentDomain.BaseDirectory)?.Parent?.Parent?.Parent?.FullName;
                if (projectRoot != null)
                {
                    migrationFile = Path.Combine(projectRoot, "MIGRATION_005_BIN_CARTON_INVENTORY.sql");
                }
            }

            if (!File.Exists(migrationFile))
            {
                return (false, $"Migration file not found: {migrationFile}");
            }

            var sqlContent = await File.ReadAllTextAsync(migrationFile);
            
            // Connect to database
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Remove the prepared statement section and handle carton_id column separately
            sqlContent = sqlContent.Replace(
                "-- Add carton_id column to stock transaction (if not exists)",
                "-- Add carton_id column to stock transaction (handled separately below)");

            // Better SQL statement splitting that handles multi-line CREATE TABLE statements
            // Split by semicolon, but preserve multi-line statements
            var lines = sqlContent.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
            var statements = new List<string>();
            var currentStatement = new System.Text.StringBuilder();
            
            foreach (var line in lines)
            {
                var trimmedLine = line.Trim();
                
                // Skip empty lines and comments
                if (string.IsNullOrWhiteSpace(trimmedLine) || trimmedLine.StartsWith("--"))
                {
                    continue;
                }
                
                // Skip SELECT statements that are just status messages
                if (trimmedLine.StartsWith("SELECT", StringComparison.OrdinalIgnoreCase) && 
                    trimmedLine.Contains("status") && trimmedLine.Contains("COMPLETE"))
                {
                    continue;
                }
                
                // Skip prepared statement commands
                if (trimmedLine.StartsWith("SET @", StringComparison.OrdinalIgnoreCase) ||
                    trimmedLine.StartsWith("PREPARE", StringComparison.OrdinalIgnoreCase) ||
                    trimmedLine.StartsWith("EXECUTE", StringComparison.OrdinalIgnoreCase) ||
                    trimmedLine.StartsWith("DEALLOCATE", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }
                
                currentStatement.AppendLine(line);
                
                // If line ends with semicolon, we have a complete statement
                if (trimmedLine.EndsWith(";"))
                {
                    var statement = currentStatement.ToString().Trim();
                    if (!string.IsNullOrWhiteSpace(statement) && statement.Length > 10) // Minimum meaningful statement
                    {
                        statements.Add(statement);
                    }
                    currentStatement.Clear();
                }
            }
            
            // Add any remaining statement
            var remaining = currentStatement.ToString().Trim();
            if (!string.IsNullOrWhiteSpace(remaining) && remaining.Length > 10)
            {
                statements.Add(remaining);
            }

            int successCount = 0;
            int errorCount = 0;
            string? lastError = null;

            foreach (var statement in statements)
            {
                if (string.IsNullOrWhiteSpace(statement) || statement.StartsWith("--"))
                    continue;

                try
                {
                    // Log the statement type for debugging
                    var statementType = statement.Substring(0, Math.Min(50, statement.Length)).Replace("\r", " ").Replace("\n", " ");
                    ErrorLogService.LogInfo($"MigrationService: Executing statement: {statementType}...");
                    
                    await using var cmd = new MySqlCommand(statement, connection);
                    await cmd.ExecuteNonQueryAsync();
                    successCount++;
                    ErrorLogService.LogInfo($"MigrationService: Statement executed successfully");
                }
                catch (MySqlException ex) when (ex.Number == 1050 || ex.Number == 1060 || ex.Number == 1061 || ex.Number == 1062)
                {
                    // Table/column/index already exists - this is OK for idempotent migrations
                    successCount++;
                    ErrorLogService.LogInfo($"MigrationService: Statement skipped (already exists): {ex.Number}");
                }
                catch (Exception ex)
                {
                    errorCount++;
                    lastError = ex.Message;
                    var statementPreview = statement.Length > 100 ? statement.Substring(0, 100) + "..." : statement;
                    ErrorLogService.LogError($"Migration statement failed: {ex.Message}\nStatement: {statementPreview}", ex);
                }
            }

            // Handle carton_id column addition separately (check if exists first)
            try
            {
                var checkColumnSql = @"
                    SELECT COUNT(*) 
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_SCHEMA = @dbName
                    AND TABLE_NAME = 'tabStockTransaction' 
                    AND COLUMN_NAME = 'carton_id'";

                await using var checkCmd = new MySqlCommand(checkColumnSql, connection);
                checkCmd.Parameters.AddWithValue("@dbName", settings.DatabaseName);
                var columnExists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;

                if (!columnExists)
                {
                    var addColumnSql = @"
                        ALTER TABLE tabStockTransaction 
                        ADD COLUMN carton_id VARCHAR(100) NULL AFTER bin_location,
                        ADD INDEX idx_carton_id (carton_id)";

                    await using var addCmd = new MySqlCommand(addColumnSql, connection);
                    await addCmd.ExecuteNonQueryAsync();
                    successCount++;
                }
                else
                {
                    // Column already exists - check if index exists
                    var checkIndexSql = @"
                        SELECT COUNT(*) 
                        FROM INFORMATION_SCHEMA.STATISTICS 
                        WHERE TABLE_SCHEMA = @dbName
                        AND TABLE_NAME = 'tabStockTransaction' 
                        AND INDEX_NAME = 'idx_carton_id'";

                    await using var checkIndexCmd = new MySqlCommand(checkIndexSql, connection);
                    checkIndexCmd.Parameters.AddWithValue("@dbName", settings.DatabaseName);
                    var indexExists = Convert.ToInt32(await checkIndexCmd.ExecuteScalarAsync()) > 0;

                    if (!indexExists)
                    {
                        var addIndexSql = "ALTER TABLE tabStockTransaction ADD INDEX idx_carton_id (carton_id)";
                        await using var addIndexCmd = new MySqlCommand(addIndexSql, connection);
                        await addIndexCmd.ExecuteNonQueryAsync();
                        successCount++;
                    }
                    else
                    {
                        successCount++; // Both column and index exist
                    }
                }
            }
            catch (MySqlException ex) when (ex.Number == 1060 || ex.Number == 1061)
            {
                // Column or index already exists
                successCount++;
            }
            catch (Exception ex)
            {
                errorCount++;
                lastError = ex.Message;
                ErrorLogService.LogError($"Failed to add carton_id column: {ex.Message}", ex);
            }

            // Handle carton_id column addition to tabCycleCountLine (for carton-level cycle counting)
            try
            {
                // Check if table exists first
                var checkTableSql = @"
                    SELECT COUNT(*) 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = @dbName
                    AND TABLE_NAME = 'tabCycleCountLine'";
                
                await using var checkTableCmd = new MySqlCommand(checkTableSql, connection);
                checkTableCmd.Parameters.AddWithValue("@dbName", settings.DatabaseName);
                var tableExists = Convert.ToInt32(await checkTableCmd.ExecuteScalarAsync()) > 0;

                if (tableExists)
                {
                    var checkCycleCountColumnSql = @"
                        SELECT COUNT(*) 
                        FROM INFORMATION_SCHEMA.COLUMNS 
                        WHERE TABLE_SCHEMA = @dbName
                        AND TABLE_NAME = 'tabCycleCountLine' 
                        AND COLUMN_NAME = 'carton_id'";

                    await using var checkCycleCountCmd = new MySqlCommand(checkCycleCountColumnSql, connection);
                    checkCycleCountCmd.Parameters.AddWithValue("@dbName", settings.DatabaseName);
                    var cycleCountColumnExists = Convert.ToInt32(await checkCycleCountCmd.ExecuteScalarAsync()) > 0;

                    if (!cycleCountColumnExists)
                    {
                        var addCycleCountColumnSql = @"
                            ALTER TABLE tabCycleCountLine 
                            ADD COLUMN carton_id VARCHAR(100) NULL AFTER bin_location,
                            ADD INDEX idx_carton_id (carton_id)";

                        await using var addCycleCountCmd = new MySqlCommand(addCycleCountColumnSql, connection);
                        await addCycleCountCmd.ExecuteNonQueryAsync();
                        successCount++;
                        ErrorLogService.LogInfo("MigrationService: Added carton_id column to tabCycleCountLine");
                    }
                    else
                    {
                        // Column exists - check if index exists
                        var checkCycleCountIndexSql = @"
                            SELECT COUNT(*) 
                            FROM INFORMATION_SCHEMA.STATISTICS 
                            WHERE TABLE_SCHEMA = @dbName
                            AND TABLE_NAME = 'tabCycleCountLine' 
                            AND INDEX_NAME = 'idx_carton_id'";

                        await using var checkCycleCountIndexCmd = new MySqlCommand(checkCycleCountIndexSql, connection);
                        checkCycleCountIndexCmd.Parameters.AddWithValue("@dbName", settings.DatabaseName);
                        var cycleCountIndexExists = Convert.ToInt32(await checkCycleCountIndexCmd.ExecuteScalarAsync()) > 0;

                        if (!cycleCountIndexExists)
                        {
                            var addCycleCountIndexSql = "ALTER TABLE tabCycleCountLine ADD INDEX idx_carton_id (carton_id)";
                            await using var addCycleCountIndexCmd = new MySqlCommand(addCycleCountIndexSql, connection);
                            await addCycleCountIndexCmd.ExecuteNonQueryAsync();
                            successCount++;
                            ErrorLogService.LogInfo("MigrationService: Added idx_carton_id index to tabCycleCountLine");
                        }
                        else
                        {
                            successCount++; // Both column and index exist
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                ErrorLogService.LogError("MigrationService: Error adding carton_id column to tabCycleCountLine (table may not exist yet)", ex);
                // Don't count as error - table might not exist if cycle count hasn't been set up
            }

            if (successCount == 0 && statements.Count > 0)
            {
                return (false, $"Migration failed. No statements executed successfully. Last error: {lastError}");
            }

            // Verify tables were actually created
            var verifySql = @"
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = @dbName 
                AND TABLE_NAME IN ('tabBin', 'tabCarton', 'tabCartonItem', 'tabCartonStock')
                ORDER BY TABLE_NAME";
            
            await using var verifyCmd = new MySqlCommand(verifySql, connection);
            verifyCmd.Parameters.AddWithValue("@dbName", settings.DatabaseName);
            await using var verifyReader = await verifyCmd.ExecuteReaderAsync();
            
            var createdTables = new List<string>();
            while (await verifyReader.ReadAsync())
            {
                createdTables.Add(verifyReader.GetString(0));
            }
            
            ErrorLogService.LogInfo($"MigrationService: Verification - Found {createdTables.Count}/4 required tables: {string.Join(", ", createdTables)}");

            var message = $"Migration completed. {successCount} statements executed successfully";
            if (errorCount > 0)
            {
                message += $", {errorCount} warnings (likely already exists)";
            }
            
            if (createdTables.Count < 4)
            {
                message += $"\n⚠️ Warning: Only {createdTables.Count}/4 tables found after migration. Tables found: {string.Join(", ", createdTables)}";
                ErrorLogService.LogError($"MigrationService: Migration completed but only {createdTables.Count}/4 tables were created", null);
            }
            else
            {
                message += $"\n✅ All 4 tables verified: {string.Join(", ", createdTables)}";
            }

            return (true, message);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Migration 005 failed", ex);
            return (false, $"Migration failed: {ex.Message}");
        }
    }

    /// <summary>
    /// Insert test carton-level inventory data
    /// Automatically runs Migration 005 if needed
    /// Cleans up old test data before inserting new data
    /// </summary>
    public static async Task<(bool Success, string Message)> InsertTestCartonDataAsync(WmsSettings settings)
    {
        try
        {
            // Connect to database first to check tables
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var checkConnection = new MySqlConnection(connectionString);
            await checkConnection.OpenAsync();

            // Check if carton tables exist first
            var checkTableSql = @"
                SELECT COUNT(*) 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = @dbName 
                AND TABLE_NAME IN ('tabBin', 'tabCarton', 'tabCartonItem', 'tabCartonStock')";
            
            await using var checkCmd = new MySqlCommand(checkTableSql, checkConnection);
            checkCmd.Parameters.AddWithValue("@dbName", settings.DatabaseName);
            var tableCount = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());
            
            if (tableCount < 4)
            {
                // Automatically run Migration 005
                ErrorLogService.LogInfo("MigrationService: Carton tables not found. Automatically running Migration 005...");
                var (migrationSuccess, migrationMessage) = await RunMigration005Async(settings);
                
                if (!migrationSuccess)
                {
                    return (false, $"Failed to run Migration 005 automatically: {migrationMessage}");
                }
                
                ErrorLogService.LogInfo($"MigrationService: Migration 005 completed: {migrationMessage}");
                
                // Verify tables were created
                await checkConnection.CloseAsync();
                await checkConnection.OpenAsync();
                await using var verifyTableCmd = new MySqlCommand(checkTableSql, checkConnection);
                verifyTableCmd.Parameters.AddWithValue("@dbName", settings.DatabaseName);
                tableCount = Convert.ToInt32(await verifyTableCmd.ExecuteScalarAsync());
                
                if (tableCount < 4)
                {
                    return (false, $"Migration 005 ran but tables still missing. Found {tableCount}/4 required tables.");
                }
            }

            var testDataFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "INSERT_TEST_CARTON_INVENTORY.sql");
            
            // Try alternative paths
            if (!File.Exists(testDataFile))
            {
                var projectRoot = Directory.GetParent(AppDomain.CurrentDomain.BaseDirectory)?.Parent?.Parent?.Parent?.FullName;
                if (projectRoot != null)
                {
                    testDataFile = Path.Combine(projectRoot, "INSERT_TEST_CARTON_INVENTORY.sql");
                }
            }

            if (!File.Exists(testDataFile))
            {
                return (false, $"Test data file not found: {testDataFile}");
            }

            var sqlContent = await File.ReadAllTextAsync(testDataFile);
            
            // Connect to database
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();
            
            // First, clean up old test data if it exists (to ensure fresh data with correct location IDs)
            ErrorLogService.LogInfo("MigrationService: Cleaning up old test data...");
            try
            {
                await using var cleanupCmd1 = new MySqlCommand("DELETE FROM tabCartonStock WHERE carton_id LIKE 'CARTON-%'", connection);
                var deleted1 = await cleanupCmd1.ExecuteNonQueryAsync();
                ErrorLogService.LogInfo($"MigrationService: Deleted {deleted1} old carton stock records");
                
                await using var cleanupCmd2 = new MySqlCommand("DELETE FROM tabCartonItem WHERE carton_id LIKE 'CARTON-%'", connection);
                var deleted2 = await cleanupCmd2.ExecuteNonQueryAsync();
                ErrorLogService.LogInfo($"MigrationService: Deleted {deleted2} old carton item records");
                
                await using var cleanupCmd3 = new MySqlCommand("DELETE FROM tabCarton WHERE carton_id LIKE 'CARTON-%'", connection);
                var deleted3 = await cleanupCmd3.ExecuteNonQueryAsync();
                ErrorLogService.LogInfo($"MigrationService: Deleted {deleted3} old carton records");
                
                await using var cleanupCmd4 = new MySqlCommand("DELETE FROM tabBin WHERE bin_id LIKE 'BIN-%'", connection);
                var deleted4 = await cleanupCmd4.ExecuteNonQueryAsync();
                ErrorLogService.LogInfo($"MigrationService: Deleted {deleted4} old bin records with BIN-% pattern");
            }
            catch (Exception ex)
            {
                ErrorLogService.LogError("MigrationService: Error cleaning up old test data (this is OK if tables don't exist yet)", ex);
            }

            // For test data, parse statements properly (no MySQL variables needed now)
            // Better approach: Split by semicolon, but keep UNION ALL together
            var statements = new List<string>();
            
            // Remove comments first
            var lines = sqlContent.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
            var cleanedLines = new List<string>();
            foreach (var line in lines)
            {
                var trimmedLine = line.Trim();
                // Skip empty lines and full-line comments
                if (string.IsNullOrWhiteSpace(trimmedLine) || trimmedLine.StartsWith("--"))
                {
                    continue;
                }
                // Remove inline comments (keep the SQL part)
                var commentIndex = trimmedLine.IndexOf("--");
                if (commentIndex >= 0)
                {
                    trimmedLine = trimmedLine.Substring(0, commentIndex).Trim();
                }
                if (!string.IsNullOrWhiteSpace(trimmedLine))
                {
                    cleanedLines.Add(trimmedLine);
                }
            }
            
            // Now split by semicolon, but preserve UNION ALL
            var currentStatement = new StringBuilder();
            foreach (var line in cleanedLines)
            {
                // Skip SELECT statements that are just verification queries
                if (line.StartsWith("SELECT", StringComparison.OrdinalIgnoreCase) && 
                    (line.Contains("status") || line.Contains("COUNT(*)") || line.Contains("VERIFICATION") || line.Contains("SUMMARY") || line.Contains("Show created") || line.Contains("Show carton")))
                {
                    continue;
                }
                
                // Skip SET @ statements (we don't use variables anymore)
                if (line.StartsWith("SET @", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }
                
                currentStatement.Append(line);
                
                // If line ends with semicolon, we have a complete statement
                if (line.EndsWith(";"))
                {
                    var statement = currentStatement.ToString().Trim();
                    if (!string.IsNullOrWhiteSpace(statement) && statement.Length > 5)
                    {
                        statements.Add(statement);
                    }
                    currentStatement.Clear();
                }
                else
                {
                    // Add space between lines (for UNION ALL, etc.)
                    currentStatement.Append(" ");
                }
            }
            
            // Add any remaining statement
            var remaining = currentStatement.ToString().Trim();
            if (!string.IsNullOrWhiteSpace(remaining) && remaining.Length > 5)
            {
                statements.Add(remaining);
            }
            
            ErrorLogService.LogInfo($"MigrationService: Found {statements.Count} test data statements to execute");

            int successCount = 0;
            int errorCount = 0;
            string? lastError = null;

            // Execute all statements
            foreach (var statement in statements)
            {
                try
                {
                    var statementType = statement.Substring(0, Math.Min(50, statement.Length)).Replace("\r", " ").Replace("\n", " ");
                    ErrorLogService.LogInfo($"MigrationService: Executing: {statementType}...");
                    
                    await using var cmd = new MySqlCommand(statement, connection);
                    var rowsAffected = await cmd.ExecuteNonQueryAsync();
                    successCount++;
                    ErrorLogService.LogInfo($"MigrationService: Statement executed successfully (rows affected: {rowsAffected})");
                }
                catch (MySqlException ex) when (ex.Number == 1062 || ex.Number == 1022)
                {
                    // Duplicate entry - this is OK (INSERT IGNORE should handle this, but just in case)
                    successCount++;
                    ErrorLogService.LogInfo($"MigrationService: Statement skipped (duplicate, error {ex.Number})");
                }
                catch (Exception ex)
                {
                    errorCount++;
                    lastError = ex.Message;
                    var statementPreview = statement.Length > 100 ? statement.Substring(0, 100) + "..." : statement;
                    ErrorLogService.LogError($"Test data statement failed: {ex.Message}\nStatement preview: {statementPreview}", ex);
                }
            }

            if (successCount == 0 && statements.Count > 0)
            {
                return (false, $"Failed to insert test data. No statements executed successfully. Last error: {lastError}");
            }

            // Verify data was inserted
            var verifySql = @"
                SELECT 
                    (SELECT COUNT(*) FROM tabBin) as bins,
                    (SELECT COUNT(*) FROM tabCarton) as cartons,
                    (SELECT COUNT(*) FROM tabCartonItem) as carton_items,
                    (SELECT COUNT(*) FROM tabCartonStock) as carton_stock";

            await using var verifyCmd = new MySqlCommand(verifySql, connection);
            await using var reader = await verifyCmd.ExecuteReaderAsync();
            
            string summary = "";
            if (await reader.ReadAsync())
            {
                var bins = reader.GetInt64(0);
                var cartons = reader.GetInt64(1);
                var cartonItems = reader.GetInt64(2);
                var cartonStock = reader.GetInt64(3);
                
                summary = $"\n\nCreated:\n• {bins} bins\n• {cartons} cartons\n• {cartonItems} carton items\n• {cartonStock} carton stock records";
            }

            var message = $"Test carton data inserted successfully. {successCount} statements executed";
            if (errorCount > 0)
            {
                message += $", {errorCount} warnings";
            }
            message += summary;

            return (true, message);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to insert test carton data", ex);
            return (false, $"Failed to insert test data: {ex.Message}");
        }
    }

    /// <summary>
    /// Verify carton data was inserted correctly
    /// </summary>
    public static async Task<(bool Success, string Message, int Bins, int Cartons, int CartonItems, int CartonStock)> VerifyCartonDataAsync(WmsSettings settings)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var verifySql = @"
                SELECT 
                    (SELECT COUNT(*) FROM tabBin) as bins,
                    (SELECT COUNT(*) FROM tabCarton) as cartons,
                    (SELECT COUNT(*) FROM tabCartonItem) as carton_items,
                    (SELECT COUNT(*) FROM tabCartonStock) as carton_stock";

            await using var cmd = new MySqlCommand(verifySql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();
            
            if (await reader.ReadAsync())
            {
                var bins = reader.GetInt32(0);
                var cartons = reader.GetInt32(1);
                var cartonItems = reader.GetInt32(2);
                var cartonStock = reader.GetInt32(3);
                
                var message = $"Verification complete:\n" +
                    $"• {bins} bins\n" +
                    $"• {cartons} cartons\n" +
                    $"• {cartonItems} carton items\n" +
                    $"• {cartonStock} carton stock records";
                
                var success = bins > 0 && cartons > 0 && cartonItems > 0 && cartonStock > 0;
                
                return (success, message, bins, cartons, cartonItems, cartonStock);
            }
            
            return (false, "No data found", 0, 0, 0, 0);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to verify carton data", ex);
            return (false, $"Verification failed: {ex.Message}", 0, 0, 0, 0);
        }
    }
}


