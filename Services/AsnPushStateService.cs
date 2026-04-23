using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace Wms.Desktop.Services;

/// <summary>
/// Persists "last sent to ERPNext" timestamp per ASN so the user can confirm when data was pushed.
/// Stored in a JSON file next to the app (e.g. wms_asn_push_state.json).
/// </summary>
public static class AsnPushStateService
{
    private static readonly string StateFilePath;
    private static readonly string PrReadyFilePath;
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = false };

    static AsnPushStateService()
    {
        var appPath = AppDomain.CurrentDomain.BaseDirectory;
        StateFilePath = Path.Combine(appPath, "wms_asn_push_state.json");
        PrReadyFilePath = Path.Combine(appPath, "wms_asn_erp_ready_for_pr.json");
    }

    /// <summary>Record that this ASN was successfully pushed to ERPNext at the given time (UTC).</summary>
    public static void RecordLastPushed(string asnTitle, DateTime utcTime)
    {
        if (string.IsNullOrWhiteSpace(asnTitle)) return;
        var key = asnTitle.Trim();
        try
        {
            var state = LoadState();
            state[key] = utcTime;
            SaveState(state);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"AsnPushStateService: Failed to record last pushed for {key}", ex);
        }
    }

    /// <summary>Get the last pushed UTC time for this ASN, or null if never pushed.</summary>
    public static DateTime? GetLastPushed(string asnTitle)
    {
        if (string.IsNullOrWhiteSpace(asnTitle)) return null;
        var key = asnTitle.Trim();
        try
        {
            var state = LoadState();
            return state.TryGetValue(key, out var utc) ? utc : null;
        }
        catch
        {
            return null;
        }
    }

    private static Dictionary<string, DateTime> LoadState()
    {
        if (!File.Exists(StateFilePath))
            return new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var json = File.ReadAllText(StateFilePath);
            var dict = JsonSerializer.Deserialize<Dictionary<string, DateTime>>(json);
            return dict ?? new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            return new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private static void SaveState(Dictionary<string, DateTime> state)
    {
        var json = JsonSerializer.Serialize(state, JsonOptions);
        File.WriteAllText(StateFilePath, json);
    }

    // --- ERP confirmed ASN status = Received (desktop may show "Generate Purchase Receipt") ---

    /// <summary>True when the last <c>update_asn_received_qty</c> response indicated ERP ASN status Received and PR has not been created yet from this flow.</summary>
    public static bool IsErpReadyForPurchaseReceipt(string asnTitle)
    {
        if (string.IsNullOrWhiteSpace(asnTitle)) return false;
        var key = asnTitle.Trim();
        try
        {
            var dict = LoadPrReadyState();
            return dict.TryGetValue(key, out var v) && v;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>Persist whether the primary action should be "Generate Purchase Receipt" (true) or "Update Received Qty" (false / remove key).</summary>
    public static void SetErpReadyForPurchaseReceipt(string asnTitle, bool ready)
    {
        if (string.IsNullOrWhiteSpace(asnTitle)) return;
        var key = asnTitle.Trim();
        try
        {
            var dict = LoadPrReadyState();
            if (ready)
                dict[key] = true;
            else
                dict.Remove(key);
            SavePrReadyState(dict);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"AsnPushStateService: Failed to set ERP PR-ready for {key}", ex);
        }
    }

    private static Dictionary<string, bool> LoadPrReadyState()
    {
        if (!File.Exists(PrReadyFilePath))
            return new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var json = File.ReadAllText(PrReadyFilePath);
            var dict = JsonSerializer.Deserialize<Dictionary<string, bool>>(json);
            return dict ?? new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            return new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private static void SavePrReadyState(Dictionary<string, bool> state)
    {
        var json = JsonSerializer.Serialize(state, JsonOptions);
        File.WriteAllText(PrReadyFilePath, json);
    }
}
