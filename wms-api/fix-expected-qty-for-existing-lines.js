// Fix expected_qty for existing cycle count lines by looking up from stock ledger
// This script updates expected_qty for lines that have actual_qty but expected_qty = 0

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'wms_desktop',
  port: parseInt(process.env.DB_PORT || '3306')
};

async function lookupExpectedQtyFromStock(connection, itemCode, binLocation, cartonId = null, warehouse = null) {
  try {
    if (!itemCode || !binLocation) {
      return 0;
    }

    // Normalize values for comparison
    const normalizedItemCode = String(itemCode || '').trim().toUpperCase();
    const normalizedBinLocation = String(binLocation || '').trim().toUpperCase();
    const normalizedCartonId = cartonId ? String(cartonId).trim().toUpperCase() : null;
    const normalizedWarehouse = warehouse ? String(warehouse).trim().toUpperCase() : null;

    // Strategy 1: If carton_id is provided, lookup from tabCartonStock (carton-level inventory)
    if (normalizedCartonId) {
      // Check if tabCartonStock table exists
      const [tableCheck] = await connection.execute(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabCartonStock'
      `);

      if (tableCheck.length > 0) {
        let cartonQuery = `
          SELECT qty
          FROM tabCartonStock
          WHERE UPPER(TRIM(item_code)) = ?
            AND UPPER(TRIM(bin_location)) = ?
            AND UPPER(TRIM(carton_id)) = ?
            AND qty > 0
        `;
        const cartonParams = [normalizedItemCode, normalizedBinLocation, normalizedCartonId];

        if (normalizedWarehouse) {
          cartonQuery += ' AND UPPER(TRIM(warehouse)) = ?';
          cartonParams.push(normalizedWarehouse);
        }

        // Only show items with PUTAWAY status (exclude PICKED, SHIPPED, etc.)
        cartonQuery += ` AND (status IS NULL OR status = '' OR status = 'PUTAWAY')`;

        cartonQuery += ' LIMIT 1';

        const [cartonRows] = await connection.execute(cartonQuery, cartonParams);

        if (cartonRows.length > 0 && cartonRows[0].qty) {
          const expectedQty = parseFloat(cartonRows[0].qty) || 0;
          return expectedQty;
        }
      }
    }

    // Strategy 2: Lookup from tabStockLedger (bin-level inventory)
    let ledgerQuery = `
      SELECT qty
      FROM tabStockLedger
      WHERE UPPER(TRIM(item_code)) = ?
        AND UPPER(TRIM(bin_location)) = ?
        AND qty > 0
    `;
    const ledgerParams = [normalizedItemCode, normalizedBinLocation];

    if (normalizedWarehouse) {
      ledgerQuery += ' AND UPPER(TRIM(warehouse)) = ?';
      ledgerParams.push(normalizedWarehouse);
    }

    ledgerQuery += ' LIMIT 1';

    const [ledgerRows] = await connection.execute(ledgerQuery, ledgerParams);

    if (ledgerRows.length > 0 && ledgerRows[0].qty) {
      const expectedQty = parseFloat(ledgerRows[0].qty) || 0;
      return expectedQty;
    }

    return 0;
  } catch (error) {
    console.error(`Error looking up expected_qty: ${error.message}`);
    return 0;
  }
}

async function fixExpectedQty() {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    await connection.beginTransaction();
    
    console.log('🔍 Finding cycle count lines with expected_qty = 0 but stock ledger has data...\n');
    
    // Get all lines that have actual_qty but expected_qty = 0
    const [lines] = await connection.execute(`
      SELECT 
        l.id,
        l.parent_title,
        l.item_code,
        l.bin_location,
        l.carton_id,
        l.expected_qty,
        l.actual_qty,
        t.warehouse
      FROM tabCycleCountLine l
      INNER JOIN tabCycleCountTask t ON l.parent_title = t.title
      WHERE l.actual_qty IS NOT NULL
        AND (l.expected_qty IS NULL OR l.expected_qty = 0)
        AND l.bin_location IS NOT NULL
        AND l.item_code IS NOT NULL
      ORDER BY l.parent_title, l.item_code
    `);
    
    console.log(`Found ${lines.length} lines to check\n`);
    
    let updatedCount = 0;
    let notFoundCount = 0;
    
    for (const line of lines) {
      const expectedQty = await lookupExpectedQtyFromStock(
        connection,
        line.item_code,
        line.bin_location,
        line.carton_id,
        line.warehouse
      );
      
      if (expectedQty > 0) {
        // Update the line
        await connection.execute(`
          UPDATE tabCycleCountLine
          SET expected_qty = ?
          WHERE id = ?
        `, [expectedQty, line.id]);
        
        console.log(`✅ Updated line ${line.id}: ${line.item_code} in ${line.bin_location} - expected_qty: 0 → ${expectedQty}`);
        updatedCount++;
      } else {
        console.log(`⚠️  No stock found for line ${line.id}: ${line.item_code} in ${line.bin_location} (keeping expected_qty = 0)`);
        notFoundCount++;
      }
    }
    
    await connection.commit();
    
    console.log(`\n✅ Fix completed!`);
    console.log(`   Updated: ${updatedCount} lines`);
    console.log(`   Not found: ${notFoundCount} lines (opening stock)`);
    
  } catch (error) {
    await connection.rollback();
    console.error('❌ Error fixing expected_qty:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

// Run the fix
fixExpectedQty().catch(console.error);
