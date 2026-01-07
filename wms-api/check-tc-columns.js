// Check tabTransferCarton columns
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function checkColumns() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'wms_desktop'
  });

  try {
    const [cols] = await connection.execute('DESCRIBE tabTransferCarton');
    console.log('tabTransferCarton columns:');
    cols.forEach(col => {
      console.log(`  ${col.Field} (${col.Type}) ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    // Check if dispatched_by exists
    const hasDispatchedBy = cols.some(col => col.Field === 'dispatched_by');
    console.log(`\ndispatched_by column exists: ${hasDispatchedBy}`);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await connection.end();
  }
}

checkColumns();

