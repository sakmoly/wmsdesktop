// Test script to dispatch transfer carton via API
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

async function testDispatch() {
  console.log('==========================================');
  console.log('Testing Transfer Carton Dispatch via API');
  console.log('==========================================\n');

  const tcId = 'TC-MR-123456-1767539596500';
  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
  
  // Note: This requires authentication token in real usage
  // For testing, you may need to login first to get token
  const token = process.env.API_TOKEN || ''; // Set this if you have a token
  
  const dispatchUrl = `${apiBaseUrl}/api/transfer-cartons/dispatch`;
  
  const requestBody = {
    tc_id: tcId,
    dispatched_by: 'USER-150526'
  };

  console.log('Dispatching Transfer Carton...');
  console.log(`URL: ${dispatchUrl}`);
  console.log(`Body:`, JSON.stringify(requestBody, null, 2));
  console.log();

  try {
    const response = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: JSON.stringify(requestBody)
    });

    const responseData = await response.json();

    if (response.ok) {
      console.log('✅ Dispatch successful!');
      console.log(JSON.stringify(responseData, null, 2));
      console.log();
      console.log('📦 Stock should now be reduced in tabStockLedger');
      console.log('📋 Check tabStockTransaction for Dispatch entries');
    } else {
      console.log('❌ Dispatch failed!');
      console.log(`Status: ${response.status}`);
      console.log(JSON.stringify(responseData, null, 2));
      
      if (response.status === 401) {
        console.log();
        console.log('⚠️  Authentication required. Please login first to get token.');
        console.log('   Use: POST /api/auth/login');
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
  
  console.log();
  console.log('==========================================');
  console.log('Test Complete');
  console.log('==========================================');
}

testDispatch();

