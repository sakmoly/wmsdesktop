/**
 * Check transaction history for a specific session
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  
  const sessionId = process.argv[2] || 'RL-20260124-305606';
  
  console.log(`\n=== Transaction History for ${sessionId} ===\n`);
  
  const [rows] = await conn.execute(`
    SELECT 
      id, transaction_type, item_code, warehouse, bin_location, 
      carton_id, qty_change, stock_direction, reference_doc,
      DATE_FORMAT(transaction_date, '%Y-%m-%d %H:%i:%s') as transaction_date
    FROM tabTransactionHistory 
    WHERE reference_doc = ?
    ORDER BY id
  `, [sessionId]);
  
  if (rows.length === 0) {
    console.log('No transactions found for this session.');
    console.log('\nChecking recent CARTON_MERGE transactions...');
    
    const [recent] = await conn.execute(`
      SELECT 
        id, transaction_type, item_code, carton_id, 
        qty_change, stock_direction, reference_doc,
        DATE_FORMAT(transaction_date, '%Y-%m-%d %H:%i:%s') as transaction_date
      FROM tabTransactionHistory 
      WHERE transaction_type = 'CARTON_MERGE'
      ORDER BY id DESC
      LIMIT 10
    `);
    console.table(recent);
  } else {
    console.table(rows);
  }
  
  await conn.end();
}

check().catch(console.error);
