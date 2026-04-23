using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace Wms.Desktop.Models;

/// <summary>
/// Purpose/type of push endpoint. Used to select the right URL when sending data to ERPNext.
/// </summary>
public static class PushEndpointTypeNames
{
    public const string AsnStatus = "ASN Status";
    public const string TransferOrderStatus = "TO Status";
    public const string MaterialRequest = "Material Request";
    public const string PurchaseReceipt = "Purchase Receipt";
    /// <summary>Offline sync: push_wms_snapshot (ledger + balance + cartons to ERPNext).</summary>
    public const string OfflineSync = "Offline Sync";
    /// <summary>Cycle count capture: sync_task_capture_only (send cycle count to ERPNext).</summary>
    public const string CycleCount = "Cycle Count";
    /// <summary>Bin transfer / relocation: upsert_relocation_session.</summary>
    public const string Relocation = "Relocation";
    public const string Custom = "Custom";
    public static readonly string[] Options = { AsnStatus, TransferOrderStatus, MaterialRequest, PurchaseReceipt, OfflineSync, CycleCount, Relocation, Custom };
}

/// <summary>
/// HTTP method for the push request.
/// </summary>
public static class PushEndpointMethodNames
{
    public const string Get = "GET";
    public const string Post = "POST";
    public static readonly string[] Options = { Get, Post };
}

/// <summary>
/// One push endpoint (send data to ERPNext). BaseUrl + optional query/body; Method is GET or POST.
/// </summary>
public sealed class PushEndpointConfig : INotifyPropertyChanged
{
    private string _name = "Push 1";
    private string _endpointType = PushEndpointTypeNames.Custom;
    private string _baseUrl = string.Empty;
    private string _method = PushEndpointMethodNames.Post;
    private string _apiKey = string.Empty;
    private bool _enabled = true;

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

    /// <summary>Default Base URL when Type is Offline Sync (push_wms_snapshot).</summary>
    public const string DefaultOfflineSyncBaseUrl = "http://printechsdammam.dyndns.org:88/api/method/printechs_wms.api.offline_sync.push_wms_snapshot";

    /// <summary>Default Base URL when Type is Relocation (upsert_relocation_session).</summary>
    public const string DefaultRelocationBaseUrl = "http://printechsdammam.dyndns.org:88/api/method/printechs_wms.api.relocation.upsert_relocation_session";

    /// <summary>Purpose: ASN Status, TO Status, Material Request, Offline Sync, Relocation, or Custom. Used to pick this endpoint when posting.</summary>
    public string EndpointType
    {
        get => _endpointType;
        set
        {
            _endpointType = value ?? PushEndpointTypeNames.Custom;
            if (string.Equals(_endpointType, PushEndpointTypeNames.OfflineSync, StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(_baseUrl))
            {
                _baseUrl = DefaultOfflineSyncBaseUrl;
                OnPropertyChanged(nameof(BaseUrl));
            }
            else if (string.Equals(_endpointType, PushEndpointTypeNames.Relocation, StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(_baseUrl))
            {
                _baseUrl = DefaultRelocationBaseUrl;
                OnPropertyChanged(nameof(BaseUrl));
            }
            OnPropertyChanged(nameof(EndpointType));
        }
    }

    /// <summary>Full URL to call when sending data (e.g. ERPNext API method URL).</summary>
    public string BaseUrl
    {
        get => _baseUrl;
        set { _baseUrl = value ?? string.Empty; OnPropertyChanged(); }
    }

    /// <summary>HTTP method: GET or POST.</summary>
    public string Method
    {
        get => _method;
        set { _method = value ?? PushEndpointMethodNames.Post; OnPropertyChanged(); }
    }

    /// <summary>API key in format api-key:api-secret.</summary>
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
}
