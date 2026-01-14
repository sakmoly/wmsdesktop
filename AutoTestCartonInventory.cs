using System;
using System.Threading.Tasks;
using System.Windows;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop;

/// <summary>
/// Automated test for carton-level inventory
/// This will:
/// 1. Check if Migration 005 has been run
/// 2. Run Migration 005 if needed
/// 3. Insert test carton data
/// 4. Verify everything works
/// </summary>
public class AutoTestCartonInventory
{
    public static async Task RunFullTestAsync()
    {
        try
        {
            Console.WriteLine("==========================================");
            Console.WriteLine("Automated Carton Inventory Test");
            Console.WriteLine("==========================================");
            Console.WriteLine();

            // Load settings
            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                ShowError("Settings not found. Please configure database settings first.");
                return;
            }

            if (!settings.DatabaseExists || !settings.TablesExist)
            {
                ShowError("Database or tables do not exist. Please create them first.");
                return;
            }

            Console.WriteLine("Step 1: Checking if Migration 005 has been run...");
            var migrationNeeded = await CheckIfMigrationNeededAsync(settings);
            
            if (migrationNeeded)
            {
                Console.WriteLine("⚠️  Migration 005 not run yet. Running migration now...");
                var (migrationSuccess, migrationMessage) = await MigrationService.RunMigration005Async(settings);
                
                if (!migrationSuccess)
                {
                    ShowError($"Migration 005 failed: {migrationMessage}");
                    return;
                }
                
                Console.WriteLine($"✅ {migrationMessage}");
                Console.WriteLine();
            }
            else
            {
                Console.WriteLine("✅ Migration 005 already completed");
                Console.WriteLine();
            }

            // Verify tables exist
            Console.WriteLine("Step 2: Verifying carton tables exist...");
            var (tablesExist, tableMessage) = await VerifyCartonTablesAsync(settings);
            if (!tablesExist)
            {
                ShowError($"Carton tables verification failed: {tableMessage}");
                return;
            }
            Console.WriteLine($"✅ {tableMessage}");
            Console.WriteLine();

            // Insert test data
            Console.WriteLine("Step 3: Inserting test carton data...");
            var (insertSuccess, insertMessage) = await MigrationService.InsertTestCartonDataAsync(settings);
            
            if (!insertSuccess)
            {
                ShowError($"Failed to insert test data: {insertMessage}");
                return;
            }
            
            Console.WriteLine($"✅ {insertMessage}");
            Console.WriteLine();

            // Verify test data
            Console.WriteLine("Step 4: Verifying test data was inserted...");
            var (verifySuccess, verifyMessage, bins, cartons, cartonItems, cartonStock) = 
                await MigrationService.VerifyCartonDataAsync(settings);
            
            if (!verifySuccess)
            {
                ShowError($"Verification failed: {verifyMessage}");
                return;
            }
            
            Console.WriteLine($"✅ {verifyMessage}");
            Console.WriteLine();

            // Test carton stock query (simulating Item Location Breakdown)
            Console.WriteLine("Step 5: Testing carton stock queries...");
            var (querySuccess, queryMessage) = await TestCartonStockQueryAsync(settings);
            
            if (!querySuccess)
            {
                ShowError($"Query test failed: {queryMessage}");
                return;
            }
            
            Console.WriteLine($"✅ {queryMessage}");
            Console.WriteLine();

            // Final summary
            Console.WriteLine("==========================================");
            Console.WriteLine("Test Summary");
            Console.WriteLine("==========================================");
            Console.WriteLine($"✅ Migration 005: {(migrationNeeded ? "Run" : "Already completed")}");
            Console.WriteLine($"✅ Tables verified: {tableMessage}");
            Console.WriteLine($"✅ Test data inserted: {insertMessage}");
            Console.WriteLine($"✅ Data verification: {verifyMessage}");
            Console.WriteLine($"   - Bins: {bins}");
            Console.WriteLine($"   - Cartons: {cartons}");
            Console.WriteLine($"   - Carton Items: {cartonItems}");
            Console.WriteLine($"   - Carton Stock Records: {cartonStock}");
            Console.WriteLine($"✅ Query test: {queryMessage}");
            Console.WriteLine();
            Console.WriteLine("==========================================");
            Console.WriteLine("✅ ALL TESTS PASSED!");
            Console.WriteLine("==========================================");
            Console.WriteLine();
            Console.WriteLine("Next Steps:");
            Console.WriteLine("1. Open the desktop application");
            Console.WriteLine("2. Go to Settings → Inventory Tracking Mode → Select 'Carton Level Inventory'");
            Console.WriteLine("3. Go to Items → Select an item → Click 'Show Location Breakdown'");
            Console.WriteLine("4. You should see the Carton ID column with carton-level inventory");
            Console.WriteLine();

            ShowSuccess("All tests passed! Carton-level inventory is ready to use.");
        }
        catch (Exception ex)
        {
            ShowError($"Test failed with error: {ex.Message}\n\n{ex.StackTrace}");
        }
    }

    private static async Task<bool> CheckIfMigrationNeededAsync(WmsSettings settings)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var sql = @"
                SELECT COUNT(*) 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = @dbName 
                AND TABLE_NAME IN ('tabBin', 'tabCarton', 'tabCartonItem', 'tabCartonStock')";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@dbName", settings.DatabaseName);
            var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            
            return count < 4; // Need all 4 tables
        }
        catch
        {
            return true; // Assume migration needed if check fails
        }
    }

    private static async Task<(bool Success, string Message)> VerifyCartonTablesAsync(WmsSettings settings)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var sql = @"
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = @dbName 
                AND TABLE_NAME IN ('tabBin', 'tabCarton', 'tabCartonItem', 'tabCartonStock')
                ORDER BY TABLE_NAME";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@dbName", settings.DatabaseName);
            await using var reader = await cmd.ExecuteReaderAsync();

            var tables = new System.Collections.Generic.List<string>();
            while (await reader.ReadAsync())
            {
                tables.Add(reader.GetString(0));
            }

            if (tables.Count == 4)
            {
                return (true, $"All 4 tables exist: {string.Join(", ", tables)}");
            }
            else
            {
                return (false, $"Missing tables. Found: {tables.Count}/4. Tables: {string.Join(", ", tables)}");
            }
        }
        catch (Exception ex)
        {
            return (false, $"Error verifying tables: {ex.Message}");
        }
    }

    private static async Task<(bool Success, string Message)> TestCartonStockQueryAsync(WmsSettings settings)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Test the same query that ItemLocationBreakdownViewModel uses
            var sql = @"
                SELECT 
                    cs.item_code,
                    cs.bin_location,
                    cs.carton_id,
                    cs.qty,
                    b.zone,
                    b.rack
                FROM tabCartonStock cs
                LEFT JOIN tabBin b ON cs.bin_location = b.bin_id
                WHERE cs.status = 'PUTAWAY'
                ORDER BY cs.item_code, cs.bin_location, cs.carton_id
                LIMIT 5";

            await using var cmd = new MySqlCommand(sql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();

            int rowCount = 0;
            while (await reader.ReadAsync())
            {
                rowCount++;
            }

            if (rowCount > 0)
            {
                return (true, $"Query successful. Found {rowCount} carton stock records (showing first 5)");
            }
            else
            {
                return (true, "Query successful but no carton stock data found (this is OK if no test data was inserted)");
            }
        }
        catch (Exception ex)
        {
            return (false, $"Query failed: {ex.Message}");
        }
    }

    private static void ShowError(string message)
    {
        Console.WriteLine($"❌ ERROR: {message}");
        Console.WriteLine();
        
        Application.Current?.Dispatcher.Invoke(() =>
        {
            MessageBox.Show(
                message,
                "Test Failed",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        });
    }

    private static void ShowSuccess(string message)
    {
        Console.WriteLine($"✅ SUCCESS: {message}");
        Console.WriteLine();
        
        Application.Current?.Dispatcher.Invoke(() =>
        {
            MessageBox.Show(
                message,
                "Test Passed",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
        });
    }
}

