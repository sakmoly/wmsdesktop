// Test Cycle Count Count Endpoint
// Run: node test-cycle-count-count-endpoint.js [task-title] [api-url] [api-key]

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const taskTitle = process.argv[2] || 'CC-A1-R01-L1-B1-MK6MZ1UR';
const API_URL = process.argv[3] || process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.argv[4] || process.env.API_KEY || 'test-key';

async function testCycleCountCount() {
  console.log(`\n🧪 Testing Cycle Count Count Endpoint\n`);
  console.log(`Task: ${taskTitle}`);
  console.log(`API URL: ${API_URL}\n`);

  // Test 1: Submit a count with a new item
  const testRequest = {
    counted_by: 'TEST-USER',
    lines: [
      {
        item_code: 'SKU-TEST-001',
        bin_location: 'A1-R01-L1-B1',
        carton_id: 'CARTON-TEST-001',
        actual_qty: 10,
        counted_qty: 10
      }
    ]
  };

  console.log('📤 Request:');
  console.log(JSON.stringify(testRequest, null, 2));
  console.log('\n');

  try {
    const response = await fetch(`${API_URL}/api/cycle-count/${taskTitle}/count`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(testRequest)
    });

    const responseData = await response.json();

    console.log('📥 Response Status:', response.status);
    console.log('📥 Response Body:');
    console.log(JSON.stringify(responseData, null, 2));
    console.log('\n');

    // Verify response format
    if (responseData.ok) {
      console.log('✅ API returned success');
      
      // Check data types
      if (typeof responseData.data.counted_items === 'number') {
        console.log('✅ counted_items is a number');
      } else {
        console.log('❌ counted_items is NOT a number (type:', typeof responseData.data.counted_items, ')');
      }
      
      if (typeof responseData.data.items_with_discrepancy === 'number') {
        console.log('✅ items_with_discrepancy is a number');
      } else {
        console.log('❌ items_with_discrepancy is NOT a number (type:', typeof responseData.data.items_with_discrepancy, ')');
      }
      
      if (typeof responseData.data.total_items === 'number') {
        console.log('✅ total_items is a number');
      } else {
        console.log('❌ total_items is NOT a number (type:', typeof responseData.data.total_items, ')');
      }
      
      // Verify statistics make sense
      console.log('\n📊 Statistics Verification:');
      console.log(`   updated_count: ${responseData.data.updated_count}`);
      console.log(`   counted_items: ${responseData.data.counted_items}`);
      console.log(`   items_with_discrepancy: ${responseData.data.items_with_discrepancy}`);
      console.log(`   total_items: ${responseData.data.total_items}`);
      
      if (responseData.data.updated_count <= responseData.data.counted_items) {
        console.log('✅ updated_count <= counted_items (makes sense)');
      } else {
        console.log('⚠️ updated_count > counted_items (unusual)');
      }
      
      if (responseData.data.counted_items <= responseData.data.total_items) {
        console.log('✅ counted_items <= total_items (makes sense)');
      } else {
        console.log('❌ counted_items > total_items (ERROR!)');
      }
      
      if (responseData.data.items_with_discrepancy <= responseData.data.counted_items) {
        console.log('✅ items_with_discrepancy <= counted_items (makes sense)');
      } else {
        console.log('❌ items_with_discrepancy > counted_items (ERROR!)');
      }
      
    } else {
      console.log('❌ API returned error:', responseData.error?.message);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCycleCountCount();

