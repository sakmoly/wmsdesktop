// Simple test script for health endpoint
import fetch from 'node-fetch';

const TEST_URLS = [
  'http://localhost:3000/health',
  'http://127.0.0.1:3000/health',
  'http://192.168.103.219:3000/health'
];

async function testHealthEndpoint(url) {
  console.log(`\n🧪 Testing: ${url}`);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (response.ok && data.status === 'ok') {
      console.log(`✅ SUCCESS: ${JSON.stringify(data)}`);
      return true;
    } else {
      console.log(`❌ FAILED: Status ${response.status}, Response: ${JSON.stringify(data)}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    if (error.cause) {
      console.log(`   Cause: ${error.cause.message || error.cause}`);
    }
    return false;
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('Health Endpoint Test Suite');
  console.log('='.repeat(60));
  
  const results = await Promise.all(
    TEST_URLS.map(url => testHealthEndpoint(url))
  );
  
  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${results.filter(r => r).length}/${results.length} passed`);
  console.log('='.repeat(60));
}

runTests().catch(console.error);

