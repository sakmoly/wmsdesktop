// Test with exact user request format
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_USER_CODE = process.env.TEST_USER_CODE || 'sysadmin';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '123456';

async function testLogin() {
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_code: TEST_USER_CODE, password: TEST_PASSWORD }),
    });
    const data = await response.json();
    if (!response.ok) return null;
    return data.data?.access_token || data.access_token || data.token || (data.data && typeof data.data === 'string' ? data.data : null);
  } catch (error) {
    console.error('Login error:', error.message);
    return null;
  }
}

async function testExactRequest(token) {
  const exactRequest = {
    events: [
      {
        offline_uuid: "550e8400-e29b-41d4-a716-446655440001",
        event_type: "PACK_ITEM_TO_TC",
        event_time: "2026-01-11T21:56:00Z",
        device_id: "DEVICE-001",
        user_id: "USER-150526",
        item_code: "SKU-HAT-301-BLU-OS",
        qty: 1.0,
        carton_id: "PAW-ASN365425473-1768138301111",
        tc_id: "TC-MR-123459-1768157787512",
        transfer_order: "MR-123459",
        to_no: "MR-123459",
        material_request: "MR-123459",
        source_bin: "A1-R02-L1-B2",
        bin: "A1-R02-L1-B2",
        location_id: "A1-R02-L1-B2",
        rack: "A1-R02-L1-B2",
        store: "STORE-002"
      }
    ]
  };

  try {
    console.log('\n📤 Testing with EXACT user request format...');
    console.log('Request:', JSON.stringify(exactRequest, null, 2));
    
    const response = await fetch(`${API_URL}/api/events/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(exactRequest),
    });

    const data = await response.json();
    
    console.log(`\n📥 Response Status: ${response.status}`);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (!response.ok || data.ok === false) {
      console.error('❌ Request failed');
      if (data.errors && data.errors.length > 0) {
        console.error('Errors:', data.errors);
      }
      return false;
    }

    if (data.failed > 0 && data.failed_events) {
      console.error('❌ Some events failed:');
      data.failed_events.forEach(err => {
        console.error(`  - ${err.offline_uuid}: ${err.error}`);
      });
      return false;
    }

    console.log('✅ Request successful');
    console.log(`   Inserted: ${data.inserted_count || data.processed || 0}`);
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function main() {
  const token = await testLogin();
  if (!token) {
    console.error('❌ Login failed');
    process.exit(1);
  }
  
  const success = await testExactRequest(token);
  process.exit(success ? 0 : 1);
}

main().catch(console.error);
