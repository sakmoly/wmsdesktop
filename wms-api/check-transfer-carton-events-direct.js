// Direct database check for transfer carton events
import { getConnection } from './src/db/connection.js';

const TC_ID = 'TC-MR-123459-1768157787512';

async function checkEvents() {
  const connection = await getConnection();
  
  try {
    console.log(`\n🔍 Checking events for TC: ${TC_ID}\n`);
    
    // Check all events
    const [allEvents] = await connection.execute(`
      SELECT 
        item_code,
        carton_id,
        tc_id,
        qty,
        event_time,
        user_id,
        event_type
      FROM tabWmsScanEvent
      WHERE tc_id = ?
      ORDER BY event_time DESC
    `, [TC_ID]);
    
    console.log(`📊 Total events found: ${allEvents.length}`);
    if (allEvents.length > 0) {
      console.log('\nAll Events:');
      allEvents.forEach((e, i) => {
        console.log(`  ${i + 1}. ${e.event_type} | ${e.item_code || 'NULL'} | carton: ${e.carton_id || 'NULL'} | qty: ${e.qty} | time: ${e.event_time}`);
      });
    }
    
    // Check PACK_ITEM_TO_TC events specifically
    const [packEvents] = await connection.execute(`
      SELECT 
        item_code,
        carton_id,
        tc_id,
        qty,
        event_time,
        user_id
      FROM tabWmsScanEvent
      WHERE event_type = 'PACK_ITEM_TO_TC'
        AND tc_id = ?
      ORDER BY event_time DESC
    `, [TC_ID]);
    
    console.log(`\n📦 PACK_ITEM_TO_TC events: ${packEvents.length}`);
    
    // Test the backend query (what the API uses)
    const [backendQuery] = await connection.execute(`
      SELECT 
        item_code,
        carton_id AS source_carton,
        SUM(qty) AS quantity,
        MAX(user_id) AS packed_by,
        MAX(event_time) AS packed_on
      FROM tabWmsScanEvent
      WHERE tc_id = ?
        AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
        AND item_code IS NOT NULL
        AND item_code != ''
        AND qty > 0
      GROUP BY item_code, carton_id
      ORDER BY packed_on DESC
    `, [TC_ID]);
    
    console.log(`\n🔍 Backend API Query Results: ${backendQuery.length} items`);
    if (backendQuery.length > 0) {
      backendQuery.forEach((item, i) => {
        console.log(`  ${i + 1}. Item: ${item.item_code} | Carton: ${item.source_carton} | Qty: ${item.quantity} | Packed By: ${item.packed_by} | Packed On: ${item.packed_on}`);
      });
    } else {
      console.log('  ⚠️  No items found - this is why desktop app shows empty!');
    }
    
    // Check transfer carton status
    const [tcStatus] = await connection.execute(`
      SELECT tc_id, status, store, to_no, material_request
      FROM tabTransferCarton
      WHERE tc_id = ?
    `, [TC_ID]);
    
    if (tcStatus.length > 0) {
      console.log(`\n📦 Transfer Carton Status: ${tcStatus[0].status}`);
      console.log(`   Store: ${tcStatus[0].store}`);
      console.log(`   TO/No: ${tcStatus[0].to_no || 'NULL'}`);
      console.log(`   Material Request: ${tcStatus[0].material_request || 'NULL'}`);
    } else {
      console.log(`\n⚠️  Transfer Carton ${TC_ID} not found in tabTransferCarton!`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

checkEvents();
