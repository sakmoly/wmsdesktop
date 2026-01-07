// test-putaway-issues.mjs
// Test script to analyze putaway issues: duplicate lines, stock doubling, incorrect quantities

import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms_db',
  port: process.env.DB_PORT || 3306
};

async function analyzePutawayIssues() {
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database\n');

    // 1. Check for duplicate putaway lines
    console.log('='.repeat(80));
    console.log('1. CHECKING FOR DUPLICATE PUTAWAY LINES');
    console.log('='.repeat(80));
    
    const [duplicateLines] = await connection.execute(`
      SELECT 
        parent_title,
        item_code,
        carton_id,
        COALESCE(rack, '') as rack,
        COALESCE(bin, '') as bin,
        SUM(qty) as total_qty,
        COUNT(*) as line_count,
        GROUP_CONCAT(id ORDER BY id) as line_ids
      FROM tabPutawayLine
      WHERE parent_title = 'PUT-20251231-0001'
      GROUP BY parent_title, item_code, carton_id, COALESCE(rack, ''), COALESCE(bin, '')
      HAVING COUNT(*) > 1
    `);
    
    if (duplicateLines.length > 0) {
      console.log(`❌ Found ${duplicateLines.length} duplicate line groups:\n`);
      for (const dup of duplicateLines) {
        console.log(`  Item: ${dup.item_code}, Carton: ${dup.carton_id || 'NULL'}, Rack: ${dup.rack || 'NULL'}, Bin: ${dup.bin || 'NULL'}`);
        console.log(`  Total Qty: ${dup.total_qty}, Count: ${dup.line_count}, Line IDs: ${dup.line_ids}\n`);
        
        // Get detailed lines
        const [details] = await connection.execute(`
          SELECT id, parent_title, item_code, carton_id, rack, bin, qty, created_at, updated_at
          FROM tabPutawayLine
          WHERE id IN (${dup.line_ids})
          ORDER BY id
        `);
        for (const detail of details) {
          console.log(`    ID ${detail.id}: rack="${detail.rack || 'NULL'}", bin="${detail.bin || 'NULL'}", qty=${detail.qty}`);
        }
        console.log('');
      }
    } else {
      console.log('✅ No duplicate lines found\n');
    }

    // 2. Check putaway lines with empty rack but bin value
    console.log('='.repeat(80));
    console.log('2. CHECKING LINES WITH EMPTY RACK BUT BIN VALUE');
    console.log('='.repeat(80));
    
    const [emptyRackLines] = await connection.execute(`
      SELECT id, parent_title, item_code, carton_id, rack, bin, qty
      FROM tabPutawayLine
      WHERE parent_title = 'PUT-20251231-0001'
        AND (rack IS NULL OR rack = '')
        AND (bin IS NOT NULL AND bin != '')
      ORDER BY item_code, carton_id
    `);
    
    if (emptyRackLines.length > 0) {
      console.log(`❌ Found ${emptyRackLines.length} lines with empty rack but bin value:\n`);
      for (const line of emptyRackLines) {
        console.log(`  ID ${line.id}: Item=${line.item_code}, Carton=${line.carton_id || 'NULL'}, Rack="${line.rack || 'NULL'}", Bin="${line.bin}", Qty=${line.qty}`);
      }
      console.log('');
    } else {
      console.log('✅ No lines with empty rack but bin value found\n');
    }

    // 3. Check stock ledger for the problematic item
    console.log('='.repeat(80));
    console.log('3. CHECKING STOCK LEDGER FOR SKU-HAT-301-GRN-OS');
    console.log('='.repeat(80));
    
    const [stockLedger] = await connection.execute(`
      SELECT 
        item_code,
        warehouse,
        bin_location,
        qty,
        reserved_qty,
        last_transaction_type,
        last_transaction_ref,
        updated_at
      FROM tabStockLedger
      WHERE item_code = 'SKU-HAT-301-GRN-OS'
      ORDER BY bin_location, updated_at DESC
    `);
    
    console.log(`Found ${stockLedger.length} stock ledger entries:\n`);
    let totalStock = 0;
    for (const stock of stockLedger) {
      totalStock += parseFloat(stock.qty) || 0;
      console.log(`  Location: "${stock.bin_location || 'NULL'}", Qty: ${stock.qty}, Warehouse: ${stock.warehouse}`);
      console.log(`    Last Transaction: ${stock.last_transaction_type}, Ref: ${stock.last_transaction_ref}`);
      console.log(`    Updated: ${stock.updated_at}\n`);
    }
    console.log(`Total Stock: ${totalStock}`);
    console.log('');

    // 4. Check stock transactions
    console.log('='.repeat(80));
    console.log('4. CHECKING STOCK TRANSACTIONS FOR SKU-HAT-301-GRN-OS');
    console.log('='.repeat(80));
    
    const [transactions] = await connection.execute(`
      SELECT 
        transaction_date,
        transaction_type,
        reference_doc,
        bin_location,
        qty_change,
        qty_before,
        qty_after,
        performed_by
      FROM tabStockTransaction
      WHERE item_code = 'SKU-HAT-301-GRN-OS'
        AND reference_doc = 'PUT-20251231-0001'
      ORDER BY transaction_date
    `);
    
    console.log(`Found ${transactions.length} transactions:\n`);
    for (const tx of transactions) {
      console.log(`  Date: ${tx.transaction_date}, Type: ${tx.transaction_type}`);
      console.log(`    Location: "${tx.bin_location || 'NULL'}", Qty Change: ${tx.qty_change}`);
      console.log(`    Before: ${tx.qty_before}, After: ${tx.qty_after}`);
      console.log(`    Performed By: ${tx.performed_by}\n`);
    }

    // 5. Check all putaway lines for the task
    console.log('='.repeat(80));
    console.log('5. ALL PUTAWAY LINES FOR PUT-20251231-0001');
    console.log('='.repeat(80));
    
    const [allLines] = await connection.execute(`
      SELECT 
        id,
        item_code,
        carton_id,
        rack,
        bin,
        qty,
        created_at,
        updated_at
      FROM tabPutawayLine
      WHERE parent_title = 'PUT-20251231-0001'
      ORDER BY item_code, carton_id, id
    `);
    
    console.log(`Total lines: ${allLines.length}\n`);
    for (const line of allLines) {
      console.log(`  ID ${line.id}: ${line.item_code} | Carton: ${line.carton_id || 'NULL'} | Rack: "${line.rack || 'NULL'}" | Bin: "${line.bin || 'NULL'}" | Qty: ${line.qty}`);
    }
    console.log('');

    // 6. Calculate expected vs actual stock
    console.log('='.repeat(80));
    console.log('6. EXPECTED VS ACTUAL STOCK ANALYSIS');
    console.log('='.repeat(80));
    
    // Expected stock from putaway lines
    const [expectedStock] = await connection.execute(`
      SELECT 
        item_code,
        COALESCE(rack, '') as rack,
        COALESCE(bin, '') as bin,
        SUM(qty) as total_qty
      FROM tabPutawayLine
      WHERE parent_title = 'PUT-20251231-0001'
        AND item_code = 'SKU-HAT-301-GRN-OS'
      GROUP BY item_code, COALESCE(rack, ''), COALESCE(bin, '')
      ORDER BY rack, bin
    `);
    
    console.log('Expected stock from putaway lines:');
    for (const exp of expectedStock) {
      const binLocation = exp.rack && exp.bin ? `${exp.rack}-${exp.bin}` : (exp.rack || exp.bin || null);
      console.log(`  Location: "${binLocation}", Qty: ${exp.total_qty}`);
    }
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n✅ Database connection closed');
    }
  }
}

analyzePutawayIssues();

