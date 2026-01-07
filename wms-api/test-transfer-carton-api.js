/**
 * Test script to verify Transfer Carton API functionality
 * Tests:
 * 1. Sealed transfer carton validation (should reject new items)
 * 2. Transfer carton contents query
 * 3. Material Request transfer carton items display
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function testTransferCartonAPI() {
  console.log('==========================================');
  console.log('Transfer Carton API Test');
  console.log('==========================================\n');

  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'wms_desktop',
      multipleStatements: true
    });

    console.log(`✅ Connected to database: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '3306'}/${process.env.DB_NAME || 'wms_desktop'}\n`);

    // Test 1: Check Transfer Carton Status
    const tcId = 'TC-MR-0001-1767520301021';
    console.log(`📦 Test 1: Checking Transfer Carton Status for ${tcId}`);
    console.log('─'.repeat(60));
    
    // Detect schema first
    const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
    const allColumns = new Set(tableInfo.map(row => row.Field));
    
    const toColumn = allColumns.has('to_no') ? 'to_no' : 
                    (allColumns.has('transfer_order') ? 'transfer_order' : 'to_no');
    const asnColumn = allColumns.has('asn_no') ? 'asn_no' : 
                     (allColumns.has('advance_shipping_notice') ? 'advance_shipping_notice' : 'asn_no');
    
    const [tcRows] = await connection.execute(`
      SELECT tc_id, status, ${toColumn} as to_no, ${asnColumn} as asn_no, store, created_on, sealed_on
      FROM tabTransferCarton
      WHERE tc_id = ?
    `, [tcId]);
    
    if (tcRows.length === 0) {
      console.log(`❌ Transfer Carton ${tcId} not found in database\n`);
    } else {
      const tc = tcRows[0];
      console.log(`✅ Transfer Carton Found:`);
      console.log(`   Status: ${tc.status}`);
      console.log(`   TO/Transfer Order: ${tc.to_no || 'NULL'}`);
      console.log(`   ASN: ${tc.asn_no || 'NULL'}`);
      console.log(`   Store: ${tc.store}`);
      console.log(`   Created On: ${tc.created_on}`);
      console.log(`   Sealed On: ${tc.sealed_on || 'Not sealed'}`);
      
      if (tc.status === 'Sealed' || tc.status === 'Dispatched') {
        console.log(`\n⚠️  WARNING: Transfer Carton is ${tc.status} - should NOT accept new items!`);
      }
    }
    
    console.log('\n');

    // Test 2: Check Events with tc_id
    console.log(`📦 Test 2: Checking Events for Transfer Carton ${tcId}`);
    console.log('─'.repeat(60));
    
    // Detect tabWmsScanEvent columns
    const [eventTableInfo] = await connection.execute(`DESCRIBE tabWmsScanEvent`);
    const eventColumns = new Set(eventTableInfo.map(row => row.Field));
    
    const hasMaterialRequest = eventColumns.has('material_request');
    const hasTransferOrder = eventColumns.has('transfer_order');
    
    const selectFields = [
      'event_type',
      'item_code',
      'qty',
      eventColumns.has('box_id') ? 'box_id' : 'NULL as box_id',
      eventColumns.has('carton_id') ? 'carton_id' : 'NULL as carton_id',
      hasTransferOrder ? 'transfer_order' : 'NULL as transfer_order',
      hasMaterialRequest ? 'material_request' : 'NULL as material_request',
      'event_time',
      'user_id'
    ].join(', ');
    
    const [eventsByTC] = await connection.execute(`
      SELECT ${selectFields}
      FROM tabWmsScanEvent
      WHERE tc_id = ?
      ORDER BY event_time DESC
      LIMIT 20
    `, [tcId]);
    
    console.log(`✅ Found ${eventsByTC.length} events with tc_id = '${tcId}'`);
    if (eventsByTC.length > 0) {
      console.log(`\n   Event Details:`);
      eventsByTC.forEach((event, idx) => {
        console.log(`   ${idx + 1}. ${event.event_type} | Item: ${event.item_code || 'NULL'} | Qty: ${event.qty || 'NULL'} | Box: ${event.box_id || 'NULL'} | Time: ${event.event_time}`);
      });
    } else {
      console.log(`   ⚠️  No events found with tc_id = '${tcId}'`);
    }
    
    console.log('\n');

    // Test 3: Check Events by Material Request Number (Fallback)
    const mrNumber = 'MR-0001';
    console.log(`📦 Test 3: Checking Events by Material Request Number (${mrNumber}) - Fallback Method`);
    console.log('─'.repeat(60));
    
    // Build WHERE clause based on available columns
    let whereClause = '';
    if (hasTransferOrder && hasMaterialRequest) {
      whereClause = '(transfer_order = ? OR material_request = ?)';
    } else if (hasTransferOrder) {
      whereClause = 'transfer_order = ?';
    } else if (hasMaterialRequest) {
      whereClause = 'material_request = ?';
    } else {
      whereClause = '1=0'; // No matching columns
    }
    
    const mrSelectFields = [
      'event_type',
      eventColumns.has('tc_id') ? 'tc_id' : 'NULL as tc_id',
      'item_code',
      'qty',
      eventColumns.has('box_id') ? 'box_id' : 'NULL as box_id',
      eventColumns.has('carton_id') ? 'carton_id' : 'NULL as carton_id',
      hasTransferOrder ? 'transfer_order' : 'NULL as transfer_order',
      hasMaterialRequest ? 'material_request' : 'NULL as material_request',
      'event_time',
      'user_id'
    ].join(', ');
    
    const mrParams = hasTransferOrder && hasMaterialRequest ? [mrNumber, mrNumber] : [mrNumber];
    
    const [eventsByMR] = await connection.execute(`
      SELECT ${mrSelectFields}
      FROM tabWmsScanEvent
      WHERE ${whereClause}
        AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
        AND item_code IS NOT NULL
      ORDER BY event_time DESC
      LIMIT 20
    `, mrParams);
    
    console.log(`✅ Found ${eventsByMR.length} packing events for Material Request ${mrNumber}`);
    if (eventsByMR.length > 0) {
      console.log(`\n   Event Details:`);
      eventsByMR.forEach((event, idx) => {
        console.log(`   ${idx + 1}. ${event.event_type} | TC: ${event.tc_id || 'NULL'} | Item: ${event.item_code} | Qty: ${event.qty} | Time: ${event.event_time}`);
      });
    } else {
      console.log(`   ⚠️  No packing events found for Material Request ${mrNumber}`);
    }
    
    console.log('\n');

    // Test 4: Query Carton Contents (Desktop App Query - Primary)
    console.log(`📦 Test 4: Querying Carton Contents (Desktop App Query - Primary)`);
    console.log('─'.repeat(60));
    
    const [cartonContents] = await connection.execute(`
      SELECT 
        item_code, 
        COALESCE(box_id, carton_id) as source_carton,
        SUM(qty) as total_qty,
        MAX(event_time) as latest_event_time,
        MAX(user_id) as latest_user_id
      FROM tabWmsScanEvent
      WHERE tc_id = ?
        AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
        AND item_code IS NOT NULL
      GROUP BY item_code, COALESCE(box_id, carton_id)
      ORDER BY latest_event_time DESC
    `, [tcId]);
    
    // Test 4b: Query Carton Contents (Fallback - by MR number and time window)
    if (cartonContents.length === 0 && tcRows.length > 0) {
      const tc = tcRows[0];
      const mrNumber = tc.to_no;
      const createdOn = tc.created_on;
      const sealedOn = tc.sealed_on;
      
      console.log(`\n📦 Test 4b: Querying Carton Contents (Fallback - by MR number)`);
      console.log('─'.repeat(60));
      
      let fallbackSql = `
        SELECT 
          item_code, 
          COALESCE(box_id, carton_id) as source_carton,
          SUM(qty) as total_qty,
          MAX(event_time) as latest_event_time,
          MAX(user_id) as latest_user_id
        FROM tabWmsScanEvent
        WHERE (transfer_order = ? OR material_request = ?)
          AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
          AND item_code IS NOT NULL
          AND (tc_id IS NULL OR tc_id = ?)`;
      
      const fallbackParams = [mrNumber, mrNumber, tcId];
      
      if (createdOn || sealedOn) {
        const startTime = createdOn || new Date(sealedOn.getTime() - 3600000); // 1 hour before seal
        const endTime = sealedOn || new Date(createdOn.getTime() + 7200000); // 2 hours after creation
        fallbackSql += ` AND event_time >= ? AND event_time <= ?`;
        fallbackParams.push(startTime, endTime);
        console.log(`   Using time window: ${startTime.toISOString()} to ${endTime.toISOString()}`);
      } else {
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - 86400000); // 24 hours ago
        fallbackSql += ` AND event_time >= ? AND event_time <= ?`;
        fallbackParams.push(startTime, endTime);
        console.log(`   Using default time window (last 24 hours)`);
      }
      
      fallbackSql += ` GROUP BY item_code, COALESCE(box_id, carton_id) ORDER BY latest_event_time DESC`;
      
      const [fallbackContents] = await connection.execute(fallbackSql, fallbackParams);
      
      if (fallbackContents.length > 0) {
        console.log(`✅ Found ${fallbackContents.length} items via fallback method`);
        console.log(`\n   Fallback Carton Contents:`);
        let totalPieces = 0;
        fallbackContents.forEach((item, idx) => {
          totalPieces += parseFloat(item.total_qty) || 0;
          console.log(`   ${idx + 1}. Item: ${item.item_code} | Source: ${item.source_carton || 'NULL'} | Qty: ${item.total_qty} | Packed By: ${item.latest_user_id || 'NULL'} | Packed On: ${item.latest_event_time}`);
        });
        console.log(`\n   Total Pieces: ${totalPieces}`);
        console.log(`   Unique SKUs: ${fallbackContents.length}`);
        console.log(`\n   ⚠️  NOTE: Items found via fallback - mobile app should include tc_id in events!`);
      } else {
        console.log(`   ⚠️  No items found via fallback method either`);
      }
    }
    
    console.log(`✅ Found ${cartonContents.length} unique items in transfer carton ${tcId}`);
    if (cartonContents.length > 0) {
      console.log(`\n   Carton Contents:`);
      let totalPieces = 0;
      cartonContents.forEach((item, idx) => {
        totalPieces += parseFloat(item.total_qty) || 0;
        console.log(`   ${idx + 1}. Item: ${item.item_code} | Source: ${item.source_carton || 'NULL'} | Qty: ${item.total_qty} | Packed By: ${item.latest_user_id || 'NULL'} | Packed On: ${item.latest_event_time}`);
      });
      console.log(`\n   Total Pieces: ${totalPieces}`);
      console.log(`   Unique SKUs: ${cartonContents.length}`);
    } else {
      console.log(`   ⚠️  No items found in carton contents query`);
      console.log(`   This means items are not showing in desktop app!`);
    }
    
    console.log('\n');

    // Test 5: Check for Recent Packing Events (After Sealing)
    if (tcRows.length > 0 && tcRows[0].sealed_on) {
      console.log(`📦 Test 5: Checking for Events After Sealing`);
      console.log('─'.repeat(60));
      
      const sealedOn = tcRows[0].sealed_on;
      const [eventsAfterSeal] = await connection.execute(`
        SELECT 
          event_type,
          item_code,
          qty,
          event_time,
          user_id
        FROM tabWmsScanEvent
        WHERE tc_id = ?
          AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
          AND event_time > ?
        ORDER BY event_time DESC
      `, [tcId, sealedOn]);
      
      if (eventsAfterSeal.length > 0) {
        console.log(`❌ PROBLEM: Found ${eventsAfterSeal.length} packing events AFTER sealing!`);
        console.log(`   Sealed On: ${sealedOn}`);
        console.log(`   Events after sealing:`);
        eventsAfterSeal.forEach((event, idx) => {
          console.log(`   ${idx + 1}. ${event.event_type} | Item: ${event.item_code} | Qty: ${event.qty} | Time: ${event.event_time} | User: ${event.user_id}`);
        });
        console.log(`\n   ⚠️  These events should have been REJECTED by the API!`);
      } else {
        console.log(`✅ No events found after sealing - Good!`);
      }
    }
    
    console.log('\n');
    console.log('==========================================');
    console.log('Test Complete');
    console.log('==========================================');

  } catch (error) {
    console.error('❌ Error during test:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

testTransferCartonAPI();

