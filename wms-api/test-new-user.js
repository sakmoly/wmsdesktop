/**
 * Test New MySQL User Connection
 * Test erppadmin user with password P61nt!
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Test with new user credentials
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: 'erppadmin',  // New user
  password: 'P61nt!',  // New password
  database: process.env.DB_NAME || 'wms_desktop',
};

async function testNewUser() {
  console.log('🔍 Testing New MySQL User Connection...\n');
  console.log('Configuration:');
  console.log(`  Host: ${dbConfig.host}`);
  console.log(`  Port: ${dbConfig.port}`);
  console.log(`  User: ${dbConfig.user}`);
  console.log(`  Database: ${dbConfig.database}`);
  console.log(`  Password: ***\n`);
  
  try {
    const connection = await mysql.createConnection(dbConfig);
    console.log('✅ Database connection successful!\n');
    
    // Test query
    const [rows] = await connection.execute('SELECT DATABASE() as db, USER() as user');
    console.log(`Connected to database: ${rows[0].db}`);
    console.log(`Connected as user: ${rows[0].user}\n`);
    
    // Test if database exists and has tables
    const [tables] = await connection.execute(`
      SELECT COUNT(*) as table_count 
      FROM information_schema.tables 
      WHERE table_schema = ?
    `, [dbConfig.database]);
    
    console.log(`Tables in database: ${tables[0].table_count}\n`);
    
    // Test if user has SELECT permission
    try {
      const [testSelect] = await connection.execute('SELECT 1 as test');
      console.log('✅ SELECT permission: OK');
    } catch (err) {
      console.log('❌ SELECT permission: FAILED');
    }
    
    // Test if user has INSERT permission
    try {
      // Try to check if we can see tabItem table
      const [itemCount] = await connection.execute('SELECT COUNT(*) as cnt FROM tabItem LIMIT 1');
      console.log('✅ Table access: OK');
    } catch (err) {
      console.log('❌ Table access: FAILED');
      console.log(`   Error: ${err.message}`);
    }
    
    await connection.end();
    console.log('\n✅ All tests passed! New user is working correctly.');
    console.log('\n📝 Next step: Update .env file with these credentials:');
    console.log(`   DB_USER=erppadmin`);
    console.log(`   DB_PASSWORD=P61nt!`);
    
  } catch (error) {
    console.error('\n❌ Database connection failed!\n');
    console.error(`Error Code: ${error.code}`);
    console.error(`Error Message: ${error.message}\n`);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('💡 User authentication failed.\n');
      console.log('Possible issues:');
      console.log('1. User "erppadmin" does not exist');
      console.log('2. Password is incorrect');
      console.log('3. User does not have permission to connect from this host');
      console.log('\nSolutions:');
      console.log('1. Verify user exists: SELECT user FROM mysql.user WHERE user="erppadmin";');
      console.log('2. Grant permissions:');
      console.log('   GRANT ALL PRIVILEGES ON wms_desktop.* TO "erppadmin"@"localhost";');
      console.log('   FLUSH PRIVILEGES;');
      console.log('3. If connecting from network IP, grant for that host:');
      console.log('   GRANT ALL PRIVILEGES ON wms_desktop.* TO "erppadmin"@"%";');
      console.log('   FLUSH PRIVILEGES;');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('💡 MySQL server is not running or wrong host/port.');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.log('💡 Database "wms_desktop" does not exist.');
      console.log('   Create it: CREATE DATABASE wms_desktop;');
    }
  }
}

testNewUser().catch(console.error);

