/**
 * Verify Carton IDs in tabCartonStock
 * Quick verification script to check if carton IDs were assigned correctly
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms_desktop'
};

async function verifyCartonIds() {
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    
    console.log('Verifying carton IDs in tabCartonStock...\n');
    
    // Get all carton stock entries
    const [rows] = await connection.execute(`
      SELECT 
        item_code, 
        bin_location, 
        carton_id, 
        qty, 
        status,
        created_on
      FROM tabCartonStock
      WHERE carton_id IS NOT NULL
        AND carton_id != ''
      ORDER BY bin_location, item_code
      LIMIT 20
    `);
    
    if (rows.length === 0) {
      console.log('❌ No carton stock entries found with carton IDs.');
    } else {
      console.log(`✅ Found ${rows.length} carton stock entries with carton IDs:\n`);
      console.log('Item Code'.padEnd(25) + '| Bin Location'.padEnd(20) + '| Carton ID'.padEnd(35) + '| Qty'.padEnd(10) + '| Status');
      console.log('-'.repeat(100));
      
      for (const row of rows) {
        const itemCode = (row.item_code || '').padEnd(25);
        const binLocation = (row.bin_location || '').padEnd(20);
        const cartonId = (row.carton_id || '').padEnd(35);
        const qty = (row.qty || 0).toString().padEnd(10);
        const status = row.status || '';
        console.log(`${itemCode}| ${binLocation}| ${cartonId}| ${qty}| ${status}`);
      }
    }
    
    // Get summary statistics
    const [stats] = await connection.execute(`
      SELECT 
        COUNT(*) as total_entries,
        COUNT(DISTINCT item_code) as unique_items,
        COUNT(DISTINCT bin_location) as unique_bins,
        COUNT(DISTINCT carton_id) as unique_cartons,
        SUM(qty) as total_qty
      FROM tabCartonStock
      WHERE carton_id IS NOT NULL
        AND carton_id != ''
        AND qty > 0
    `);
    
    if (stats.length > 0) {
      console.log('\n' + '='.repeat(100));
      console.log('Summary Statistics:');
      console.log(`  Total entries: ${stats[0].total_entries}`);
      console.log(`  Unique items: ${stats[0].unique_items}`);
      console.log(`  Unique bins: ${stats[0].unique_bins}`);
      console.log(`  Unique cartons: ${stats[0].unique_cartons}`);
      console.log(`  Total quantity: ${stats[0].total_qty || 0}`);
    }
    
    // Check items without carton IDs in tabStockLedger (if carton_id column exists)
    const [checkColumn] = await connection.execute(`
      SELECT COUNT(*) as exists
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabStockLedger'
        AND COLUMN_NAME = 'carton_id'
    `);
    
    if (checkColumn[0].exists > 0) {
      const [stockLedgerStats] = await connection.execute(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN carton_id IS NULL OR carton_id = '' THEN 1 ELSE 0 END) as without_carton_id,
          SUM(CASE WHEN carton_id IS NOT NULL AND carton_id != '' THEN 1 ELSE 0 END) as with_carton_id
        FROM tabStockLedger
        WHERE qty > 0
          AND bin_location IS NOT NULL
      `);
      
      if (stockLedgerStats.length > 0) {
        console.log('\n' + '='.repeat(100));
        console.log('tabStockLedger Statistics (if carton_id column exists):');
        console.log(`  Total entries: ${stockLedgerStats[0].total}`);
        console.log(`  With carton_id: ${stockLedgerStats[0].with_carton_id}`);
        console.log(`  Without carton_id: ${stockLedgerStats[0].without_carton_id}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

verifyCartonIds();
