using System;
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public partial class SettingsViewModel : ObservableObject
{
    private WmsSettings _settings = new();
    private WmsSettings _originalSettings = new();
    private string _connectionStatus = "Not tested";
    private bool _isTestingConnection;
    private ImportViewModel? _importViewModel;

    public WmsSettings Settings
    {
        get => _settings;
        set
        {
            if (SetProperty(ref _settings, value))
            {
                CheckIfCreateButtonShouldBeEnabled();
            }
        }
    }

    public string ConnectionStatus
    {
        get => _connectionStatus;
        set => SetProperty(ref _connectionStatus, value);
    }

    public bool IsTestingConnection
    {
        get => _isTestingConnection;
        set => SetProperty(ref _isTestingConnection, value);
    }

    public bool CanCreateDatabase => !Settings.DatabaseExists || !Settings.TablesExist || HasSettingsChanged();

    public ImportViewModel ImportViewModel
    {
        get
        {
            if (_importViewModel == null)
            {
                _importViewModel = new ImportViewModel(_settings);
            }
            return _importViewModel;
        }
    }

    public SettingsViewModel()
    {
        // Try to load settings from file, otherwise use defaults
        var loadedSettings = SettingsService.LoadSettings();
        if (loadedSettings != null)
        {
            _settings = loadedSettings;
        }
        else
        {
            // Default settings if file doesn't exist
            _settings = new WmsSettings
            {
                Company = "Printechs Advanced Printing Trading Co.",
                ApiEndpointUrl = "https://erpnext.printechs.example.com/api",
                ApiKey = "******-MOCK-KEY-ONLY-******",
                SyncFrequencyMinutes = 15,
                DefaultPickingWarehouse = "WH-MAIN",
                LastSyncTimestamp = DateTime.Now.AddMinutes(-30),
                DatabaseType = "MySQL",
                DatabaseHost = "localhost",
                DatabaseName = "wms_desktop",
                DatabaseUserName = "root",
                DatabasePassword = string.Empty,
                DatabasePort = 3306,
                DatabaseExists = false,
                TablesExist = false,
                InventoryTrackingMode = "BinLevel"
            };
        }

        // Subscribe to property changes to detect when database settings change and auto-save
        _settings.PropertyChanged += (sender, e) =>
        {
            if (e.PropertyName != null && 
                (e.PropertyName.StartsWith("Database") || e.PropertyName == "DatabaseType"))
            {
                CheckIfCreateButtonShouldBeEnabled();
            }
            
            // Auto-save settings when any property changes (debounced)
            SaveSettingsDebounced();
        };

        // Store original settings for comparison
        _originalSettings = CloneSettings(_settings);

        // Check database status on load (fire and forget)
        _ = CheckDatabaseStatusAsync();
    }

    private System.Threading.Timer? _saveTimer;

    private void SaveSettingsDebounced()
    {
        // Debounce saves to avoid excessive file writes
        _saveTimer?.Dispose();
        _saveTimer = new System.Threading.Timer(_ =>
        {
            try
            {
                SettingsService.SaveSettings(_settings);
            }
            catch (Exception ex)
            {
                ErrorLogService.LogError("Failed to auto-save settings", ex);
            }
        }, null, 1000, System.Threading.Timeout.Infinite); // Wait 1 second before saving
    }

    [RelayCommand]
    private void SaveSettings()
    {
        try
        {
            SettingsService.SaveSettings(_settings);
            _originalSettings = CloneSettings(_settings);
            MessageBox.Show("Settings saved successfully!", "Settings", 
                MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to save settings", ex);
            MessageBox.Show($"Failed to save settings: {ex.Message}", "Settings", 
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async System.Threading.Tasks.Task TestConnectionAsync()
    {
        IsTestingConnection = true;
        ConnectionStatus = "Testing...";

        try
        {
            var success = await DatabaseService.TestConnectionAsync(Settings);
            
            if (success)
            {
                ConnectionStatus = "Connection successful";
                MessageBox.Show("Database connection test successful!", "Connection Test", 
                    MessageBoxButton.OK, MessageBoxImage.Information);
                
                // Check database and tables status
                await CheckDatabaseStatusAsync();
            }
            else
            {
                ConnectionStatus = "Connection failed";
                MessageBox.Show("Database connection test failed. Please check your settings.", 
                    "Connection Test", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ConnectionStatus = "Error: " + ex.Message;
            MessageBox.Show($"Connection test error: {ex.Message}", "Connection Test", 
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsTestingConnection = false;
        }
    }

    [RelayCommand]
    private async System.Threading.Tasks.Task CreateDatabaseAndTablesAsync()
    {
        if (!CanCreateDatabase)
        {
            MessageBox.Show("Database and tables already exist. No changes needed.", 
                "Database Status", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var result = MessageBox.Show(
            "This will create the database and all required tables. Continue?",
            "Create Database and Tables",
            MessageBoxButton.YesNo,
            MessageBoxImage.Question);

        if (result != MessageBoxResult.Yes)
            return;

        try
        {
            IsTestingConnection = true;
            ConnectionStatus = "Creating database and tables...";

            var (success, errorMessage) = await DatabaseService.CreateDatabaseAndTablesAsync(Settings);

            if (success)
            {
                ConnectionStatus = "Database and tables created successfully";
                MessageBox.Show("Database and tables created successfully!", 
                    "Database Creation", MessageBoxButton.OK, MessageBoxImage.Information);
                
                // Update status
                Settings.DatabaseExists = true;
                Settings.TablesExist = true;
                _originalSettings = CloneSettings(_settings);
                await CheckDatabaseStatusAsync();
            }
            else
            {
                ConnectionStatus = "Failed to create database/tables";
                var errorMsg = string.IsNullOrWhiteSpace(errorMessage) 
                    ? "Failed to create database and tables. Please check your settings and try again." 
                    : $"Failed to create database and tables:\n\n{errorMessage}";
                MessageBox.Show(errorMsg, 
                    "Database Creation", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ConnectionStatus = "Error: " + ex.Message;
            MessageBox.Show($"Error creating database: {ex.Message}", 
                "Database Creation", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsTestingConnection = false;
        }
    }

    [RelayCommand]
    private async System.Threading.Tasks.Task ImportMockDataAsync()
    {
        if (!Settings.DatabaseExists || !Settings.TablesExist)
        {
            MessageBox.Show("Please create the database and tables first before importing data.", 
                "Import Data", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var result = MessageBox.Show(
            "This will import mock data into the database. Existing data may be updated. Continue?",
            "Import Mock Data",
            MessageBoxButton.YesNo,
            MessageBoxImage.Question);

        if (result != MessageBoxResult.Yes)
            return;

        try
        {
            IsTestingConnection = true;
            ConnectionStatus = "Importing mock data...";

            var (success, message) = await DataImportService.ImportMockDataAsync(Settings);

            if (success)
            {
                ConnectionStatus = "Mock data imported successfully";
                MessageBox.Show(message, 
                    "Import Data", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            else
            {
                ConnectionStatus = "Failed to import mock data";
                MessageBox.Show(message, 
                    "Import Data", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ConnectionStatus = "Error: " + ex.Message;
            MessageBox.Show($"Error importing mock data: {ex.Message}", 
                "Import Data", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsTestingConnection = false;
        }
    }

    [RelayCommand]
    private async System.Threading.Tasks.Task RunFullCartonTestAsync()
    {
        if (!Settings.DatabaseExists || !Settings.TablesExist)
        {
            MessageBox.Show("Please create the database and tables first before running tests.", 
                "Test", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var result = MessageBox.Show(
            "This will run a complete automated test:\n\n" +
            "1. Check if Migration 005 has been run\n" +
            "2. Run Migration 005 if needed\n" +
            "3. Verify carton tables exist\n" +
            "4. Insert test carton data\n" +
            "5. Verify test data\n" +
            "6. Test carton inventory queries\n\n" +
            "This may take a minute. Continue?",
            "Run Full Carton Test",
            MessageBoxButton.YesNo,
            MessageBoxImage.Question);

        if (result != MessageBoxResult.Yes)
            return;

        try
        {
            IsTestingConnection = true;
            ConnectionStatus = "Running full carton test...";

            await AutoTestCartonInventory.RunFullTestAsync();
            
            ConnectionStatus = "Full test completed";
        }
        catch (Exception ex)
        {
            ConnectionStatus = "Error: " + ex.Message;
            MessageBox.Show(
                $"Error running full test: {ex.Message}\n\n{ex.StackTrace}", 
                "Test Error", 
                MessageBoxButton.OK, 
                MessageBoxImage.Error);
        }
        finally
        {
            IsTestingConnection = false;
        }
    }

    [RelayCommand]
    private async System.Threading.Tasks.Task InsertTestCartonDataAsync()
    {
        // Auto-run without prompts

        try
        {
            IsTestingConnection = true;
            ConnectionStatus = "Inserting test carton data...";

            var (success, message) = await MigrationService.InsertTestCartonDataAsync(Settings);

            if (success)
            {
                ConnectionStatus = "Test data inserted successfully";
                
                // Verify the data was inserted correctly
                var (verifySuccess, verifyMessage, bins, cartons, cartonItems, cartonStock) = 
                    await MigrationService.VerifyCartonDataAsync(Settings);
                
                var fullMessage = $"Test carton data inserted successfully!\n\n{message}";
                
                if (verifySuccess)
                {
                    fullMessage += $"\n\n✅ Verification passed:\n{verifyMessage}";
                }
                else
                {
                    fullMessage += $"\n\n⚠️ Verification: {verifyMessage}";
                }
                
                fullMessage += "\n\nYou can now:\n" +
                    "1. Switch to Carton Level Inventory mode in Settings\n" +
                    "2. Go to Items → Select an item → Show Location Breakdown\n" +
                    "3. See carton-level inventory with Carton ID column";
                
                MessageBox.Show(
                    fullMessage,
                    "Test Data Inserted", 
                    MessageBoxButton.OK, 
                    MessageBoxImage.Information);
            }
            else
            {
                ConnectionStatus = "Failed to insert test data";
                MessageBox.Show(
                    $"Failed to insert test data:\n\n{message}\n\n" +
                    "Please check the error log for details.",
                    "Test Data Failed", 
                    MessageBoxButton.OK, 
                    MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ConnectionStatus = "Error: " + ex.Message;
            MessageBox.Show(
                $"Error inserting test data: {ex.Message}\n\n{ex.StackTrace}", 
                "Test Data Error", 
                MessageBoxButton.OK, 
                MessageBoxImage.Error);
        }
        finally
        {
            IsTestingConnection = false;
        }
    }

    [RelayCommand]
    private async System.Threading.Tasks.Task RunMigration005Async()
    {
        if (!Settings.DatabaseExists || !Settings.TablesExist)
        {
            MessageBox.Show("Please create the database and tables first before running migrations.", 
                "Migration", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var result = MessageBox.Show(
            "This will run Migration 005: Bin + Carton Level Inventory Support.\n\n" +
            "This migration will:\n" +
            "• Create tabBin, tabCarton, tabCartonItem, tabCartonStock tables\n" +
            "• Add carton_id column to tabStockTransaction\n" +
            "• Create default DOCK and STAGING bins\n\n" +
            "The migration is safe to run multiple times. Continue?",
            "Run Migration 005",
            MessageBoxButton.YesNo,
            MessageBoxImage.Question);

        if (result != MessageBoxResult.Yes)
            return;

        try
        {
            IsTestingConnection = true;
            ConnectionStatus = "Running migration...";

            var (success, message) = await MigrationService.RunMigration005Async(Settings);

            if (success)
            {
                ConnectionStatus = "Migration completed successfully";
                MessageBox.Show(
                    $"Migration 005 completed successfully!\n\n{message}\n\n" +
                    "The following tables were created:\n" +
                    "• tabBin - Bin master table\n" +
                    "• tabCarton - Carton master table\n" +
                    "• tabCartonItem - Carton items table\n" +
                    "• tabCartonStock - Carton stock table\n\n" +
                    "You can now use Carton Level Inventory mode.",
                    "Migration Complete", 
                    MessageBoxButton.OK, 
                    MessageBoxImage.Information);
            }
            else
            {
                ConnectionStatus = "Migration failed";
                MessageBox.Show(
                    $"Migration 005 failed:\n\n{message}\n\n" +
                    "Please check the error log for details.",
                    "Migration Failed", 
                    MessageBoxButton.OK, 
                    MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            ConnectionStatus = "Error: " + ex.Message;
            MessageBox.Show(
                $"Error running migration: {ex.Message}\n\n{ex.StackTrace}", 
                "Migration Error", 
                MessageBoxButton.OK, 
                MessageBoxImage.Error);
        }
        finally
        {
            IsTestingConnection = false;
        }
    }

    private async System.Threading.Tasks.Task CheckDatabaseStatusAsync()
    {
        await DatabaseService.CheckDatabaseStatusAsync(Settings);
        OnPropertyChanged(nameof(CanCreateDatabase));
    }

    private bool HasSettingsChanged()
    {
        return _settings.DatabaseHost != _originalSettings.DatabaseHost ||
               _settings.DatabaseName != _originalSettings.DatabaseName ||
               _settings.DatabaseUserName != _originalSettings.DatabaseUserName ||
               _settings.DatabasePassword != _originalSettings.DatabasePassword ||
               _settings.DatabasePort != _originalSettings.DatabasePort ||
               _settings.DatabaseType != _originalSettings.DatabaseType;
    }

    private void CheckIfCreateButtonShouldBeEnabled()
    {
        OnPropertyChanged(nameof(CanCreateDatabase));
    }

    private static WmsSettings CloneSettings(WmsSettings source)
    {
        return new WmsSettings
        {
            Company = source.Company,
            ApiEndpointUrl = source.ApiEndpointUrl,
            ApiKey = source.ApiKey,
            SyncFrequencyMinutes = source.SyncFrequencyMinutes,
            DefaultPickingWarehouse = source.DefaultPickingWarehouse,
            LastSyncTimestamp = source.LastSyncTimestamp,
            DatabaseType = source.DatabaseType,
            DatabaseHost = source.DatabaseHost,
            DatabaseName = source.DatabaseName,
            DatabaseUserName = source.DatabaseUserName,
            DatabasePassword = source.DatabasePassword,
            DatabasePort = source.DatabasePort,
            DatabaseExists = source.DatabaseExists,
            TablesExist = source.TablesExist
        };
    }

}


