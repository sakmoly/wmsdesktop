// ============================================================
// Auto Run Transaction History Setup (Node.js)
// This script uses the same database connection as the API
// Run from wms-api directory: node ../SCRIPTS/runTransactionHistorySetup.js
// ============================================================

import { getConnection } from './wms-api/src/db/connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSetup() {
  console.log('============================================================');
  console.log('Auto Setup Transaction History Table');
  console.log('============================================================');
  console.log('');
  
  console.log('Database Configuration:');
  console.log(`  Host: ${DB_CONFIG.host}`);
  console.log(`  Port: ${DB_CONFIG.port}`);
  console.log(`  Database: ${DB_CONFIG.database}`);
  console.log(`  User: ${DB_CONFIG.user}`);
  console.log('');

  let connection;
  
  try {
    // Connect to database using API's connection pool
    console.log('Connecting to database...');
    connection = await getConnection();
    console.log('✅ Connected to database');
    console.log('');

    // Read SQL script (go up one level from wms-api to SCRIPTS)
    const scriptPath = path.join(__dirname, '..', 'SCRIPTS', 'AutoSetupTransactionHistory.sql');
    console.log(`Reading SQL script: ${scriptPath}`);
    
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`SQL script not found: ${scriptPath}`);
    }
    
    const sqlScript = fs.readFileSync(scriptPath, 'utf8');
    console.log('✅ SQL script loaded');
    console.log('');

    // Execute SQL script
    console.log('Executing SQL script...');
    console.log('');
    
    // Execute entire script (MySQL supports multiple statements)
    const [results] = await connection.query(sqlScript);
    
    // Show results
    if (Array.isArray(results)) {
      results.forEach((result, index) => {
        if (Array.isArray(result) && result.length > 0) {
          result.forEach(row => {
            if (row.Status) {
              console.log(row.Status);
            } else if (row.table_status) {
              console.log(row.table_status);
            } else if (row.trigger_status) {
              console.log(row.trigger_status);
            } else if (row.info) {
              console.log(row.info);
            }
          });
        }
      });
    }

    console.log('');
    console.log('============================================================');
    console.log('✅ SETUP COMPLETE!');
    console.log('============================================================');
    console.log('');
    console.log('The transaction history table is now active and will');
    console.log('automatically capture all future transactions.');
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Test by performing a transaction (Material Request, etc.)');
    console.log('  2. Check tabTransactionHistory to verify it was captured');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('============================================================');
    console.error('❌ ERROR: Setup failed!');
    console.error('============================================================');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    console.error('Please check:');
    console.error('  1. MySQL server is running');
    console.error('  2. Database credentials are correct');
    console.error('  3. Database exists:', DB_CONFIG.database);
    console.error('  4. User has proper permissions');
    console.error('');
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// Run setup
runSetup().catch(console.error);
