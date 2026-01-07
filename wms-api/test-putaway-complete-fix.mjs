// test-putaway-complete-fix.mjs
// Comprehensive test script to verify putaway completion fixes

import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_USER = process.env.TEST_USER || 'USER-001';

let authToken = null;

async function login() {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_code: 'sysadmin',
      password: 'sysadmin'
    })
  });
  
  if (!response.ok) {
    throw new Error(`Login failed: ${response.statusText}`);
  }
  
  const data = await response.json();
  if (data.ok && data.token) {
    authToken = data.token;
    console.log('✅ Login successful\n');
    return true;
  }
  throw new Error('Login failed: No token received');
}

async function createPutawayTask(asnNo = 'ASN-TEST-001') {
  const response = await fetch(`${API_BASE_URL}/api/putaway/create-task-for-remaining-items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      asn_no: asnNo,
      user_id: TEST_USER
    })
  });
  
  const data = await response.json();
  if (data.ok && data.data && data.data.putaway_task) {
    console.log(`✅ Created putaway task: ${data.data.putaway_task}`);
    return data.data.putaway_task;
  }
  console.log('⚠️  Could not create putaway task, using existing task');
  return null;
}

async function testPutawayComplete(putawayTask, testCase) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TEST CASE: ${testCase.name}`);
  console.log('='.repeat(80));
  console.log(`Putaway Task: ${putawayTask}`);
  console.log(`Items: ${testCase.items.length}`);
  console.log('');
  
  const response = await fetch(`${API_BASE_URL}/api/putaway/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      putaway_task: putawayTask,
      performed_by: TEST_USER,
      items: testCase.items
    })
  });
  
  const data = await response.json();
  
  if (data.ok) {
    console.log('✅ Putaway completed successfully');
    console.log(`   Items Updated: ${data.data.items_updated || 0}`);
    console.log(`   Stock Updates: ${data.data.stock_updates?.length || 0}`);
    if (data.data.stock_updates && data.data.stock_updates.length > 0) {
      console.log('\n   Stock Updates:');
      for (const update of data.data.stock_updates) {
        console.log(`     ${update.item_code} @ ${update.location}: +${update.qty_added} (${update.qty_before} → ${update.qty_after})`);
      }
    }
    return { success: true, data };
  } else {
    console.log(`❌ Putaway completion failed: ${data.error?.message || 'Unknown error'}`);
    if (data.error?.details) {
      console.log(`   Details: ${data.error.details}`);
    }
    return { success: false, error: data.error };
  }
}

async function verifyPutawayLines(putawayTask, expectedLines) {
  // This would require database access - skipping for now
  console.log('\n📋 Verification: Check database for putaway lines');
  console.log(`   Query: SELECT * FROM tabPutawayLine WHERE parent_title = '${putawayTask}'`);
}

async function runTests() {
  try {
    console.log('🧪 PUTAWAY COMPLETION FIX - COMPREHENSIVE TEST');
    console.log('='.repeat(80));
    console.log(`API URL: ${API_BASE_URL}`);
    console.log('');
    
    // Login
    await login();
    
    // Test Case 1: Single part target_bin (e.g., "B1")
    console.log('\n📝 Test Case 1: Single part target_bin');
    const task1 = await createPutawayTask('ASN-TEST-001');
    if (task1) {
      await testPutawayComplete(task1, {
        name: 'Single part target_bin "B1"',
        items: [
          {
            item_code: 'SKU-TEST-SINGLE-BIN',
            qty: 25,
            target_bin: 'B1',
            completed: true,
            carton_id: 'BOX-TEST-001'
          }
        ]
      });
    }
    
    // Test Case 2: Normal multi-part target_bin
    console.log('\n📝 Test Case 2: Normal multi-part target_bin');
    const task2 = await createPutawayTask('ASN-TEST-002');
    if (task2) {
      await testPutawayComplete(task2, {
        name: 'Multi-part target_bin "A1-R01-L2-B1"',
        items: [
          {
            item_code: 'SKU-TEST-MULTI-BIN',
            qty: 50,
            target_bin: 'A1-R01-L2-B1',
            completed: true,
            carton_id: 'BOX-TEST-002'
          }
        ]
      });
    }
    
    // Test Case 3: Multiple items same location
    console.log('\n📝 Test Case 3: Multiple items same location');
    const task3 = await createPutawayTask('ASN-TEST-003');
    if (task3) {
      await testPutawayComplete(task3, {
        name: 'Multiple items same location',
        items: [
          {
            item_code: 'SKU-TEST-SAME-LOC-1',
            qty: 100,
            target_bin: 'A1-R01-B1',
            completed: true,
            carton_id: 'BOX-TEST-003A'
          },
          {
            item_code: 'SKU-TEST-SAME-LOC-1',
            qty: 50,
            target_bin: 'A1-R01-B1',
            completed: true,
            carton_id: 'BOX-TEST-003B'
          }
        ]
      });
    }
    
    // Test Case 4: Complex target_bin (5 parts)
    console.log('\n📝 Test Case 4: Complex target_bin (5 parts)');
    const task4 = await createPutawayTask('ASN-TEST-004');
    if (task4) {
      await testPutawayComplete(task4, {
        name: 'Complex target_bin "A1-R01-L1-B1-B1"',
        items: [
          {
            item_code: 'SKU-TEST-COMPLEX',
            qty: 75,
            target_bin: 'A1-R01-L1-B1-B1',
            completed: true,
            carton_id: 'BOX-TEST-004'
          }
        ]
      });
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ ALL TESTS COMPLETED');
    console.log('='.repeat(80));
    console.log('\n📋 Next Steps:');
    console.log('1. Check database for putaway lines');
    console.log('2. Verify stock ledger quantities');
    console.log('3. Verify no duplicate lines');
    console.log('4. Verify stock not doubled');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
  }
}

runTests();

