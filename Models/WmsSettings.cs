using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Runtime.CompilerServices;

namespace Wms.Desktop.Models;

public sealed class WmsSettings : INotifyPropertyChanged
{
    private string _company = string.Empty;
    private string _apiEndpointUrl = string.Empty;
    private string _erpNextApiUrl = string.Empty;
    private string _apiKey = string.Empty;
    private string _erpNextApiKey = string.Empty;
    private int _syncFrequencyMinutes = 15;
    private string? _defaultPickingWarehouse;
    private string? _defaultReceivingWarehouseForPr;
    private string? _intransitWarehouseName;
    private string? _materialRequestForTransferCarton;
    private DateTime? _lastSyncTimestamp;
    private DateTime? _lastItemSyncTimestamp;
    private string _databaseType = "MySQL";
    private string _databaseHost = "localhost";
    private string _databaseName = "wms_desktop";
    private string _databaseUserName = "root";
    private string _databasePassword = string.Empty;
    private int _databasePort = 3306;
    private bool _databaseExists;
    private bool _tablesExist;
    private string _inventoryTrackingMode = "BinLevel"; // BinLevel or CartonLevel
    private bool _sendCartonIdWithCycleCountPush; // Default false: omit carton_id until ERPNext Carton ID is Data not Link
    
    // User authentication fields
    private string? _loggedInUserCode;
    private string? _loggedInUserName;
    private string? _loggedInUserRole;
    private string? _rememberedUsername;
    private string _itemSyncFilters = "{\"custom_dcs\":\"MENFOTSLP\"}"; // Default filter as JSON
    private string _itemSyncAttributeFilters = "{\"year\":[\"=\",2026]}"; // e.g. {"year":["=",2026]}
    private string _itemSyncFields = "[\"item_code\",\"item_name\",\"year\",\"season\",\"brand\",\"stock_uom\",\"is_stock\",\"barcode\",\"custom_wms_modified\",\"disabled\"]";
    private bool _itemSyncFlattenAttributes = true;
    private ObservableCollection<SyncEndpointConfig> _syncEndpoints = new();
    private ObservableCollection<PushEndpointConfig> _pushEndpoints = new();
    private string _itemSyncPushUrl = string.Empty;

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

    /// <summary>
    /// ERPNext API base URL (for item sync and other ERPNext operations)
    /// Separate from WMS API endpoint URL
    /// </summary>
    public string ErpNextApiUrl
    {
        get => _erpNextApiUrl;
        set { _erpNextApiUrl = value; OnPropertyChanged(); }
    }

    public string ApiKey
    {
        get => _apiKey;
        set { _apiKey = value; OnPropertyChanged(); }
    }

    /// <summary>
    /// ERPNext API Key in format "api-key:api-secret"
    /// Separate from WMS API key (JWT token)
    /// </summary>
    public string ErpNextApiKey
    {
        get => _erpNextApiKey;
        set { _erpNextApiKey = value; OnPropertyChanged(); }
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

    /// <summary>Default warehouse for Purchase Receipt creation (e.g. Main Warehouse - MAATC). Used when calling receive_asn_and_create_purchase_receipt.</summary>
    public string? DefaultReceivingWarehouseForPr
    {
        get => _defaultReceivingWarehouseForPr;
        set { _defaultReceivingWarehouseForPr = value; OnPropertyChanged(); }
    }

    /// <summary>Warehouse name for intransit (e.g. "Goods In Transit - MAATC"). Used by create_stock_entry_from_transfer_carton as to_warehouse.</summary>
    public string? IntransitWarehouseName
    {
        get => _intransitWarehouseName;
        set { _intransitWarehouseName = value; OnPropertyChanged(); }
    }

    /// <summary>Optional Material Request name for Transfer Carton Stock Entry (e.g. MAT-MR-2026-00001). Used when generating stock entry from transfer carton.</summary>
    public string? MaterialRequestForTransferCarton
    {
        get => _materialRequestForTransferCarton;
        set { _materialRequestForTransferCarton = value; OnPropertyChanged(); }
    }

    /// <summary>When true, send carton_id in cycle count push to ERPNext. Only enable after ERPNext Carton ID field is Data (not Link). Default false to avoid LinkValidationError.</summary>
    public bool SendCartonIdWithCycleCountPush
    {
        get => _sendCartonIdWithCycleCountPush;
        set { _sendCartonIdWithCycleCountPush = value; OnPropertyChanged(); }
    }

    public DateTime? LastSyncTimestamp
    {
        get => _lastSyncTimestamp;
        set { _lastSyncTimestamp = value; OnPropertyChanged(); }
    }

    /// <summary>
    /// Last timestamp when items were synced from ERPNext (for incremental sync)
    /// </summary>
    public DateTime? LastItemSyncTimestamp
    {
        get => _lastItemSyncTimestamp;
        set { _lastItemSyncTimestamp = value; OnPropertyChanged(); }
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

    /// <summary>
    /// Inventory tracking mode: "BinLevel" or "CartonLevel"
    /// BinLevel: Track inventory at item + warehouse + bin level (current implementation)
    /// CartonLevel: Track inventory at item + warehouse + bin + carton level (new requirement)
    /// </summary>
    public string InventoryTrackingMode
    {
        get => _inventoryTrackingMode;
        set 
        { 
            if (value != "BinLevel" && value != "CartonLevel")
                throw new ArgumentException("InventoryTrackingMode must be 'BinLevel' or 'CartonLevel'");
            _inventoryTrackingMode = value; 
            OnPropertyChanged(); 
        }
    }

    // User authentication properties
    
    /// <summary>
    /// Currently logged in user code
    /// </summary>
    public string? LoggedInUserCode
    {
        get => _loggedInUserCode;
        set { _loggedInUserCode = value; OnPropertyChanged(); }
    }

    /// <summary>
    /// Currently logged in user display name
    /// </summary>
    public string? LoggedInUserName
    {
        get => _loggedInUserName;
        set { _loggedInUserName = value; OnPropertyChanged(); }
    }

    /// <summary>
    /// Currently logged in user role
    /// </summary>
    public string? LoggedInUserRole
    {
        get => _loggedInUserRole;
        set { _loggedInUserRole = value; OnPropertyChanged(); }
    }

    /// <summary>
    /// Remembered username for "Remember Me" feature
    /// </summary>
    public string? RememberedUsername
    {
        get => _rememberedUsername;
        set { _rememberedUsername = value; OnPropertyChanged(); }
    }

    /// <summary>
    /// Item sync filters as JSON string (e.g., {"custom_dcs":"MENFOTSLP"} or {"item_name":"COLN WMN WST"})
    /// This filter is used when fetching items from ERPNext API
    /// </summary>
    public string ItemSyncFilters
    {
        get => _itemSyncFilters;
        set { _itemSyncFilters = value; OnPropertyChanged(); }
    }

    /// <summary>
    /// Item sync attribute filters as JSON (e.g., {"year":["=",2026]}).
    /// Sent as attribute_filters in the ERPNext item API request.
    /// </summary>
    public string ItemSyncAttributeFilters
    {
        get => _itemSyncAttributeFilters;
        set { _itemSyncAttributeFilters = value; OnPropertyChanged(); }
    }

    /// <summary>
    /// Item sync fields as JSON array (e.g., ["item_code","item_name","year","season","brand","stock_uom","is_stock","barcode","custom_wms_modified","disabled"]).
    /// Sent as fields in the ERPNext item API request.
    /// </summary>
    public string ItemSyncFields
    {
        get => _itemSyncFields;
        set { _itemSyncFields = value; OnPropertyChanged(); }
    }

    /// <summary>
    /// When true, send flatten_attributes=1 in the ERPNext item API request.
    /// </summary>
    public bool ItemSyncFlattenAttributes
    {
        get => _itemSyncFlattenAttributes;
        set { _itemSyncFlattenAttributes = value; OnPropertyChanged(); }
    }

    /// <summary>
    /// Multiple sync endpoints (pull URLs). When non-empty and any enabled, sync fetches from each.
    /// When empty, single ErpNextApiUrl/ErpNextApiKey is used.
    /// </summary>
    public ObservableCollection<SyncEndpointConfig> SyncEndpoints
    {
        get => _syncEndpoints;
        set { _syncEndpoints = value ?? new ObservableCollection<SyncEndpointConfig>(); OnPropertyChanged(); }
    }

    /// <summary>
    /// Push endpoints (send data to ERPNext). Each has URL, Method (GET/POST), and Type (ASN Status, TO Status, etc.).
    /// </summary>
    public ObservableCollection<PushEndpointConfig> PushEndpoints
    {
        get => _pushEndpoints;
        set { _pushEndpoints = value ?? new ObservableCollection<PushEndpointConfig>(); OnPropertyChanged(); }
    }

    /// <summary>
    /// Optional webhook URL to call after item sync completes (push notification).
    /// Not required for saving data to the table; table is filled from pull. If set, a POST is sent with sync summary.
    /// </summary>
    public string ItemSyncPushUrl
    {
        get => _itemSyncPushUrl;
        set { _itemSyncPushUrl = value ?? string.Empty; OnPropertyChanged(); }
    }

    /// <summary>
    /// Check if user is currently logged in (has valid token)
    /// </summary>
    public bool IsLoggedIn => !string.IsNullOrWhiteSpace(ApiKey) && 
                              !ApiKey.Contains("MOCK-KEY") && 
                              !ApiKey.Contains("******");
}


