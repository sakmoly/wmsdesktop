using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Persists relocation push result (ERP transaction number and line items) to tabRelocationErpPush.
/// </summary>
public static class RelocationErpPushDataService
{
    /// <summary>
    /// Save ERP transaction number and optional lines after a successful push to ERPNext.
    /// </summary>
    public static async Task SaveAsync(WmsSettings settings, string sessionId, string? erpTransactionNo, List<RelocationLine>? lines = null)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return;
        await DatabaseService.EnsureTabRelocationErpPushExistsAsync(settings);
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();
            string? linesJson = null;
            if (lines != null && lines.Count > 0)
            {
                var dto = lines.ConvertAll(l => new { item_code = l.ItemCode ?? "", qty = l.QtyMoved });
                linesJson = JsonSerializer.Serialize(dto);
            }
            const string sql = @"
                INSERT INTO tabRelocationErpPush (session_id, erp_transaction_no, pushed_at_utc, lines_json)
                VALUES (@sessionId, @erpTransactionNo, UTC_TIMESTAMP(), @linesJson)
                ON DUPLICATE KEY UPDATE
                  erp_transaction_no = VALUES(erp_transaction_no),
                  pushed_at_utc = VALUES(pushed_at_utc),
                  lines_json = VALUES(lines_json),
                  updated_at = CURRENT_TIMESTAMP";
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@sessionId", sessionId.Trim());
            cmd.Parameters.AddWithValue("@erpTransactionNo", (object?)erpTransactionNo?.Trim() ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@linesJson", (object?)linesJson ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync();
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("RelocationErpPushDataService: Save failed", ex);
        }
    }

    /// <summary>
    /// Get saved ERP transaction number and line items for a session, if any.
    /// </summary>
    public static async Task<(string? ErpTransactionNo, List<RelocationLine>? Lines)> GetAsync(WmsSettings settings, string sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return (null, null);
        await DatabaseService.EnsureTabRelocationErpPushExistsAsync(settings);
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();
            const string sql = "SELECT erp_transaction_no, lines_json FROM tabRelocationErpPush WHERE session_id = @sessionId";
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@sessionId", sessionId.Trim());
            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync()) return (null, null);
            var transactionNo = reader.IsDBNull(0) ? null : reader.GetString(0)?.Trim();
            if (string.IsNullOrEmpty(transactionNo)) transactionNo = null;
            List<RelocationLine>? lines = null;
            if (!reader.IsDBNull(1))
            {
                var json = reader.GetString(1);
                if (!string.IsNullOrWhiteSpace(json))
                {
                    try
                    {
                        var dto = JsonSerializer.Deserialize<List<RelocationLineDto>>(json);
                        if (dto != null && dto.Count > 0)
                        {
                            lines = dto.ConvertAll(x => new RelocationLine
                            {
                                ItemCode = x.ItemCode ?? "",
                                QtyMoved = x.Qty,
                                Barcode = null,
                                CreatedAt = null
                            });
                        }
                    }
                    catch
                    {
                        // ignore malformed json
                    }
                }
            }
            return (transactionNo, lines);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("RelocationErpPushDataService: Get failed", ex);
            return (null, null);
        }
    }

    private class RelocationLineDto
    {
        [JsonPropertyName("item_code")]
        public string? ItemCode { get; set; }
        [JsonPropertyName("qty")]
        public double Qty { get; set; }
    }
}
