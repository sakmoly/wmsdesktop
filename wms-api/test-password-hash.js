// Test password hash generation
import crypto from 'crypto';

const password = 'admin';
const hash = crypto.createHash('sha256').update(password).digest('hex');

console.log('Password:', password);
console.log('SHA256 Hash:', hash);
console.log('Hash Length:', hash.length);

// Test what MySQL SHA2('admin', 256) produces
console.log('\nTo verify in MySQL, run:');
console.log(`SELECT SHA2('admin', 256) as hash;`);
console.log(`Expected hash: ${hash}`);

