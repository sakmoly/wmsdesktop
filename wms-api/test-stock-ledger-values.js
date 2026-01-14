// Test script to verify stock ledger values
import { getConnection } from './src/db/connection.js';

async function test() {
  const connection = await getConnection();
  
  try {
    // Check actual values in database for MR-123457
    const [rows] = await connection.execute(`
      SELECT 
        item_code,
        qty as remaining_stock,
        qty_before,
        qty_reduced,
        last_transaction_type,
        last_transaction_ref,
        last_transaction_date
      FROM tabStockLedger
      WHERE last_transaction_ref = 'MR-123457'
        AND last_transaction_type = 'Picking'
      ORDER BY last_transaction_date DESC
      LIMIT 10
    `);
    
    console.log('\n=== Stock Ledger Data for MR-123457 ===\n');
    console.log(JSON.stringify(rows, null, 2));
    
    // Check if columns exist
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabStockLedger'
        AND COLUMN_NAME IN ('qty_before', 'qty_reduced')
    `);
    
    console.log('\n=== Column Check ===\n');
    console.log(JSON.stringify(columns, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

test();
