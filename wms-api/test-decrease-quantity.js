// Test script to verify decrease quantity functionality
import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_USER_CODE = process.env.TEST_USER_CODE || 'sysadmin';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'admin123';

let authToken = '';

async function login() {
  console.log('\n🔐 Logging in...');
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_code: TEST_USER_CODE,
      password: TEST_PASSWORD
    })
  });
  
  const data = await response.json();
  if (data.ok && data.data && data.data.access_token) {
    authToken = data.data.access_token;
    console.log('✅ Login successful');
    return true;
  } else {
    console.error('❌ Login failed:', data);
    return false;
  }
}

async function testDecreaseQuantity(mrTitle, itemCode, decreaseAmount, sourceBin) {
  console.log(`\n📦 Testing decrease quantity for ${itemCode} in ${mrTitle}`);
  console.log(`   Current picked_qty: (will query first)`);
  console.log(`   Decrease by: ${decreaseAmount}`);
  console.log(`   New picked_qty should be: (current - ${decreaseAmount})`);
  
  // First, get current picked_qty
  const getResponse = await fetch(`${API_URL}/api/material-requests/${mrTitle}`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  
  const getData = await getResponse.json();
  if (!getData.ok) {
    console.error('❌ Failed to get Material Request:', getData);
    return false;
  }
  
  const item = getData.data.items.find(i => i.item_code === itemCode);
  if (!item) {
    console.error(`❌ Item ${itemCode} not found in Material Request`);
    return false;
  }
  
  const currentPickedQty = parseFloat(item.picked_qty) || 0;
  console.log(`   Current picked_qty: ${currentPickedQty}`);
  
  // Now decrease by sending negative value
  const decreaseResponse = await fetch(`${API_URL}/api/material-requests/${mrTitle}/pick-items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      items: [{
        item_code: itemCode,
        picked_qty: -decreaseAmount, // Negative value to decrease
        source_bin: sourceBin
      }],
      warehouse: 'WH-MAIN'
    })
  });
  
  const decreaseData = await decreaseResponse.json();
  
  if (decreaseData.ok) {
    console.log('✅ Decrease successful!');
    console.log('   Response:', JSON.stringify(decreaseData, null, 2));
    
    // Verify the decrease
    const verifyResponse = await fetch(`${API_URL}/api/material-requests/${mrTitle}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const verifyData = await verifyResponse.json();
    const updatedItem = verifyData.data.items.find(i => i.item_code === itemCode);
    const newPickedQty = parseFloat(updatedItem.picked_qty) || 0;
    
    console.log(`\n📊 Verification:`);
    console.log(`   Before: ${currentPickedQty}`);
    console.log(`   After: ${newPickedQty}`);
    console.log(`   Expected: ${Math.max(0, currentPickedQty - decreaseAmount)}`);
    
    if (newPickedQty === Math.max(0, currentPickedQty - decreaseAmount)) {
      console.log('✅ Quantity decreased correctly!');
      return true;
    } else {
      console.error('❌ Quantity mismatch!');
      return false;
    }
  } else {
    console.error('❌ Decrease failed:', JSON.stringify(decreaseData, null, 2));
    return false;
  }
}

async function main() {
  console.log('🧪 Testing Decrease Quantity Functionality\n');
  
  if (!await login()) {
    process.exit(1);
  }
  
  // Test with example values (adjust as needed)
  const mrTitle = process.argv[2] || 'MR-123459';
  const itemCode = process.argv[3] || 'SKU-HAT-301-BLU-OS';
  const decreaseAmount = parseFloat(process.argv[4]) || 18;
  const sourceBin = process.argv[5] || 'A1-R02-L1-B2';
  
  console.log(`\n📋 Test Configuration:`);
  console.log(`   Material Request: ${mrTitle}`);
  console.log(`   Item Code: ${itemCode}`);
  console.log(`   Decrease Amount: ${decreaseAmount}`);
  console.log(`   Source Bin: ${sourceBin}`);
  
  const success = await testDecreaseQuantity(mrTitle, itemCode, decreaseAmount, sourceBin);
  
  if (success) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Tests failed!');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
