using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace Wms.Desktop.Models;

public sealed class WmsSettings : INotifyPropertyChanged
{
    private string _company = string.Empty;
    private string _apiEndpointUrl = string.Empty;
    private string _apiKey = string.Empty;
    private int _syncFrequencyMinutes = 15;
    private string? _defaultPickingWarehouse;
    private DateTime? _lastSyncTimestamp;
    private string _databaseType = "MySQL";
    private string _databaseHost = "localhost";
    private string _databaseName = "wms_desktop";
    private string _databaseUserName = "root";
    private string _databasePassword = string.Empty;
    private int _databasePort = 3306;
    private bool _databaseExists;
    private bool _tablesExist;

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }

    public string Company
    {
        get => _company;
        set { _company = value; OnPropertyChanged(); }
    }

    public string ApiEndpointUrl
    {
        get => _apiEndpointUrl;
        set { _apiEndpointUrl = value; OnPropertyChanged(); }
    }

    public string ApiKey
    {
        get => _apiKey;
        set { _apiKey = value; OnPropertyChanged(); }
    }

    public int SyncFrequencyMinutes
    {
        get => _syncFrequencyMinutes;
        set { _syncFrequencyMinutes = value; OnPropertyChanged(); }
    }

    public string? DefaultPickingWarehouse
    {
        get => _defaultPickingWarehouse;
        set { _defaultPickingWarehouse = value; OnPropertyChanged(); }
    }

    public DateTime? LastSyncTimestamp
    {
        get => _lastSyncTimestamp;
        set { _lastSyncTimestamp = value; OnPropertyChanged(); }
    }

    // Database Configuration
    public string DatabaseType
    {
        get => _databaseType;
        set { _databaseType = value; OnPropertyChanged(); }
    }

    public string DatabaseHost
    {
        get => _databaseHost;
        set { _databaseHost = value; OnPropertyChanged(); }
    }

    public string DatabaseName
    {
        get => _databaseName;
        set { _databaseName = value; OnPropertyChanged(); }
    }

    public string DatabaseUserName
    {
        get => _databaseUserName;
        set { _databaseUserName = value; OnPropertyChanged(); }
    }

    public string DatabasePassword
    {
        get => _databasePassword;
        set { _databasePassword = value; OnPropertyChanged(); }
    }

    public int DatabasePort
    {
        get => _databasePort;
        set { _databasePort = value; OnPropertyChanged(); }
    }

    public bool DatabaseExists
    {
        get => _databaseExists;
        set { _databaseExists = value; OnPropertyChanged(); }
    }

    public bool TablesExist
    {
        get => _tablesExist;
        set { _tablesExist = value; OnPropertyChanged(); }
    }
}


