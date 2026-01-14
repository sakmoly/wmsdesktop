// Check transfer carton events and query
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

async function checkQuery() {
  const conn = await mysql.createConnection(dbConfig);
  
  try {
    const tcId = 'TC-MR-123456-1768218343676';
    
    console.log(`\n🔍 Checking events for TC: ${tcId}\n`);
    
    // Check all events
    const [allEvents] = await conn.execute(
      `SELECT event_type, item_code, carton_id, tc_id, qty, event_time 
       FROM tabWmsScanEvent 
       WHERE tc_id = ? 
       ORDER BY event_time DESC 
       LIMIT 20`,
      [tcId]
    );
    
    console.log(`📊 Total events found: ${allEvents.length}`);
    if (allEvents.length > 0) {
      console.log('\nAll Events:');
      allEvents.forEach((e, i) => {
        console.log(`  ${i + 1}. ${e.event_type} | ${e.item_code} | carton: ${e.carton_id || 'NULL'} | qty: ${e.qty} | time: ${e.event_time}`);
      });
    }
    
    // Check packing events
    const [packEvents] = await conn.execute(
      `SELECT event_type, item_code, carton_id, tc_id, qty, event_time 
       FROM tabWmsScanEvent 
       WHERE tc_id = ? 
         AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
         AND item_code IS NOT NULL
       ORDER BY event_time DESC`,
      [tcId]
    );
    
    console.log(`\n📦 Packing events (PACK_BOX_TO_TC, PACK_ITEM_TO_TC): ${packEvents.length}`);
    
    // Test the GROUP BY query (desktop app query - FIXED)
    console.log('\n🔍 Testing GROUP BY query (desktop app query - FIXED):');
    const [grouped] = await conn.execute(
      `SELECT 
         item_code,
         carton_id,
         tc_id,
         COALESCE(MAX(box_id), carton_id) as source_carton,
         SUM(qty) as total_qty,
         MAX(event_time) as latest_event_time,
         MAX(user_id) as latest_user_id
       FROM tabWmsScanEvent
       WHERE tc_id = ?
         AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
         AND item_code IS NOT NULL
         AND qty > 0
       GROUP BY item_code, carton_id, tc_id
       ORDER BY latest_event_time DESC`,
      [tcId]
    );
    
    console.log(`\n✅ Grouped results: ${grouped.length} items`);
    if (grouped.length > 0) {
      grouped.forEach((g, i) => {
        console.log(`  ${i + 1}. Item: ${g.item_code} | Carton: ${g.carton_id || 'NULL'} | Source: ${g.source_carton || 'NULL'} | Total Qty: ${g.total_qty}`);
      });
    } else {
      console.log('  ❌ No grouped results found!');
      
      // Debug: Check if qty > 0 filter is the issue
      const [withZeroQty] = await conn.execute(
        `SELECT item_code, carton_id, qty 
         FROM tabWmsScanEvent 
         WHERE tc_id = ? 
           AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
           AND item_code IS NOT NULL`,
        [tcId]
      );
      
      if (withZeroQty.length > 0) {
        console.log('\n⚠️  Events with qty (including zeros):');
        withZeroQty.forEach((e, i) => {
          console.log(`  ${i + 1}. ${e.item_code} | carton: ${e.carton_id || 'NULL'} | qty: ${e.qty}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await conn.end();
  }
}

checkQuery();
