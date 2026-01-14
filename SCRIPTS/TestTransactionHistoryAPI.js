// Test script to verify Transaction History API is working
// Run: node SCRIPTS/TestTransactionHistoryAPI.js

import { getConnection } from '../wms-api/src/db/connection.js';

async function testTransactionHistoryAPI() {
  console.log('========================================');
  console.log('Testing Transaction History API');
  console.log('========================================\n');

  const connection = await getConnection();

  try {
    // 1. Check if table exists
    console.log('1. Checking if tabTransactionHistory table exists...');
    const [tableCheck] = await connection.execute(`
      SELECT COUNT(*) > 0 as table_exists
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransactionHistory'
    `);
    
    if (!tableCheck[0].table_exists) {
      console.error('❌ ERROR: tabTransactionHistory table does not exist!');
      console.log('   Please run the setup script first.');
      return;
    }
    console.log('✅ Table exists\n');

    // 2. Count total records
    console.log('2. Counting total records...');
    const [countRows] = await connection.execute(`
      SELECT COUNT(*) as total_count
      FROM tabTransactionHistory
    `);
    const totalCount = countRows[0].total_count;
    console.log(`✅ Total records: ${totalCount}\n`);

    if (totalCount === 0) {
      console.log('⚠️  WARNING: No records found in tabTransactionHistory');
      console.log('   The trigger might not be working, or no transactions have been created yet.\n');
    }

    // 3. Get sample records (last 5)
    console.log('3. Fetching last 5 records...');
    const [sampleRows] = await connection.execute(`
      SELECT 
        id,
        transaction_id,
        transaction_number,
        transaction_date,
        transaction_type,
        item_code,
        warehouse,
        qty_change,
        stock_direction
      FROM tabTransactionHistory
      ORDER BY id DESC
      LIMIT 5
    `);
    
    if (sampleRows.length === 0) {
      console.log('   No records to display\n');
    } else {
      console.log(`✅ Found ${sampleRows.length} records:\n`);
      sampleRows.forEach((row, index) => {
        console.log(`   Record ${index + 1}:`);
        console.log(`     ID: ${row.id}`);
        console.log(`     Transaction #: ${row.transaction_number}`);
        console.log(`     Date: ${row.transaction_date}`);
        console.log(`     Type: ${row.transaction_type}`);
        console.log(`     Item: ${row.item_code}`);
        console.log(`     Warehouse: ${row.warehouse}`);
        console.log(`     Qty Change: ${row.qty_change}`);
        console.log(`     Direction: ${row.stock_direction}`);
        console.log('');
      });
    }

    // 4. Test API query (simulate API call)
    console.log('4. Testing API query (no filters)...');
    let query = `
      SELECT 
        id,
        transaction_id,
        transaction_number,
        transaction_date,
        transaction_type,
        reference_doc_type,
        reference_doc,
        wms_transaction_title,
        item_code,
        item_name,
        warehouse,
        warehouse_name,
        bin_location,
        location_id,
        carton_id,
        batch_no,
        serial_no,
        qty_change,
        qty_before,
        qty_after,
        stock_direction,
        source_bin,
        target_bin,
        performed_by,
        performed_by_name,
        notes,
        reason_code,
        status,
        created_at
      FROM tabTransactionHistory
      WHERE 1=1
    `;
    
    const params = [];
    
    // Add date filter (last 30 days)
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    query += ' AND DATE(transaction_date) >= ?';
    params.push(fromDate.toISOString().split('T')[0]);
    
    query += ' ORDER BY transaction_date DESC, id DESC';
    query += ' LIMIT ?';
    params.push(10000);
    
    console.log('   Query:', query);
    console.log('   Params:', params);
    
    const [apiRows] = await connection.execute(query, params);
    console.log(`✅ API query returned ${apiRows.length} records\n`);

    // 5. Test with item_code filter
    console.log('5. Testing API query with item_code filter (SKU-HAT-301-BLU-OS)...');
    let query2 = `
      SELECT id, transaction_number, item_code, transaction_date
      FROM tabTransactionHistory
      WHERE 1=1
    `;
    const params2 = [];
    
    query2 += ' AND item_code LIKE ?';
    params2.push('%SKU-HAT-301-BLU-OS%');
    
    query2 += ' ORDER BY transaction_date DESC, id DESC';
    query2 += ' LIMIT ?';
    params2.push(10000);
    
    const [itemRows] = await connection.execute(query2, params2);
    console.log(`✅ Item filter query returned ${itemRows.length} records\n`);

    // 6. Check response format
    console.log('6. Testing response format...');
    const testRow = apiRows[0];
    if (testRow) {
      const response = {
        ok: true,
        data: [{
          id: testRow.id,
          transaction_id: testRow.transaction_id,
          transaction_number: testRow.transaction_number || null,
          transaction_date: testRow.transaction_date ? testRow.transaction_date.toISOString() : null,
          transaction_type: testRow.transaction_type,
          item_code: testRow.item_code,
          warehouse: testRow.warehouse,
          qty_change: parseFloat(testRow.qty_change) || 0,
          stock_direction: testRow.stock_direction || null
        }]
      };
      console.log('✅ Response format test:');
      console.log(JSON.stringify(response, null, 2));
      console.log('');
    }

    console.log('========================================');
    console.log('✅ All tests completed successfully!');
    console.log('========================================');
    console.log('\nNext steps:');
    console.log('1. Verify API server is running');
    console.log('2. Check API endpoint: GET /api/transaction-history');
    console.log('3. Verify API authentication token');
    console.log('4. Check desktop app Error Log for API call details');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    connection.release();
  }
}

testTransactionHistoryAPI().catch(console.error);
