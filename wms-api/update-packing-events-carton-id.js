// wms-api/update-packing-events-carton-id.js
// Update packing events without carton_id by matching with stock transaction carton_id

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
};

console.log('🔧 Update Packing Events Carton ID Tool');
console.log('========================================\n');
console.log(`Database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
console.log(`User: ${dbConfig.user}\n`);

async function updatePackingEventsCartonId() {
  let connection;
  
  try {
    // Connect to database
    console.log('📡 Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database\n');

    // Check if carton_id column exists in tabWmsScanEvent
    const [cartonIdColumn] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabWmsScanEvent' 
      AND COLUMN_NAME = 'carton_id'
    `);
    const hasCartonIdColumn = cartonIdColumn.length > 0;
    
    if (!hasCartonIdColumn) {
      console.log('❌ ERROR: carton_id column does not exist in tabWmsScanEvent table');
      return;
    }

    // Check if carton_id column exists in tabStockTransaction
    const [stockTransactionCartonIdColumn] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabStockTransaction' 
      AND COLUMN_NAME = 'carton_id'
    `);
    const hasStockTransactionCartonIdColumn = stockTransactionCartonIdColumn.length > 0;

    console.log('📊 Step 1: Finding packing events without carton_id...\n');

    // Check which column exists: to_no or transfer_order (for TC lookup)
    const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
    const allColumns = new Set(tableInfo.map((row) => row.Field));
    const toColumn = allColumns.has("to_no") ? "to_no" : (allColumns.has("transfer_order") ? "transfer_order" : null);

    // First, let's check the specific transfer carton from the image
    // TC-MR-0001-1768152754168, Item: SKU-HAT-301-BLU-OS
    console.log('🔍 Checking specific transfer carton: TC-MR-0001-1768152754168\n');
    const [allTCEvents] = await connection.execute(`
      SELECT 
        offline_uuid,
        tc_id,
        item_code,
        box_id,
        carton_id,
        qty,
        event_time,
        user_id,
        transfer_order,
        rack,
        bin
      FROM tabWmsScanEvent
      WHERE tc_id = 'TC-MR-0001-1768152754168'
        AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
        AND item_code IS NOT NULL
      ORDER BY item_code, event_time
    `);

    if (allTCEvents.length > 0) {
      console.log(`Found ${allTCEvents.length} event(s) for this transfer carton:\n`);
      console.table(allTCEvents.map(e => ({
        item_code: e.item_code,
        box_id: e.box_id || '(empty)',
        carton_id: e.carton_id || '(empty)',
        qty: e.qty,
        event_time: e.event_time?.toISOString() || e.event_time,
        source_carton: e.box_id || e.carton_id || '(empty)'
      })));
      console.log('\n');
      
      // Check for events where carton_id is empty
      const eventsWithoutCartonId = allTCEvents.filter(e => !e.carton_id || e.carton_id.trim() === '');
      if (eventsWithoutCartonId.length > 0) {
        console.log(`⚠️  Found ${eventsWithoutCartonId.length} event(s) without carton_id in this TC:\n`);
        console.table(eventsWithoutCartonId.map(e => ({
          offline_uuid: e.offline_uuid,
          item_code: e.item_code,
          box_id: e.box_id || '(empty)',
          carton_id: e.carton_id || '(empty)',
          qty: e.qty
        })));
        console.log('\n');
      }
    } else {
      console.log('⚠️  No events found for TC-MR-0001-1768152754168\n');
      
      // Check if the TC exists at all
      if (toColumn) {
        const [tcCheck] = await connection.execute(`
          SELECT tc_id, status, ${toColumn} as transfer_order, created_on
          FROM tabTransferCarton
          WHERE tc_id LIKE 'TC-MR-0001%'
          ORDER BY created_on DESC
          LIMIT 5
        `);
        
        if (tcCheck.length > 0) {
          console.log('Found similar TCs:\n');
          console.table(tcCheck.map(tc => ({
            tc_id: tc.tc_id,
            status: tc.status,
            transfer_order: tc.transfer_order,
            created_on: tc.created_on
          })));
          console.log('\n');
        }
      }
    }
    
    // Also check for ANY packing events with empty carton_id, regardless of TC
    console.log('🔍 Checking for ANY packing events with empty carton_id...\n');
    const [anyEmptyCartonEvents] = await connection.execute(`
      SELECT 
        offline_uuid,
        tc_id,
        item_code,
        box_id,
        carton_id,
        qty,
        event_time
      FROM tabWmsScanEvent
      WHERE event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
        AND item_code IS NOT NULL
        AND (carton_id IS NULL OR carton_id = '' OR TRIM(carton_id) = '')
      LIMIT 10
    `);
    console.log(`Found ${anyEmptyCartonEvents.length} packing event(s) without carton_id:\n`);
    if (anyEmptyCartonEvents.length > 0) {
      console.table(anyEmptyCartonEvents.map(e => ({
        offline_uuid: e.offline_uuid,
        tc_id: e.tc_id || '(empty)',
        item_code: e.item_code,
        box_id: e.box_id || '(empty)',
        carton_id: e.carton_id || '(empty)',
        qty: e.qty
      })));
      console.log('\n');
    }

    // Find packing events without carton_id
    // Note: The display query uses COALESCE(box_id, carton_id) as source_carton
    // But we want to update carton_id specifically when it's empty
    // Find events where carton_id is empty (regardless of box_id or tc_id)
    // Also include events without tc_id (they may have transfer_order instead)
    const [packingEventsWithoutCarton] = await connection.execute(`
      SELECT 
        offline_uuid,
        tc_id,
        item_code,
        box_id,
        carton_id,
        qty,
        event_time,
        user_id,
        transfer_order,
        rack,
        bin
      FROM tabWmsScanEvent
      WHERE event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
        AND item_code IS NOT NULL
        AND (carton_id IS NULL OR carton_id = '' OR TRIM(carton_id) = '')
      ORDER BY COALESCE(tc_id, transfer_order, ''), item_code, event_time
    `);

    if (packingEventsWithoutCarton.length === 0) {
      console.log('✅ No packing events without carton_id found!\n');
      return;
    }

    console.log(`⚠️  Found ${packingEventsWithoutCarton.length} packing event(s) without carton_id:\n`);

    if (packingEventsWithoutCarton.length <= 10) {
      console.table(packingEventsWithoutCarton.map(e => ({
        tc_id: e.tc_id,
        item_code: e.item_code,
        qty: e.qty,
        event_time: e.event_time,
        location: (e.rack && e.bin ? `${e.rack}-${e.bin}` : null)
      })));
    } else {
      console.table(packingEventsWithoutCarton.slice(0, 10).map(e => ({
        tc_id: e.tc_id,
        item_code: e.item_code,
        qty: e.qty
      })));
      console.log(`... and ${packingEventsWithoutCarton.length - 10} more events\n`);
    }

    console.log('\n📊 Step 2: Finding carton_id from stock transactions...\n');

    let updatedCount = 0;
    let notFoundCount = 0;
    const updateDetails = [];

    for (const event of packingEventsWithoutCarton) {
      const itemCode = event.item_code;
      let tcId = event.tc_id;
      const sourceBin = (event.rack && event.bin ? `${event.rack}-${event.bin}` : null);
      const transferOrder = event.transfer_order;

      // If tc_id is empty but transfer_order exists, try to find tc_id from transfer carton
      if (!tcId && transferOrder && toColumn) {
        const [tcRows] = await connection.execute(`
          SELECT tc_id
          FROM tabTransferCarton
          WHERE ${toColumn} = ?
          ORDER BY created_on DESC
          LIMIT 1
        `, [transferOrder]);
        
        if (tcRows.length > 0) {
          tcId = tcRows[0].tc_id;
          console.log(`📌 Found TC ${tcId} for transfer_order ${transferOrder}`);
        }
      }

      // Strategy 1: Try to find carton_id from tabStockLedger (if column exists)
      // This is where dispatch gets carton_id from when reducing stock
      let cartonId = null;
      
      // Check if carton_id column exists in tabStockLedger
      const [stockLedgerCartonIdColumn] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabStockLedger' 
        AND COLUMN_NAME = 'carton_id'
      `);
      const hasStockLedgerCartonIdColumn = stockLedgerCartonIdColumn.length > 0;

      if (hasStockLedgerCartonIdColumn && sourceBin) {
        // Try to find carton_id from tabStockLedger for this item+bin
        // This is where the stock was before dispatch
        const [stockLedgerRows] = await connection.execute(`
          SELECT DISTINCT carton_id, item_code, bin_location
          FROM tabStockLedger
          WHERE item_code = ?
            AND bin_location = ?
            AND (carton_id IS NOT NULL AND carton_id != '')
          ORDER BY updated_at DESC
          LIMIT 1
        `, [itemCode, sourceBin]);

        if (stockLedgerRows.length > 0 && stockLedgerRows[0].carton_id) {
          cartonId = stockLedgerRows[0].carton_id.trim();
          console.log(`✅ Found carton_id from tabStockLedger: ${itemCode} @ ${sourceBin} → ${cartonId}`);
        }
      }

      // Strategy 2: Try to find carton_id from stock transactions (dispatch/picking)
      // Match by item_code, reference_doc (tc_id or transfer_order), and transaction type
      if (!cartonId && hasStockTransactionCartonIdColumn) {
        let cartonIdQuery = `
          SELECT DISTINCT carton_id, item_code, bin_location, transaction_type, reference_doc, transaction_date
          FROM tabStockTransaction
          WHERE item_code = ?
            AND transaction_type IN ('Dispatch', 'Picking')
            AND (
              reference_doc = ? 
              OR reference_doc = ?
            )
            AND carton_id IS NOT NULL 
            AND carton_id != ''
        `;
        const cartonIdParams = [itemCode, tcId, transferOrder || tcId];

        // If source_bin is available, also match by bin_location
        if (sourceBin) {
          cartonIdQuery += ` AND bin_location = ?`;
          cartonIdParams.push(sourceBin);
        }

        cartonIdQuery += ` ORDER BY transaction_date DESC LIMIT 1`;

        const [cartonStockRows] = await connection.execute(cartonIdQuery, cartonIdParams);

        if (cartonStockRows.length > 0 && cartonStockRows[0].carton_id) {
          cartonId = cartonStockRows[0].carton_id.trim();
          console.log(`✅ Found carton_id from tabStockTransaction: ${itemCode} → ${cartonId}`);
        }
      }

      // Strategy 3: Try to find from tabCartonStock
      if (!cartonId) {

        // Try alternative: Find carton_id from tabCartonStock for this item+bin
        if (sourceBin) {
          const [cartonStock] = await connection.execute(`
            SELECT carton_id, qty
            FROM tabCartonStock
            WHERE item_code = ?
              AND bin_location = ?
              AND qty > 0
              AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
            ORDER BY updated_at DESC
            LIMIT 1
          `, [itemCode, sourceBin]);

          if (cartonStock.length > 0 && cartonStock[0].carton_id) {
            cartonId = cartonStock[0].carton_id.trim();
            console.log(`✅ Found carton_id from tabCartonStock (by bin): ${itemCode} @ ${sourceBin} → ${cartonId}`);
          }
        }
        
        // Strategy 4: No bin location - try to find any carton for this item
        if (!cartonId) {
          const [anyCarton] = await connection.execute(`
            SELECT carton_id, bin_location, qty
            FROM tabCartonStock
            WHERE item_code = ?
              AND qty > 0
              AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
            ORDER BY updated_at DESC
            LIMIT 1
          `, [itemCode]);

          if (anyCarton.length > 0 && anyCarton[0].carton_id) {
            cartonId = anyCarton[0].carton_id.trim();
            console.log(`✅ Found carton_id from tabCartonStock (any bin): ${itemCode} → ${cartonId}`);
          }
        }
      }

      // Update the packing event if carton_id was found
      if (cartonId) {
        await connection.execute(`
          UPDATE tabWmsScanEvent
          SET carton_id = ?
          WHERE offline_uuid = ?
        `, [cartonId, event.offline_uuid]);

        updatedCount++;
        updateDetails.push({
          tc_id: tcId,
          item_code: itemCode,
          carton_id: cartonId,
          source: 'Found from stock data'
        });

        console.log(`✅ Updated event ${event.offline_uuid}: Item ${itemCode} → Carton ${cartonId}`);
      } else {
        notFoundCount++;
        console.log(`⚠️  Could not find carton_id for event ${event.offline_uuid}: Item ${itemCode} @ ${sourceBin || 'NO_BIN'} (TC: ${tcId})`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📋 Summary');
    console.log('='.repeat(60) + '\n');
    console.log(`Total events without carton_id: ${packingEventsWithoutCarton.length}`);
    console.log(`✅ Updated: ${updatedCount}`);
    console.log(`⚠️  Not found: ${notFoundCount}\n`);

    if (updateDetails.length > 0) {
      console.log('Updated events:');
      console.table(updateDetails.slice(0, 20));
      if (updateDetails.length > 20) {
        console.log(`... and ${updateDetails.length - 20} more updates\n`);
      }
    }

    console.log('✅ Script completed!\n');
    console.log('💡 Next steps:');
    console.log('   1. Restart the desktop app to refresh data');
    console.log('   2. Check Transfer Carton Details - carton IDs should now be visible\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('📡 Database connection closed');
    }
  }
}

// Run the script
updatePackingEventsCartonId().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
