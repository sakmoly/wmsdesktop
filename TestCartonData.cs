using System;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop;

/// <summary>
/// Standalone test program to insert and verify carton data
/// Run this to test carton-level inventory functionality
/// </summary>
public class TestCartonData
{
    public static async Task Main(string[] args)
    {
        Console.WriteLine("==========================================");
        Console.WriteLine("Carton-Level Inventory Test");
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

            if (!settings.DatabaseExists || !settings.TablesExist)
            {
                Console.WriteLine("ERROR: Database or tables do not exist. Please create them first.");
                return;
            }

            Console.WriteLine("Database Configuration:");
            Console.WriteLine($"  Host: {settings.DatabaseHost}");
            Console.WriteLine($"  Database: {settings.DatabaseName}");
            Console.WriteLine($"  User: {settings.DatabaseUserName}");
            Console.WriteLine();

            // Step 1: Insert test data
            Console.WriteLine("Step 1: Inserting test carton data...");
            var (insertSuccess, insertMessage) = await MigrationService.InsertTestCartonDataAsync(settings);
            
            if (!insertSuccess)
            {
                Console.WriteLine($"ERROR: Failed to insert test data: {insertMessage}");
                return;
            }

            Console.WriteLine($"✅ {insertMessage}");
            Console.WriteLine();

            // Step 2: Verify data
            Console.WriteLine("Step 2: Verifying carton data...");
            var (verifySuccess, verifyMessage, bins, cartons, cartonItems, cartonStock) = 
                await MigrationService.VerifyCartonDataAsync(settings);

            if (!verifySuccess)
            {
                Console.WriteLine($"⚠️  Verification warning: {verifyMessage}");
            }
            else
            {
                Console.WriteLine($"✅ {verifyMessage}");
            }
            Console.WriteLine();

            // Step 3: Test carton stock query
            Console.WriteLine("Step 3: Testing carton stock queries...");
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySql.Data.MySqlClient.MySqlConnection(connectionString);
            await connection.OpenAsync();

            var testSql = @"
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
                LIMIT 10";

            await using var cmd = new MySql.Data.MySqlClient.MySqlCommand(testSql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();

            Console.WriteLine("Sample carton stock data:");
            Console.WriteLine("Item Code | Bin Location | Carton ID | Qty | Zone | Rack");
            Console.WriteLine("------------------------------------------------------------");
            
            int rowCount = 0;
            while (await reader.ReadAsync() && rowCount < 10)
            {
                var itemCode = reader.GetString(0);
                var binLocation = reader.GetString(1);
                var cartonId = reader.GetString(2);
                var qty = reader.GetDecimal(3);
                var zone = reader.IsDBNull(4) ? "N/A" : reader.GetString(4);
                var rack = reader.IsDBNull(5) ? "N/A" : reader.GetString(5);
                
                Console.WriteLine($"{itemCode,-12} | {binLocation,-12} | {cartonId,-10} | {qty,6} | {zone,-8} | {rack}");
                rowCount++;
            }
            Console.WriteLine();

            // Summary
            Console.WriteLine("==========================================");
            Console.WriteLine("Test Summary");
            Console.WriteLine("==========================================");
            Console.WriteLine($"✅ Test data inserted: {insertSuccess}");
            Console.WriteLine($"✅ Data verification: {verifySuccess}");
            Console.WriteLine($"   - Bins: {bins}");
            Console.WriteLine($"   - Cartons: {cartons}");
            Console.WriteLine($"   - Carton Items: {cartonItems}");
            Console.WriteLine($"   - Carton Stock Records: {cartonStock}");
            Console.WriteLine();
            Console.WriteLine("Next Steps:");
            Console.WriteLine("1. Open the desktop application");
            Console.WriteLine("2. Go to Settings → Inventory Tracking Mode → Select 'Carton Level Inventory'");
            Console.WriteLine("3. Go to Items → Select an item → Click 'Show Location Breakdown'");
            Console.WriteLine("4. You should see the Carton ID column with carton-level inventory");
            Console.WriteLine();
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

