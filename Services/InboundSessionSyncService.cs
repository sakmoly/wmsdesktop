using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class InboundSessionSyncService
{
    /// <summary>
    /// Sync sessions from API to local database
    /// Only updates if connection is available, keeps existing data if not
    /// </summary>
    public static async Task<bool> SyncSessionsFromApiAsync(WmsSettings settings)
    {
        try
        {
            // Fetch sessions from API
            var apiSessions = await InboundSessionApiService.FetchSessionsFromApiAsync(settings);
            
            if (apiSessions == null || apiSessions.Count == 0)
            {
                ErrorLogService.LogInfo("InboundSessionSyncService: No sessions from API or API not available - keeping existing data");
                return false; // API not available, but that's OK - keep existing data
            }

            // Sync to database
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            int updatedCount = 0;
            int insertedCount = 0;

            // Track which sessions we're processing to detect duplicates in API response
            var processedSessions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            
            foreach (var apiSession in apiSessions)
            {
                try
                {
                    // Skip if we've already processed this session ID (duplicate in API response)
                    if (processedSessions.Contains(apiSession.InboundSession))
                    {
                        ErrorLogService.LogInfo($"InboundSessionSyncService: Skipping duplicate session in API response: {apiSession.InboundSession}");
                        continue;
                    }
                    processedSessions.Add(apiSession.InboundSession);
                    
                    // Use INSERT ... ON DUPLICATE KEY UPDATE to upsert
                    var sql = @"INSERT INTO tabInboundSession 
                                (inbound_session, status, completed_cartons, total_cartons, asn_no, 
                                 transfer_order, dock, started_by, device_id, started_at, ended_at, completed_on)
                                VALUES 
                                (@inbound_session, @status, @completed_cartons, @total_cartons, @asn_no,
                                 @transfer_order, @dock, @started_by, @device_id, @started_at, @ended_at, @completed_on)
                                ON DUPLICATE KEY UPDATE
                                    status = VALUES(status),
                                    completed_cartons = VALUES(completed_cartons),
                                    total_cartons = VALUES(total_cartons),
                                    asn_no = VALUES(asn_no),
                                    transfer_order = VALUES(transfer_order),
                                    dock = VALUES(dock),
                                    started_by = VALUES(started_by),
                                    device_id = VALUES(device_id),
                                    started_at = VALUES(started_at),
                                    ended_at = VALUES(ended_at),
                                    completed_on = VALUES(completed_on),
                                    updated_at = CURRENT_TIMESTAMP";

                    await using var cmd = new MySqlCommand(sql, connection);
                    cmd.Parameters.AddWithValue("@inbound_session", apiSession.InboundSession);
                    cmd.Parameters.AddWithValue("@status", apiSession.Status);
                    cmd.Parameters.AddWithValue("@completed_cartons", apiSession.CompletedCartons);
                    cmd.Parameters.AddWithValue("@total_cartons", apiSession.TotalCartons);
                    cmd.Parameters.AddWithValue("@asn_no", apiSession.AsnNo);
                    cmd.Parameters.AddWithValue("@transfer_order", apiSession.TransferOrder ?? (object)DBNull.Value);
                    cmd.Parameters.AddWithValue("@dock", apiSession.Dock ?? (object)DBNull.Value);
                    cmd.Parameters.AddWithValue("@started_by", apiSession.StartedBy);
                    cmd.Parameters.AddWithValue("@device_id", apiSession.DeviceId);
                    cmd.Parameters.AddWithValue("@started_at", apiSession.StartedAt);
                    cmd.Parameters.AddWithValue("@ended_at", apiSession.EndedAt ?? (object)DBNull.Value);
                    cmd.Parameters.AddWithValue("@completed_on", apiSession.CompletedOn ?? (object)DBNull.Value);

                    var rowsAffected = await cmd.ExecuteNonQueryAsync();
                    
                    bool isNewSession = false;
                    if (rowsAffected == 1)
                    {
                        insertedCount++;
                        isNewSession = true;
                    }
                    else if (rowsAffected == 2)
                    {
                        updatedCount++;
                    }

                    // Automatically create Receiving transaction for new sessions
                    if (isNewSession && !string.IsNullOrEmpty(apiSession.AsnNo))
                    {
                        try
                        {
                            await WmsTransactionAutoCreateService.CreateReceivingTransactionFromSessionAsync(
                                settings,
                                apiSession.InboundSession,
                                apiSession.AsnNo,
                                apiSession.Dock,
                                apiSession.StartedBy);
                        }
                        catch (Exception txEx)
                        {
                            ErrorLogService.LogError($"InboundSessionSyncService: Error creating transaction for session {apiSession.InboundSession}: {txEx.Message}", txEx);
                            // Continue - transaction creation failure shouldn't stop session sync
                        }
                    }

                    // Sync unload lines - delete existing and insert fresh (to avoid duplicates)
                    if (apiSession.UnloadLines != null && apiSession.UnloadLines.Count > 0)
                    {
                        try
                        {
                            // Deduplicate unload lines from API response (in case API returns duplicates)
                            // Keep only the first occurrence of each (parent_title, unit_type, unit_id) combination
                            var deduplicatedUnloadLines = apiSession.UnloadLines
                                .GroupBy(line => new { line.UnitType, line.UnitId })
                                .Select(group => group.First())
                                .ToList();

                            // Delete existing unload lines for this session
                            await using var deleteUnloadCmd = new MySqlCommand(@"
                                DELETE FROM tabInboundUnloadLine WHERE parent_title = @parent_title
                            ", connection);
                            deleteUnloadCmd.Parameters.AddWithValue("@parent_title", apiSession.InboundSession);
                            await deleteUnloadCmd.ExecuteNonQueryAsync();

                            // Insert deduplicated unload lines using UPSERT (works with or without unique key constraint)
                            foreach (var unloadLine in deduplicatedUnloadLines)
                            {
                                // Use INSERT ... ON DUPLICATE KEY UPDATE for UPSERT
                                // If unique key exists, this prevents duplicates
                                // If unique key doesn't exist, deduplication above prevents duplicates
                                await using var unloadCmd = new MySqlCommand(@"
                                    INSERT INTO tabInboundUnloadLine 
                                    (parent_title, unit_type, unit_id, scanned_on, scanned_by)
                                    VALUES (@parent_title, @unit_type, @unit_id, @scanned_on, @scanned_by)
                                    ON DUPLICATE KEY UPDATE
                                        scanned_on = VALUES(scanned_on),
                                        scanned_by = VALUES(scanned_by),
                                        updated_at = CURRENT_TIMESTAMP
                                ", connection);
                                
                                unloadCmd.Parameters.AddWithValue("@parent_title", apiSession.InboundSession);
                                unloadCmd.Parameters.AddWithValue("@unit_type", unloadLine.UnitType);
                                unloadCmd.Parameters.AddWithValue("@unit_id", unloadLine.UnitId);
                                unloadCmd.Parameters.AddWithValue("@scanned_on", unloadLine.ScannedOn);
                                unloadCmd.Parameters.AddWithValue("@scanned_by", unloadLine.ScannedBy);
                                
                                await unloadCmd.ExecuteNonQueryAsync();
                            }
                        }
                        catch (Exception unloadEx)
                        {
                            ErrorLogService.LogError($"InboundSessionSyncService: Error syncing unload lines for session {apiSession.InboundSession}: {unloadEx.Message}", unloadEx);
                            // Continue with receive lines
                        }
                    }

                    // Sync receive lines - delete existing and insert fresh (to avoid duplicates)
                    // Filter to only sync receive lines for cartons that have been unloaded
                    if (apiSession.ReceiveLines != null)
                    {
                        try
                        {
                            // Get unloaded carton IDs from the database (unload lines were just synced above)
                            // Query unload lines that were just synced to get the list of unloaded cartons
                            var unloadedCartonIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            
                            if (apiSession.UnloadLines != null && apiSession.UnloadLines.Count > 0)
                            {
                                // Use unload lines from API response if available
                                foreach (var unloadLine in apiSession.UnloadLines)
                                {
                                    if (unloadLine.UnitType == "Carton")
                                    {
                                        unloadedCartonIds.Add(unloadLine.UnitId);
                                    }
                                }
                            }
                            else
                            {
                                // Fallback: Query from database if API response doesn't have unload lines
                                await using var unloadQueryCmd = new MySqlCommand(@"
                                    SELECT DISTINCT unit_id 
                                    FROM tabInboundUnloadLine 
                                    WHERE parent_title = @parent_title AND unit_type = 'Carton'
                                ", connection);
                                unloadQueryCmd.Parameters.AddWithValue("@parent_title", apiSession.InboundSession);
                                
                                await using var unloadQueryReader = await unloadQueryCmd.ExecuteReaderAsync();
                                while (await unloadQueryReader.ReadAsync())
                                {
                                    unloadedCartonIds.Add(unloadQueryReader.GetString(0));
                                }
                                await unloadQueryReader.CloseAsync();
                            }

                            // Filter receive lines to only include those for unloaded cartons
                            var filteredReceiveLines = apiSession.ReceiveLines
                                .Where(r => unloadedCartonIds.Contains(r.CartonId))
                                .ToList();

                            ErrorLogService.LogInfo($"InboundSessionSyncService: Filtering receive lines for session {apiSession.InboundSession} - {apiSession.ReceiveLines.Count} total, {unloadedCartonIds.Count} unloaded cartons, {filteredReceiveLines.Count} filtered");

                            // Delete existing receive lines for this session
                            await using var deleteReceiveCmd = new MySqlCommand(@"
                                DELETE FROM tabInboundReceiveLine WHERE parent_title = @parent_title
                            ", connection);
                            deleteReceiveCmd.Parameters.AddWithValue("@parent_title", apiSession.InboundSession);
                            await deleteReceiveCmd.ExecuteNonQueryAsync();

                            // Insert filtered receive lines
                            if (filteredReceiveLines.Count > 0)
                            {
                                foreach (var receiveLine in filteredReceiveLines)
                                {
                                    await using var receiveCmd = new MySqlCommand(@"
                                        INSERT INTO tabInboundReceiveLine 
                                        (parent_title, carton_id, item_code, expected_qty, received_qty, `condition`, remarks)
                                        VALUES (@parent_title, @carton_id, @item_code, @expected_qty, @received_qty, @condition, @remarks)
                                    ", connection);
                                    
                                    receiveCmd.Parameters.AddWithValue("@parent_title", apiSession.InboundSession);
                                    receiveCmd.Parameters.AddWithValue("@carton_id", receiveLine.CartonId);
                                    receiveCmd.Parameters.AddWithValue("@item_code", receiveLine.ItemCode);
                                    receiveCmd.Parameters.AddWithValue("@expected_qty", receiveLine.ExpectedQty);
                                    receiveCmd.Parameters.AddWithValue("@received_qty", receiveLine.ReceivedQty);
                                    receiveCmd.Parameters.AddWithValue("@condition", receiveLine.Condition);
                                    receiveCmd.Parameters.AddWithValue("@remarks", receiveLine.Remarks ?? (object)DBNull.Value);
                                    
                                    await receiveCmd.ExecuteNonQueryAsync();
                                }
                            }
                        }
                        catch (Exception receiveEx)
                        {
                            ErrorLogService.LogError($"InboundSessionSyncService: Error syncing receive lines for session {apiSession.InboundSession}: {receiveEx.Message}", receiveEx);
                            // Continue with next session
                        }
                    }
                }
                catch (Exception ex)
                {
                    ErrorLogService.LogError($"InboundSessionSyncService: Error syncing session {apiSession.InboundSession}: {ex.Message}", ex);
                    // Continue with other sessions
                }
            }

            ErrorLogService.LogInfo($"InboundSessionSyncService: Synced {apiSessions.Count} sessions (Inserted: {insertedCount}, Updated: {updatedCount})");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"InboundSessionSyncService: Error syncing sessions: {ex.Message}", ex);
            return false; // Failed, but keep existing data
        }
    }
}

