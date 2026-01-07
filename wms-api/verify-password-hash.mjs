// Verify the password hash in database matches what we expect
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms_desktop',
};

async function verifyHash() {
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    
    // Get current hash from database
    const [users] = await connection.execute(
      `SELECT user_code, password_hash FROM tabUser WHERE user_code = 'sysadmin'`
    );
    
    if (users.length === 0) {
      console.log('❌ User not found');
      return;
    }
    
    const storedHash = users[0].password_hash;
    const password = 'sysadmin';
    
    // Compute expected hash
    const expectedHash = crypto.createHash('sha256').update(password).digest('hex');
    
    console.log('\n📊 Password Hash Verification:');
    console.log(`Password: "${password}"`);
    console.log(`Stored Hash: ${storedHash}`);
    console.log(`Expected Hash: ${expectedHash}`);
    console.log(`Match: ${storedHash === expectedHash ? '✅ YES' : '❌ NO'}`);
    
    if (storedHash !== expectedHash) {
      console.log('\nWARNING: Hashes don\'t match! Updating...');
      await connection.execute(
        `UPDATE tabUser SET password_hash = ?, updated_at = NOW() WHERE user_code = 'sysadmin'`,
        [expectedHash]
      );
      console.log('✅ Hash updated');
      
      // Verify again
      const [verify] = await connection.execute(
        `SELECT password_hash FROM tabUser WHERE user_code = 'sysadmin'`
      );
      console.log(`New Hash: ${verify[0].password_hash}`);
      console.log(`Match Now: ${verify[0].password_hash === expectedHash ? '✅ YES' : '❌ NO'}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

verifyHash();

