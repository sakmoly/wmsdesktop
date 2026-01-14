// Check if mobile app events are being stored
import { getConnection } from './src/db/connection.js';

const TC_ID = 'TC-MR-123459-1768206191091';
const ITEM_CODE = 'SKU-HAT-301-BLU-OS';

async function checkEvents() {
  const connection = await getConnection();
  
  try {
    console.log(`\n🔍 Checking events for TC: ${TC_ID}`);
    console.log(`   Item: ${ITEM_CODE}\n`);
    
    // Check all events for this TC
    const [allEvents] = await connection.execute(`
      SELECT 
        item_code,
        qty,
        event_time,
        event_type,
        user_id,
        tc_id
      FROM tabWmsScanEvent
      WHERE tc_id = ?
      ORDER BY event_time DESC
    `, [TC_ID]);
    
    console.log(`📊 Total events for TC: ${allEvents.length}`);
    if (allEvents.length > 0) {
      console.log('\nAll Events:');
      allEvents.forEach((e, i) => {
        console.log(`  ${i + 1}. ${e.event_type} | ${e.item_code || 'NULL'} | qty: ${e.qty} | time: ${e.event_time}`);
      });
    }
    
    // Check events for this specific item
    const [itemEvents] = await connection.execute(`
      SELECT 
        item_code,
        carton_id,
        qty,
        event_time,
        event_type,
        user_id
      FROM tabWmsScanEvent
      WHERE tc_id = ?
        AND item_code = ?
      ORDER BY event_time DESC
    `, [TC_ID, ITEM_CODE]);
    
    console.log(`\n📦 Events for ${ITEM_CODE}: ${itemEvents.length}`);
    if (itemEvents.length > 0) {
      console.log('\nItem Events:');
      itemEvents.forEach((e, i) => {
        console.log(`  ${i + 1}. qty: ${e.qty} | carton: ${e.carton_id || 'NULL'} | time: ${e.event_time}`);
      });
      
      const totalQty = itemEvents.reduce((sum, e) => sum + parseFloat(e.qty || 0), 0);
      console.log(`\n✅ Total Quantity: ${totalQty}`);
    } else {
      console.log(`\n❌ No events found for ${ITEM_CODE} in TC ${TC_ID}`);
      console.log(`   This means the mobile app is NOT sending events to the backend!`);
    }
    
    // Check backend API query result
    const [apiQuery] = await connection.execute(`
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
    
    console.log(`\n🔍 Backend API Query Results: ${apiQuery.length} items`);
    if (apiQuery.length > 0) {
      apiQuery.forEach((item, i) => {
        console.log(`  ${i + 1}. Item: ${item.item_code} | Carton: ${item.source_carton} | Qty: ${item.quantity}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

checkEvents();
