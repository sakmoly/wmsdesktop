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

async function runMigrations() {
    let connection;
    
    try {
        console.log('\n🔄 Starting Database Migrations...\n');
        console.log(`📊 Database: ${dbConfig.database}@${dbConfig.host}:${dbConfig.port}\n`);
        
        // Connect to database
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to database\n');

        // Migration files in order
        const migrationFiles = [
            '../MIGRATION_001_STOCK_LEDGER_AND_TRACKING.sql',
            '../MIGRATION_002_TRANSFER_IN_AND_CYCLE_COUNT.sql',
            '../MIGRATION_003_STOCK_TRACKING_AND_ROUTING.sql'
        ];

        for (const migrationFile of migrationFiles) {
            const sqlFilePath = path.join(__dirname, migrationFile);
            console.log(`📄 Running migration: ${path.basename(sqlFilePath)}`);
            
            if (!fs.existsSync(sqlFilePath)) {
                console.error(`❌ Migration file not found: ${sqlFilePath}`);
                continue;
            }
            
            const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');
            console.log('✅ SQL file read successfully');

            // Split SQL into statements
            const statements = sqlContent
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('SELECT'));

            console.log(`📝 Found ${statements.length} SQL statements\n`);

            let executedCount = 0;
            for (const statement of statements) {
                if (statement.startsWith('CREATE') || statement.startsWith('ALTER') || 
                    statement.startsWith('INSERT') || statement.startsWith('UPDATE') ||
                    statement.startsWith('DROP') || statement.startsWith('DELETE')) {
                    try {
                        await connection.execute(statement);
                        executedCount++;
                        console.log(`  ✅ Executed: ${statement.substring(0, 60)}...`);
                    } catch (error) {
                        // Ignore "already exists" errors for CREATE TABLE IF NOT EXISTS
                        if (error.code === 'ER_TABLE_EXISTS_ERROR' || 
                            error.code === 'ER_DUP_FIELDNAME' ||
                            error.message.includes('already exists')) {
                            console.log(`  ⚠️  Skipped (already exists): ${statement.substring(0, 60)}...`);
                        } else {
                            console.error(`  ❌ Error: ${error.message}`);
                            console.error(`     Statement: ${statement.substring(0, 100)}...`);
                        }
                    }
                }
            }

            console.log(`\n📊 Executed ${executedCount} statements from ${path.basename(sqlFilePath)}\n`);

            // Run verification queries (SELECT statements)
            const verificationStatements = sqlContent
                .split(';')
                .map(s => s.trim())
                .filter(s => s.startsWith('SELECT'));

            if (verificationStatements.length > 0) {
                console.log('🔍 Running verification queries...\n');
                
                for (const statement of verificationStatements) {
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
                }
            }
        }

        console.log('\n✅ All Migrations Completed!\n');

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

// Run the migrations
runMigrations();

