// Script to automatically insert Transfer Carton API test data
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
    console.log('Transfer Carton API Mock Data Insertion');
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

        console.log(`✅ Connected to database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}\n`);

        // Read SQL file (go up one directory from wms-api to project root)
        const sqlFilePath = path.join(__dirname, '..', 'INSERT_TRANSFER_CARTON_API_TEST_DATA.sql');
        
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
            .filter(line => !line.trim().startsWith('--'))
            .join('\n');

        // Split by semicolon, but preserve multi-line statements
        const statements = [];
        let currentStatement = '';
        const lines = cleanedSql.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length === 0) continue;
            
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

        // Execute SELECT statements for verification
        if (selectStatements.length > 0) {
            console.log('Running verification queries...\n');
            
            for (const query of selectStatements) {
                try {
                    const [rows] = await connection.execute(query);
                    const preview = query.substring(0, Math.min(60, query.length));
                    console.log(`\n📊 ${preview}...`);
                    console.log('─'.repeat(80));
                    
                    if (Array.isArray(rows) && rows.length > 0) {
                        // Print column headers
                        const columns = Object.keys(rows[0]);
                        console.log(columns.join(' | '));
                        console.log('─'.repeat(80));
                        
                        // Print rows (limit to 10)
                        const displayRows = rows.slice(0, 10);
                        for (const row of displayRows) {
                            const values = columns.map(col => {
                                const val = row[col];
                                return val === null || val === undefined ? 'NULL' : String(val);
                            });
                            console.log(values.join(' | '));
                        }
                        
                        if (rows.length > 10) {
                            console.log(`... (showing first 10 of ${rows.length} rows)`);
                        }
                    } else {
                        console.log('(No rows returned)');
                    }
                } catch (error) {
                    console.error(`⚠️  Could not execute verification query: ${error.message}`);
                }
            }
        }

        await connection.end();
        
        console.log('\n✅ Mock data insertion completed!');
        console.log('\nYou can now test the API endpoint:');
        console.log('GET /api/transfer-cartons/TC-1766773112793');
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

