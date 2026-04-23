using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace Wms.Desktop.Models;

/// <summary>
/// Sync type: which sync(s) use this endpoint. All = items + warehouses + item groups + ASN + TO, or specific type only.
/// </summary>
public static class SyncTypeNames
{
    public const string All = "All";
    public const string Item = "Item";
    public const string Warehouse = "Warehouse";
    public const string ItemGroup = "Item Group";
    public const string Asn = "ASN";
    public const string TransferOrder = "Transfer Order";
    public const string MaterialRequest = "Material Request";
    public const string TransferIn = "Transfer In";
    public static readonly string[] Options = { All, Item, Warehouse, ItemGroup, Asn, TransferOrder, MaterialRequest, TransferIn };
}

/// <summary>
/// One sync endpoint (pull URL). SyncType controls which sync(s) use it: All, Item, Warehouse, Item Group, ASN, or Transfer Order.
/// </summary>
public sealed class SyncEndpointConfig : INotifyPropertyChanged
{
    private string _name = "ERPNext 1";
    private string _baseUrl = string.Empty;
    private string _apiKey = string.Empty;
    private bool _enabled = true;
    private string _syncType = SyncTypeNames.All;

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }

    public string Name
    {
        get => _name;
        set { _name = value ?? string.Empty; OnPropertyChanged(); }
    }

    /// <summary>Base URL e.g. http://192.168.103.187:88</summary>
    public string BaseUrl
    {
        get => _baseUrl;
        set { _baseUrl = value ?? string.Empty; OnPropertyChanged(); }
    }

    /// <summary>API key in format api-key:api-secret</summary>
    public string ApiKey
    {
        get => _apiKey;
        set { _apiKey = value ?? string.Empty; OnPropertyChanged(); }
    }

    public bool Enabled
    {
        get => _enabled;
        set { _enabled = value; OnPropertyChanged(); }
    }

    /// <summary>Which sync(s) use this endpoint: All, Item, Warehouse, Item Group, ASN, Transfer Order, Material Request, or Transfer In.</summary>
    public string SyncType
    {
        get => _syncType;
        set { _syncType = value ?? SyncTypeNames.All; OnPropertyChanged(); }
    }
}
