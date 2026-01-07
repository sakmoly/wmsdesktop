using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class PutawayTaskDataService
{
    /// <summary>
    /// Get all Putaway Tasks from database
    /// </summary>
    public static async Task<List<PutawayTask>> GetPutawayTasksAsync(WmsSettings settings)
    {
        var tasks = new List<PutawayTask>();
        
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if source_type, transfer_in, and location_id columns exist
            var hasSourceType = await CheckColumnExistsAsync(connection, "tabPutawayTask", "source_type");
            var hasTransferIn = await CheckColumnExistsAsync(connection, "tabPutawayTask", "transfer_in");
            var hasTaskLocationId = await CheckColumnExistsAsync(connection, "tabPutawayTask", "location_id");

            // Build query based on column existence
            string sourceTypeColumn = hasSourceType ? "COALESCE(source_type, 'ASN') as source_type," : "'ASN' as source_type,";
            string transferInColumn = hasTransferIn ? "transfer_in," : "NULL as transfer_in,";
            string locationIdColumn = hasTaskLocationId ? "pt.location_id," : "NULL as location_id,";
            string locationIdGroupBy = hasTaskLocationId ? "pt.location_id," : "";
            
            // Get unique tasks by title, selecting the most recent one (by updated_at, then created_at)
            // This prevents duplicate tasks from appearing in the list when there are multiple rows with same title
            // Since title is the PRIMARY KEY, we use a subquery to get the most recent row per title
            // If multiple rows have the same max_date, we use LIMIT 1 in a subquery to pick one
            // Note: rack and bin are NOT in tabPutawayTask - they are only in tabPutawayLine
            var taskSql = $@"SELECT pt.title, 
                                   pt.status,
                                   {sourceTypeColumn}
                                   pt.advance_shipping_notice, 
                                   {transferInColumn}
                                   pt.inbound_session, 
                                   pt.created_by,
                                   {locationIdColumn}
                                   NULL as rack,
                                   NULL as bin
                            FROM tabPutawayTask pt
                            INNER JOIN (
                                SELECT title, 
                                       MAX(COALESCE(updated_at, created_at)) as max_date
                                FROM tabPutawayTask
                                GROUP BY title
                            ) latest ON pt.title = latest.title 
                                AND COALESCE(pt.updated_at, pt.created_at) = latest.max_date
                            GROUP BY pt.title, pt.status, pt.advance_shipping_notice, pt.inbound_session, pt.created_by{(!string.IsNullOrEmpty(locationIdGroupBy) ? ", " + locationIdGroupBy : "")}
                            ORDER BY pt.title";
            
            await using var taskCmd = new MySqlCommand(taskSql, connection);
            await using var taskReader = await taskCmd.ExecuteReaderAsync();

            var taskTitles = new List<string>(); // List to store unique task titles for querying lines
            var seenTitles = new HashSet<string>(); // Additional deduplication check
            
            while (await taskReader.ReadAsync())
            {
                try
                {
                    var title = taskReader.GetString(0);
                    
                    // Skip if we've already seen this title (defensive check)
                    if (seenTitles.Contains(title))
                    {
                        ErrorLogService.LogInfo($"PutawayTaskDataService: Skipping duplicate task {title}");
                        continue;
                    }
                    
                    seenTitles.Add(title);
                    taskTitles.Add(title);
                    
                    var status = taskReader.GetString(1);
                    var sourceType = taskReader.GetString(2);
                    var asn = taskReader.IsDBNull(3) ? null : taskReader.GetString(3);
                    var transferIn = taskReader.IsDBNull(4) ? null : taskReader.GetString(4);
                    var inboundSession = taskReader.GetString(5);
                    var createdBy = taskReader.GetString(6);
                    var locationId = taskReader.IsDBNull(7) ? null : taskReader.GetString(7);
                    
                    // For task level, location_id comes directly from the column (no construction from rack+bin needed)
                    // rack and bin are only at the line level (tabPutawayLine), not at task level (tabPutawayTask)
                    string? finalLocationId = locationId;
                    
                    tasks.Add(new PutawayTask
                    {
                        Title = title,
                        Status = status,
                        SourceType = sourceType,
                        AdvanceShippingNotice = sourceType == "ASN" ? asn : null,
                        TransferIn = sourceType == "TransferIn" ? transferIn : null,
                        InboundSession = inboundSession,
                        CreatedBy = createdBy,
                        LocationId = finalLocationId
                    });
                    
                    ErrorLogService.LogInfo($"PutawayTaskDataService: Loaded task {title} with status {status}");
                }
                catch (Exception ex)
                {
                    ErrorLogService.LogError($"PutawayTaskDataService: Error reading putaway task row", ex);
                    // Continue to next row
                }
            }

            await taskReader.CloseAsync();

            // Get Putaway Lines for each task
            if (taskTitles.Count > 0)
            {
                // Check if location_id column exists in tabPutawayLine
                var hasLineLocationId = await CheckColumnExistsAsync(connection, "tabPutawayLine", "location_id");
                
                var placeholders = string.Join(",", taskTitles.Select((_, i) => $"@title{i}"));
                string lineLocationIdColumn = hasLineLocationId ? "pl.location_id" : "NULL as location_id";
                
                // Build SQL query - GROUP BY and SUM qty to aggregate duplicate lines with same carton/item/rack/bin
                var linesSql = hasLineLocationId
                    ? $@"SELECT pl.parent_title, pl.carton_id, pl.item_code, SUM(pl.qty) as qty, pl.rack, pl.bin, pl.location_id
                         FROM tabPutawayLine pl
                         WHERE pl.parent_title IN ({placeholders})
                         GROUP BY pl.parent_title, pl.carton_id, pl.item_code, pl.rack, pl.bin, pl.location_id
                         ORDER BY pl.parent_title, pl.item_code"
                    : $@"SELECT pl.parent_title, pl.carton_id, pl.item_code, SUM(pl.qty) as qty, pl.rack, pl.bin, NULL as location_id
                         FROM tabPutawayLine pl
                         WHERE pl.parent_title IN ({placeholders})
                         GROUP BY pl.parent_title, pl.carton_id, pl.item_code, pl.rack, pl.bin
                         ORDER BY pl.parent_title, pl.item_code";
                
                ErrorLogService.LogInfo($"PutawayTaskDataService: SQL Query: {linesSql}");
                
                await using var linesCmd = new MySqlCommand(linesSql, connection);
                for (int i = 0; i < taskTitles.Count; i++)
                {
                    linesCmd.Parameters.AddWithValue($"@title{i}", taskTitles[i]);
                }
                
                await using var linesReader = await linesCmd.ExecuteReaderAsync();
                var linesDict = new Dictionary<string, List<PutawayLine>>();
                // Use a set to track unique line keys and prevent duplicates
                var seenLines = new HashSet<string>();
                
                ErrorLogService.LogInfo($"PutawayTaskDataService: Querying lines for {taskTitles.Count} tasks: {string.Join(", ", taskTitles)}");
                
                // Collect all lines first, then look up location_ids from tabLocation
                var linesData = new List<(string ParentTitle, string? CartonId, string ItemCode, double Qty, string Rack, string Bin, string? LocationId)>();
                
                int linesRead = 0;
                while (await linesReader.ReadAsync())
                {
                    var parentTitle = linesReader.GetString(0);
                    var cartonId = linesReader.IsDBNull(1) ? null : linesReader.GetString(1);
                    var itemCode = linesReader.GetString(2);
                    var qty = Convert.ToDouble(linesReader.GetDecimal(3));
                    var rack = linesReader.IsDBNull(4) ? string.Empty : linesReader.GetString(4);
                    var bin = linesReader.IsDBNull(5) ? string.Empty : linesReader.GetString(5);
                    var locationId = linesReader.IsDBNull(6) ? null : linesReader.GetString(6);
                    
                    linesData.Add((parentTitle, cartonId, itemCode, qty, rack, bin, locationId));
                    linesRead++;
                }
                await linesReader.CloseAsync();
                
                ErrorLogService.LogInfo($"PutawayTaskDataService: Read {linesData.Count} lines, now looking up location_ids from tabLocation");
                
                // Look up actual location_ids from tabLocation table
                foreach (var lineData in linesData)
                {
                    var (parentTitle, cartonId, itemCode, qty, rack, bin, locationId) = lineData;
                    
                    string? finalLocationId = locationId;
                    
                    // If location_id is null, try to find it in tabLocation by matching rack and bin
                    if (string.IsNullOrEmpty(finalLocationId) && (!string.IsNullOrEmpty(rack) || !string.IsNullOrEmpty(bin)))
                    {
                        // Try to find location_id in tabLocation table
                        var locationLookupSql = @"
                            SELECT location_id
                            FROM tabLocation
                            WHERE (parent_rack = @rack OR (@rack IS NULL AND parent_rack IS NULL))
                              AND (bin_id = @bin OR (@bin IS NULL AND bin_id IS NULL))
                            LIMIT 1";
                        
                        await using var locationCmd = new MySqlCommand(locationLookupSql, connection);
                        locationCmd.Parameters.AddWithValue("@rack", string.IsNullOrEmpty(rack) ? (object)DBNull.Value : rack.Trim());
                        locationCmd.Parameters.AddWithValue("@bin", string.IsNullOrEmpty(bin) ? (object)DBNull.Value : bin.Trim());
                        await using var locationReader = await locationCmd.ExecuteReaderAsync();
                        
                        if (await locationReader.ReadAsync())
                        {
                            finalLocationId = locationReader.GetString(0);
                            ErrorLogService.LogInfo($"PutawayTaskDataService: Found location_id={finalLocationId} for rack='{rack}', bin='{bin}'");
                        }
                        await locationReader.CloseAsync();
                        
                        // If still not found, use constructed value as fallback
                        if (string.IsNullOrEmpty(finalLocationId))
                        {
                            if (!string.IsNullOrEmpty(rack) && !string.IsNullOrEmpty(bin))
                            {
                                finalLocationId = $"{rack}-{bin}";
                            }
                            else if (!string.IsNullOrEmpty(bin))
                            {
                                finalLocationId = bin;
                            }
                            else if (!string.IsNullOrEmpty(rack))
                            {
                                finalLocationId = rack;
                            }
                            ErrorLogService.LogInfo($"PutawayTaskDataService: Using fallback location_id={finalLocationId} for rack='{rack}', bin='{bin}'");
                        }
                    }
                    
                    if (!linesDict.ContainsKey(parentTitle))
                    {
                        linesDict[parentTitle] = new List<PutawayLine>();
                    }
                    
                    // Create a unique key: carton_id|item_code|rack|bin
                    var lineKey = $"{parentTitle}|{cartonId ?? "NULL"}|{itemCode}|{rack}|{bin}";
                    
                    // Skip if we've already seen this exact line (duplicate)
                    if (seenLines.Contains(lineKey))
                    {
                        ErrorLogService.LogInfo($"PutawayTaskDataService: Skipping duplicate line: {lineKey} (Qty: {qty})");
                        continue;
                    }
                    
                    seenLines.Add(lineKey);
                    linesRead++;
                    
                    linesDict[parentTitle].Add(new PutawayLine
                    {
                        CartonId = cartonId,
                        ItemCode = itemCode,
                        Qty = qty,
                        Rack = rack,
                        Bin = bin,
                        LocationId = finalLocationId
                    });
                    
                    ErrorLogService.LogInfo($"PutawayTaskDataService: Added line for {parentTitle}: {itemCode} (Qty: {qty}, Carton: {cartonId ?? "NULL"})");
                }
                
                ErrorLogService.LogInfo($"PutawayTaskDataService: Total lines read from database: {linesRead}, Unique parent titles with lines: {linesDict.Keys.Count}");

                // Assign lines to tasks
                for (int i = 0; i < tasks.Count; i++)
                {
                    var task = tasks[i];
                    var lines = linesDict.ContainsKey(task.Title) ? linesDict[task.Title] : new List<PutawayLine>();
                    
                    ErrorLogService.LogInfo($"PutawayTaskDataService: Task {task.Title} has {lines.Count} line(s)");
                    
                    tasks[i] = new PutawayTask
                    {
                        Title = task.Title,
                        Status = task.Status,
                        SourceType = task.SourceType,
                        AdvanceShippingNotice = task.AdvanceShippingNotice,
                        TransferIn = task.TransferIn,
                        InboundSession = task.InboundSession,
                        CreatedBy = task.CreatedBy,
                        LocationId = task.LocationId,
                        Lines = lines
                    };
                }
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Putaway Tasks from database", ex);
        }

        ErrorLogService.LogInfo($"PutawayTaskDataService: Total tasks loaded: {tasks.Count}");
        return tasks;
    }

    /// <summary>
    /// Create Putaway Task from ASN (for items without Transfer Order or remaining items)
    /// </summary>
    public static async Task<bool> CreatePutawayTaskFromAsnAsync(
        WmsSettings settings,
        string asnNo,
        string inboundSessionTitle,
        string createdBy = "SYSTEM")
    {
        try
        {
            ErrorLogService.LogInfo($"PutawayTaskDataService: Creating Putaway Task from ASN {asnNo}");

            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if Putaway Task already exists for this ASN
            var hasSourceType = await CheckColumnExistsAsync(connection, "tabPutawayTask", "source_type");
            string checkSql = hasSourceType 
                ? @"SELECT COUNT(*) FROM tabPutawayTask 
                   WHERE advance_shipping_notice = @asnNo 
                   AND source_type = 'ASN'"
                : @"SELECT COUNT(*) FROM tabPutawayTask 
                   WHERE advance_shipping_notice = @asnNo";
            await using var checkCmd = new MySqlCommand(checkSql, connection);
            checkCmd.Parameters.AddWithValue("@asnNo", asnNo);
            var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;

            if (exists)
            {
                ErrorLogService.LogInfo($"PutawayTaskDataService: Putaway Task already exists for ASN {asnNo}");
                return true;
            }

            // Generate Putaway Task title
            var taskTitle = await GeneratePutawayTaskTitleAsync(connection);

            // Get ASN items
            var itemsSql = @"
                SELECT item_code, shipped_qty, carton_id
                FROM tabAsnItemDetails
                WHERE parent_title = @asnNo";

            await using var itemsCmd = new MySqlCommand(itemsSql, connection);
            itemsCmd.Parameters.AddWithValue("@asnNo", asnNo);
            await using var itemsReader = await itemsCmd.ExecuteReaderAsync();

            var items = new List<(string ItemCode, double Qty, string? CartonId)>();
            while (await itemsReader.ReadAsync())
            {
                items.Add((
                    itemsReader.GetString(0),
                    Convert.ToDouble(itemsReader.GetDecimal(1)),
                    itemsReader.IsDBNull(2) ? null : itemsReader.GetString(2)
                ));
            }
            await itemsReader.CloseAsync();

            if (items.Count == 0)
            {
                ErrorLogService.LogInfo($"PutawayTaskDataService: No items found in ASN {asnNo}");
                return false;
            }

            // Create Putaway Task
            string insertTaskSql = hasSourceType
                ? @"INSERT INTO tabPutawayTask 
                    (title, status, source_type, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
                   VALUES 
                    (@title, 'Draft', 'ASN', @asnNo, @inboundSession, @createdBy, NOW(), NOW())"
                : @"INSERT INTO tabPutawayTask 
                    (title, status, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
                   VALUES 
                    (@title, 'Draft', @asnNo, @inboundSession, @createdBy, NOW(), NOW())";

            await using var insertTaskCmd = new MySqlCommand(insertTaskSql, connection);
            insertTaskCmd.Parameters.AddWithValue("@title", taskTitle);
            insertTaskCmd.Parameters.AddWithValue("@asnNo", asnNo);
            insertTaskCmd.Parameters.AddWithValue("@inboundSession", inboundSessionTitle);
            insertTaskCmd.Parameters.AddWithValue("@createdBy", createdBy);
            await insertTaskCmd.ExecuteNonQueryAsync();

            // Create Putaway Lines (with default rack/bin - will be updated during putaway)
            var insertLineSql = @"
                INSERT INTO tabPutawayLine 
                    (parent_title, carton_id, item_code, qty, rack, bin, created_at, updated_at)
                VALUES 
                    (@parentTitle, @cartonId, @itemCode, @qty, 'TBD', 'TBD', NOW(), NOW())";

            foreach (var item in items)
            {
                await using var insertLineCmd = new MySqlCommand(insertLineSql, connection);
                insertLineCmd.Parameters.AddWithValue("@parentTitle", taskTitle);
                insertLineCmd.Parameters.AddWithValue("@cartonId", item.CartonId ?? (object)DBNull.Value);
                insertLineCmd.Parameters.AddWithValue("@itemCode", item.ItemCode);
                insertLineCmd.Parameters.AddWithValue("@qty", item.Qty);
                await insertLineCmd.ExecuteNonQueryAsync();
            }

            ErrorLogService.LogInfo($"PutawayTaskDataService: Successfully created Putaway Task {taskTitle} with {items.Count} items for ASN {asnNo}");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"PutawayTaskDataService: Error creating Putaway Task from ASN {asnNo}", ex);
            return false;
        }
    }

    /// <summary>
    /// Create Putaway Task for remaining items only (items not sorted to transfer orders)
    /// </summary>
    public static async Task<bool> CreatePutawayTaskForRemainingItemsAsync(
        WmsSettings settings,
        string asnNo,
        string inboundSessionTitle,
        Dictionary<string, double> remainingItems,
        string createdBy = "SYSTEM")
    {
        try
        {
            ErrorLogService.LogInfo($"PutawayTaskDataService: Creating Putaway Task for {remainingItems.Count} remaining items from ASN {asnNo}");

            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if Putaway Task already exists for this ASN
            var hasSourceType = await CheckColumnExistsAsync(connection, "tabPutawayTask", "source_type");
            string checkSql = hasSourceType 
                ? @"SELECT COUNT(*) FROM tabPutawayTask 
                   WHERE advance_shipping_notice = @asnNo 
                   AND source_type = 'ASN'
                   AND status IN ('Draft', 'Open', 'In Progress')"
                : @"SELECT COUNT(*) FROM tabPutawayTask 
                   WHERE advance_shipping_notice = @asnNo
                   AND status IN ('Draft', 'Open', 'In Progress')";
            await using var checkCmd = new MySqlCommand(checkSql, connection);
            checkCmd.Parameters.AddWithValue("@asnNo", asnNo);
            var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;

            if (exists)
            {
                ErrorLogService.LogInfo($"PutawayTaskDataService: Putaway Task already exists for ASN {asnNo}. Updating with remaining items.");
                // Update existing task instead of creating new one
                // Get existing task title
                string getTaskSql = hasSourceType
                    ? @"SELECT title FROM tabPutawayTask 
                       WHERE advance_shipping_notice = @asnNo 
                       AND source_type = 'ASN'
                       AND status IN ('Draft', 'Open', 'In Progress')
                       ORDER BY created_at DESC LIMIT 1"
                    : @"SELECT title FROM tabPutawayTask 
                       WHERE advance_shipping_notice = @asnNo
                       AND status IN ('Draft', 'Open', 'In Progress')
                       ORDER BY created_at DESC LIMIT 1";
                await using var getTaskCmd = new MySqlCommand(getTaskSql, connection);
                getTaskCmd.Parameters.AddWithValue("@asnNo", asnNo);
                var taskTitleResult = await getTaskCmd.ExecuteScalarAsync();
                
                // Ensure we handle DB nulls and only call when we have a non-empty title
                var taskTitle = taskTitleResult as string ?? (taskTitleResult == DBNull.Value ? null : taskTitleResult?.ToString());
                if (!string.IsNullOrEmpty(taskTitle))
                {
                    // Add remaining items to existing task
                    await AddRemainingItemsToTaskAsync(connection, taskTitle, remainingItems);
                    return true;
                }
            }

            // Generate Putaway Task title
            var newTaskTitle = await GeneratePutawayTaskTitleAsync(connection);

            // Create Putaway Task
            string insertTaskSql = hasSourceType
                ? @"INSERT INTO tabPutawayTask 
                    (title, status, source_type, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
                   VALUES 
                    (@title, 'Draft', 'ASN', @asnNo, @inboundSession, @createdBy, NOW(), NOW())"
                : @"INSERT INTO tabPutawayTask 
                    (title, status, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
                   VALUES 
                    (@title, 'Draft', @asnNo, @inboundSession, @createdBy, NOW(), NOW())";

            await using var insertTaskCmd = new MySqlCommand(insertTaskSql, connection);
            insertTaskCmd.Parameters.AddWithValue("@title", newTaskTitle);
            insertTaskCmd.Parameters.AddWithValue("@asnNo", asnNo);
            insertTaskCmd.Parameters.AddWithValue("@inboundSession", inboundSessionTitle);
            insertTaskCmd.Parameters.AddWithValue("@createdBy", createdBy);
            await insertTaskCmd.ExecuteNonQueryAsync();

            // Create Putaway Lines for remaining items only
            // Get carton_id from ASN items
            var insertLineSql = @"
                INSERT INTO tabPutawayLine 
                    (parent_title, carton_id, item_code, qty, rack, bin, created_at, updated_at)
                VALUES 
                    (@parentTitle, @cartonId, @itemCode, @qty, 'TBD', 'TBD', NOW(), NOW())";

            foreach (var remainingItem in remainingItems)
            {
                // Get carton_id from ASN item details (use first carton for this item)
                var cartonSql = @"
                    SELECT carton_id
                    FROM tabAsnItemDetails
                    WHERE parent_title = @asnNo
                      AND item_code = @itemCode
                    LIMIT 1";
                await using var cartonCmd = new MySqlCommand(cartonSql, connection);
                cartonCmd.Parameters.AddWithValue("@asnNo", asnNo);
                cartonCmd.Parameters.AddWithValue("@itemCode", remainingItem.Key);
                var cartonResult = await cartonCmd.ExecuteScalarAsync();
                var cartonId = cartonResult != null && !DBNull.Value.Equals(cartonResult) ? cartonResult.ToString() : null;

                await using var insertLineCmd = new MySqlCommand(insertLineSql, connection);
                insertLineCmd.Parameters.AddWithValue("@parentTitle", newTaskTitle);
                insertLineCmd.Parameters.AddWithValue("@cartonId", cartonId ?? (object)DBNull.Value);
                insertLineCmd.Parameters.AddWithValue("@itemCode", remainingItem.Key);
                insertLineCmd.Parameters.AddWithValue("@qty", remainingItem.Value);
                await insertLineCmd.ExecuteNonQueryAsync();
            }

            ErrorLogService.LogInfo($"PutawayTaskDataService: Successfully created Putaway Task {newTaskTitle} with {remainingItems.Count} remaining items for ASN {asnNo}");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"PutawayTaskDataService: Error creating Putaway Task for remaining items from ASN {asnNo}", ex);
            return false;
        }
    }

    /// <summary>
    /// Add remaining items to existing putaway task
    /// </summary>
    private static async Task AddRemainingItemsToTaskAsync(
        MySqlConnection connection,
        string taskTitle,
        Dictionary<string, double> remainingItems)
    {
        foreach (var item in remainingItems)
        {
            // Check if line already exists
            var checkLineSql = @"
                SELECT COUNT(*) FROM tabPutawayLine
                WHERE parent_title = @taskTitle
                  AND item_code = @itemCode";
            await using var checkLineCmd = new MySqlCommand(checkLineSql, connection);
            checkLineCmd.Parameters.AddWithValue("@taskTitle", taskTitle);
            checkLineCmd.Parameters.AddWithValue("@itemCode", item.Key);
            var lineExists = Convert.ToInt32(await checkLineCmd.ExecuteScalarAsync()) > 0;

            if (!lineExists)
            {
                // Add new line
                var insertLineSql = @"
                    INSERT INTO tabPutawayLine 
                        (parent_title, carton_id, item_code, qty, rack, bin, created_at, updated_at)
                    VALUES 
                        (@parentTitle, NULL, @itemCode, @qty, 'TBD', 'TBD', NOW(), NOW())";
                await using var insertLineCmd = new MySqlCommand(insertLineSql, connection);
                insertLineCmd.Parameters.AddWithValue("@parentTitle", taskTitle);
                insertLineCmd.Parameters.AddWithValue("@itemCode", item.Key);
                insertLineCmd.Parameters.AddWithValue("@qty", item.Value);
                await insertLineCmd.ExecuteNonQueryAsync();
            }
        }
    }

    /// <summary>
    /// Create Putaway Task from Transfer In
    /// </summary>
    public static async Task<bool> CreatePutawayTaskFromTransferInAsync(
        WmsSettings settings,
        string transferInTitle,
        string inboundSessionTitle,
        string createdBy = "SYSTEM")
    {
        try
        {
            ErrorLogService.LogInfo($"PutawayTaskDataService: Creating Putaway Task from Transfer In {transferInTitle}");

            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if Putaway Task already exists for this Transfer In
            var hasTransferIn = await CheckColumnExistsAsync(connection, "tabPutawayTask", "transfer_in");
            var hasSourceType = await CheckColumnExistsAsync(connection, "tabPutawayTask", "source_type");
            
            if (!hasTransferIn)
            {
                ErrorLogService.LogInfo($"PutawayTaskDataService: transfer_in column does not exist, skipping check for Transfer In {transferInTitle}");
                return false;
            }
            
            string checkSql = hasSourceType
                ? @"SELECT COUNT(*) FROM tabPutawayTask 
                   WHERE transfer_in = @transferIn 
                   AND source_type = 'TransferIn'"
                : @"SELECT COUNT(*) FROM tabPutawayTask 
                   WHERE transfer_in = @transferIn";
            await using var checkCmd = new MySqlCommand(checkSql, connection);
            checkCmd.Parameters.AddWithValue("@transferIn", transferInTitle);
            var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;

            if (exists)
            {
                ErrorLogService.LogInfo($"PutawayTaskDataService: Putaway Task already exists for Transfer In {transferInTitle}");
                return true;
            }

            // Generate Putaway Task title
            var taskTitle = await GeneratePutawayTaskTitleAsync(connection);

            // Get Transfer In items
            var itemsSql = @"
                SELECT item_code, qty, carton_id
                FROM tabTransferInItem
                WHERE parent_title = @transferIn";

            await using var itemsCmd = new MySqlCommand(itemsSql, connection);
            itemsCmd.Parameters.AddWithValue("@transferIn", transferInTitle);
            await using var itemsReader = await itemsCmd.ExecuteReaderAsync();

            var items = new List<(string ItemCode, double Qty, string? CartonId)>();
            while (await itemsReader.ReadAsync())
            {
                items.Add((
                    itemsReader.GetString(0),
                    Convert.ToDouble(itemsReader.GetDecimal(1)),
                    itemsReader.IsDBNull(2) ? null : itemsReader.GetString(2)
                ));
            }
            await itemsReader.CloseAsync();

            if (items.Count == 0)
            {
                ErrorLogService.LogInfo($"PutawayTaskDataService: No items found in Transfer In {transferInTitle}");
                return false;
            }

            // Create Putaway Task (hasTransferIn already checked above, hasSourceType already declared)
            string insertTaskSql = hasSourceType
                ? @"INSERT INTO tabPutawayTask 
                    (title, status, source_type, transfer_in, inbound_session, created_by, created_at, updated_at)
                   VALUES 
                    (@title, 'Draft', 'TransferIn', @transferIn, @inboundSession, @createdBy, NOW(), NOW())"
                : @"INSERT INTO tabPutawayTask 
                    (title, status, transfer_in, inbound_session, created_by, created_at, updated_at)
                   VALUES 
                    (@title, 'Draft', @transferIn, @inboundSession, @createdBy, NOW(), NOW())";

            await using var insertTaskCmd = new MySqlCommand(insertTaskSql, connection);
            insertTaskCmd.Parameters.AddWithValue("@title", taskTitle);
            insertTaskCmd.Parameters.AddWithValue("@transferIn", transferInTitle);
            insertTaskCmd.Parameters.AddWithValue("@inboundSession", inboundSessionTitle);
            insertTaskCmd.Parameters.AddWithValue("@createdBy", createdBy);
            await insertTaskCmd.ExecuteNonQueryAsync();

            // Create Putaway Lines (with default rack/bin - will be updated during putaway)
            var insertLineSql = @"
                INSERT INTO tabPutawayLine 
                    (parent_title, carton_id, item_code, qty, rack, bin, created_at, updated_at)
                VALUES 
                    (@parentTitle, @cartonId, @itemCode, @qty, 'TBD', 'TBD', NOW(), NOW())";

            foreach (var item in items)
            {
                await using var insertLineCmd = new MySqlCommand(insertLineSql, connection);
                insertLineCmd.Parameters.AddWithValue("@parentTitle", taskTitle);
                insertLineCmd.Parameters.AddWithValue("@cartonId", item.CartonId ?? (object)DBNull.Value);
                insertLineCmd.Parameters.AddWithValue("@itemCode", item.ItemCode);
                insertLineCmd.Parameters.AddWithValue("@qty", item.Qty);
                await insertLineCmd.ExecuteNonQueryAsync();
            }

            ErrorLogService.LogInfo($"PutawayTaskDataService: Successfully created Putaway Task {taskTitle} with {items.Count} items for Transfer In {transferInTitle}");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"PutawayTaskDataService: Error creating Putaway Task from Transfer In {transferInTitle}", ex);
            return false;
        }
    }

    /// <summary>
    /// Generate a unique Putaway Task title
    /// </summary>
    private static async Task<string> GeneratePutawayTaskTitleAsync(MySqlConnection connection)
    {
        var datePrefix = DateTime.Now.ToString("yyyyMMdd");
        var sql = @"
            SELECT COUNT(*) 
            FROM tabPutawayTask 
            WHERE title LIKE @pattern";

        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@pattern", $"PUT-{datePrefix}%");
        
        var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
        var sequence = (count + 1).ToString("D4");
        
        return $"PUT-{datePrefix}-{sequence}";
    }

    /// <summary>
    /// Check if a column exists in a table
    /// </summary>
    private static async Task<bool> CheckColumnExistsAsync(MySqlConnection connection, string tableName, string columnName)
    {
        try
        {
            var sql = @"
                SELECT COUNT(*) 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = @tableName 
                AND COLUMN_NAME = @columnName";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@tableName", tableName);
            cmd.Parameters.AddWithValue("@columnName", columnName);
            var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            return count > 0;
        }
        catch
        {
            return false;
        }
    }
}

