// wms-api/test-api.js
// Comprehensive API test script for all GET and POST endpoints

import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_USER = process.env.TEST_USER || 'sysadmin';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'password';

// Test results storage
const results = {
  passed: [],
  failed: [],
  skipped: []
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

let authToken = null;

// Helper function to make API requests
async function apiRequest(method, endpoint, body = null, token = null) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    }
  };

  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      // If JSON parsing fails, try to get text
      data = { text: await response.text() };
    }
    return {
      status: response.status,
      ok: response.ok,
      data,
      headers: Object.fromEntries(response.headers.entries())
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      error: error.message,
      data: null
    };
  }
}

// Test function
function test(name, testFn) {
  return async () => {
    try {
      await testFn();
      results.passed.push(name);
      console.log(`${colors.green}✓${colors.reset} ${name}`);
      return true;
    } catch (error) {
      results.failed.push({ name, error: error.message });
      console.log(`${colors.red}✗${colors.reset} ${name}`);
      console.log(`  ${colors.red}Error:${colors.reset} ${error.message}`);
      return false;
    }
  };
}

// Assertion helpers
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertStatus(response, expectedStatus) {
  assert(
    response.status === expectedStatus,
    `Expected status ${expectedStatus}, got ${response.status}`
  );
}

function assertOk(response) {
  assert(response.ok, `Request failed with status ${response.status}`);
}

function assertHasData(response) {
  assert(response.data !== null && response.data !== undefined, 'Response has no data');
}

// ============================================
// AUTHENTICATION TESTS
// ============================================

const testLogin = test('POST /api/auth/login', async () => {
  const response = await apiRequest('POST', '/api/auth/login', {
    user_code: TEST_USER,
    password: TEST_PASSWORD
  });

  if (!response.ok) {
    console.log(`  ${colors.yellow}Response status: ${response.status}${colors.reset}`);
    console.log(`  ${colors.yellow}Response data: ${JSON.stringify(response.data)}${colors.reset}`);
  }

  assertOk(response);
  assertHasData(response);
  
  // Response format: { success: true, data: { access_token: "...", ... } }
  // So token is at response.data.data.access_token
  const responseData = response.data;
  const token = responseData?.data?.access_token || 
                responseData?.access_token || 
                responseData?.token || 
                responseData;
  
  assert(token && typeof token === 'string', `No token in response. Response: ${JSON.stringify(responseData)}`);
  
  authToken = token;
  console.log(`  ${colors.cyan}Token obtained: ${token.substring(0, 20)}...${colors.reset}`);
});

// ============================================
// GET ENDPOINT TESTS
// ============================================

const testHealthCheck = test('GET /health', async () => {
  const response = await apiRequest('GET', '/health');
  assertOk(response);
  assertStatus(response, 200);
});

const testGetAllAsns = test('GET /api/master/asns', async () => {
  const response = await apiRequest('GET', '/api/master/asns', null, authToken);
  assertOk(response);
  assert(Array.isArray(response.data), 'Response should be an array');
});

const testGetAsnByNumber = test('GET /api/asn/:asn_no', async () => {
  // Try with a sample ASN (adjust based on your data)
  const response = await apiRequest('GET', '/api/asn/ASN-0001', null, authToken);
  // Accept both 200 (found) and 404 (not found) as valid responses
  assert(
    response.status === 200 || response.status === 404,
    `Unexpected status: ${response.status}`
  );
});

const testGetTransferOrderByAsn = test('GET /api/transfer-order/by-asn/:asn_no', async () => {
  const response = await apiRequest('GET', '/api/transfer-order/by-asn/ASN-0001', null, authToken);
  // Accept both 200 (found) and 404 (not found)
  assert(
    response.status === 200 || response.status === 404,
    `Unexpected status: ${response.status}`
  );
});

const testGetAllTransferOrders = test('GET /api/master/transfer-orders', async () => {
  const response = await apiRequest('GET', '/api/master/transfer-orders', null, authToken);
  assertOk(response);
  assert(Array.isArray(response.data), 'Response should be an array');
});

const testGetAllBoxes = test('GET /api/master/boxes', async () => {
  const response = await apiRequest('GET', '/api/master/boxes', null, authToken);
  assertOk(response);
  assert(Array.isArray(response.data), 'Response should be an array');
});

const testGetBoxes = test('GET /api/boxes', async () => {
  // GET /api/boxes requires asn and store query parameters
  const response = await apiRequest('GET', '/api/boxes?asn=ASN-0001&store=WAREHOUSE', null, authToken);
  assertOk(response);
  // Response format: { ok: true, data: [...] }
  assert(response.data.ok !== false, 'Response should be ok');
  assert(Array.isArray(response.data.data || response.data), 'Response should contain an array');
});

const testGetBoxById = test('GET /api/boxes/:box_id', async () => {
  // Try with a sample box ID (adjust based on your data)
  const response = await apiRequest('GET', '/api/boxes/BOX-TEST-001', null, authToken);
  // Accept both 200 (found) and 404 (not found)
  assert(
    response.status === 200 || response.status === 404,
    `Unexpected status: ${response.status}`
  );
});

const testGetAllTransferCartons = test('GET /api/master/transfer-cartons', async () => {
  const response = await apiRequest('GET', '/api/master/transfer-cartons', null, authToken);
  assertOk(response);
  assert(Array.isArray(response.data), 'Response should be an array');
});

const testGetAllWarehouseRacks = test('GET /api/master/warehouse-racks', async () => {
  const response = await apiRequest('GET', '/api/master/warehouse-racks', null, authToken);
  assertOk(response);
  assert(Array.isArray(response.data), 'Response should be an array');
});

const testGetAllWarehouses = test('GET /api/master/warehouses', async () => {
  const response = await apiRequest('GET', '/api/master/warehouses', null, authToken);
  assertOk(response);
  assert(Array.isArray(response.data), 'Response should be an array');
});

const testGetWarehousesStores = test('GET /api/master/warehouses-stores', async () => {
  const response = await apiRequest('GET', '/api/master/warehouses-stores', null, authToken);
  assertOk(response);
  assert(Array.isArray(response.data), 'Response should be an array');
  
  // Validate structure if data exists
  if (response.data.length > 0) {
    const item = response.data[0];
    assert(item.code !== undefined, 'Item should have code field');
    assert(item.name !== undefined, 'Item should have name field');
    assert(item.warehouse_type !== undefined, 'Item should have warehouse_type field');
  }
});

const testGetAllLocations = test('GET /api/master/locations', async () => {
  const response = await apiRequest('GET', '/api/master/locations', null, authToken);
  assertOk(response);
  assert(Array.isArray(response.data), 'Response should be an array');
});

const testGetInboundSessions = test('GET /api/inbound/sessions', async () => {
  const response = await apiRequest('GET', '/api/inbound/sessions', null, authToken);
  assertOk(response);
  assert(Array.isArray(response.data), 'Response should be an array');
  
  // Validate structure if data exists
  if (response.data.length > 0) {
    const session = response.data[0];
    assert(session.inbound_session !== undefined, 'Session should have inbound_session field');
    assert(session.asn_no !== undefined, 'Session should have asn_no field');
    assert(session.status !== undefined, 'Session should have status field');
  }
});

const testGetAllUsers = test('GET /api/master/users', async () => {
  const response = await apiRequest('GET', '/api/master/users', null, authToken);
  assertOk(response);
  assert(Array.isArray(response.data), 'Response should be an array');
  
  // Validate structure if data exists
});

const testGetAllItems = test('GET /api/master/items', async () => {
  const response = await apiRequest('GET', '/api/master/items', null, authToken);
  assertOk(response);
  assert(Array.isArray(response.data), 'Response should be an array');
  
  // Validate structure if data exists
  if (response.data.length > 0) {
    const item = response.data[0];
    assert(item.code !== undefined, 'Item should have code field');
    assert(item.name !== undefined, 'Item should have name field');
  }
});

// ============================================
// POST ENDPOINT TESTS
// ============================================

const testCreateBox = test('POST /api/boxes/create', async () => {
  const timestamp = Date.now();
  const testBoxData = {
    asn_no: 'ASN-TEST',
    store: 'WH-MAIN', // Use warehouse to avoid TO requirement
    to_no: '', // Empty for warehouse
    user_id: TEST_USER,
    purpose: 'STORE'
  };

  const response = await apiRequest('POST', '/api/boxes/create', testBoxData, authToken);
  
  // Accept both 200 (success) and 400 (validation error) as valid
  if (response.status === 200 || response.status === 201) {
    assertHasData(response);
    // Check if box_id is returned
    const boxId = response.data.box_id || response.data.data?.box_id;
    if (boxId) {
      console.log(`  ${colors.cyan}Box created: ${boxId}${colors.reset}`);
    }
  } else if (response.status === 400) {
    // Validation error is acceptable (e.g., ASN doesn't exist)
    console.log(`  ${colors.yellow}Validation error (expected if test data doesn't exist): ${JSON.stringify(response.data)}${colors.reset}`);
  } else {
    throw new Error(`Unexpected status: ${response.status}`);
  }
});

const testCreateBoxWithStore = test('POST /api/boxes/create (Store with TO)', async () => {
  const testBoxData = {
    asn_no: 'ASN-TEST',
    store: 'STORE-001', // Use store code
    to_no: 'TO-00012', // TO required for stores
    user_id: TEST_USER,
    purpose: 'STORE'
  };

  const response = await apiRequest('POST', '/api/boxes/create', testBoxData, authToken);
  
  // Accept various statuses as valid responses
  assert(
    [200, 201, 400, 404].includes(response.status),
    `Unexpected status: ${response.status}`
  );
});

const testCloseBox = test('POST /api/boxes/close', async () => {
  const testData = {
    box_id: 'BOX-TEST-001',
    user_id: TEST_USER
  };

  const response = await apiRequest('POST', '/api/boxes/close', testData, authToken);
  // Accept 200 (success), 400 (validation), or 404 (not found)
  assert(
    [200, 400, 404].includes(response.status),
    `Unexpected status: ${response.status}`
  );
});

const testDeleteBox = test('POST /api/boxes/delete', async () => {
  const testData = {
    box_id: 'BOX-TEST-001',
    user_id: TEST_USER
  };

  const response = await apiRequest('POST', '/api/boxes/delete', testData, authToken);
  // Accept 200 (success), 400 (validation), or 404 (not found)
  assert(
    [200, 400, 404].includes(response.status),
    `Unexpected status: ${response.status}`
  );
});

const testPrintBox = test('POST /api/boxes/print', async () => {
  const testData = {
    box_id: 'BOX-TEST-001'
  };

  const response = await apiRequest('POST', '/api/boxes/print', testData, authToken);
  // Accept 200 (success) or 404 (not found)
  assert(
    [200, 404].includes(response.status),
    `Unexpected status: ${response.status}`
  );
});

const testLockCarton = test('POST /api/carton/lock', async () => {
  const testData = {
    inbound_session: 'SESSION-TEST',
    asn_no: 'ASN-TEST',
    carton_id: 'CARTON-TEST-001',
    user_id: TEST_USER,
    device_id: 'DEVICE-TEST'
  };

  const response = await apiRequest('POST', '/api/carton/lock', testData, authToken);
  // Accept various statuses
  assert(
    [200, 400, 404].includes(response.status),
    `Unexpected status: ${response.status}`
  );
});

const testCompleteCarton = test('POST /api/carton/complete', async () => {
  const testData = {
    inbound_session: 'SESSION-TEST',
    asn_no: 'ASN-TEST',
    carton_id: 'CARTON-TEST-001',
    user_id: TEST_USER,
    device_id: 'DEVICE-TEST'
  };

  const response = await apiRequest('POST', '/api/carton/complete', testData, authToken);
  assert(
    [200, 400, 404].includes(response.status),
    `Unexpected status: ${response.status}`
  );
});

const testUpdateCartonStatus = test('POST /api/cartons/update-status', async () => {
  const testData = {
    asn_no: 'ASN-TEST',
    inbound_session: 'SESSION-TEST',
    carton_id: 'CARTON-TEST-001',
    status: 'Unloaded',
    user_id: TEST_USER,
    device_id: 'DEVICE-TEST'
  };

  const response = await apiRequest('POST', '/api/cartons/update-status', testData, authToken);
  assert(
    [200, 400, 404].includes(response.status),
    `Unexpected status: ${response.status}`
  );
});

const testReceiveLines = test('POST /api/inbound/receive-lines', async () => {
  const testData = {
    receive_lines: [
      {
        parent_title: 'SESSION-TEST',
        carton_id: 'CARTON-TEST-001',
        item_code: 'ITEM-TEST-001',
        expected_qty: 10,
        received_qty: 10,
        condition: 'Good'
      }
    ]
  };

  const response = await apiRequest('POST', '/api/inbound/receive-lines', testData, authToken);
  assert(
    [200, 201, 400, 404].includes(response.status),
    `Unexpected status: ${response.status}`
  );
});

const testUpdateInboundSession = test('POST /api/inbound/update', async () => {
  const testData = {
    inbound_session: 'SESSION-TEST',
    asn_no: 'ASN-TEST',
    status: 'Active',
    completed_cartons: 0,
    total_cartons: 1
  };

  const response = await apiRequest('POST', '/api/inbound/update', testData, authToken);
  assert(
    [200, 400, 404].includes(response.status),
    `Unexpected status: ${response.status}`
  );
});

const testCompleteInboundSession = test('POST /api/inbound/complete', async () => {
  const testData = {
    inbound_session: 'SESSION-TEST',
    asn_no: 'ASN-TEST',
    user_id: TEST_USER,
    device_id: 'DEVICE-TEST'
  };

  const response = await apiRequest('POST', '/api/inbound/complete', testData, authToken);
  assert(
    [200, 400, 404].includes(response.status),
    `Unexpected status: ${response.status}`
  );
});

const testBatchEvents = test('POST /api/events/batch', async () => {
  const testData = {
    events: [
      {
        event_type: 'UNLOAD_SCAN',
        asn_no: 'ASN-TEST',
        inbound_session: 'SESSION-TEST',
        carton_id: 'CARTON-TEST-001',
        device_id: 'DEVICE-TEST',
        user_id: TEST_USER,
        event_time: new Date().toISOString()
      }
    ]
  };

  const response = await apiRequest('POST', '/api/events/batch', testData, authToken);
  assert(
    [200, 201, 400].includes(response.status),
    `Unexpected status: ${response.status}`
  );
});

const testAssignRack = test('POST /api/putaway/assign-rack', async () => {
  const testData = {
    asn_no: 'ASN-TEST',
    item_code: 'ITEM-TEST-001',
    rack_id: 'RACK-TEST-001',
    location_id: 'LOC-TEST-001',
    user_id: TEST_USER,
    device_id: 'DEVICE-TEST'
  };

  const response = await apiRequest('POST', '/api/putaway/assign-rack', testData, authToken);
  assert(
    [200, 400, 404].includes(response.status),
    `Unexpected status: ${response.status}`
  );
});

const testCreateTransferCarton = test('POST /api/transfer-cartons/create', async () => {
  const testData = {
    asn_no: 'ASN-TEST',
    store: 'STORE-001',
    box_ids: ['BOX-TEST-001'],
    user_id: TEST_USER
  };

  const response = await apiRequest('POST', '/api/transfer-cartons/create', testData, authToken);
  assert(
    [200, 201, 400, 404].includes(response.status),
    `Unexpected status: ${response.status}`
  );
});

const testSealTransferCarton = test('POST /api/transfer-cartons/seal', async () => {
  const testData = {
    tc_id: 'TC-TEST-001',
    user_id: TEST_USER
  };

  const response = await apiRequest('POST', '/api/transfer-cartons/seal', testData, authToken);
  assert(
    [200, 400, 404].includes(response.status),
    `Unexpected status: ${response.status}`
  );
});

const testDispatchTransferCarton = test('POST /api/transfer-cartons/dispatch', async () => {
  const testData = {
    tc_id: 'TC-TEST-001',
    user_id: TEST_USER
  };

  const response = await apiRequest('POST', '/api/transfer-cartons/dispatch', testData, authToken);
  assert(
    [200, 400, 404].includes(response.status),
    `Unexpected status: ${response.status}`
  );
});

// ============================================
// MAIN TEST RUNNER
// ============================================

async function runTests() {
  console.log(`${colors.blue}========================================${colors.reset}`);
  console.log(`${colors.blue}WMS API Comprehensive Test Suite${colors.reset}`);
  console.log(`${colors.blue}========================================${colors.reset}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test User: ${TEST_USER}`);
  console.log('');

  // Step 1: Test login first (required for all other tests)
  console.log(`${colors.cyan}Step 1: Authentication${colors.reset}`);
  await testLogin();
  console.log('');

  if (!authToken) {
    console.log(`${colors.red}✗ Authentication failed. Cannot proceed with other tests.${colors.reset}`);
    return;
  }

  // Step 2: Test all GET endpoints
  console.log(`${colors.cyan}Step 2: Testing GET Endpoints${colors.reset}`);
  await testHealthCheck();
  await testGetAllAsns();
  await testGetAsnByNumber();
  await testGetTransferOrderByAsn();
  await testGetAllTransferOrders();
  await testGetAllBoxes();
  await testGetBoxes();
  await testGetBoxById();
  await testGetAllTransferCartons();
  await testGetAllWarehouseRacks();
  await testGetAllWarehouses();
  await testGetWarehousesStores();
  await testGetAllLocations();
  await testGetAllUsers();
  await testGetAllItems();
  await testGetInboundSessions();
  console.log('');

  // Step 3: Test all POST endpoints
  console.log(`${colors.cyan}Step 3: Testing POST Endpoints${colors.reset}`);
  await testCreateBox();
  await testCreateBoxWithStore();
  await testCloseBox();
  await testDeleteBox();
  await testPrintBox();
  await testLockCarton();
  await testCompleteCarton();
  await testUpdateCartonStatus();
  await testReceiveLines();
  await testUpdateInboundSession();
  await testCompleteInboundSession();
  await testBatchEvents();
  await testAssignRack();
  await testCreateTransferCarton();
  await testSealTransferCarton();
  await testDispatchTransferCarton();
  console.log('');

  // Step 4: Print summary
  console.log(`${colors.blue}========================================${colors.reset}`);
  console.log(`${colors.blue}Test Summary${colors.reset}`);
  console.log(`${colors.blue}========================================${colors.reset}`);
  console.log(`${colors.green}Passed: ${results.passed.length}${colors.reset}`);
  console.log(`${colors.red}Failed: ${results.failed.length}${colors.reset}`);
  console.log(`${colors.yellow}Skipped: ${results.skipped.length}${colors.reset}`);
  console.log('');

  if (results.failed.length > 0) {
    console.log(`${colors.red}Failed Tests:${colors.reset}`);
    results.failed.forEach(({ name, error }) => {
      console.log(`  ${colors.red}✗${colors.reset} ${name}`);
      console.log(`    ${error}`);
    });
    console.log('');
  }

  const totalTests = results.passed.length + results.failed.length;
  const passRate = totalTests > 0 ? ((results.passed.length / totalTests) * 100).toFixed(1) : 0;
  
  console.log(`${colors.blue}Pass Rate: ${passRate}%${colors.reset}`);
  console.log('');

  // Exit with appropriate code
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});

