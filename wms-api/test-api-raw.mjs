// Test API endpoint and show RAW response (before any transformation)
import http from 'http';

const testData = JSON.stringify({
  user_code: 'sysadmin',
  password: 'sysadmin'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(testData)
  }
};

console.log('\n🧪 Testing API Endpoint (RAW HTTP)...\n');
console.log(`POST http://localhost:3000/api/auth/login`);
console.log(`Body: ${testData}\n`);

const req = http.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  console.log(`Status Message: ${res.statusMessage}`);
  console.log(`Headers:`, res.headers);
  console.log('\n📥 Response Body:');
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(data);
    try {
      const parsed = JSON.parse(data);
      console.log('\n📊 Parsed JSON:');
      console.log(JSON.stringify(parsed, null, 2));
      
      if (parsed.ok === false || parsed.success === false) {
        console.log('\n❌ Login failed');
        if (parsed.error) {
          console.log(`   Code: ${parsed.error.code}`);
          console.log(`   Message: ${parsed.error.message}`);
          if (parsed.error.debug || parsed.debug) {
            console.log('\n🔍 Debug Info:');
            console.log(JSON.stringify(parsed.error.debug || parsed.debug, null, 2));
          }
        }
      } else if (parsed.ok === true || parsed.success === true) {
        console.log('\n✅ Login successful!');
        if (parsed.data?.access_token) {
          console.log(`   Token: ${parsed.data.access_token.substring(0, 30)}...`);
        }
      }
    } catch (e) {
      console.log('(Not valid JSON)');
    }
  });
});

req.on('error', (error) => {
  console.error('\n❌ Request failed:', error.message);
  if (error.code === 'ECONNREFUSED') {
    console.error('⚠️  API server is not running!');
    console.error('   Start it with: cd wms-api && npm start');
  }
});

req.write(testData);
req.end();

