// Script to insert mock stock ledger data
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

// Database configuration (using same as API)
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'wms_desktop',
    multipleStatements: true
};

async function runStockLedgerMockData() {
    let connection;
    
    try {
        console.log('\n🔄 Starting Stock Ledger Mock Data Insertion...\n');
        console.log(`📊 Database: ${dbConfig.database}@${dbConfig.host}:${dbConfig.port}\n`);
        
        // Connect to database
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to database\n');

        // Read SQL file
        const sqlFilePath = path.join(__dirname, '../INSERT_STOCK_LEDGER_MOCK_DATA.sql');
        if (!fs.existsSync(sqlFilePath)) {
            console.error(`❌ SQL file not found: ${sqlFilePath}`);
            process.exit(1);
        }
        
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');
        console.log('✅ SQL file read successfully\n');

        // Split SQL into statements
        const statements = sqlContent
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--') && !s.toUpperCase().startsWith('TRUNCATE'));

        console.log(`📝 Found ${statements.length} SQL statements\n`);

        let executedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const statement of statements) {
            if (statement.startsWith('SELECT')) {
                // Verification queries - execute and show results
                try {
                    const [rows] = await connection.execute(statement);
                    if (rows.length > 0) {
                        console.log('📋 Results:');
                        console.table(rows);
                        console.log('');
                    }
                } catch (error) {
                    console.error(`❌ Verification query error: ${error.message}`);
                }
            } else if (statement.startsWith('INSERT') || statement.startsWith('UPDATE') || statement.startsWith('CREATE')) {
                try {
                    await connection.execute(statement);
                    executedCount++;
                } catch (error) {
                    // Check for duplicate key errors (expected with ON DUPLICATE KEY UPDATE)
                    if (error.code === 'ER_DUP_ENTRY') {
                        skippedCount++;
                        // This is expected with ON DUPLICATE KEY UPDATE, so we continue
                    } else {
                        errorCount++;
                        console.error(`❌ Error: ${error.message}`);
                        console.error(`   Statement: ${statement.substring(0, 100)}...`);
                    }
                }
            }
        }

        console.log(`\n📊 Summary:`);
        console.log(`   ✅ Executed: ${executedCount} statements`);
        if (skippedCount > 0) {
            console.log(`   ⚠️  Skipped: ${skippedCount} duplicates (expected with ON DUPLICATE KEY UPDATE)`);
        }
        if (errorCount > 0) {
            console.log(`   ❌ Errors: ${errorCount}`);
        }

        console.log('\n✅ Stock Ledger Mock Data Insertion Completed!\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Database connection closed');
        }
    }
}

// Run the script
runStockLedgerMockData();

