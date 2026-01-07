// Script to automatically create Transfer Orders for ASNs
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
    console.log('Create Transfer Orders for ASNs');
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

        console.log('✅ Connected to database\n');

        // Read SQL file
        const sqlFilePath = path.join(__dirname, '..', 'CHECK_AND_CREATE_TRANSFER_ORDERS.sql');
        console.log(`📄 Reading SQL file: ${sqlFilePath}\n`);
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

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
                if (stmt.length > 0 && !stmt.startsWith('=')) {
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
        const insertStatements = statements.filter(s => {
            const upper = s.toUpperCase().trim();
            return upper.startsWith('INSERT') || 
                   upper.startsWith('UPDATE') || 
                   upper.startsWith('CREATE');
        });

        const selectStatements = statements.filter(s => {
            const upper = s.toUpperCase().trim();
            return upper.startsWith('SELECT') || 
                   upper.startsWith('DESCRIBE');
        });

        console.log(`📝 Found ${insertStatements.length} INSERT/UPDATE statements`);
        console.log(`📝 Found ${selectStatements.length} SELECT statements\n`);

        let executedStatementsCount = 0;
        let hadError = false;

        // Execute INSERT/UPDATE statements
        for (const statement of insertStatements) {
            try {
                const [result] = await connection.execute(statement);
                const rowsAffected = result.affectedRows || 0;
                executedStatementsCount++;
                const preview = statement.substring(0, Math.min(60, statement.length));
                console.log(`✅ Executed: ${preview}... (Rows: ${rowsAffected})`);
            } catch (error) {
                // Ignore duplicate key errors (already exists)
                if (error.code === 'ER_DUP_ENTRY' || error.message.includes('Duplicate entry')) {
                    const preview = statement.substring(0, Math.min(60, statement.length));
                    console.log(`⚠️  Skipped (duplicate): ${preview}...`);
                    executedStatementsCount++;
                } else {
                    console.error(`❌ Error: ${error.message}`);
                    console.error(`   Statement: ${statement.substring(0, 100)}...`);
                    hadError = true;
                }
            }
        }

        console.log(`\n📊 Executed ${executedStatementsCount} statements\n`);

        // Execute verification queries
        if (selectStatements.length > 0) {
            console.log('🔍 Running verification queries...\n');
            
            for (const statement of selectStatements) {
                try {
                    const [rows] = await connection.execute(statement);
                    const preview = statement.substring(0, Math.min(60, statement.length));
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
                    console.log('');
                } catch (error) {
                    console.error(`❌ Verification query error: ${error.message}\n`);
                }
            }
        }

        if (hadError) {
            console.log('⚠️  Some errors occurred, but script completed');
        } else {
            console.log('✅ Script completed successfully!');
        }

        await connection.end();
        console.log('\n🔌 Database connection closed');

    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

runSqlScript();

