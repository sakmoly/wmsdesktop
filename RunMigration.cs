using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Services;

namespace Wms.Desktop;

public class RunMigration
{
    public static async Task Main(string[] args)
    {
        Console.WriteLine("==========================================");
        Console.WriteLine("Migration 005: Bin + Carton Inventory");
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

            // Read migration file
            var migrationFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "..", "MIGRATION_005_BIN_CARTON_INVENTORY.sql");
            if (!File.Exists(migrationFile))
            {
                migrationFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "MIGRATION_005_BIN_CARTON_INVENTORY.sql");
            }

            if (!File.Exists(migrationFile))
            {
                Console.WriteLine($"ERROR: Migration file not found: {migrationFile}");
                return;
            }

            Console.WriteLine($"Reading migration file: {migrationFile}");
            var sqlContent = await File.ReadAllTextAsync(migrationFile);
            Console.WriteLine();

            // Connect to database
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();
            Console.WriteLine("Connected to database successfully!");
            Console.WriteLine();

            // Split SQL into statements
            var statements = sqlContent
                .Split(';', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => s.Trim())
                .Where(s => !string.IsNullOrWhiteSpace(s) && !s.StartsWith("--"))
                .ToList();

            Console.WriteLine($"Executing {statements.Count} SQL statements...");
            Console.WriteLine();

            int successCount = 0;
            int errorCount = 0;

            foreach (var statement in statements)
            {
                try
                {
                    await using var cmd = new MySqlCommand(statement, connection);
                    await cmd.ExecuteNonQueryAsync();
                    successCount++;
                }
                catch (MySqlException ex) when (ex.Number == 1050 || ex.Number == 1060 || ex.Number == 1061)
                {
                    // Table/column/index already exists - this is OK
                    successCount++;
                }
                catch (Exception ex)
                {
                    errorCount++;
                    Console.WriteLine($"Warning: {ex.Message}");
                }
            }

            Console.WriteLine();
            Console.WriteLine($"Results: {successCount} succeeded, {errorCount} warnings");
            Console.WriteLine();

            // Verify tables
            Console.WriteLine("Verifying tables...");
            var verifySql = @"
                SELECT TABLE_NAME, TABLE_ROWS 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = @dbName 
                AND TABLE_NAME IN ('tabBin', 'tabCarton', 'tabCartonItem', 'tabCartonStock')
                ORDER BY TABLE_NAME";

            await using var verifyCmd = new MySqlCommand(verifySql, connection);
            verifyCmd.Parameters.AddWithValue("@dbName", settings.DatabaseName);
            await using var reader = await verifyCmd.ExecuteReaderAsync();

            Console.WriteLine();
            Console.WriteLine("Created Tables:");
            while (await reader.ReadAsync())
            {
                var tableName = reader.GetString(0);
                var rowCount = reader.IsDBNull(1) ? 0 : reader.GetInt64(1);
                Console.WriteLine($"  - {tableName} ({rowCount} rows)");
            }

            Console.WriteLine();
            Console.WriteLine("==========================================");
            Console.WriteLine("Migration 005: COMPLETE");
            Console.WriteLine("==========================================");
        }
        catch (Exception ex)
        {
            Console.WriteLine();
            Console.WriteLine($"ERROR: {ex.Message}");
            Console.WriteLine(ex.StackTrace);
        }
    }
}

