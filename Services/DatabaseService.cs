using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class DatabaseService
{
    /// <summary>
    /// Test MySQL connection (tests server connectivity without requiring database to exist)
    /// </summary>
    public static async Task<bool> TestConnectionAsync(WmsSettings settings)
    {
        if (string.IsNullOrWhiteSpace(settings.DatabaseHost))
            return false;

        try
        {
            // Test connection to server without requiring database to exist
            var connectionString = BuildConnectionStringWithoutDatabase(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();
            
            return connection.State == ConnectionState.Open;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Database connection test failed", ex);
            return false;
        }
    }

    /// <summary>
    /// Create database and all required tables
    /// </summary>
    public static async Task<(bool Success, string ErrorMessage)> CreateDatabaseAndTablesAsync(WmsSettings settings)
    {
        try
        {
            // Step 1: Connect without database to create it
            var connectionStringWithoutDb = BuildConnectionStringWithoutDatabase(settings);
            await using var connection = new MySqlConnection(connectionStringWithoutDb);
            await connection.OpenAsync();

            // Step 2: Create database if not exists
            var createDbSql = $@"
                CREATE DATABASE IF NOT EXISTS `{settings.DatabaseName}` 
                CHARACTER SET utf8mb4 
                COLLATE utf8mb4_unicode_ci;";
            
            await using var createDbCmd = new MySqlCommand(createDbSql, connection);
            await createDbCmd.ExecuteNonQueryAsync();
            
            await connection.CloseAsync();

            // Step 3: Connect to the new database and create tables
            var connectionString = BuildConnectionString(settings);
            await using var dbConnection = new MySqlConnection(connectionString);
            await dbConnection.OpenAsync();

            // Get SQL script for all tables and execute statements
            var createTablesSql = GetCreateTablesScript();
            
            // Get all CREATE TABLE statements as individual SQL commands
            var statements = ExtractCreateTableStatements(createTablesSql);
            
            if (statements.Count == 0)
            {
                // Try alternative extraction method
                statements = ExtractCreateTableStatementsAlternative(createTablesSql);
            }
            
            if (statements.Count == 0)
            {
                var errorMsg = "No CREATE TABLE statements found in SQL script. Expected 17 tables.";
                ErrorLogService.LogError(errorMsg);
                return (false, errorMsg);
            }
            
            int successCount = 0;
            int totalStatements = statements.Count;
            string lastError = string.Empty;
            
            if (statements.Count < 17)
            {
                // Continue anyway, but note the discrepancy
                lastError = $"Warning: Only found {statements.Count} CREATE TABLE statements, expected 17. ";
            }
            
            foreach (var statement in statements)
            {
                await using var cmd = new MySqlCommand(statement, dbConnection);
                try
                {
                    await cmd.ExecuteNonQueryAsync();
                    successCount++;
                }
                catch (MySqlException ex) when (ex.Number == 1050) // Table already exists
                {
                    // Ignore table already exists errors - this is actually success
                    successCount++;
                    continue;
                }
                catch (MySqlException ex)
                {
                    var sqlPreview = statement.Length > 200 ? statement.Substring(0, 200) + "..." : statement;
                    lastError = $"Error executing SQL (Error Code: {ex.Number}): {ex.Message}\n\nSQL: {sqlPreview}";
                    ErrorLogService.LogError($"SQL Execution Error (Code: {ex.Number}): {ex.Message}\nSQL: {sqlPreview}", ex);
                    // Continue trying other statements but keep track of the error
                }
                catch (Exception ex)
                {
                    var sqlPreview = statement.Length > 200 ? statement.Substring(0, 200) + "..." : statement;
                    lastError = $"Unexpected error: {ex.Message}\n\nSQL: {sqlPreview}";
                    ErrorLogService.LogError($"Unexpected error executing SQL: {ex.Message}\nSQL: {sqlPreview}", ex);
                    // Continue trying other statements
                }
            }

            // If we processed statements but none succeeded, return error
            if (totalStatements > 0 && successCount == 0)
            {
                var errorMsg = lastError ?? "Failed to execute any SQL statements";
                ErrorLogService.LogError($"Database table creation failed: {errorMsg}. Executed: {successCount}/{totalStatements} statements.");
                return (false, errorMsg);
            }
            
            // Verify all tables were created
            var verificationResult = await VerifyAllTablesExistAsync(settings);
            if (!verificationResult.Success)
            {
                var errorMsg = $"Tables created but verification failed: {verificationResult.ErrorMessage}. Created: {successCount}/{totalStatements} tables.";
                ErrorLogService.LogError($"Table verification failed: {errorMsg}");
                return (false, errorMsg);
            }
            
            // If some statements failed, we still report success but with a warning
            if (!string.IsNullOrEmpty(lastError) && successCount < totalStatements)
            {
                return (true, $"Created database and {successCount} tables successfully. Warning: {lastError}");
            }

            return (true, $"Successfully created database and all {successCount} tables. All tables verified.");
        }
        catch (Exception ex)
        {
            var errorMsg = $"Database creation error: {ex.Message}";
            ErrorLogService.LogError(errorMsg, ex);
            return (false, errorMsg);
        }
    }

    /// <summary>
    /// Extract CREATE TABLE statements from SQL script
    /// Uses a more reliable approach: find CREATE TABLE, then find matching semicolon
    /// </summary>
    private static List<string> ExtractCreateTableStatements(string sqlScript)
    {
        var statements = new List<string>();
        
        // Find all occurrences of "CREATE TABLE" (case insensitive)
        var pattern = @"CREATE\s+TABLE";
        var matches = Regex.Matches(sqlScript, pattern, RegexOptions.IgnoreCase);
        
        foreach (Match match in matches)
        {
            // Start from the CREATE TABLE keyword
            int startPos = match.Index;
            
            // Find the matching semicolon (accounting for nested parentheses)
            int endPos = FindStatementEnd(sqlScript, startPos);
            
            if (endPos > startPos)
            {
                var statement = sqlScript.Substring(startPos, endPos - startPos + 1).Trim();
                if (!string.IsNullOrWhiteSpace(statement))
                {
                    statements.Add(statement);
                }
            }
        }
        
        return statements;
    }
    
    /// <summary>
    /// Find the end position of a SQL statement (semicolon outside of parentheses/strings)
    /// </summary>
    private static int FindStatementEnd(string sql, int startPos)
    {
        int parenDepth = 0;
        bool inSingleQuote = false;
        bool inDoubleQuote = false;
        bool inBacktick = false;
        bool escaped = false;
        
        for (int i = startPos; i < sql.Length; i++)
        {
            char current = sql[i];
            char prev = i > 0 ? sql[i - 1] : '\0';
            
            if (escaped)
            {
                escaped = false;
                continue;
            }
            
            if (current == '\\' && (inSingleQuote || inDoubleQuote))
            {
                escaped = true;
                continue;
            }
            
            // Handle string delimiters
            if (!inDoubleQuote && !inBacktick && current == '\'')
            {
                inSingleQuote = !inSingleQuote;
            }
            else if (!inSingleQuote && !inBacktick && current == '"')
            {
                inDoubleQuote = !inDoubleQuote;
            }
            else if (!inSingleQuote && !inDoubleQuote && current == '`')
            {
                inBacktick = !inBacktick;
            }
            // Handle parentheses (only when not in strings)
            else if (!inSingleQuote && !inDoubleQuote && !inBacktick)
            {
                if (current == '(')
                {
                    parenDepth++;
                }
                else if (current == ')')
                {
                    parenDepth--;
                }
                else if (current == ';' && parenDepth == 0)
                {
                    // Found the end of the statement
                    return i;
                }
            }
        }
        
        // If no semicolon found, return the end of the string
        return sql.Length - 1;
    }
    
    /// <summary>
    /// Alternative method to extract CREATE TABLE statements - simpler approach
    /// </summary>
    private static List<string> ExtractCreateTableStatementsAlternative(string sqlScript)
    {
        var statements = new List<string>();
        var lines = sqlScript.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
        var currentStatement = new System.Text.StringBuilder();
        bool inStatement = false;
        
        foreach (var line in lines)
        {
            var trimmedLine = line.Trim();
            
            // Skip pure comment lines
            if (trimmedLine.StartsWith("--") && !inStatement)
                continue;
            
            // Check if this line starts a CREATE TABLE statement
            if (trimmedLine.StartsWith("CREATE TABLE", StringComparison.OrdinalIgnoreCase))
            {
                if (inStatement)
                {
                    // Save previous statement if it exists
                    var prevStmt = currentStatement.ToString().Trim();
                    if (!string.IsNullOrWhiteSpace(prevStmt) && prevStmt.EndsWith(";"))
                    {
                        statements.Add(prevStmt);
                    }
                    currentStatement.Clear();
                }
                inStatement = true;
                currentStatement.AppendLine(trimmedLine);
            }
            else if (inStatement)
            {
                currentStatement.AppendLine(trimmedLine);
                
                // Check if this line ends the statement (contains ENGINE= and semicolon)
                if (trimmedLine.Contains("ENGINE=", StringComparison.OrdinalIgnoreCase) && 
                    trimmedLine.Contains(";"))
                {
                    var stmt = currentStatement.ToString().Trim();
                    if (!string.IsNullOrWhiteSpace(stmt))
                    {
                        statements.Add(stmt);
                    }
                    currentStatement.Clear();
                    inStatement = false;
                }
            }
        }
        
        // Add any remaining statement
        if (inStatement)
        {
            var stmt = currentStatement.ToString().Trim();
            if (!string.IsNullOrWhiteSpace(stmt))
            {
                // Ensure it ends with semicolon
                if (!stmt.EndsWith(";"))
                    stmt += ";";
                statements.Add(stmt);
            }
        }
        
        return statements;
    }

    /// <summary>
    /// Verify all required tables exist in the database
    /// </summary>
    private static async Task<(bool Success, string ErrorMessage)> VerifyAllTablesExistAsync(WmsSettings settings)
    {
        try
        {
            // Wait a moment for any ongoing transactions to complete
            await Task.Delay(500);
            
            var connectionString = BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var requiredTables = GetRequiredTableNames();
            
            // Use parameterized query to avoid SQL injection and handle table names properly
            var tableList = string.Join(",", requiredTables.Select(t => $"'{t}'"));
            var verifySql = $@"
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = @dbName 
                AND TABLE_NAME IN ({tableList})";
            
            await using var cmd = new MySqlCommand(verifySql, connection);
            cmd.Parameters.AddWithValue("@dbName", settings.DatabaseName);
            
            var existingTables = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var tableName = reader.GetString(0);
                existingTables.Add(tableName);
            }

            var missingTables = requiredTables.Where(t => !existingTables.Contains(t)).ToList();
            
            if (missingTables.Count > 0)
            {
                ErrorLogService.LogInfo($"Table verification: Found {existingTables.Count} tables, Missing {missingTables.Count} tables: {string.Join(", ", missingTables)}");
                return (false, $"Missing tables: {string.Join(", ", missingTables)}");
            }

            ErrorLogService.LogInfo($"Table verification successful: All {requiredTables.Length} tables exist.");
            return (true, string.Empty);
        }
        catch (Exception ex)
        {
            var errorMsg = $"Verification error: {ex.Message}";
            ErrorLogService.LogError($"Table verification error: {errorMsg}", ex);
            return (false, errorMsg);
        }
    }

    /// <summary>
    /// Get list of all required table names
    /// </summary>
    private static string[] GetRequiredTableNames()
    {
        return new[]
        {
            "tabAdvanceShippingNotice", "tabAsnItemDetails", "tabTransferOrder", "tabTransferOrderItem",
            "tabInboundSession", "tabInboundUnloadLine", "tabInboundReceiveLine",
            "tabSortBox", "tabTransferCarton", "tabWmsScanEvent",
            "tabPutawayTask", "tabPutawayLine", "tabReceivingCarton",
            "tabWmsTransaction", "tabWmsTransactionDetail",
            "tabItem", "tabWarehouse", "tabLocation", "tabUser", "tabDevice",
            "tabPurchaseOrder", "tabPurchaseOrderItem"
        };
    }

    /// <summary>
    /// Check if database and tables exist
    /// </summary>
    public static async Task CheckDatabaseStatusAsync(WmsSettings settings)
    {
        if (string.IsNullOrWhiteSpace(settings.DatabaseName))
        {
            settings.DatabaseExists = false;
            settings.TablesExist = false;
            return;
        }

        try
        {
            // First, connect without database to check if database exists
            var connectionStringWithoutDb = BuildConnectionStringWithoutDatabase(settings);
            await using var checkConnection = new MySqlConnection(connectionStringWithoutDb);
            await checkConnection.OpenAsync();

            // Check if database exists
            var dbExistsSql = @"
                SELECT COUNT(*) 
                FROM INFORMATION_SCHEMA.SCHEMATA 
                WHERE SCHEMA_NAME = @dbName";
            
            await using var dbCmd = new MySqlCommand(dbExistsSql, checkConnection);
            dbCmd.Parameters.AddWithValue("@dbName", settings.DatabaseName);
            var dbExists = Convert.ToInt32(await dbCmd.ExecuteScalarAsync()) > 0;
            
            settings.DatabaseExists = dbExists;

            if (!dbExists)
            {
                settings.TablesExist = false;
                await checkConnection.CloseAsync();
                return;
            }

            await checkConnection.CloseAsync();

            // If database exists, connect to it and check tables
            var connectionString = BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if required tables exist
            var requiredTables = GetRequiredTableNames();

            var placeholders = string.Join(",", requiredTables.Select(t => $"'{t}'"));
            var tablesExistSql = $@"
                SELECT COUNT(*) 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = @dbName 
                AND TABLE_NAME IN ({placeholders})";
            
            await using var tablesCmd = new MySqlCommand(tablesExistSql, connection);
            tablesCmd.Parameters.AddWithValue("@dbName", settings.DatabaseName);
            var tablesCount = Convert.ToInt32(await tablesCmd.ExecuteScalarAsync());
            
            settings.TablesExist = tablesCount >= requiredTables.Length;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error checking database status", ex);
            settings.DatabaseExists = false;
            settings.TablesExist = false;
        }
    }

    /// <summary>
    /// Build MySQL connection string
    /// </summary>
    public static string BuildConnectionString(WmsSettings settings)
    {
        var password = string.IsNullOrWhiteSpace(settings.DatabasePassword) 
            ? string.Empty 
            : settings.DatabasePassword;
        
        return $"Server={settings.DatabaseHost};" +
               $"Port={settings.DatabasePort};" +
               $"Database={settings.DatabaseName};" +
               $"Uid={settings.DatabaseUserName};" +
               $"Pwd={password};" +
               "CharSet=utf8mb4;";
    }

    /// <summary>
    /// Build MySQL connection string without database (for creating database)
    /// </summary>
    public static string BuildConnectionStringWithoutDatabase(WmsSettings settings)
    {
        var password = string.IsNullOrWhiteSpace(settings.DatabasePassword) 
            ? string.Empty 
            : settings.DatabasePassword;
        
        return $"Server={settings.DatabaseHost};" +
               $"Port={settings.DatabasePort};" +
               $"Uid={settings.DatabaseUserName};" +
               $"Pwd={password};" +
               "CharSet=utf8mb4;";
    }

    /// <summary>
    /// Get complete SQL script for creating all WMS tables
    /// </summary>
    private static string GetCreateTablesScript()
    {
        return @"
-- Advance Shipping Notice (Parent)
CREATE TABLE IF NOT EXISTS tabAdvanceShippingNotice (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft',
  purchase_order VARCHAR(100) NULL,
  supplier VARCHAR(100) NOT NULL,
  shipment_date DATE NOT NULL,
  expected_arrival_date DATE NOT NULL,
  total_shipped_qty DECIMAL(10,2) NOT NULL,
  airway_bill_no VARCHAR(100) NULL,
  shipment_type VARCHAR(50) NULL,
  updated_on TIMESTAMP NULL,
  payload_json LONGTEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_purchase_order (purchase_order),
  INDEX idx_supplier (supplier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ASN Item Details (Child Table)
CREATE TABLE IF NOT EXISTS tabAsnItemDetails (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  po_item_reference VARCHAR(100) NULL,
  shipped_qty DECIMAL(10,2) NOT NULL,
  carton_id VARCHAR(100) NULL,
  carton_assigned_status VARCHAR(50) DEFAULT 'Assigned',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_item_code (item_code),
  INDEX idx_carton_id (carton_id),
  FOREIGN KEY (parent_title) REFERENCES tabAdvanceShippingNotice(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transfer Order (Parent)
CREATE TABLE IF NOT EXISTS tabTransferOrder (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft',
  advance_shipping_notice VARCHAR(100) NOT NULL,
  from_warehouse VARCHAR(100) NOT NULL,
  prepared_by VARCHAR(100) NOT NULL,
  required_date DATE NULL,
  total_allocated_qty DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_asn (advance_shipping_notice),
  INDEX idx_status (status),
  INDEX idx_from_warehouse (from_warehouse)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transfer Order Item (Child Table)
CREATE TABLE IF NOT EXISTS tabTransferOrderItem (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  store VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  allocated_qty DECIMAL(10,2) NOT NULL,
  sorted_qty DECIMAL(10,2) DEFAULT 0,
  packed_qty DECIMAL(10,2) DEFAULT 0,
  pending_qty DECIMAL(10,2) DEFAULT 0,
  remarks TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_store (store),
  INDEX idx_item_code (item_code),
  FOREIGN KEY (parent_title) REFERENCES tabTransferOrder(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inbound Session (Parent)
CREATE TABLE IF NOT EXISTS tabInboundSession (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft',
  advance_shipping_notice VARCHAR(100) NOT NULL,
  transfer_order VARCHAR(100) NULL,
  dock VARCHAR(50) NULL,
  started_by VARCHAR(100) NOT NULL,
  started_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_on TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_asn (advance_shipping_notice),
  INDEX idx_status (status),
  INDEX idx_started_on (started_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inbound Unload Line (Child Table)
CREATE TABLE IF NOT EXISTS tabInboundUnloadLine (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  unit_type VARCHAR(50) NOT NULL,
  unit_id VARCHAR(100) NOT NULL,
  scanned_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  scanned_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_unit_id (unit_id),
  FOREIGN KEY (parent_title) REFERENCES tabInboundSession(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inbound Receive Line (Child Table)
CREATE TABLE IF NOT EXISTS tabInboundReceiveLine (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  carton_id VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  expected_qty DECIMAL(10,2) NOT NULL,
  received_qty DECIMAL(10,2) NOT NULL,
  `condition` VARCHAR(50) DEFAULT 'Good',
  remarks TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_carton_id (carton_id),
  INDEX idx_item_code (item_code),
  FOREIGN KEY (parent_title) REFERENCES tabInboundSession(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sort Box
CREATE TABLE IF NOT EXISTS tabSortBox (
  box_id VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Open',
  advance_shipping_notice VARCHAR(100) NOT NULL,
  transfer_order VARCHAR(100) NOT NULL,
  store VARCHAR(100) NOT NULL,
  purpose VARCHAR(50) DEFAULT 'STORE',
  created_by VARCHAR(100) NOT NULL,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_by VARCHAR(100) NULL,
  closed_on TIMESTAMP NULL,
  dispatched_on TIMESTAMP NULL,
  received_at_store_on TIMESTAMP NULL,
  updated_on TIMESTAMP NULL,
  remarks TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_asn (advance_shipping_notice),
  INDEX idx_store (store),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transfer Carton
CREATE TABLE IF NOT EXISTS tabTransferCarton (
  tc_id VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Created',
  advance_shipping_notice VARCHAR(100) NOT NULL,
  transfer_order VARCHAR(100) NOT NULL,
  store VARCHAR(100) NOT NULL,
  created_by VARCHAR(100) NOT NULL,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sealed_by VARCHAR(100) NULL,
  sealed_on TIMESTAMP NULL,
  dispatched_on TIMESTAMP NULL,
  updated_on TIMESTAMP NULL,
  remarks TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_asn (advance_shipping_notice),
  INDEX idx_store (store),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WMS Scan Event
CREATE TABLE IF NOT EXISTS tabWmsScanEvent (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  offline_uuid VARCHAR(36) UNIQUE NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_time TIMESTAMP NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  advance_shipping_notice VARCHAR(100) NULL,
  transfer_order VARCHAR(100) NULL,
  inbound_session VARCHAR(100) NULL,
  carton_id VARCHAR(100) NULL,
  item_code VARCHAR(100) NULL,
  qty DECIMAL(10,2) DEFAULT 1,
  store VARCHAR(100) NULL,
  box_id VARCHAR(100) NULL,
  tc_id VARCHAR(100) NULL,
  rack VARCHAR(100) NULL,
  bin VARCHAR(100) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_offline_uuid (offline_uuid),
  INDEX idx_event_type (event_type),
  INDEX idx_asn (advance_shipping_notice),
  INDEX idx_inbound_session (inbound_session),
  INDEX idx_event_time (event_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Putaway Task (Parent)
CREATE TABLE IF NOT EXISTS tabPutawayTask (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft',
  advance_shipping_notice VARCHAR(100) NOT NULL,
  inbound_session VARCHAR(100) NOT NULL,
  created_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_asn (advance_shipping_notice),
  INDEX idx_inbound_session (inbound_session),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Putaway Line (Child Table)
CREATE TABLE IF NOT EXISTS tabPutawayLine (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  carton_id VARCHAR(100) NULL,
  item_code VARCHAR(100) NOT NULL,
  qty DECIMAL(10,2) NOT NULL,
  rack VARCHAR(100) NOT NULL,
  bin VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_item_code (item_code),
  INDEX idx_rack_bin (rack, bin),
  FOREIGN KEY (parent_title) REFERENCES tabPutawayTask(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Receiving Carton (for concurrency control)
CREATE TABLE IF NOT EXISTS tabReceivingCarton (
  id INT AUTO_INCREMENT PRIMARY KEY,
  carton_id VARCHAR(100) NOT NULL,
  advance_shipping_notice VARCHAR(100) NOT NULL,
  inbound_session VARCHAR(100) NULL,
  status VARCHAR(50) DEFAULT 'Pending',
  opened_by VARCHAR(100) NULL,
  opened_on TIMESTAMP NULL,
  locked_by VARCHAR(100) NULL,
  locked_on TIMESTAMP NULL,
  received_by VARCHAR(100) NULL,
  received_on TIMESTAMP NULL,
  verified_by VARCHAR(100) NULL,
  verified_on TIMESTAMP NULL,
  updated_on TIMESTAMP NULL,
  remarks TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_carton_asn (carton_id, advance_shipping_notice),
  INDEX idx_asn (advance_shipping_notice),
  INDEX idx_inbound_session (inbound_session),
  INDEX idx_status (status),
  INDEX idx_locked_by (locked_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Item (Master Data)
CREATE TABLE IF NOT EXISTS tabItem (
  code VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  item_group VARCHAR(100) NULL,
  brand VARCHAR(100) NULL,
  default_uom VARCHAR(50) NULL,
  stock_uom VARCHAR(50) NULL,
  barcode VARCHAR(255) NULL,
  maintain_stock BOOLEAN DEFAULT TRUE,
  stock_qty DECIMAL(10,2) DEFAULT 0,
  reserved_qty DECIMAL(10,2) DEFAULT 0,
  updated_on TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_barcode (barcode),
  INDEX idx_item_group (item_group),
  INDEX idx_brand (brand)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Warehouse (Master Data)
CREATE TABLE IF NOT EXISTS tabWarehouse (
  code VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  warehouse_type VARCHAR(50) NULL,
  is_group BOOLEAN DEFAULT FALSE,
  parent_warehouse VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_warehouse)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Location (Master Data - bin-level locations)
CREATE TABLE IF NOT EXISTS tabLocation (
  location_id VARCHAR(100) PRIMARY KEY,
  warehouse VARCHAR(100) NOT NULL,
  zone VARCHAR(100) NULL,
  aisle VARCHAR(100) NULL,
  parent_rack VARCHAR(100) NULL,
  level VARCHAR(50) NULL,
  bin_id VARCHAR(100) NULL,
  location_type VARCHAR(50) NULL,
  location_type_detailed VARCHAR(100) NULL,
  is_available BOOLEAN DEFAULT TRUE,
  capacity_volume_weight DECIMAL(10,2) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_warehouse (warehouse),
  INDEX idx_zone (zone),
  INDEX idx_aisle (aisle),
  INDEX idx_parent_rack (parent_rack)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User (Master Data)
CREATE TABLE IF NOT EXISTS tabUser (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NULL,
  role VARCHAR(50) DEFAULT 'operator',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_code (user_code),
  INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Device (Master Data)
CREATE TABLE IF NOT EXISTS tabDevice (
  device_id VARCHAR(100) PRIMARY KEY,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_sync_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_last_seen (last_seen),
  INDEX idx_last_sync (last_sync_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Purchase Order (Parent)
CREATE TABLE IF NOT EXISTS tabPurchaseOrder (
  po_id VARCHAR(100) PRIMARY KEY,
  doc_status INT NOT NULL DEFAULT 1,
  transaction_date DATE NOT NULL,
  expected_delivery_date DATE NULL,
  supplier_id VARCHAR(100) NOT NULL,
  supplier_name VARCHAR(255) NOT NULL,
  shipping_address TEXT NULL,
  status VARCHAR(50) DEFAULT 'Open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_supplier_id (supplier_id),
  INDEX idx_transaction_date (transaction_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Purchase Order Item (Child Table)
CREATE TABLE IF NOT EXISTS tabPurchaseOrderItem (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_po_id VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  ordered_qty DECIMAL(10,2) NOT NULL,
  received_qty DECIMAL(10,2) DEFAULT 0,
  uom VARCHAR(50) NOT NULL,
  target_warehouse VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_po_id),
  INDEX idx_item_code (item_code),
  INDEX idx_target_warehouse (target_warehouse),
  FOREIGN KEY (parent_po_id) REFERENCES tabPurchaseOrder(po_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WMS Transaction (Parent)
CREATE TABLE IF NOT EXISTS tabWmsTransaction (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft',
  operation_type VARCHAR(50) NOT NULL,
  transaction_date TIMESTAMP NOT NULL,
  assigned_to VARCHAR(100) NULL,
  source_warehouse VARCHAR(100) NULL,
  target_warehouse VARCHAR(100) NULL,
  reference_doc_type VARCHAR(100) NULL,
  reference_doc VARCHAR(100) NULL,
  transaction_status VARCHAR(50) DEFAULT 'Draft',
  primary_assignee VARCHAR(100) NULL,
  completion_progress DECIMAL(5,2) DEFAULT 0,
  is_locked BOOLEAN DEFAULT FALSE,
  receiving_dock VARCHAR(100) NULL,
  require_qc BOOLEAN DEFAULT FALSE,
  putaway_strategy VARCHAR(100) NULL,
  suggest_bins BOOLEAN DEFAULT TRUE,
  picking_wave VARCHAR(100) NULL,
  pick_route VARCHAR(100) NULL,
  cycle_count_zone VARCHAR(100) NULL,
  freeze_stock_during_count BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_operation_type (operation_type),
  INDEX idx_transaction_status (transaction_status),
  INDEX idx_reference_doc (reference_doc),
  INDEX idx_assigned_to (assigned_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WMS Transaction Detail (Child Table)
CREATE TABLE IF NOT EXISTS tabWmsTransactionDetail (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  item_name VARCHAR(255) NULL,
  qty DECIMAL(10,2) NOT NULL,
  uom VARCHAR(50) DEFAULT 'Nos',
  container_id VARCHAR(100) NULL,
  source_bin VARCHAR(100) NULL,
  target_bin VARCHAR(100) NULL,
  actual_qty_counted DECIMAL(10,2) NULL,
  discrepancy DECIMAL(10,2) NULL,
  assignment_status VARCHAR(50) DEFAULT 'Pending',
  assigned_operator VARCHAR(100) NULL,
  actual_completion_time TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_item_code (item_code),
  INDEX idx_assignment_status (assignment_status),
  INDEX idx_assigned_operator (assigned_operator),
  FOREIGN KEY (parent_title) REFERENCES tabWmsTransaction(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
";
    }
}
