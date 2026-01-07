// Test login logic directly (bypass API server)
// This will help us see exactly what's happening

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

const TEST_CREDENTIALS = {
  user_code: 'sysadmin',
  password: 'sysadmin'
};

async function testLoginLogic() {
  let connection;
  
  try {
    console.log('\n🧪 Testing Login Logic Directly...\n');
    
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Database connected\n');
    
    // Step 1: Query user (same as API)
    console.log(`🔍 Querying user: ${TEST_CREDENTIALS.user_code}`);
    const [users] = await connection.execute(
      `SELECT user_code, name, active, password_hash
       FROM tabUser
       WHERE user_code = ? AND active = 1`,
      [TEST_CREDENTIALS.user_code]
    );
    
    console.log(`📊 Found ${users.length} user(s)\n`);
    
    if (users.length === 0) {
      console.log('❌ User not found or inactive');
      return;
    }
    
    const user = users[0];
    console.log('👤 User Details:');
    console.log(`   user_code: ${user.user_code}`);
    console.log(`   name: ${user.name || 'N/A'}`);
    console.log(`   active: ${user.active}`);
    console.log(`   password_hash: ${user.password_hash ? `${user.password_hash.substring(0, 20)}...` : 'NULL'}\n`);
    
    // Step 2: Test password validation (same as API)
    console.log('🔐 Testing Password Validation...');
    console.log(`   Password received: "${TEST_CREDENTIALS.password}"`);
    
    let passwordValid = false;
    
    if (user.password_hash) {
      // Check if bcrypt hash
      if (user.password_hash.startsWith('$2')) {
        console.log('   Hash type: bcrypt (not supported yet)');
        const sha256Hash = crypto.createHash('sha256').update(TEST_CREDENTIALS.password).digest('hex');
        passwordValid = user.password_hash === sha256Hash;
      } else {
        // SHA256 or plain text
        const plainTextMatch = user.password_hash === TEST_CREDENTIALS.password;
        const sha256Hash = crypto.createHash('sha256').update(TEST_CREDENTIALS.password).digest('hex');
        const hashMatch = user.password_hash === sha256Hash;
        passwordValid = plainTextMatch || hashMatch;
        
        console.log(`   Stored hash: ${user.password_hash}`);
        console.log(`   Computed SHA256: ${sha256Hash}`);
        console.log(`   Plain text match: ${plainTextMatch ? '✅ YES' : '❌ NO'}`);
        console.log(`   Hash match: ${hashMatch ? '✅ YES' : '❌ NO'}`);
      }
    } else {
      // Dev mode - accept any password
      if (process.env.NODE_ENV === 'development') {
        passwordValid = true;
        console.log('   Dev mode: No password hash, accepting any password');
      } else {
        passwordValid = false;
        console.log('   Production mode: No password hash, rejecting');
      }
    }
    
    console.log(`\n📊 Final Result: ${passwordValid ? '✅ VALID' : '❌ INVALID'}\n`);
    
    if (!passwordValid) {
      console.log('❌ Password validation failed!');
      console.log('\n🔧 Attempting to fix...');
      
      // Set correct hash
      const correctHash = crypto.createHash('sha256').update(TEST_CREDENTIALS.password).digest('hex');
      await connection.execute(
        `UPDATE tabUser 
         SET password_hash = ?, updated_at = NOW()
         WHERE user_code = ?`,
        [correctHash, TEST_CREDENTIALS.user_code]
      );
      
      console.log('✅ Password hash updated');
      console.log(`   New hash: ${correctHash}\n`);
      
      // Test again
      console.log('🔄 Testing again...');
      const [verify] = await connection.execute(
        `SELECT password_hash FROM tabUser WHERE user_code = ?`,
        [TEST_CREDENTIALS.user_code]
      );
      
      const newHash = verify[0].password_hash;
      const newHashMatch = newHash === correctHash;
      console.log(`   Hash match: ${newHashMatch ? '✅ YES' : '❌ NO'}`);
      
      if (newHashMatch) {
        console.log('\n✅✅✅ PASSWORD HASH IS NOW CORRECT! ✅✅✅');
        console.log('\n⚠️  IMPORTANT: Restart your API server for changes to take effect!');
        console.log('   Run: npm start (in wms-api directory)');
      }
    } else {
      console.log('✅✅✅ PASSWORD VALIDATION PASSED! ✅✅✅');
      console.log('\n⚠️  If login still fails, check:');
      console.log('   1. API server is running');
      console.log('   2. API server has been restarted after code changes');
      console.log('   3. Check API server logs for detailed error messages');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    if (connection) await connection.end();
  }
}

testLoginLogic();

