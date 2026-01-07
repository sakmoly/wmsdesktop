import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'wms_desktop'
  });
  
  const tcId = 'TC-MR-0001-1767524449896';
  console.log('Testing Sealed Transfer Carton:', tcId);
  
  const [tcRows] = await conn.execute('SELECT tc_id, status, to_no, created_on, sealed_on FROM tabTransferCarton WHERE tc_id = ?', [tcId]);
  if (tcRows.length === 0) {
    console.log('TC not found!');
    await conn.end();
    return;
  }
  
  const tc = tcRows[0];
  console.log('Status:', tc.status);
  console.log('Created:', tc.created_on);
  console.log('Sealed:', tc.sealed_on);
  console.log('');
  
  const createdOn = new Date(tc.created_on);
  const sealedOn = tc.sealed_on ? new Date(tc.sealed_on) : null;
  
  // New logic: Look back 6 hours before creation
  const startTime = new Date(createdOn.getTime() - 6 * 3600000);
  const endTime = sealedOn ? new Date(sealedOn.getTime() + 2 * 3600000) : new Date();
  
  console.log('Time window (new logic):');
  console.log('  Start:', startTime.toISOString());
  console.log('  End:', endTime.toISOString());
  console.log('');
  
  const [events] = await conn.execute(`
    SELECT COUNT(*) as count
    FROM tabWmsScanEvent 
    WHERE transfer_order = ? 
      AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
      AND item_code IS NOT NULL
      AND (tc_id IS NULL OR tc_id = ?)
      AND event_time >= ? AND event_time <= ?
  `, [tc.to_no, tcId, startTime, endTime]);
  
  console.log('Events found with new time window:', events[0].count);
  
  // Also get item details
  const [items] = await conn.execute(`
    SELECT 
      item_code,
      COALESCE(box_id, carton_id) as source_carton,
      SUM(qty) as total_qty
    FROM tabWmsScanEvent 
    WHERE transfer_order = ? 
      AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
      AND item_code IS NOT NULL
      AND (tc_id IS NULL OR tc_id = ?)
      AND event_time >= ? AND event_time <= ?
    GROUP BY item_code, COALESCE(box_id, carton_id)
  `, [tc.to_no, tcId, startTime, endTime]);
  
  if (items.length > 0) {
    console.log('\nItems found:');
    items.forEach(item => {
      console.log(`  ${item.item_code}: ${item.total_qty} (from ${item.source_carton || 'NULL'})`);
    });
  }
  
  await conn.end();
}

test().catch(console.error);

