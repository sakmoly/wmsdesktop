// Test script to verify dispatch and stock reduction
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

async function testDispatch() {
  console.log('==========================================');
  console.log('Testing Transfer Carton Dispatch & Stock Reduction');
  console.log('==========================================\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'wms_desktop'
  });

  try {
    const tcId = 'TC-MR-123456-1767539596500';
    
    // 1. Check TC status
    console.log('1. Checking Transfer Carton Status...');
    const [tc] = await connection.execute(`
      SELECT tc_id, status, to_no, created_on, sealed_on, dispatched_on, store
      FROM tabTransferCarton
      WHERE tc_id = ?
    `, [tcId]);
    
    if (tc.length === 0) {
      console.log(`❌ Transfer Carton ${tcId} not found`);
      await connection.end();
      return;
    }
    
    const tcData = tc[0];
    console.log(`   TC ID: ${tcData.tc_id}`);
    console.log(`   Status: ${tcData.status}`);
    console.log(`   Transfer Order: ${tcData.to_no}`);
    console.log(`   Created: ${tcData.created_on}`);
    console.log(`   Sealed: ${tcData.sealed_on || 'Not sealed'}`);
    console.log(`   Dispatched: ${tcData.dispatched_on || 'Not dispatched'}`);
    console.log();
    
    if (tcData.status !== 'Sealed') {
      console.log(`⚠️  Transfer Carton is ${tcData.status}, not Sealed. Must be Sealed before dispatch.`);
      await connection.end();
      return;
    }
    
    // 2. Check items in TC (from events)
    console.log('2. Checking items in Transfer Carton...');
    const [items] = await connection.execute(`
      SELECT 
        item_code,
        SUM(qty) as total_qty,
        MAX(event_time) as latest_event
      FROM tabWmsScanEvent
      WHERE (tc_id = ? OR transfer_order = ?)
        AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
        AND item_code IS NOT NULL
      GROUP BY item_code
    `, [tcId, tcData.to_no]);
    
    console.log(`   Found ${items.length} item(s):`);
    items.forEach(item => {
      console.log(`     - ${item.item_code}: ${item.total_qty} pcs`);
    });
    console.log();
    
    // 3. Check current stock before dispatch
    console.log('3. Checking current stock BEFORE dispatch...');
    const materialRequest = tcData.to_no;
    const [mrInfo] = await connection.execute(`
      SELECT from_warehouse
      FROM tabMaterialRequest
      WHERE title = ?
    `, [materialRequest]);
    
    if (mrInfo.length === 0) {
      console.log(`❌ Material Request ${materialRequest} not found`);
      await connection.end();
      return;
    }
    
    const warehouse = mrInfo[0].from_warehouse;
    console.log(`   Warehouse: ${warehouse}`);
    
    for (const item of items) {
      const [stockBefore] = await connection.execute(`
        SELECT 
          bin_location,
          qty,
          last_transaction_type,
          last_transaction_ref
        FROM tabStockLedger
        WHERE item_code = ? AND warehouse = ?
        ORDER BY qty DESC
        LIMIT 5
      `, [item.item_code, warehouse]);
      
      console.log(`   ${item.item_code}:`);
      if (stockBefore.length === 0) {
        console.log(`     ❌ No stock found in stock ledger`);
      } else {
        stockBefore.forEach(s => {
          console.log(`     ${s.bin_location}: ${s.qty} (Last: ${s.last_transaction_type || 'NULL'}, Ref: ${s.last_transaction_ref || 'NULL'})`);
        });
      }
    }
    console.log();
    
    // 4. If not dispatched, show instructions
    if (!tcData.dispatched_on) {
      console.log('4. Transfer Carton is NOT dispatched yet.');
      console.log();
      console.log('📋 To dispatch and reduce stock:');
      console.log('   POST /api/transfer-cartons/dispatch');
      console.log('   Body: {');
      console.log('     "tc_id": "' + tcId + '",');
      console.log('     "dispatched_by": "USER-150526"');
      console.log('   }');
      console.log();
      console.log('   Or use this curl command:');
      console.log(`   curl -X POST http://localhost:3000/api/transfer-cartons/dispatch \\`);
      console.log(`     -H "Content-Type: application/json" \\`);
      console.log(`     -H "Authorization: Bearer YOUR_TOKEN" \\`);
      console.log(`     -d '{"tc_id":"${tcId}","dispatched_by":"USER-150526"}'`);
      console.log();
    } else {
      // 5. Check stock after dispatch
      console.log('4. Transfer Carton is ALREADY dispatched.');
      console.log();
      console.log('5. Checking stock AFTER dispatch...');
      
      for (const item of items) {
        const [stockAfter] = await connection.execute(`
          SELECT 
            bin_location,
            qty,
            last_transaction_type,
            last_transaction_ref
          FROM tabStockLedger
          WHERE item_code = ? AND warehouse = ?
          ORDER BY qty DESC
          LIMIT 5
        `, [item.item_code, warehouse]);
        
        console.log(`   ${item.item_code}:`);
        if (stockAfter.length === 0) {
          console.log(`     ❌ No stock found in stock ledger`);
        } else {
          stockAfter.forEach(s => {
            console.log(`     ${s.bin_location}: ${s.qty} (Last: ${s.last_transaction_type || 'NULL'}, Ref: ${s.last_transaction_ref || 'NULL'})`);
          });
        }
      }
      console.log();
      
      // 6. Check stock transactions
      console.log('6. Checking stock transactions...');
      const [transactions] = await connection.execute(`
        SELECT 
          transaction_date,
          transaction_type,
          reference_doc,
          item_code,
          bin_location,
          qty_change,
          qty_before,
          qty_after
        FROM tabStockTransaction
        WHERE reference_doc = ?
        ORDER BY transaction_date DESC
      `, [tcId]);
      
      if (transactions.length === 0) {
        console.log(`   ⚠️  No stock transactions found for ${tcId}`);
      } else {
        console.log(`   Found ${transactions.length} transaction(s):`);
        transactions.forEach(t => {
          console.log(`     ${t.transaction_date}: ${t.transaction_type} - ${t.item_code} at ${t.bin_location}: ${t.qty_before} → ${t.qty_after} (${t.qty_change})`);
        });
      }
    }
    
    console.log();
    console.log('==========================================');
    console.log('Test Complete');
    console.log('==========================================');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await connection.end();
  }
}

testDispatch();

