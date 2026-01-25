/**
 * Clean up test data after running tests
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function cleanup() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  
  console.log('🧹 Cleaning up test data...\n');
  
  // Clean test item stock
  const [result1] = await conn.execute(`DELETE FROM tabStockLedger WHERE item_code = 'SKU-TEST-AUTO-001'`);
  console.log(`   Deleted ${result1.affectedRows} test stock ledger entries`);
  
  // Clean test cartons
  const [result2] = await conn.execute(`DELETE FROM tabCartonStock WHERE carton_id LIKE 'CTN-TEST-%'`);
  console.log(`   Deleted ${result2.affectedRows} test carton stock entries`);
  
  const [result3] = await conn.execute(`DELETE FROM tabCarton WHERE carton_id LIKE 'CTN-TEST-%'`);
  console.log(`   Deleted ${result3.affectedRows} test cartons`);
  
  // Clean test sessions
  const [result4] = await conn.execute(`DELETE FROM tabRelocationSession WHERE session_id LIKE 'RL-2026%'`);
  console.log(`   Deleted ${result4.affectedRows} test relocation sessions`);
  
  // Clean test transactions
  const [result5] = await conn.execute(`DELETE FROM tabTransactionHistory WHERE reference_doc LIKE 'RL-2026%'`);
  console.log(`   Deleted ${result5.affectedRows} test transaction history entries`);
  
  console.log('\n✅ Cleanup complete');
  await conn.end();
}

cleanup().catch(console.error);
