// Test script for /api/events/batch endpoint
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_USER_CODE = process.env.TEST_USER_CODE || 'sysadmin';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '123456';

async function testLogin() {
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_code: TEST_USER_CODE,
        password: TEST_PASSWORD,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('❌ Login failed:', data);
      return null;
    }

    console.log('✅ Login successful');
    // Try different possible token field names
    const token = data.access_token || data.token || data.data?.access_token || data.data?.token || (data.data && typeof data.data === 'string' ? data.data : null);
    
    if (!token) {
      console.error('❌ Token not found in response:', JSON.stringify(data, null, 2));
      return null;
    }
    
    return token;
  } catch (error) {
    console.error('❌ Login error:', error.message);
    return null;
  }
}

async function testBatchEvents(token) {
  const testEvent = {
    offline_uuid: `test-${Date.now()}`,
    event_type: 'PACK_ITEM_TO_TC',
    event_time: new Date().toISOString(),
    device_id: 'DEVICE-001',
    user_id: 'USER-150526',
    item_code: 'SKU-HAT-301-BLU-OS',
    qty: 1.0,
    carton_id: 'PAW-ASN365425473-1768138301111',
    tc_id: 'TC-MR-123459-1768157787512',
    transfer_order: 'MR-123459',
    to_no: 'MR-123459',
    material_request: 'MR-123459',
    source_bin: 'A1-R02-L1-B2',
    bin: 'A1-R02-L1-B2',
    location_id: 'A1-R02-L1-B2',
    rack: 'A1-R02-L1-B2',
    store: 'STORE-002'
  };

  try {
    console.log('\n📤 Sending batch events request...');
    console.log('Event:', JSON.stringify(testEvent, null, 2));
    
    const response = await fetch(`${API_URL}/api/events/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        events: [testEvent]
      }),
    });

    const data = await response.json();
    
    console.log(`\n📥 Response Status: ${response.status} ${response.statusText}`);
    console.log('Response Body:', JSON.stringify(data, null, 2));
    
    if (!response.ok) {
      console.error('❌ API request failed');
      return false;
    }

    if (data.ok === false) {
      console.error('❌ API returned error:', data.error);
      return false;
    }

    if (data.failed > 0) {
      console.error('❌ Some events failed:', data.failed_events);
      return false;
    }

    console.log('✅ API request successful');
    console.log(`   Processed: ${data.processed || data.inserted_count || 0}`);
    console.log(`   Failed: ${data.failed || 0}`);
    
    return true;
  } catch (error) {
    console.error('❌ API request error:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

async function main() {
  console.log('🔍 Testing /api/events/batch endpoint\n');
  console.log(`API URL: ${API_URL}`);
  console.log(`User: ${TEST_USER_CODE}\n`);

  // Step 1: Login
  const token = await testLogin();
  if (!token) {
    console.error('❌ Cannot proceed without authentication token');
    process.exit(1);
  }

  // Step 2: Test batch events
  const success = await testBatchEvents(token);
  
  if (success) {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  } else {
    console.log('\n❌ Test failed');
    process.exit(1);
  }
}

main().catch(console.error);
