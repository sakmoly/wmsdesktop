/**
 * Check Environment Configuration
 * Verify what values are being read from .env
 */

import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 Current Environment Configuration:\n');
console.log('Database Settings:');
console.log(`  DB_HOST: ${process.env.DB_HOST || '(not set)'}`);
console.log(`  DB_PORT: ${process.env.DB_PORT || '(not set)'}`);
console.log(`  DB_USER: ${process.env.DB_USER || '(not set)'}`);
console.log(`  DB_PASSWORD: ${process.env.DB_PASSWORD ? '***' : '(not set or empty)'}`);
console.log(`  DB_NAME: ${process.env.DB_NAME || '(not set)'}`);

console.log('\nServer Settings:');
console.log(`  PORT: ${process.env.PORT || '(not set)'}`);
console.log(`  HOST: ${process.env.HOST || '(not set)'}`);

console.log('\n📝 Expected Values:');
console.log('  DB_USER should be: erppadmin');
console.log('  DB_PASSWORD should be: P61nt!');
console.log('  DB_HOST should be: localhost (or 192.168.103.219 if MySQL is on network)');

if (process.env.DB_USER === 'root') {
  console.log('\n❌ ERROR: DB_USER is still "root"!');
  console.log('   Update .env file: DB_USER=erppadmin');
} else if (process.env.DB_USER === 'erppadmin') {
  console.log('\n✅ DB_USER is correct: erppadmin');
} else {
  console.log(`\n⚠️  DB_USER is: ${process.env.DB_USER}`);
}

if (!process.env.DB_PASSWORD) {
  console.log('\n❌ ERROR: DB_PASSWORD is not set!');
  console.log('   Update .env file: DB_PASSWORD=P61nt!');
} else if (process.env.DB_PASSWORD === 'P61nt!') {
  console.log('\n✅ DB_PASSWORD is set correctly');
} else {
  console.log('\n⚠️  DB_PASSWORD is set (but may not be correct)');
}

console.log('\n💡 If values are wrong:');
console.log('1. Open wms-api/.env file');
console.log('2. Update DB_USER=erppadmin');
console.log('3. Update DB_PASSWORD=P61nt!');
console.log('4. Save the file');
console.log('5. Restart the server (npm start)');

