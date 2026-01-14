// Test script for cycle count endpoints
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';
const AUTH_TOKEN = 'your-token-here'; // Replace with actual token

async function testEndpoint(method, url, body = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    console.log(`\n${method} ${url}`);
    if (body) {
      console.log('Body:', JSON.stringify(body, null, 2));
    }
    
    const response = await fetch(url, options);
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    return { status: response.status, data };
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return { error: error.message };
  }
}

async function runTests() {
  console.log('=== Testing Cycle Count Endpoints ===\n');
  
  const title1 = 'CC-A1-R01-L1-B1-MK6SK143';
  const title2 = 'CC-A1-R01-L1-B1-MK6MZ1UR';
  
  // Test 1: /count endpoint
  console.log('\n--- Test 1: POST /count ---');
  await testEndpoint('POST', `${BASE_URL}/api/cycle-count/${title1}/count`, {
    counted_by: 'TEST-USER',
    lines: [
      {
        item_code: 'SKU-TEST-001',
        bin_location: 'A1-R01-L1-B1',
        actual_qty: 10
      }
    ]
  });
  
  // Test 2: /submit endpoint
  console.log('\n--- Test 2: POST /submit ---');
  await testEndpoint('POST', `${BASE_URL}/api/cycle-count/${title2}/submit`, {});
  
  console.log('\n=== Tests Complete ===');
}

runTests().catch(console.error);
