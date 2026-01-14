// ============================================================
// Auto Run Transaction History Setup
// Run from project root: node SCRIPTS/runSetup.js
// ============================================================

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration (from user)
const DB_CONFIG = {
  host: 'localhost',
  port: 3306,
  user: 'erppadmin',
  password: 'P61nt!',
  database: 'wms_desktop',
  multipleStatements: true
};

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
    // Connect to database
    console.log('Connecting to database...');
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('✅ Connected to database');
    console.log('');

    // Read SQL script
    const scriptPath = path.join(__dirname, 'AutoSetupTransactionHistory.sql');
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
            const keys = Object.keys(row);
            if (keys.length > 0) {
              const value = row[keys[0]];
              if (value) {
                console.log(value);
              }
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
      await connection.end();
    }
  }
}

// Run setup
runSetup().catch(console.error);
