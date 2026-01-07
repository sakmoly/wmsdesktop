// Test and Auto-Fix Login for sysadmin
// This script will:
// 1. Check database state
// 2. Test login endpoint
// 3. Fix any issues automatically
// 4. Verify it works

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

const API_URL = 'http://localhost:3000/api/auth/login';
const TEST_CREDENTIALS = {
  user_code: 'sysadmin',
  password: 'sysadmin'
};

async function checkDatabaseState(connection) {
  console.log('\n📊 Checking database state...');
  
  const [users] = await connection.execute(
    `SELECT user_code, name, active, password_hash, updated_at
     FROM tabUser
     WHERE user_code = ?`,
    [TEST_CREDENTIALS.user_code]
  );
  
  if (users.length === 0) {
    console.log('❌ User not found in database!');
    return { found: false, active: false, hasPassword: false, user: null };
  }
  
  const user = users[0];
  const hasPassword = user.password_hash !== null && user.password_hash !== '';
  const isActive = user.active === 1;
  
  console.log(`✅ User found: ${user.user_code}`);
  console.log(`   Name: ${user.name || 'N/A'}`);
  console.log(`   Active: ${isActive ? '✅ Yes' : '❌ No'}`);
  console.log(`   Password Hash: ${hasPassword ? '✅ Set' : '❌ NULL/Empty'}`);
  if (hasPassword) {
    console.log(`   Hash Preview: ${user.password_hash.substring(0, 20)}...`);
  }
  
  return { found: true, active: isActive, hasPassword, user };
}

async function testLogin() {
  console.log('\n🧪 Testing login endpoint...');
  console.log(`URL: ${API_URL}`);
  console.log(`Credentials: ${TEST_CREDENTIALS.user_code} / ${TEST_CREDENTIALS.password}`);
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(TEST_CREDENTIALS)
    });
    
    const data = await response.json();
    
    console.log(`\n📥 Response Status: ${response.status}`);
    console.log(`📥 Response Body:`, JSON.stringify(data, null, 2));
    
    if (data.success || data.ok) {
      console.log('\n✅ Login successful!');
      if (data.data?.access_token) {
        console.log(`Token: ${data.data.access_token.substring(0, 30)}...`);
      }
      return { success: true, data };
    } else {
      console.log('\n❌ Login failed');
      console.log(`Error Code: ${data.error?.code || 'UNKNOWN'}`);
      console.log(`Error Message: ${data.error?.message || 'Unknown error'}`);
      return { success: false, data, status: response.status };
    }
  } catch (error) {
    console.error('\n❌ Test request failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('⚠️  API server is not running! Please start it with: npm start');
    }
    return { success: false, error: error.message };
  }
}

async function fixUser(connection, dbState) {
  console.log('\n🔧 Fixing user account...');
  
  // Calculate SHA256 hash for password "sysadmin"
  const crypto = await import('crypto');
  const passwordHash = crypto.createHash('sha256')
    .update(TEST_CREDENTIALS.password)
    .digest('hex');
  
  console.log(`Setting password hash for "${TEST_CREDENTIALS.password}"`);
  console.log(`Hash: ${passwordHash.substring(0, 20)}...`);
  
  if (!dbState.found) {
    // Create user if doesn't exist
    console.log('Creating new user...');
    await connection.execute(
      `INSERT INTO tabUser (user_code, name, active, password_hash, created_at, updated_at)
       VALUES (?, ?, 1, ?, NOW(), NOW())`,
      [TEST_CREDENTIALS.user_code, 'System Administrator', passwordHash]
    );
    console.log('✅ User created');
  } else {
    // Update existing user
    await connection.execute(
      `UPDATE tabUser
       SET active = 1,
           password_hash = ?,
           updated_at = NOW()
       WHERE user_code = ?`,
      [passwordHash, TEST_CREDENTIALS.user_code]
    );
    console.log('✅ User updated');
  }
  
  // Verify the fix
  const [verify] = await connection.execute(
    `SELECT user_code, active, password_hash
     FROM tabUser
     WHERE user_code = ?`,
    [TEST_CREDENTIALS.user_code]
  );
  
  if (verify.length > 0 && verify[0].active === 1 && verify[0].password_hash === passwordHash) {
    console.log('✅ Fix verified - user is active with correct password hash');
    return true;
  } else {
    console.log('❌ Fix verification failed');
    return false;
  }
}

async function main() {
  console.log('\n🚀 Starting Login Test and Auto-Fix...\n');
  console.log('='.repeat(60));
  
  let connection;
  
  try {
    // Step 1: Connect to database
    console.log('\n📡 Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Database connected');
    
    // Step 2: Check database state
    const dbState = await checkDatabaseState(connection);
    
    // Step 3: Test login
    const loginResult = await testLogin();
    
    // Step 4: If login failed, fix it
    if (!loginResult.success) {
      console.log('\n⚠️  Login failed. Attempting to fix...');
      
      const fixed = await fixUser(connection, dbState);
      
      if (fixed) {
        console.log('\n⏳ Waiting 1 second for changes to propagate...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Step 5: Test again
        console.log('\n🔄 Testing login again after fix...');
        const retestResult = await testLogin();
        
        if (retestResult.success) {
          console.log('\n✅✅✅ LOGIN IS NOW WORKING! ✅✅✅');
          process.exit(0);
        } else {
          console.log('\n❌ Login still failing after fix');
          console.log('Please check:');
          console.log('1. API server is running');
          console.log('2. API server has been restarted after code changes');
          console.log('3. Database connection is correct');
          process.exit(1);
        }
      } else {
        console.log('\n❌ Failed to fix user account');
        process.exit(1);
      }
    } else {
      console.log('\n✅✅✅ LOGIN IS ALREADY WORKING! ✅✅✅');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n📡 Database connection closed');
    }
  }
}

main();

