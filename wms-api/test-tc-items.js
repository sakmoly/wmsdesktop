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
  console.log('Checking Transfer Carton:', tcId);
  
  // Get TC details
  const [tcRows] = await conn.execute('SELECT tc_id, status, to_no, store, created_on, sealed_on FROM tabTransferCarton WHERE tc_id = ?', [tcId]);
  if (tcRows.length === 0) {
    console.log('TC not found!');
    await conn.end();
    return;
  }
  
  const tc = tcRows[0];
  console.log('TC Status:', tc.status);
  console.log('TC Created:', tc.created_on);
  console.log('TC TO:', tc.to_no);
  console.log('');
  
  // Check events with tc_id
  const [eventsWithTC] = await conn.execute('SELECT COUNT(*) as count FROM tabWmsScanEvent WHERE tc_id = ?', [tcId]);
  console.log('Events with tc_id:', eventsWithTC[0].count);
  
  // Check events by MR number (no tc_id)
  const [mrEvents] = await conn.execute(`
    SELECT COUNT(*) as count, MIN(event_time) as earliest, MAX(event_time) as latest 
    FROM tabWmsScanEvent 
    WHERE transfer_order = ? 
      AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
      AND item_code IS NOT NULL
      AND (tc_id IS NULL OR tc_id = ?)
  `, [tc.to_no, tcId]);
  
  console.log('MR Events (no tc_id or matching tc_id):', mrEvents[0].count);
  if (mrEvents[0].count > 0) {
    console.log('Earliest event:', mrEvents[0].earliest);
    console.log('Latest event:', mrEvents[0].latest);
  }
  
  // Check with time window (current logic)
  if (tc.created_on) {
    const startTime = new Date(tc.created_on);
    const endTime = new Date(tc.created_on);
    endTime.setHours(endTime.getHours() + 2);
    
    const [timeWindowEvents] = await conn.execute(`
      SELECT COUNT(*) as count
      FROM tabWmsScanEvent 
      WHERE transfer_order = ? 
        AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
        AND item_code IS NOT NULL
        AND (tc_id IS NULL OR tc_id = ?)
        AND event_time >= ? AND event_time <= ?
    `, [tc.to_no, tcId, startTime, endTime]);
    
    console.log('');
    console.log('With time window (created_on to +2 hours):', timeWindowEvents[0].count);
    console.log('Time window:', startTime.toISOString(), 'to', endTime.toISOString());
  }
  
  await conn.end();
}

test().catch(console.error);

