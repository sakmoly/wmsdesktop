// wms-api/create-test-user.js
// Script to create a test user for API testing

import dotenv from 'dotenv';
dotenv.config();

import { getConnection } from './src/db/connection.js';

async function createTestUser() {
  const connection = await getConnection();
  
  try {
    // Check if user exists
    const [existing] = await connection.execute(
      'SELECT user_code, name, active FROM tabUser WHERE user_code = ?',
      ['sysadmin']
    );
    
    if (existing.length > 0) {
      console.log('User sysadmin already exists:');
      console.log(JSON.stringify(existing[0], null, 2));
      
      // Update to ensure it's active and has no password hash (for development)
      await connection.execute(
        `UPDATE tabUser 
         SET active = 1, 
             password_hash = NULL 
         WHERE user_code = 'sysadmin'`
      );
      console.log('✅ Updated sysadmin user (set active=1, password_hash=NULL)');
    } else {
      // Create new user
      await connection.execute(
        `INSERT INTO tabUser (user_code, name, password_hash, role, active) 
         VALUES (?, ?, NULL, ?, 1)`,
        ['sysadmin', 'System Administrator', 'admin']
      );
      console.log('✅ Created sysadmin user (password_hash=NULL, accepts any password in dev mode)');
    }
    
    // Also create/update a simple test user
    const [testUser] = await connection.execute(
      'SELECT user_code FROM tabUser WHERE user_code = ?',
      ['testuser']
    );
    
    if (testUser.length === 0) {
      await connection.execute(
        `INSERT INTO tabUser (user_code, name, password_hash, role, active) 
         VALUES (?, ?, NULL, ?, 1)`,
        ['testuser', 'Test User', 'operator']
      );
      console.log('✅ Created testuser (password_hash=NULL, accepts any password in dev mode)');
    }
    
    // List all active users
    const [allUsers] = await connection.execute(
      'SELECT user_code, name, role, active, password_hash IS NULL as no_password FROM tabUser WHERE active = 1 ORDER BY user_code'
    );
    
    console.log('\n📋 Active users in database:');
    allUsers.forEach(user => {
      console.log(`  - ${user.user_code} (${user.name}) - Role: ${user.role} - No password: ${user.no_password ? 'Yes' : 'No'}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

createTestUser();

