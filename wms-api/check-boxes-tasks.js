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
  
  // Check tabLocation columns
  const [locColumns] = await conn.execute(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabLocation'`);
  console.log('tabLocation columns:', locColumns.map(c => c.COLUMN_NAME).join(', '));
  
  // Check if location exists
  const [locations] = await conn.execute(`SELECT * FROM tabLocation LIMIT 5`);
  console.log('Sample Locations:', JSON.stringify(locations, null, 2));
  
  // Check if A1-R02-L1-B1 exists
  const [targetLoc] = await conn.execute(`SELECT * FROM tabLocation WHERE location_id = 'A1-R02-L1-B1' LIMIT 1`);
  console.log('Target Location A1-R02-L1-B1:', JSON.stringify(targetLoc, null, 2));
  
  await conn.end();
}
check().catch(console.error);
