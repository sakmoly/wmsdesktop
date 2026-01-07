// Test login with password "123456" (changed from desktop app)
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
  password: '123456'
};

async function testAndFix() {
  let connection;
  
  try {
    console.log('\n' + '='.repeat(70));
    console.log('🔧 TESTING LOGIN WITH PASSWORD: 123456');
    console.log('='.repeat(70) + '\n');
    
    // Step 1: Connect to database
    console.log('📡 Step 1: Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected\n');
    
    // Step 2: Check current password hash
    console.log('🔍 Step 2: Checking current password hash...');
    const [users] = await connection.execute(
      `SELECT user_code, name, active, password_hash
       FROM tabUser
       WHERE user_code = ?`,
      [TEST_CREDENTIALS.user_code]
    );
    
    if (users.length === 0) {
      console.log('❌ User not found!');
      return;
    }
    
    const user = users[0];
    console.log(`✅ User found: ${user.user_code}`);
    console.log(`   Active: ${user.active === 1 ? '✅ Yes' : '❌ No'}`);
    console.log(`   Current hash: ${user.password_hash ? `${user.password_hash.substring(0, 20)}...` : 'NULL'}\n`);
    
    // Step 3: Compute expected hash for "123456"
    console.log('🔐 Step 3: Computing SHA256 hash for "123456"...');
    const expectedHash = crypto.createHash('sha256').update(TEST_CREDENTIALS.password).digest('hex');
    console.log(`   Password: "${TEST_CREDENTIALS.password}"`);
    console.log(`   Expected hash: ${expectedHash}\n`);
    
    // Step 4: Compare hashes
    console.log('🔍 Step 4: Comparing hashes...');
    const hashMatch = user.password_hash === expectedHash;
    console.log(`   Stored hash: ${user.password_hash || 'NULL'}`);
    console.log(`   Expected hash: ${expectedHash}`);
    console.log(`   Match: ${hashMatch ? '✅ YES' : '❌ NO'}\n`);
    
    // Step 5: Fix if needed
    if (!hashMatch) {
      console.log('🔧 Step 5: Updating password hash to match "123456"...');
      await connection.execute(
        `UPDATE tabUser
         SET password_hash = ?,
             updated_at = NOW()
         WHERE user_code = ?`,
        [expectedHash, TEST_CREDENTIALS.user_code]
      );
      console.log('✅ Password hash updated\n');
      
      // Verify
      const [verify] = await connection.execute(
        `SELECT password_hash FROM tabUser WHERE user_code = ?`,
        [TEST_CREDENTIALS.user_code]
      );
      const newHash = verify[0].password_hash;
      console.log(`   New hash: ${newHash}`);
      console.log(`   Match: ${newHash === expectedHash ? '✅ YES' : '❌ NO'}\n`);
    } else {
      console.log('✅ Step 5: Password hash is already correct\n');
    }
    
    // Step 6: Test API endpoint
    console.log('🌐 Step 6: Testing API endpoint...');
    console.log(`   URL: http://localhost:3000/api/auth/login`);
    console.log(`   Credentials: ${TEST_CREDENTIALS.user_code} / ${TEST_CREDENTIALS.password}\n`);
    
    try {
      const response = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(TEST_CREDENTIALS)
      });
      
      const data = await response.json();
      
      console.log(`   Status: ${response.status}`);
      console.log(`   Response:`, JSON.stringify(data, null, 2));
      
      if (data.success || data.ok) {
        console.log('\n✅✅✅ LOGIN IS WORKING! ✅✅✅\n');
        if (data.data?.access_token) {
          console.log(`Token: ${data.data.access_token.substring(0, 30)}...`);
        }
      } else {
        console.log('\n❌ Login still failing');
        console.log(`   Error Code: ${data.error?.code || 'UNKNOWN'}`);
        console.log(`   Error Message: ${data.error?.message || 'Unknown error'}`);
        
        if (data.error?.debug || data.debug) {
          console.log('\n📊 Debug Info:');
          console.log(JSON.stringify(data.error?.debug || data.debug, null, 2));
        }
        
        console.log('\n⚠️  TROUBLESHOOTING:');
        console.log('   1. Make sure API server is running: npm start');
        console.log('   2. Make sure API server was restarted after code changes');
        console.log('   3. Check API server console for detailed logs');
        console.log('   4. The password hash in database is now correct');
        console.log('   5. Try restarting the API server again');
      }
    } catch (fetchError) {
      if (fetchError.code === 'ECONNREFUSED') {
        console.log('\n❌ API server is not running!');
        console.log('\n⚠️  ACTION REQUIRED:');
        console.log('   1. Open a new terminal');
        console.log('   2. Navigate to: wms-api directory');
        console.log('   3. Run: npm start');
        console.log('   4. Wait for server to start');
        console.log('   5. Run this script again');
      } else {
        console.log('\n❌ Error testing API:', fetchError.message);
      }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ Test completed');
    console.log('='.repeat(70) + '\n');
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
  } finally {
    if (connection) await connection.end();
  }
}

testAndFix();

