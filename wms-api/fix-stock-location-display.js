/**
 * Fix Stock Location Display
 * Creates stock ledger entries for items that have stock_qty but no location breakdown
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'wms_desktop',
};

async function fixStockLocationDisplay() {
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database\n');

    await connection.beginTransaction();

    // Step 1: Find items with stock_qty but no stock ledger entries with locations
    console.log('📋 Step 1: Finding items with stock but no location entries...\n');
    const [itemsNeedingLocation] = await connection.execute(`
      SELECT 
        i.code as item_code,
        i.stock_qty,
        COALESCE(SUM(CASE WHEN sl.bin_location IS NOT NULL THEN sl.qty ELSE 0 END), 0) as location_qty,
        COALESCE(SUM(CASE WHEN sl.bin_location IS NULL THEN sl.qty ELSE 0 END), 0) as warehouse_qty
      FROM tabItem i
      LEFT JOIN tabStockLedger sl ON sl.item_code = i.code
      WHERE i.stock_qty > 0
      GROUP BY i.code, i.stock_qty
      HAVING location_qty = 0 AND (warehouse_qty > 0 OR i.stock_qty > 0)
      ORDER BY i.stock_qty DESC
      LIMIT 20
    `);
    
    if (itemsNeedingLocation.length === 0) {
      console.log('✅ All items already have location entries or no stock.\n');
      await connection.rollback();
      return;
    }
    
    console.log(`Found ${itemsNeedingLocation.length} items needing location entries:\n`);
    console.table(itemsNeedingLocation);
    console.log('');

    // Step 2: Get default warehouse
    const [warehouseRows] = await connection.execute(`
      SELECT name FROM tabWarehouse 
      WHERE warehouse_type = 'Warehouse' 
         OR name LIKE '%Main%' 
         OR name LIKE '%WH-MAIN%' 
         OR code LIKE '%MAIN%'
      ORDER BY 
        CASE WHEN name = 'Main Warehouse' THEN 1
             WHEN name LIKE '%Main%' THEN 2
             ELSE 3 END
      LIMIT 1
    `);
    const warehouse = warehouseRows.length > 0 ? warehouseRows[0].name : 'Main Warehouse';
    console.log(`📦 Using warehouse: "${warehouse}"\n`);

    // Step 3: Check for putaway tasks with locations for these items
    console.log('📋 Step 2: Checking for putaway tasks with locations...\n');
    const itemCodes = itemsNeedingLocation.map(i => i.item_code);
    const placeholders = itemCodes.map(() => '?').join(',');
    
    const [putawayWithLocations] = await connection.execute(`
      SELECT 
        pl.item_code,
        pl.qty,
        pl.rack,
        pl.bin,
        CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL AND pl.bin != 'TBD', CONCAT('-', pl.bin), '')) as bin_location,
        pt.title as putaway_task,
        pt.status
      FROM tabPutawayLine pl
      JOIN tabPutawayTask pt ON pl.parent_title = pt.title
      WHERE pl.item_code IN (${placeholders})
        AND pl.rack IS NOT NULL
        AND pl.rack != 'TBD'
      ORDER BY pt.created_at DESC
    `, itemCodes);
    
    console.log(`Found ${putawayWithLocations.length} putaway lines with actual locations:\n`);
    if (putawayWithLocations.length > 0) {
      console.table(putawayWithLocations);
      console.log('');
    }

    // Step 4: Create stock ledger entries
    console.log('📦 Step 3: Creating stock ledger entries...\n');
    let createdCount = 0;
    let updatedCount = 0;
    const defaultLocation = 'DOCK-01'; // Default location for items without putaway locations

    for (const item of itemsNeedingLocation) {
      const itemCode = item.item_code;
      const totalQty = parseFloat(item.stock_qty) || 0;
      const warehouseQty = parseFloat(item.warehouse_qty) || 0;
      const locationQty = parseFloat(item.location_qty) || 0;
      
      // Find putaway location for this item
      const putawayLine = putawayWithLocations.find(p => p.item_code === itemCode);
      let binLocation = null;
      let qtyToAdd = totalQty - locationQty;
      
      if (putawayLine && putawayLine.bin_location && putawayLine.bin_location !== 'TBD-TBD') {
        binLocation = putawayLine.bin_location;
        qtyToAdd = parseFloat(putawayLine.qty) || qtyToAdd;
      } else if (warehouseQty > 0) {
        // Use warehouse-level stock (no location)
        binLocation = null;
        qtyToAdd = warehouseQty;
      } else {
        // No location info - use default location
        binLocation = defaultLocation;
        qtyToAdd = totalQty;
      }

      if (qtyToAdd <= 0) continue;

      // Get current stock at this location
      const [currentStock] = await connection.execute(`
        SELECT qty, reserved_qty
        FROM tabStockLedger
        WHERE item_code = ?
          AND warehouse = ?
          AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
      `, [itemCode, warehouse, binLocation, binLocation]);

      const currentQty = currentStock.length > 0 ? parseFloat(currentStock[0].qty) || 0 : 0;
      const currentReservedQty = currentStock.length > 0 ? parseFloat(currentStock[0].reserved_qty) || 0 : 0;
      const newQty = currentQty + qtyToAdd;

      // Insert or update stock ledger
      try {
        const [result] = await connection.execute(`
          INSERT INTO tabStockLedger 
            (item_code, warehouse, bin_location, qty, reserved_qty, 
             last_transaction_date, last_transaction_type, last_transaction_ref, 
             updated_at, created_at)
          VALUES 
            (?, ?, ?, ?, ?,
             NOW(), 'Putaway', 'MANUAL-FIX', 
             NOW(), NOW())
          ON DUPLICATE KEY UPDATE
            qty = ?,
            last_transaction_date = NOW(),
            last_transaction_type = 'Putaway',
            last_transaction_ref = 'MANUAL-FIX',
            updated_at = NOW()
        `, [
          itemCode,
          warehouse,
          binLocation,
          newQty,
          currentReservedQty,
          newQty
        ]);

        if (result.affectedRows === 1) {
          createdCount++;
          console.log(`✅ Created: ${itemCode} @ ${binLocation || 'Warehouse'} = ${newQty}`);
        } else {
          updatedCount++;
          console.log(`🔄 Updated: ${itemCode} @ ${binLocation || 'Warehouse'} = ${newQty}`);
        }
      } catch (error) {
        console.error(`❌ Error for ${itemCode}:`, error.message);
      }
    }

    // Step 5: Update tabItem.stock_qty from stock ledger sum
    console.log('\n📊 Step 4: Updating tabItem.stock_qty from stock ledger...\n');
    const [itemsToUpdate] = await connection.execute(`
      SELECT item_code, SUM(qty) as total_qty
      FROM tabStockLedger
      WHERE item_code IN (${placeholders})
      GROUP BY item_code
    `, itemCodes);

    for (const item of itemsToUpdate) {
      await connection.execute(`
        UPDATE tabItem
        SET stock_qty = ?,
            updated_at = NOW()
        WHERE code = ?
      `, [item.total_qty, item.item_code]);
    }

    await connection.commit();
    
    console.log(`\n✅ Summary:`);
    console.log(`   Created: ${createdCount} stock ledger entries`);
    console.log(`   Updated: ${updatedCount} stock ledger entries`);
    console.log(`   Updated: ${itemsToUpdate.length} item stock quantities`);
    console.log(`\n✅ Stock location display should now work!`);
    console.log(`   Open Item Location Breakdown in desktop app to verify.`);

  } catch (error) {
    await connection.rollback();
    console.error('❌ Error:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

fixStockLocationDisplay().catch(console.error);

