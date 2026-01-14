// Simple test for cycle count count endpoint
// Uses built-in fetch (Node 18+) or http module

import http from 'http';

const taskTitle = process.argv[2] || 'CC-A1-R01-L1-B1-MK6MZ1UR';
const API_URL = process.argv[3] || 'http://localhost:3000';

const testData = {
  counted_by: 'TEST-USER',
  lines: [
    {
      item_code: 'SKU-TEST-002',
      bin_location: 'A1-R01-L1-B1',
      carton_id: 'CARTON-TEST-002',
      actual_qty: 5,
      counted_qty: 5
    }
  ]
};

const postData = JSON.stringify(testData);

const options = {
  hostname: 'localhost',
  port: 3000,
  path: `/api/cycle-count/${encodeURIComponent(taskTitle)}/count`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'Authorization': 'Bearer test-key'
  }
};

console.log(`\n🧪 Testing Cycle Count Count Endpoint\n`);
console.log(`Task: ${taskTitle}`);
console.log(`URL: ${API_URL}/api/cycle-count/${taskTitle}/count\n`);
console.log('Request:', JSON.stringify(testData, null, 2), '\n');

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Response Status:', res.statusCode);
    console.log('Response Body:');
    
    try {
      const response = JSON.parse(data);
      console.log(JSON.stringify(response, null, 2));
      
      if (response.ok && response.data) {
        console.log('\n✅ Response Validation:');
        
        // Check data types
        const issues = [];
        
        if (typeof response.data.counted_items !== 'number') {
          issues.push(`❌ counted_items is ${typeof response.data.counted_items}, expected number`);
        } else {
          console.log(`✅ counted_items is a number: ${response.data.counted_items}`);
        }
        
        if (typeof response.data.items_with_discrepancy !== 'number') {
          issues.push(`❌ items_with_discrepancy is ${typeof response.data.items_with_discrepancy}, expected number`);
        } else {
          console.log(`✅ items_with_discrepancy is a number: ${response.data.items_with_discrepancy}`);
        }
        
        if (typeof response.data.total_items !== 'number') {
          issues.push(`❌ total_items is ${typeof response.data.total_items}, expected number`);
        } else {
          console.log(`✅ total_items is a number: ${response.data.total_items}`);
        }
        
        if (typeof response.data.updated_count !== 'number') {
          issues.push(`❌ updated_count is ${typeof response.data.updated_count}, expected number`);
        } else {
          console.log(`✅ updated_count is a number: ${response.data.updated_count}`);
        }
        
        if (issues.length > 0) {
          console.log('\n❌ Issues found:');
          issues.forEach(issue => console.log(`   ${issue}`));
        } else {
          console.log('\n✅ All response fields are correct types!');
        }
        
        // Verify logic
        console.log('\n📊 Statistics Check:');
        if (response.data.updated_count <= response.data.counted_items) {
          console.log(`✅ updated_count (${response.data.updated_count}) <= counted_items (${response.data.counted_items})`);
        } else {
          console.log(`❌ updated_count (${response.data.updated_count}) > counted_items (${response.data.counted_items}) - ERROR!`);
        }
        
        if (response.data.counted_items <= response.data.total_items) {
          console.log(`✅ counted_items (${response.data.counted_items}) <= total_items (${response.data.total_items})`);
        } else {
          console.log(`❌ counted_items (${response.data.counted_items}) > total_items (${response.data.total_items}) - ERROR!`);
        }
        
        if (response.data.items_with_discrepancy <= response.data.counted_items) {
          console.log(`✅ items_with_discrepancy (${response.data.items_with_discrepancy}) <= counted_items (${response.data.counted_items})`);
        } else {
          console.log(`❌ items_with_discrepancy (${response.data.items_with_discrepancy}) > counted_items (${response.data.counted_items}) - ERROR!`);
        }
      }
    } catch (e) {
      console.log('Raw response:', data);
      console.error('Error parsing JSON:', e.message);
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ Request error: ${e.message}`);
});

req.write(postData);
req.end();

