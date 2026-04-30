using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;

namespace Wms.Desktop.Services;

/// <summary>
/// When pulling headers from ERPNext into WMS, do not downgrade document status if WMS/mobile has already advanced the workflow.
/// </summary>
public static class ErpSyncPullHeaderStatus
{
    private static readonly HashSet<string> AsnPreserve = new(StringComparer.OrdinalIgnoreCase)
    {
        "Approved", "Receiving", "Received", "Completed", "Cancelled", "Closed", "In Progress",
    };

    /// <summary>
    /// WMS statuses for which we skip ERP pull processing entirely (no upsert): finished locally so re-sync adds no value.
    /// Does not reduce the HTTP payload from ERPNext unless the server-side API filters them out.
    /// </summary>
    private static readonly HashSet<string> AsnTerminalSkipPull = new(StringComparer.OrdinalIgnoreCase)
    {
        "Received", "Completed", "Cancelled", "Closed",
    };

    private static readonly HashSet<string> TransferOrderPreserve = new(StringComparer.OrdinalIgnoreCase)
    {
        "Approved", "Executing", "In Progress", "Completed", "Cancelled", "Picked", "Partially Shipped", "Shipped", "Dispatched",
    };

    private static readonly HashSet<string> TransferInPreserve = new(StringComparer.OrdinalIgnoreCase)
    {
        "Receiving", "In Progress", "Completed", "Received", "Cancelled", "Closed",
    };

    public static async Task<string?> ReadStatusAsync(MySqlConnection connection, string table, string title, MySqlTransaction? transaction = null)
    {
        var sql = $"SELECT status FROM {table} WHERE title = @t LIMIT 1";
        await using var cmd = new MySqlCommand(sql, connection);
        if (transaction != null) cmd.Transaction = transaction;
        cmd.Parameters.AddWithValue("@t", title);
        var o = await cmd.ExecuteScalarAsync();
        if (o == null || o is DBNull) return null;
        return Convert.ToString(o);
    }

    public static string MergeAsnStatus(string? existingWmsStatus, string incomingFromErp, string asnTitleForLog)
        => Merge(existingWmsStatus, incomingFromErp, AsnPreserve, "ASN", asnTitleForLog);

    public static string MergeTransferOrderStatus(string? existingWmsStatus, string incomingFromErp, string toTitleForLog)
        => Merge(existingWmsStatus, incomingFromErp, TransferOrderPreserve, "Transfer Order", toTitleForLog);

    public static string MergeTransferInStatus(string? existingWmsStatus, string incomingFromErp, string titleForLog)
        => Merge(existingWmsStatus, incomingFromErp, TransferInPreserve, "Transfer In", titleForLog);

    /// <summary>
    /// ASN titles in tabAdvanceShippingNotice whose WMS status is terminal (e.g. Received): caller should not upsert these on pull.
    /// </summary>
    public static async Task<HashSet<string>> GetAsnTitlesToSkipOnErpPullAsync(MySqlConnection connection)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var inList = string.Join(",", AsnTerminalSkipPull.Select(s => "'" + s.Replace("'", "''", StringComparison.Ordinal).ToLowerInvariant() + "'"));
        var sql = $"""
            SELECT title
            FROM tabAdvanceShippingNotice
            WHERE LOWER(TRIM(COALESCE(status, ''))) IN ({inList})
            """;
        await using var cmd = new MySqlCommand(sql, connection);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var t = reader.IsDBNull(0) ? null : reader.GetString(0);
            if (!string.IsNullOrWhiteSpace(t)) set.Add(t.Trim());
        }

        return set;
    }

    private static string Merge(
        string? existingWmsStatus,
        string incomingFromErp,
        HashSet<string> preserveLocal,
        string docLabel,
        string titleForLog)
    {
        var incoming = (incomingFromErp ?? "").Trim();
        if (string.IsNullOrWhiteSpace(existingWmsStatus))
            return string.IsNullOrWhiteSpace(incoming) ? "Draft" : incoming;

        var existing = existingWmsStatus.Trim();
        if (!preserveLocal.Contains(existing))
            return string.IsNullOrWhiteSpace(incoming) ? existing : incoming;

        if (!string.Equals(existing, incoming, StringComparison.OrdinalIgnoreCase))
        {
            ErrorLogService.LogInfo(
                $"ErpSyncPullHeaderStatus: {docLabel} {titleForLog}: keeping WMS header status \"{existing}\" (ERP would set \"{incoming}\").");
        }

        return existing;
    }
}
