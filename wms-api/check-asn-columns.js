import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root', 
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wms'
  });
  
  const [events] = await conn.execute("SELECT event_type, box_id, item_code, qty FROM tabWmsScanEvent WHERE box_id LIKE 'BOX-ASN-0003%' ORDER BY id DESC LIMIT 10");
  console.log('Scan events for ASN-0003 boxes:', JSON.stringify(events, null, 2));
  
  await conn.end();
}
check().catch(console.error);
