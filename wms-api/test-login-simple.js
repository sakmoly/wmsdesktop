// Simple test to verify login endpoint is working
// Use built-in fetch (Node 18+) or http module

const testLogin = async () => {
  try {
    console.log('\n🧪 Testing login endpoint...');
    console.log('URL: http://localhost:3000/api/auth/login');
    console.log('Body: { user_code: "sysadmin", password: "admin" }');
    
    // Use built-in fetch (Node 18+) or http module
    const fetch = (await import('node-fetch')).default || globalThis.fetch;
    
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_code: 'sysadmin',
        password: 'admin'
      })
    });
    
    const data = await response.json();
    
    console.log('\n📊 Response:');
    console.log(`Status: ${response.status}`);
    console.log(`Body:`, JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log('\n✅ Login successful!');
      console.log(`Token: ${data.data?.access_token?.substring(0, 20)}...`);
    } else {
      console.log('\n❌ Login failed');
      console.log(`Error: ${data.error?.message}`);
    }
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
};

testLogin();

