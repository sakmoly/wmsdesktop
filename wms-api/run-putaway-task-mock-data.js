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

async function runPutawayTaskMockData() {
    let connection;
    
    try {
        console.log('\n🔄 Starting Putaway Task Mock Data Insertion...\n');
        console.log(`📊 Database: ${dbConfig.database}@${dbConfig.host}:${dbConfig.port}`);
        
        // Connect to database
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to database\n');

        // Read SQL file
        const sqlFilePath = path.join(__dirname, '..', 'INSERT_PUTAWAY_TASK_MOCK_DATA.sql');
        console.log(`📄 Reading SQL file: ${sqlFilePath}`);
        
        if (!fs.existsSync(sqlFilePath)) {
            throw new Error(`SQL file not found: ${sqlFilePath}`);
        }
        
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');
        console.log('✅ SQL file read successfully\n');

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

        console.log(`📝 Found ${insertStatements.length} INSERT/UPDATE statements to execute`);
        console.log(`📝 Found ${selectStatements.length} SELECT statements for verification\n`);

        // Execute INSERT/UPDATE statements
        let successCount = 0;
        let hadError = false;
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
                    hadError = true;
                }
            }
        }

        console.log(`\n📊 Executed ${successCount} INSERT/UPDATE/DELETE statements`);

        // Run verification queries
        if (selectStatements.length > 0) {
            console.log('\n🔍 Running verification queries...\n');
            
            for (const statement of selectStatements) {
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

        if (hadError) {
            console.log('\n⚠️  Some statements had errors, but continuing...');
        }

        console.log('\n✅ Putaway Task Mock Data Insertion Completed!\n');

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
runPutawayTaskMockData();

