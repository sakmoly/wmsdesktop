/**
 * Test Database Connection
 * Verify database credentials are correct
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms_desktop',
};

async function testConnection() {
  console.log('🔍 Testing Database Connection...\n');
  console.log('Configuration:');
  console.log(`  Host: ${dbConfig.host}`);
  console.log(`  Port: ${dbConfig.port}`);
  console.log(`  User: ${dbConfig.user}`);
  console.log(`  Database: ${dbConfig.database}`);
  console.log(`  Password: ${dbConfig.password ? '***' : '(empty)'}\n`);
  
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
    
    console.log(`Tables in database: ${tables[0].table_count}`);
    
    await connection.end();
    console.log('\n✅ All tests passed! Database is ready.');
    
  } catch (error) {
    console.error('\n❌ Database connection failed!\n');
    console.error(`Error Code: ${error.code}`);
    console.error(`Error Message: ${error.message}\n`);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('💡 This is a password/authentication error.\n');
      console.log('Solutions:');
      console.log('1. Check DB_PASSWORD in .env file');
      console.log('2. Verify MySQL root password');
      console.log('3. Try empty password: DB_PASSWORD=');
      console.log('4. Try common passwords: root, password');
      console.log('5. Reset MySQL password (see FIX_DATABASE_PASSWORD.md)');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('💡 MySQL server is not running.\n');
      console.log('Solutions:');
      console.log('1. Start MySQL service');
      console.log('2. Check DB_HOST and DB_PORT in .env');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.log('💡 Database does not exist.\n');
      console.log('Solutions:');
      console.log('1. Create database: CREATE DATABASE wms_desktop;');
      console.log('2. Or update DB_NAME in .env to existing database');
    } else {
      console.log('💡 Check error message above for details.');
    }
  }
}

testConnection().catch(console.error);

