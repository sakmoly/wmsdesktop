import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  
  console.log('=== ASN/Transfer Orders ===');
  const [asns] = await conn.execute('SELECT title, status, advance_shipping_notice FROM tabTransferOrder ORDER BY created_at DESC LIMIT 10');
  console.log(asns.length > 0 ? asns : 'No ASN/Transfer Orders found');
  
  console.log('\n=== Putaway Tasks ===');
  const [putaways] = await conn.execute('SELECT title, source_type, status, warehouse FROM tabPutawayTask ORDER BY created_at DESC LIMIT 10');
  console.log(putaways.length > 0 ? putaways : 'No Putaway Tasks found');
  
  console.log('\n=== Inbound Sessions ===');
  try {
    const [sessions] = await conn.execute('SELECT * FROM tabInboundSession ORDER BY created_at DESC LIMIT 10');
    console.log(sessions.length > 0 ? sessions : 'No Inbound Sessions found');
  } catch(e) { console.log('Table not exists or empty'); }
  
  console.log('\n=== Test Cartons (CTN-ASN-*, CTN-PUT-*) ===');
  const [cartons] = await conn.execute(`SELECT carton_id, current_bin_id, status FROM tabCarton WHERE carton_id LIKE 'CTN-ASN-%' OR carton_id LIKE 'CTN-PUT-%' ORDER BY created_on DESC LIMIT 10`);
  console.log(cartons.length > 0 ? cartons : 'No test cartons found');
  
  console.log('\n=== Transaction History (ASN/Putaway types) ===');
  const [txns] = await conn.execute(`SELECT id, transaction_type, reference_doc, carton_id, qty_change FROM tabTransactionHistory WHERE transaction_type IN ('ASN_RECEIVE', 'Putaway') ORDER BY id DESC LIMIT 10`);
  console.log(txns.length > 0 ? txns : 'No ASN/Putaway transactions found');
  
  console.log('\n=== All Transaction Types in DB ===');
  const [types] = await conn.execute('SELECT DISTINCT transaction_type, COUNT(*) as cnt FROM tabTransactionHistory GROUP BY transaction_type');
  console.log(types);
  
  await conn.end();
}
check().catch(console.error);
