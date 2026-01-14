/**
 * Automatic Carton ID Update Script
 * 
 * This script automatically updates carton IDs for existing stock that doesn't have them.
 * It finds all stock without carton IDs and assigns them based on item+bin combinations.
 * 
 * Usage:
 *   node update-carton-ids-for-stock.js
 * 
 * Prerequisites:
 *   - .env file with database credentials
 *   - tabStockLedger table exists (optionally with carton_id column)
 *   - tabCartonStock table exists (optional, for carton-level inventory)
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import readline from 'readline';

// Load environment variables
dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms_desktop',
  multipleStatements: false
};

/**
 * Check if a column exists in a table
 */
async function checkColumnExists(connection, tableName, columnName) {
  try {
    const [rows] = await connection.execute(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND LOWER(TABLE_NAME) = LOWER(?)
        AND LOWER(COLUMN_NAME) = LOWER(?)
    `, [tableName, columnName]);
    return rows[0].count > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Check if a table exists
 */
async function checkTableExists(connection, tableName) {
  try {
    const [rows] = await connection.execute(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND LOWER(TABLE_NAME) = LOWER(?)
    `, [tableName]);
    return rows[0].count > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Generate carton ID based on item code and bin location
 */
function generateCartonId(itemCode, binLocation, warehouse, index) {
  const itemCodeCleaned = itemCode.replace(/[-_ ]/g, '').toUpperCase().substring(0, 10);
  const binLocationCleaned = binLocation.replace(/[-_ ]/g, '').toUpperCase().substring(0, 15);
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').substring(8, 14); // YYMMDDHHmmss -> HHmmss
  return `CTN-${itemCodeCleaned}-${binLocationCleaned}-${timestamp}-${String(index).padStart(3, '0')}`;
}

/**
 * Prompt user for confirmation
 */
function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/**
 * Main function
 */
async function updateCartonIdsForStock() {
  console.log('==========================================');
  console.log('Update Carton IDs for Existing Stock');
  console.log('==========================================');
  console.log();

  let connection;
  
  try {
    // Connect to database
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database successfully');
    console.log(`   Host: ${dbConfig.host}`);
    console.log(`   Database: ${dbConfig.database}`);
    console.log();

    // Check which tables/columns exist
    const hasStockLedgerCartonId = await checkColumnExists(connection, 'tabStockLedger', 'carton_id');
    const hasCartonStockTable = await checkTableExists(connection, 'tabCartonStock');

    console.log('Database Schema Check:');
    console.log(`   tabStockLedger.carton_id column: ${hasStockLedgerCartonId ? '✅ EXISTS' : '❌ NOT FOUND'}`);
    console.log(`   tabCartonStock table: ${hasCartonStockTable ? '✅ EXISTS' : '❌ NOT FOUND'}`);
    console.log();

    if (!hasStockLedgerCartonId && !hasCartonStockTable) {
      console.log('❌ ERROR: Neither tabStockLedger.carton_id column nor tabCartonStock table exists.');
      console.log('Cannot proceed with carton ID updates.');
      return;
    }

    // Show what the script will do
    console.log('This script will:');
    console.log('  1. Find all stock without carton IDs');
    console.log('  2. Generate carton IDs based on item+bin combinations');
    console.log('  3. Update tabStockLedger (if carton_id column exists)');
    console.log('  4. Create entries in tabCartonStock');
    console.log();
    console.log('Starting update process...');
    console.log();

    // Step 1: Find stock without carton IDs
    console.log('Step 1: Finding stock without carton IDs...');
    console.log();

    const stockWithoutCartonIds = [];

    if (hasStockLedgerCartonId) {
      const [rows] = await connection.execute(`
        SELECT item_code, bin_location, warehouse, qty
        FROM tabStockLedger
        WHERE (carton_id IS NULL OR carton_id = '')
          AND qty > 0
          AND bin_location IS NOT NULL
        ORDER BY warehouse, bin_location, item_code
      `);

      for (const row of rows) {
        stockWithoutCartonIds.push({
          itemCode: row.item_code,
          binLocation: row.bin_location,
          warehouse: row.warehouse,
          qty: parseFloat(row.qty)
        });
      }
    } else {
      // If no carton_id column, check all stock and see if it has carton stock entries
      const [rows] = await connection.execute(`
        SELECT DISTINCT item_code, bin_location, warehouse, SUM(qty) as qty
        FROM tabStockLedger
        WHERE qty > 0
          AND bin_location IS NOT NULL
        GROUP BY item_code, bin_location, warehouse
        ORDER BY warehouse, bin_location, item_code
      `);

      for (const row of rows) {
        // Check if this item+bin already has carton stock entry
        if (hasCartonStockTable) {
          const [cartonRows] = await connection.execute(`
            SELECT COUNT(*) as count
            FROM tabCartonStock
            WHERE item_code = ?
              AND bin_location = ?
              AND warehouse = ?
              AND carton_id IS NOT NULL
              AND carton_id != ''
          `, [row.item_code, row.bin_location, row.warehouse]);

          if (cartonRows[0].count === 0) {
            stockWithoutCartonIds.push({
              itemCode: row.item_code,
              binLocation: row.bin_location,
              warehouse: row.warehouse,
              qty: parseFloat(row.qty)
            });
          }
        } else {
          stockWithoutCartonIds.push({
            itemCode: row.item_code,
            binLocation: row.bin_location,
            warehouse: row.warehouse,
            qty: parseFloat(row.qty)
          });
        }
      }
    }

    if (stockWithoutCartonIds.length === 0) {
      console.log('✅ No stock found without carton IDs. All stock already has carton IDs assigned.');
      return;
    }

    const uniqueItems = new Set(stockWithoutCartonIds.map(s => s.itemCode)).size;
    const uniqueBins = new Set(stockWithoutCartonIds.map(s => s.binLocation)).size;
    const uniqueWarehouses = new Set(stockWithoutCartonIds.map(s => s.warehouse)).size;

    console.log(`Found ${stockWithoutCartonIds.length} stock entries without carton IDs:`);
    console.log(`   Items: ${uniqueItems}`);
    console.log(`   Bins: ${uniqueBins}`);
    console.log(`   Warehouses: ${uniqueWarehouses}`);
    console.log();

    // Step 2: Generate carton IDs and update
    console.log('Step 2: Generating carton IDs and updating stock...');
    console.log();

    await connection.beginTransaction();

    try {
      const cartonIdsGenerated = new Map(); // (itemCode_binLocation_warehouse) -> cartonId
      let updatedCount = 0;
      let createdCount = 0;
      let index = 0;

      for (const stock of stockWithoutCartonIds) {
        // Generate carton ID based on item+bin combination
        const key = `${stock.itemCode}_${stock.binLocation}_${stock.warehouse}`;
        if (!cartonIdsGenerated.has(key)) {
          index++;
          const cartonId = generateCartonId(stock.itemCode, stock.binLocation, stock.warehouse, index);
          cartonIdsGenerated.set(key, cartonId);
        }
        const cartonId = cartonIdsGenerated.get(key);

        // Update tabStockLedger if column exists
        if (hasStockLedgerCartonId) {
          const [result] = await connection.execute(`
            UPDATE tabStockLedger
            SET carton_id = ?,
                updated_at = NOW()
            WHERE item_code = ?
              AND warehouse = ?
              AND bin_location = ?
              AND (carton_id IS NULL OR carton_id = '')
              AND qty > 0
          `, [cartonId, stock.itemCode, stock.warehouse, stock.binLocation]);

          if (result.affectedRows > 0) {
            updatedCount++;
          }
        }

        // Create/update tabCartonStock if table exists
        if (hasCartonStockTable) {
          // Get total qty for this item+bin combination
          const [qtyRows] = await connection.execute(`
            SELECT COALESCE(SUM(qty), 0) as total_qty
            FROM tabStockLedger
            WHERE item_code = ?
              AND warehouse = ?
              AND bin_location = ?
              AND qty > 0
          `, [stock.itemCode, stock.warehouse, stock.binLocation]);

          const totalQty = qtyRows[0].total_qty || stock.qty;

          // Note: created_on has DEFAULT CURRENT_TIMESTAMP, so we don't need to set it
          // updated_at also has ON UPDATE CURRENT_TIMESTAMP, but we set it explicitly in ON DUPLICATE KEY UPDATE
          await connection.execute(`
            INSERT INTO tabCartonStock 
              (carton_id, item_code, warehouse, bin_location, qty, status)
            VALUES 
              (?, ?, ?, ?, ?, 'PUTAWAY')
            ON DUPLICATE KEY UPDATE
              qty = VALUES(qty),
              updated_at = NOW(),
              status = 'PUTAWAY'
          `, [cartonId, stock.itemCode, stock.warehouse, stock.binLocation, totalQty]);

          createdCount++;
        }

        // Progress indicator
        if ((updatedCount + createdCount) % 10 === 0) {
          process.stdout.write('.');
        }
      }

      await connection.commit();

      console.log();
      console.log();
      console.log('✅ Update completed successfully!');
      console.log();
      console.log('Summary:');
      console.log(`   Records in tabStockLedger updated: ${updatedCount}`);
      console.log(`   Records in tabCartonStock created/updated: ${createdCount}`);
      console.log(`   Unique carton IDs generated: ${cartonIdsGenerated.size}`);
      console.log();

      // Show some sample carton IDs
      if (cartonIdsGenerated.size > 0) {
        console.log('Sample carton IDs generated:');
        const samples = Array.from(cartonIdsGenerated.values()).slice(0, 5);
        samples.forEach(cartonId => {
          console.log(`   - ${cartonId}`);
        });
        if (cartonIdsGenerated.size > 5) {
          console.log(`   ... and ${cartonIdsGenerated.size - 5} more`);
        }
        console.log();
      }
    } catch (error) {
      await connection.rollback();
      console.log();
      console.log('❌ ERROR: Update failed. Transaction rolled back.');
      console.log(`Error: ${error.message}`);
      throw error;
    }
  } catch (error) {
    console.log();
    console.log(`❌ ERROR: ${error.message}`);
    if (error.stack) {
      console.log(error.stack);
    }
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run the script
updateCartonIdsForStock()
  .then(() => {
    console.log('Script completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
