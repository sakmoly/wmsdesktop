// wms-api/check-transfer-carton-events.js
// Check why packing events are not showing for a transfer carton

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms_desktop',
};

async function checkTransferCartonEvents() {
  const tcId = process.argv[2] || 'TC-MR-123460-1768157787512';
  
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database\n');
    
    console.log(`🔍 Checking events for Transfer Carton: ${tcId}\n`);
    
    // Check which column exists: to_no or transfer_order
    const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
    const allColumns = new Set(tableInfo.map((row) => row.Field));
    const toColumn = allColumns.has("to_no") ? "to_no" : (allColumns.has("transfer_order") ? "transfer_order" : null);
    
    // 1. Check if transfer carton exists
    const [tcRows] = await connection.execute(
      `SELECT tc_id, status, ${toColumn || 'to_no'} as transfer_order, store, created_on 
       FROM tabTransferCarton 
       WHERE tc_id = ?`,
      [tcId]
    );
    
    if (tcRows.length === 0) {
      console.log(`❌ Transfer Carton ${tcId} NOT FOUND in database\n`);
      return;
    }
    
    console.log('📦 Transfer Carton Details:');
    console.table(tcRows.map(tc => ({
      tc_id: tc.tc_id,
      status: tc.status,
      transfer_order: tc.transfer_order,
      store: tc.store,
      created_on: tc.created_on
    })));
    console.log('\n');
    
    const transferOrder = tcRows[0].transfer_order;
    
    // 2. Check events with exact tc_id match
    const [eventsWithTcId] = await connection.execute(
      `SELECT 
         offline_uuid,
         event_type,
         tc_id,
         item_code,
         carton_id,
         box_id,
         qty,
         event_time,
         user_id,
         transfer_order
       FROM tabWmsScanEvent
       WHERE tc_id = ?
         AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
       ORDER BY event_time DESC
       LIMIT 20`,
      [tcId]
    );
    
    console.log(`\n📊 Events with tc_id = '${tcId}': ${eventsWithTcId.length}`);
    if (eventsWithTcId.length > 0) {
      console.table(eventsWithTcId.map(e => ({
        event_type: e.event_type,
        item_code: e.item_code,
        qty: e.qty,
        carton_id: e.carton_id || '(empty)',
        box_id: e.box_id || '(empty)',
        event_time: e.event_time?.toISOString() || e.event_time
      })));
    } else {
      console.log('❌ No events found with exact tc_id match\n');
    }
    
    // 3. Check events by transfer_order (fallback)
    if (transferOrder) {
      // Check if material_request column exists
      const [materialRequestColumn] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabWmsScanEvent' 
        AND COLUMN_NAME = 'material_request'
      `);
      const hasMaterialRequestColumn = materialRequestColumn.length > 0;
      
      let query = `SELECT 
         offline_uuid,
         event_type,
         tc_id,
         item_code,
         carton_id,
         box_id,
         qty,
         event_time,
         user_id,
         transfer_order
       FROM tabWmsScanEvent
       WHERE transfer_order = ?
         AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
         AND (tc_id IS NULL OR tc_id = '' OR tc_id != ?)`;
       
      if (hasMaterialRequestColumn) {
        query = query.replace('WHERE transfer_order = ?', 'WHERE (transfer_order = ? OR material_request = ?)');
        var params = [transferOrder, transferOrder, tcId];
      } else {
        var params = [transferOrder, tcId];
      }
      
      query += ` ORDER BY event_time DESC LIMIT 20`;
      
      const [eventsByTransferOrder] = await connection.execute(query, params);
      
      console.log(`\n📊 Events by transfer_order = '${transferOrder}' (without tc_id): ${eventsByTransferOrder.length}`);
      if (eventsByTransferOrder.length > 0) {
        console.table(eventsByTransferOrder.map(e => ({
          event_type: e.event_type,
          item_code: e.item_code,
          qty: e.qty,
          tc_id: e.tc_id || '(empty)',
          carton_id: e.carton_id || '(empty)',
          event_time: e.event_time?.toISOString() || e.event_time
        })));
        console.log('\n⚠️  These events are missing tc_id! They need to be updated.');
      }
    }
    
    // 4. Check recent packing events (any)
    const [recentEvents] = await connection.execute(
      `SELECT 
         offline_uuid,
         event_type,
         tc_id,
         item_code,
         qty,
         event_time,
         transfer_order
       FROM tabWmsScanEvent
       WHERE event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
         AND item_code = 'SKU-HAT-301-GRN-OS'
       ORDER BY event_time DESC
       LIMIT 10`
    );
    
    console.log(`\n📊 Recent packing events for SKU-HAT-301-GRN-OS: ${recentEvents.length}`);
    if (recentEvents.length > 0) {
      console.table(recentEvents.map(e => ({
        event_type: e.event_type,
        tc_id: e.tc_id || '(empty)',
        transfer_order: e.transfer_order || '(empty)',
        qty: e.qty,
        event_time: e.event_time?.toISOString() || e.event_time
      })));
    }
    
    // 5. Check all packing events (summary)
    const [allPackingEvents] = await connection.execute(
      `SELECT 
         COUNT(*) as total,
         COUNT(DISTINCT tc_id) as unique_tc_ids,
         COUNT(CASE WHEN tc_id IS NULL OR tc_id = '' THEN 1 END) as missing_tc_id,
         COUNT(CASE WHEN item_code = 'SKU-HAT-301-GRN-OS' THEN 1 END) as hat_item_count
       FROM tabWmsScanEvent
       WHERE event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')`
    );
    
    console.log('\n📊 All Packing Events Summary:');
    console.table(allPackingEvents);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n📡 Database connection closed');
    }
  }
}

checkTransferCartonEvents().catch(console.error);
