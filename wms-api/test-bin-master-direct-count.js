// Direct database test to count bins and verify query
import { getConnection } from './src/db/connection.js';

async function testBinMasterCount() {
  const connection = await getConnection();
  
  try {
    console.log('🔍 Testing Bin Master Query...\n');
    
    // Test 1: Count total bins
    const [countRows] = await connection.execute(`
      SELECT COUNT(*) as total FROM tabLocation
    `);
    const totalBins = countRows[0].total;
    console.log(`1. Total bins in database: ${totalBins}\n`);
    
    // Test 2: Execute the exact query from getBinMaster
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
    
    console.log(`2. Query returned ${rows.length} rows\n`);
    
    if (rows.length !== totalBins) {
      console.log(`⚠️ WARNING: Query returned ${rows.length} rows but COUNT(*) says ${totalBins}`);
    }
    
    // Test 3: Check if there are any NULL values that might cause issues
    const [nullCheck] = await connection.execute(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN location_id IS NULL THEN 1 ELSE 0 END) as null_location_id,
        SUM(CASE WHEN warehouse IS NULL THEN 1 ELSE 0 END) as null_warehouse
      FROM tabLocation
    `);
    
    console.log('3. Data quality check:');
    console.log(`   Total rows: ${nullCheck[0].total}`);
    console.log(`   NULL location_id: ${nullCheck[0].null_location_id}`);
    console.log(`   NULL warehouse: ${nullCheck[0].null_warehouse}\n`);
    
    // Test 4: List all bin codes
    console.log('4. All bin codes in database:');
    rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.location_id} (warehouse: ${row.warehouse})`);
    });
    
    console.log(`\n✅ Total: ${rows.length} bins available for sync`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

testBinMasterCount();

