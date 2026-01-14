// Auto-setup script for Stock Posting System
// Runs CreateStockPostingLog.sql automatically

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration
const dbConfig = {
  host: 'localhost',
  user: 'erppadmin',
  password: 'P61nt!',
  database: 'wms_desktop',
  multipleStatements: true
};

async function setupStockPosting() {
  let connection;
  
  try {
    console.log('============================================================');
    console.log('Stock Posting System - Auto Setup');
    console.log('============================================================');
    console.log('');
    
    // Step 1: Connect to database
    console.log('Step 1: Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database');
    console.log('');
    
    // Step 2: Read SQL script
    console.log('Step 2: Reading SQL script...');
    // Try multiple possible paths
    const possiblePaths = [
      path.join(__dirname, 'CreateStockPostingLog.sql'),
      path.join(__dirname, '..', 'SCRIPTS', 'CreateStockPostingLog.sql'),
      path.join(process.cwd(), 'SCRIPTS', 'CreateStockPostingLog.sql'),
      path.join(process.cwd(), '..', 'SCRIPTS', 'CreateStockPostingLog.sql')
    ];
    
    let sqlScript = null;
    let sqlFilePath = null;
    
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        sqlFilePath = possiblePath;
        sqlScript = fs.readFileSync(possiblePath, 'utf8');
        break;
      }
    }
    
    if (!sqlScript) {
      throw new Error(`SQL script not found. Tried: ${possiblePaths.join(', ')}`);
    }
    
    console.log(`✅ SQL script loaded from: ${sqlFilePath}`);
    console.log('');
    
    // Step 3: Check if table already exists
    console.log('Step 3: Checking if table already exists...');
    const [tables] = await connection.execute(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabStockPostingLog'
    `);
    
    if (tables[0].count > 0) {
      console.log('⚠️  Table tabStockPostingLog already exists');
      console.log('   Skipping table creation...');
      console.log('');
    } else {
      // Step 4: Execute SQL script
      console.log('Step 4: Creating tabStockPostingLog table...');
      await connection.query(sqlScript);
      console.log('✅ Table created successfully');
      console.log('');
    }
    
    // Step 5: Verify table structure
    console.log('Step 5: Verifying table structure...');
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabStockPostingLog'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('✅ Table structure verified:');
    columns.forEach(col => {
      const key = col.COLUMN_KEY ? ` [${col.COLUMN_KEY}]` : '';
      console.log(`   - ${col.COLUMN_NAME} (${col.DATA_TYPE})${key}`);
    });
    console.log('');
    
    // Step 6: Check for existing postings
    console.log('Step 6: Checking for existing postings...');
    const [postings] = await connection.execute(`
      SELECT COUNT(*) as count
      FROM tabStockPostingLog
    `);
    console.log(`✅ Found ${postings[0].count} existing posting(s)`);
    console.log('');
    
    console.log('============================================================');
    console.log('✅ Stock Posting System Setup Complete!');
    console.log('============================================================');
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Restart API server');
    console.log('  2. Test with diagnostics endpoint:');
    console.log('     GET /api/wms/stock/diagnose?item_code=SKU-XXX&warehouse=WH-MAIN');
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('❌ Setup failed:');
    console.error(error.message);
    if (error.sql) {
      console.error('SQL:', error.sql);
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run setup
setupStockPosting();
