using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class InboundSessionDataService
{
    /// <summary>
    /// Get all Inbound Sessions from database
    /// </summary>
    public static async Task<List<InboundSession>> GetInboundSessionsAsync(WmsSettings settings)
    {
        var sessions = new List<InboundSession>();
        
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            ErrorLogService.LogInfo("Loading Inbound Sessions from database...");

            // Detect which schema is being used by checking which columns exist
            var schemaInfo = await DetectSchemaAsync(connection);
            ErrorLogService.LogInfo($"Detected schema: UsesNewSchema={schemaInfo.UsesNewSchema}, TitleColumn={schemaInfo.TitleColumn}, AsnColumn={schemaInfo.AsnColumn}, StartedColumn={schemaInfo.StartedColumn}, HasTransferIn={schemaInfo.HasTransferIn}");

            // Build query based on detected schema - use detected column names directly
            // Note: We use the detected column names, not hardcoded ones
            // Use DISTINCT to ensure no duplicate rows from the database
            // Conditionally include transfer_in column only if it exists
            string transferInColumn = schemaInfo.HasTransferIn ? "transfer_in," : "NULL as transfer_in,";
            string sessionSql = $@"SELECT DISTINCT
                                  {schemaInfo.TitleColumn} as session_title,
                                  status, 
                                  {schemaInfo.AsnColumn} as asn,
                                  {transferInColumn}
                                  transfer_order, 
                                  dock, 
                                  started_by, 
                                  {schemaInfo.StartedColumn} as started,
                                  COALESCE(completed_on, ended_at) as completed
                               FROM tabInboundSession
                               ORDER BY {schemaInfo.StartedColumn} DESC, {schemaInfo.TitleColumn}";
            
            ErrorLogService.LogInfo($"Executing query: {sessionSql}");
            
            await using var sessionCmd = new MySqlCommand(sessionSql, connection);
            await using var sessionReader = await sessionCmd.ExecuteReaderAsync();

            var sessionTitles = new List<string>();
            var seenTitles = new HashSet<string>(StringComparer.OrdinalIgnoreCase); // Prevent duplicates
            int rowCount = 0;
            while (await sessionReader.ReadAsync())
            {
                rowCount++;
                var title = sessionReader.GetString(0);
                
                // Skip if we've already seen this session title (prevent duplicates)
                if (seenTitles.Contains(title))
                {
                    ErrorLogService.LogInfo($"Skipping duplicate session: {title}");
                    continue;
                }
                
                seenTitles.Add(title);
                sessionTitles.Add(title);
                
                // Handle ASN column - can be NULL for Transfer In-based sessions
                var asn = sessionReader.IsDBNull(2) ? string.Empty : sessionReader.GetString(2);
                var transferIn = sessionReader.IsDBNull(3) ? null : sessionReader.GetString(3);
                
                sessions.Add(new InboundSession
                {
                    Title = title,
                    Status = sessionReader.GetString(1),
                    AdvanceShippingNotice = asn,
                    TransferIn = transferIn,
                    TransferOrder = sessionReader.IsDBNull(4) ? null : sessionReader.GetString(4),
                    Dock = sessionReader.IsDBNull(5) ? null : sessionReader.GetString(5),
                    StartedBy = sessionReader.GetString(6),
                    StartedOn = sessionReader.GetDateTime(7),
                    CompletedOn = sessionReader.IsDBNull(8) ? null : (DateTime?)sessionReader.GetDateTime(8)
                });
            }

            await sessionReader.CloseAsync();
            ErrorLogService.LogInfo($"Loaded {rowCount} inbound sessions from database");

            // Get Unload Lines
            if (sessionTitles.Count > 0)
            {
                var placeholders = string.Join(",", sessionTitles.Select((_, i) => $"@title{i}"));
                var unloadSql = $@"SELECT parent_title, unit_type, unit_id, scanned_on, scanned_by
                                   FROM tabInboundUnloadLine
                                   WHERE parent_title IN ({placeholders})
                                   ORDER BY parent_title, scanned_on";
                
                await using var unloadCmd = new MySqlCommand(unloadSql, connection);
                for (int i = 0; i < sessionTitles.Count; i++)
                {
                    unloadCmd.Parameters.AddWithValue($"@title{i}", sessionTitles[i]);
                }
                
                await using var unloadReader = await unloadCmd.ExecuteReaderAsync();
                var unloadDict = new Dictionary<string, List<InboundUnloadLine>>();
                
                while (await unloadReader.ReadAsync())
                {
                    var parentTitle = unloadReader.GetString(0);
                    if (!unloadDict.ContainsKey(parentTitle))
                    {
                        unloadDict[parentTitle] = new List<InboundUnloadLine>();
                    }

                    unloadDict[parentTitle].Add(new InboundUnloadLine
                    {
                        UnitType = unloadReader.GetString(1),
                        UnitId = unloadReader.GetString(2),
                        ScannedOn = unloadReader.GetDateTime(3),
                        ScannedBy = unloadReader.GetString(4)
                    });
                }

                await unloadReader.CloseAsync();

                // Get Receive Lines - Filter to only include cartons that have been unloaded
                // Join with unload lines to filter receive lines by unloaded cartons
                var receiveSql = $@"SELECT DISTINCT r.parent_title, r.carton_id, r.item_code, r.expected_qty, 
                                           r.received_qty, r.`condition`, r.remarks
                                    FROM tabInboundReceiveLine r
                                    INNER JOIN tabInboundUnloadLine u 
                                        ON r.parent_title = u.parent_title 
                                        AND r.carton_id = u.unit_id 
                                        AND u.unit_type = 'Carton'
                                    WHERE r.parent_title IN ({placeholders})
                                    ORDER BY r.parent_title, r.carton_id, r.item_code";
                
                await using var receiveCmd = new MySqlCommand(receiveSql, connection);
                for (int i = 0; i < sessionTitles.Count; i++)
                {
                    receiveCmd.Parameters.AddWithValue($"@title{i}", sessionTitles[i]);
                }
                
                ErrorLogService.LogInfo($"Executing receive lines query with INNER JOIN filter: {receiveSql.Substring(0, Math.Min(200, receiveSql.Length))}...");
                await using var receiveReader = await receiveCmd.ExecuteReaderAsync();
                var receiveDict = new Dictionary<string, List<InboundReceiveLine>>();
                int totalReceiveLinesFetched = 0;
                
                while (await receiveReader.ReadAsync())
                {
                    totalReceiveLinesFetched++;
                    var parentTitle = receiveReader.GetString(0);
                    var cartonId = receiveReader.GetString(1);
                    if (!receiveDict.ContainsKey(parentTitle))
                    {
                        receiveDict[parentTitle] = new List<InboundReceiveLine>();
                    }

                    receiveDict[parentTitle].Add(new InboundReceiveLine
                    {
                        CartonId = cartonId,
                        ItemCode = receiveReader.GetString(2),
                        ExpectedQty = Convert.ToDouble(receiveReader.GetDecimal(3)),
                        ReceivedQty = Convert.ToDouble(receiveReader.GetDecimal(4)),
                        Condition = receiveReader.GetString(5),
                        Remarks = receiveReader.IsDBNull(6) ? null : receiveReader.GetString(6)
                    });
                    ErrorLogService.LogInfo($"InboundSessionDataService: Fetched receive line - Session: {parentTitle}, Carton: {cartonId}, Item: {receiveReader.GetString(2)}");
                }

                ErrorLogService.LogInfo($"InboundSessionDataService: Total receive lines fetched from database (after INNER JOIN filter): {totalReceiveLinesFetched}");

                // Assign lines to sessions
                for (int i = 0; i < sessions.Count; i++)
                {
                    var session = sessions[i];
                    var unloadLines = unloadDict.ContainsKey(session.Title) ? unloadDict[session.Title] : new List<InboundUnloadLine>();
                    var receiveLines = receiveDict.ContainsKey(session.Title) ? receiveDict[session.Title] : new List<InboundReceiveLine>();
                    
                    sessions[i] = new InboundSession
                    {
                        Title = session.Title,
                        Status = session.Status,
                        AdvanceShippingNotice = session.AdvanceShippingNotice,
                        TransferIn = session.TransferIn,
                        TransferOrder = session.TransferOrder,
                        Dock = session.Dock,
                        StartedBy = session.StartedBy,
                        StartedOn = session.StartedOn,
                        CompletedOn = session.CompletedOn,
                        UnloadLines = unloadLines,
                        ReceiveLines = receiveLines
                    };
                }
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"Error loading Inbound Sessions from database: {ex.Message}", ex);
        }

        ErrorLogService.LogInfo($"Returning {sessions.Count} inbound sessions");
        return sessions;
    }

    /// <summary>
    /// Detect which schema is being used by checking which columns exist
    /// </summary>
    private static async Task<(bool UsesNewSchema, string TitleColumn, string AsnColumn, string StartedColumn, bool HasTransferIn)> DetectSchemaAsync(MySqlConnection connection)
    {
        try
        {
            ErrorLogService.LogInfo("DetectSchemaAsync: Starting schema detection");
            
            // Check which columns exist
            var checkSql = @"
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'tabInboundSession' 
                AND COLUMN_NAME IN ('inbound_session', 'title', 'asn_no', 'advance_shipping_notice', 'started_at', 'started_on', 'transfer_in')";
            
            await using var cmd = new MySqlCommand(checkSql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();
            
            var existingColumns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            while (await reader.ReadAsync())
            {
                var columnName = reader.GetString(0);
                existingColumns.Add(columnName);
                ErrorLogService.LogInfo($"DetectSchemaAsync: Found column '{columnName}'");
            }

            // Determine schema based on which columns exist
            bool hasInboundSession = existingColumns.Contains("inbound_session");
            bool hasTitle = existingColumns.Contains("title");
            bool hasAsnNo = existingColumns.Contains("asn_no");
            bool hasAdvanceShippingNotice = existingColumns.Contains("advance_shipping_notice");
            bool hasStartedAt = existingColumns.Contains("started_at");
            bool hasStartedOn = existingColumns.Contains("started_on");
            bool hasTransferIn = existingColumns.Contains("transfer_in");

            ErrorLogService.LogInfo($"DetectSchemaAsync: hasInboundSession={hasInboundSession}, hasTitle={hasTitle}, hasAsnNo={hasAsnNo}, hasAdvanceShippingNotice={hasAdvanceShippingNotice}, hasStartedAt={hasStartedAt}, hasStartedOn={hasStartedOn}, hasTransferIn={hasTransferIn}");

            // Use only columns that actually exist - don't fallback to non-existent columns
            string titleColumn;
            string asnColumn;
            string startedColumn;
            
            if (hasInboundSession)
            {
                titleColumn = "inbound_session";
            }
            else if (hasTitle)
            {
                titleColumn = "title";
            }
            else
            {
                // Neither exists - this is an error condition, but default to new schema
                ErrorLogService.LogError("DetectSchemaAsync: Neither inbound_session nor title column found! Defaulting to inbound_session", null);
                titleColumn = "inbound_session";
            }

            if (hasAsnNo)
            {
                asnColumn = "asn_no";
            }
            else if (hasAdvanceShippingNotice)
            {
                asnColumn = "advance_shipping_notice";
            }
            else
            {
                ErrorLogService.LogError("DetectSchemaAsync: Neither asn_no nor advance_shipping_notice column found! Defaulting to asn_no", null);
                asnColumn = "asn_no";
            }

            if (hasStartedAt)
            {
                startedColumn = "started_at";
            }
            else if (hasStartedOn)
            {
                startedColumn = "started_on";
            }
            else
            {
                ErrorLogService.LogError("DetectSchemaAsync: Neither started_at nor started_on column found! Defaulting to started_at", null);
                startedColumn = "started_at";
            }
            
            bool usesNewSchema = hasInboundSession && hasAsnNo && hasStartedAt;

            ErrorLogService.LogInfo($"DetectSchemaAsync: Returning - UsesNewSchema={usesNewSchema}, TitleColumn={titleColumn}, AsnColumn={asnColumn}, StartedColumn={startedColumn}, HasTransferIn={hasTransferIn}");
            
            return (usesNewSchema, titleColumn, asnColumn, startedColumn, hasTransferIn);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"Error detecting schema: {ex.Message}, defaulting to new schema", ex);
            // Default to new schema names, assume transfer_in doesn't exist if detection fails
            return (true, "inbound_session", "asn_no", "started_at", false);
        }
    }
}

