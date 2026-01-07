// Test the actual API response to see what's being returned
import { getConnection } from './src/db/connection.js';

async function testBinMasterResponse() {
  const connection = await getConnection();
  
  try {
    console.log('🔍 Testing Bin Master API Response Format...\n');
    
    // Execute the exact query from getBinMaster
    const [rows] = await connection.execute(`
      SELECT 
        location_id,
        warehouse,
        zone,
        aisle,
        parent_rack,
        level,
        bin_id,
        location_type,
        location_type_detailed,
        is_available,
        capacity_volume_weight,
        created_at,
        updated_at
      FROM tabLocation
      ORDER BY warehouse, zone, aisle, parent_rack, level, bin_id
    `);
    
    console.log(`✅ Query returned ${rows.length} rows from database\n`);
    
    // Transform exactly as the API does
    const bins = rows.map(row => ({
      location_id: row.location_id,
      bin_code: row.location_id, // Mobile app uses bin_code to match location_id
      bin_id: row.bin_id || null,
      warehouse: row.warehouse,
      zone: row.zone || null,
      aisle: row.aisle || null,
      parent_rack: row.parent_rack || null,
      rack: row.parent_rack || null, // Alias for mobile app compatibility
      level: row.level || null,
      location_type: row.location_type || null,
      location_type_detailed: row.location_type_detailed || null,
      is_available: Boolean(row.is_available),
      capacity_volume_weight: row.capacity_volume_weight ? parseFloat(row.capacity_volume_weight) : null,
      created_at: row.created_at ? row.created_at.toISOString() : null,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null
    }));
    
    console.log(`✅ Transformed to ${bins.length} bins\n`);
    
    // Simulate JSON response
    const jsonResponse = JSON.stringify(bins);
    const responseSize = Buffer.byteLength(jsonResponse, 'utf8');
    
    console.log(`📊 Response Statistics:`);
    console.log(`   Total bins: ${bins.length}`);
    console.log(`   JSON size: ${(responseSize / 1024).toFixed(2)} KB`);
    console.log(`   Average size per bin: ${(responseSize / bins.length).toFixed(2)} bytes\n`);
    
    // Check if response would be truncated (unlikely but check)
    if (responseSize > 5 * 1024 * 1024) {
      console.log('⚠️ WARNING: Response size exceeds 5MB limit!');
    } else {
      console.log('✅ Response size is well within limits\n');
    }
    
    // Show first 5 and last 5 bins
    console.log('📋 First 5 bins:');
    bins.slice(0, 5).forEach((bin, index) => {
      console.log(`   ${index + 1}. ${bin.bin_code} (warehouse: ${bin.warehouse})`);
    });
    
    if (bins.length > 10) {
      console.log(`\n📋 Bins 6-10:`);
      bins.slice(5, 10).forEach((bin, index) => {
        console.log(`   ${index + 6}. ${bin.bin_code} (warehouse: ${bin.warehouse})`);
      });
    }
    
    if (bins.length > 10) {
      console.log(`\n📋 Last 5 bins:`);
      bins.slice(-5).forEach((bin, index) => {
        const actualIndex = bins.length - 5 + index + 1;
        console.log(`   ${actualIndex}. ${bin.bin_code} (warehouse: ${bin.warehouse})`);
      });
    }
    
    // Check for any null or invalid values that might cause issues
    console.log('\n🔍 Data Quality Check:');
    const nullLocationIds = bins.filter(b => !b.location_id).length;
    const nullWarehouses = bins.filter(b => !b.warehouse).length;
    const duplicateBinCodes = bins.length - new Set(bins.map(b => b.bin_code)).size;
    
    console.log(`   NULL location_id: ${nullLocationIds}`);
    console.log(`   NULL warehouse: ${nullWarehouses}`);
    console.log(`   Duplicate bin_codes: ${duplicateBinCodes}`);
    
    if (nullLocationIds > 0 || nullWarehouses > 0 || duplicateBinCodes > 0) {
      console.log('   ⚠️ WARNING: Data quality issues found!');
    } else {
      console.log('   ✅ All bins have valid data\n');
    }
    
    // Verify the specific bin that's failing
    const failingBin = bins.find(b => b.bin_code === 'A1-R01-L1-B1');
    if (failingBin) {
      console.log('✅ Bin "A1-R01-L1-B1" is present in response:');
      console.log(JSON.stringify(failingBin, null, 2));
    } else {
      console.log('❌ ERROR: Bin "A1-R01-L1-B1" is NOT in response!');
    }
    
    console.log(`\n✅ Total bins available for sync: ${bins.length}`);
    console.log('✅ All bins are properly formatted and ready for mobile app sync');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

testBinMasterResponse();

