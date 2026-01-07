using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class SortBoxDataService
{
    /// <summary>
    /// Get all Sort Boxes from database
    /// </summary>
    public static async Task<List<SortBox>> GetSortBoxesAsync(WmsSettings settings)
    {
        var boxes = new List<SortBox>();
        
        try
        {
            ErrorLogService.LogInfo("Loading Sort Boxes from database...");
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var sql = @"SELECT box_id, status, advance_shipping_notice, transfer_order, store, 
                               purpose, created_by, created_on, closed_by, closed_on, 
                               dispatched_on, received_at_store_on, remarks
                        FROM tabSortBox
                        ORDER BY created_on DESC, box_id";
            
            ErrorLogService.LogInfo($"Executing query: {sql}");
            await using var cmd = new MySqlCommand(sql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();

            int rowCount = 0;
            while (await reader.ReadAsync())
            {
                rowCount++;
                boxes.Add(new SortBox
                {
                    BoxId = reader.GetString(0),
                    Status = reader.GetString(1),
                    AdvanceShippingNotice = reader.GetString(2),
                    TransferOrder = reader.GetString(3),
                    Store = reader.GetString(4),
                    Purpose = reader.IsDBNull(5) ? "STORE" : reader.GetString(5),
                    CreatedBy = reader.GetString(6),
                    CreatedOn = reader.GetDateTime(7),
                    ClosedBy = reader.IsDBNull(8) ? null : reader.GetString(8),
                    ClosedOn = reader.IsDBNull(9) ? null : reader.GetDateTime(9),
                    DispatchedOn = reader.IsDBNull(10) ? null : reader.GetDateTime(10),
                    ReceivedAtStoreOn = reader.IsDBNull(11) ? null : reader.GetDateTime(11),
                    Remarks = reader.IsDBNull(12) ? null : reader.GetString(12)
                });
            }
            
            ErrorLogService.LogInfo($"Loaded {rowCount} sort boxes from database");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Sort Boxes from database", ex);
        }

        return boxes;
    }

    /// <summary>
    /// Create a new Sort Box in the database
    /// </summary>
    /// <param name="settings">Database settings</param>
    /// <param name="box">Sort Box to create</param>
    /// <returns>True if successful, false otherwise</returns>
    public static async Task<bool> CreateSortBoxAsync(WmsSettings settings, SortBox box)
    {
        try
        {
            ErrorLogService.LogInfo($"SortBoxDataService: Creating new sort box '{box.BoxId}'");
            
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var sql = @"INSERT INTO tabSortBox 
                        (box_id, status, advance_shipping_notice, transfer_order, store, purpose, 
                         created_by, created_on, remarks)
                        VALUES 
                        (@box_id, @status, @asn, @to, @store, @purpose, 
                         @created_by, @created_on, @remarks)";

            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@box_id", box.BoxId);
            cmd.Parameters.AddWithValue("@status", box.Status);
            cmd.Parameters.AddWithValue("@asn", box.AdvanceShippingNotice);
            cmd.Parameters.AddWithValue("@to", box.TransferOrder);
            cmd.Parameters.AddWithValue("@store", box.Store);
            cmd.Parameters.AddWithValue("@purpose", box.Purpose);
            cmd.Parameters.AddWithValue("@created_by", box.CreatedBy);
            cmd.Parameters.AddWithValue("@created_on", box.CreatedOn);
            cmd.Parameters.AddWithValue("@remarks", box.Remarks ?? (object)DBNull.Value);

            var rowsAffected = await cmd.ExecuteNonQueryAsync();
            
            ErrorLogService.LogInfo($"SortBoxDataService: Successfully created sort box '{box.BoxId}' (rows affected: {rowsAffected})");
            return rowsAffected > 0;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"SortBoxDataService: Error creating sort box '{box.BoxId}'", ex);
            return false;
        }
    }

    /// <summary>
    /// Generate a unique Box ID based on store and sequence number
    /// Format: BOX-{STORE}-{SEQUENCE}
    /// </summary>
    /// <param name="settings">Database settings</param>
    /// <param name="store">Store identifier</param>
    /// <returns>Unique Box ID</returns>
    public static async Task<string> GenerateBoxIdAsync(WmsSettings settings, string store)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Find the highest sequence number for this store
            var sql = @"SELECT MAX(CAST(SUBSTRING_INDEX(box_id, '-', -1) AS UNSIGNED)) as max_seq
                        FROM tabSortBox
                        WHERE box_id LIKE CONCAT('BOX-', @store, '-%')";

            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@store", store);

            var result = await cmd.ExecuteScalarAsync();
            var nextSeq = result != null && result != DBNull.Value 
                ? Convert.ToInt32(result) + 1 
                : 1;

            var boxId = $"BOX-{store}-{nextSeq:D3}";
            ErrorLogService.LogInfo($"SortBoxDataService: Generated Box ID '{boxId}' for store '{store}'");
            return boxId;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"SortBoxDataService: Error generating Box ID for store '{store}'", ex);
            // Fallback: use timestamp-based ID
            var timestamp = DateTime.Now.ToString("yyyyMMddHHmmss");
            return $"BOX-{store}-{timestamp}";
        }
    }
}

