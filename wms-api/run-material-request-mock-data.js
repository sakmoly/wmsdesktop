// Script to automatically insert Material Request mock data
// Uses the same database connection as the API

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

async function runSqlScript() {
    console.log('==========================================');
    console.log('Material Request Mock Data Insertion');
    console.log('==========================================\n');

    try {
        // Get database connection from environment
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'root',
            database: process.env.DB_NAME || 'wms_desktop',
            multipleStatements: true
        });

        console.log(`✅ Connected to database: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '3306'}/${process.env.DB_NAME || 'wms_desktop'}\n`);

        // Check and create tables if they don't exist
        console.log("🔍 Checking if tables exist...\n");
        
        const createTablesSQL = `
-- Material Request Table
CREATE TABLE IF NOT EXISTS tabMaterialRequest (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft',
  from_warehouse VARCHAR(100) NOT NULL,
  to_showroom VARCHAR(100) NOT NULL,
  requested_date DATE NOT NULL,
  required_date DATE NULL,
  requested_by VARCHAR(100) NOT NULL,
  total_requested_qty DECIMAL(10,2) DEFAULT 0,
  total_picked_qty DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_from_warehouse (from_warehouse),
  INDEX idx_to_showroom (to_showroom),
  INDEX idx_status (status),
  INDEX idx_required_date (required_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Material Request Item Table
CREATE TABLE IF NOT EXISTS tabMaterialRequestItem (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  requested_qty DECIMAL(10,2) NOT NULL,
  picked_qty DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'Pending',
  pending_qty DECIMAL(10,2) AS (requested_qty - picked_qty) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_item_code (item_code),
  INDEX idx_status (status),
  FOREIGN KEY (parent_title) REFERENCES tabMaterialRequest(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;

        try {
          // Execute table creation SQL directly
          await connection.query(createTablesSQL);
          console.log("✅ Tables checked/created\n");
        } catch (error) {
          // Ignore "already exists" errors - this is expected
          if (error.code === 'ER_TABLE_EXISTS_ERROR' || error.message.includes('already exists')) {
            console.log("✅ Tables already exist\n");
          } else {
            console.error(`⚠️  Error creating tables: ${error.message}`);
            console.log("⚠️  Continuing anyway...\n");
          }
        }

        // Read SQL file (go up one directory from wms-api to project root)
        const sqlFilePath = path.join(__dirname, '..', 'INSERT_MATERIAL_REQUEST_MOCK_DATA.sql');
        
        if (!fs.existsSync(sqlFilePath)) {
            console.error(`❌ SQL file not found: ${sqlFilePath}`);
            await connection.end();
            return;
        }

        console.log(`Reading SQL file: ${sqlFilePath}`);
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
        console.log(`File size: ${sqlContent.length} characters\n`);

        // Split SQL into statements - handle multi-line statements properly
        // Remove comments first
        let cleanedSql = sqlContent
            .split('\n')
            .filter(line => !line.trim().startsWith('--') || line.trim().startsWith('-- ='))
            .join('\n');

        // Split by semicolon, but preserve multi-line statements
        const statements = [];
        let currentStatement = '';
        const lines = cleanedSql.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length === 0) continue;
            
            // Skip section headers
            if (trimmed.startsWith('-- =')) continue;
            
            currentStatement += line + '\n';
            
            // Check if line ends with semicolon (end of statement)
            if (trimmed.endsWith(';')) {
                const stmt = currentStatement.trim();
                if (stmt.length > 0 && !stmt.startsWith('--')) {
                    statements.push(stmt);
                }
                currentStatement = '';
            }
        }
        
        // Add any remaining statement
        if (currentStatement.trim().length > 0) {
            statements.push(currentStatement.trim());
        }

        // Separate INSERT/UPDATE statements from SELECT statements
        const insertStatements = statements.filter(s => 
            s.toUpperCase().trim().startsWith('INSERT') || 
            s.toUpperCase().trim().startsWith('UPDATE') ||
            s.toUpperCase().trim().startsWith('DELETE')
        );

        const selectStatements = statements.filter(s => 
            s.toUpperCase().trim().startsWith('SELECT') ||
            s.toUpperCase().trim().startsWith('DESCRIBE')
        );

        console.log(`Found ${insertStatements.length} INSERT/UPDATE statements to execute`);
        console.log(`Found ${selectStatements.length} SELECT statements for verification\n`);

        // Execute INSERT/UPDATE statements
        let successCount = 0;
        for (const statement of insertStatements) {
            try {
                const [result] = await connection.execute(statement);
                const rowsAffected = result.affectedRows || 0;
                successCount++;
                const preview = statement.substring(0, Math.min(60, statement.length));
                console.log(`✅ Executed: ${preview}... (Rows: ${rowsAffected})`);
            } catch (error) {
                // Ignore duplicate key errors (expected for ON DUPLICATE KEY UPDATE)
                if (error.code === 'ER_DUP_ENTRY' || error.message.includes('Duplicate entry')) {
                    const preview = statement.substring(0, Math.min(60, statement.length));
                    console.log(`⚠️  Skipped (duplicate): ${preview}...`);
                } else {
                    console.error(`❌ Error: ${error.message}`);
                    console.error(`   Statement: ${statement.substring(0, Math.min(100, statement.length))}...`);
                }
            }
        }

        console.log('\n==========================================');
        console.log(`✅ Successfully executed: ${successCount} statements`);
        console.log('==========================================\n');

        // Run verification queries
        console.log('Running verification queries...\n');
        
        try {
            const [materialRequestCount] = await connection.execute(
                "SELECT COUNT(*) as count FROM tabMaterialRequest WHERE title LIKE 'MR-%'"
            );
            console.log(`✅ Material Request documents: ${materialRequestCount[0].count}`);

            const [itemCount] = await connection.execute(
                "SELECT COUNT(*) as count FROM tabMaterialRequestItem WHERE parent_title LIKE 'MR-%'"
            );
            console.log(`✅ Material Request items: ${itemCount[0].count}`);

            const [statusCount] = await connection.execute(
                "SELECT status, COUNT(*) as count, SUM(total_requested_qty) as total_requested, SUM(total_picked_qty) as total_picked FROM tabMaterialRequest WHERE title LIKE 'MR-%' GROUP BY status"
            );
            console.log('\n📋 Status breakdown:');
            statusCount.forEach(row => {
                console.log(`   ${row.status}: ${row.count} (Requested: ${row.total_requested}, Picked: ${row.total_picked})`);
            });
        } catch (error) {
            console.error(`⚠️  Could not run verification queries: ${error.message}`);
        }

        await connection.end();
        
        console.log('\n✅ Mock data insertion completed!');
        console.log('\nYou can now view Material Request documents in the desktop app.');
        console.log('');

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        if (error.code) {
            console.error(`   Error code: ${error.code}`);
        }
        process.exit(1);
    }
}

runSqlScript();
