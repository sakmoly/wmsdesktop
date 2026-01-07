/**
 * Check Environment Configuration and Network IPs
 * Verify what values are being read from .env and detect network IPs
 */

import dotenv from 'dotenv';
import os from 'os';

dotenv.config();

console.log('🔍 Environment Configuration Check:\n');
console.log('='.repeat(70));

console.log('\n📋 Server Settings:');
console.log(`  PORT: ${process.env.PORT || '(not set - will use 3000)'}`);
console.log(`  HOST: ${process.env.HOST || '(not set - will use 0.0.0.0)'}`);
console.log(`  API_BASE_URL: ${process.env.API_BASE_URL || '(not set - will auto-detect)'}`);

console.log('\n💾 Database Settings:');
console.log(`  DB_HOST: ${process.env.DB_HOST || '(not set)'}`);
console.log(`  DB_PORT: ${process.env.DB_PORT || '(not set)'}`);
console.log(`  DB_USER: ${process.env.DB_USER || '(not set)'}`);
console.log(`  DB_PASSWORD: ${process.env.DB_PASSWORD ? '***' : '(not set)'}`);
console.log(`  DB_NAME: ${process.env.DB_NAME || '(not set)'}`);

console.log('\n🌐 Network Interface Detection:');
const interfaces = os.networkInterfaces();
const networkIPs = [];

for (const name of Object.keys(interfaces)) {
  for (const iface of interfaces[name]) {
    if (iface.family === 'IPv4' && !iface.internal) {
      networkIPs.push(iface.address);
      console.log(`  ✅ Found: ${iface.address} (${name})`);
    }
  }
}

if (networkIPs.length === 0) {
  console.log('  ⚠️  No network IPs detected!');
  console.log('  💡 Make sure you are connected to a network');
} else {
  console.log(`\n✅ Primary Network IP: ${networkIPs[0]}`);
  console.log(`   Server will be accessible at: http://${networkIPs[0]}:${process.env.PORT || 3000}`);
}

console.log('\n📝 Recommended .env file should have:');
console.log('='.repeat(70));
console.log('# Server Configuration');
console.log(`PORT=${process.env.PORT || 3000}`);
console.log(`HOST=0.0.0.0`);
console.log(`# Optional: Set this to your network IP if auto-detection fails`);
console.log(`# API_BASE_URL=http://${networkIPs[0] || 'YOUR_IP'}:${process.env.PORT || 3000}`);
console.log('\n# Database Configuration');
console.log(`DB_HOST=${process.env.DB_HOST || 'localhost'}`);
console.log(`DB_PORT=${process.env.DB_PORT || 3306}`);
console.log(`DB_USER=${process.env.DB_USER || 'erppadmin'}`);
console.log(`DB_PASSWORD=${process.env.DB_PASSWORD ? '***' : 'P61nt!'}`);
console.log(`DB_NAME=${process.env.DB_NAME || 'wms_desktop'}`);
console.log('\n# JWT Configuration');
console.log(`JWT_SECRET=${process.env.JWT_SECRET || 'your-secret-key-here'}`);
console.log(`JWT_EXPIRES_IN=${process.env.JWT_EXPIRES_IN || '7d'}`);
console.log('='.repeat(70));

