// Test the actual API endpoint to see how many bins it returns
import fetch from 'node-fetch';

async function testBinMasterAPI() {
  try {
    // You'll need to set these values
    const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
    const API_TOKEN = process.env.API_TOKEN || 'your-token-here';
    
    console.log('🔍 Testing Bin Master API Endpoint...\n');
    console.log(`API URL: ${API_BASE_URL}/api/master/bin-master\n`);
    
    const response = await fetch(`${API_BASE_URL}/api/master/bin-master`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`❌ API Error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('Response:', errorText);
      return;
    }
    
    const bins = await response.json();
    
    console.log(`✅ API returned ${bins.length} bins\n`);
    
    if (bins.length > 0) {
      console.log('First 5 bins:');
      bins.slice(0, 5).forEach((bin, index) => {
        console.log(`  ${index + 1}. ${bin.bin_code || bin.location_id} (warehouse: ${bin.warehouse})`);
      });
      
      if (bins.length > 5) {
        console.log(`  ... and ${bins.length - 5} more`);
      }
      
      console.log('\nLast 5 bins:');
      bins.slice(-5).forEach((bin, index) => {
        const actualIndex = bins.length - 5 + index + 1;
        console.log(`  ${actualIndex}. ${bin.bin_code || bin.location_id} (warehouse: ${bin.warehouse})`);
      });
    } else {
      console.log('⚠️ No bins returned from API');
    }
    
    // Check if response is an array
    if (!Array.isArray(bins)) {
      console.log('\n⚠️ WARNING: Response is not an array!');
      console.log('Response type:', typeof bins);
      console.log('Response:', JSON.stringify(bins, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error testing API:', error.message);
    console.error('\nNote: Make sure the API server is running and you have a valid token.');
    console.error('Set API_BASE_URL and API_TOKEN environment variables if needed.');
  }
}

testBinMasterAPI();

