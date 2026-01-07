// Test ASN total shipped quantity calculation
// Run this after restarting the API server to verify the fix

const API_URL = 'http://localhost:3000/api/master/asns';

async function testAsnTotal() {
  try {
    console.log('======================================================================');
    console.log('🧪 TESTING ASN TOTAL SHIPPED QUANTITY');
    console.log('======================================================================');
    console.log('');
    console.log(`📡 Testing: GET ${API_URL}`);
    console.log('');

    // Note: This requires authentication token
    // For testing, you may need to login first and use the token
    const response = await fetch(API_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': 'Bearer YOUR_TOKEN_HERE' // Uncomment and add token if needed
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.log('❌ Authentication required');
        console.log('   Please login first and add the token to this script');
        console.log('   Or test via Postman/mobile app after login');
        return;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const asns = await response.json();

    console.log(`✅ Response received: ${asns.length} ASN(s)`);
    console.log('');

    // Find ASN-12225 specifically
    const asn12225 = asns.find(a => a.asn_no === 'ASN-12225' || a.asn_no?.includes('12225'));
    
    if (asn12225) {
      console.log('📊 ASN-12225 Details:');
      console.log(`   ASN No: ${asn12225.asn_no}`);
      console.log(`   Total Shipped Qty: ${asn12225.total_shipped_qty}`);
      console.log(`   Total Carton Count: ${asn12225.total_carton_count}`);
      console.log('');
      
      if (asn12225.total_shipped_qty === 100) {
        console.log('⚠️  WARNING: Total is still 100 (old value)');
        console.log('   Expected: 1600 (100 + 500 + 500 + 500)');
        console.log('   API server may not have been restarted yet');
      } else if (asn12225.total_shipped_qty === 1600) {
        console.log('✅ SUCCESS: Total is correct (1600)');
      } else {
        console.log(`ℹ️  Total: ${asn12225.total_shipped_qty} (verify if this matches item details)`);
      }
    } else {
      console.log('ℹ️  ASN-12225 not found in response');
      console.log('   Available ASNs:');
      asns.slice(0, 5).forEach(asn => {
        console.log(`   - ${asn.asn_no}: ${asn.total_shipped_qty} qty`);
      });
    }

    console.log('');
    console.log('======================================================================');
    console.log('✅ Test completed');
    console.log('======================================================================');

  } catch (error) {
    console.error('❌ Error testing ASN total:', error.message);
    if (error.message.includes('fetch failed')) {
      console.error('   Make sure the API server is running on http://localhost:3000');
    }
  }
}

testAsnTotal();

