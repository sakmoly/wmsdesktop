// Test script to verify bin master endpoint and check if specific bins exist
import { getConnection } from './src/db/connection.js';

async function testBinMaster() {
  const connection = await getConnection();
  
  try {
    console.log('🔍 Testing Bin Master Data...\n');
    
    // Test 1: Check if bin "A1-R01-L1-B1" exists
    const testBinCode = 'A1-R01-L1-B1';
    console.log(`1. Checking if bin "${testBinCode}" exists in database...`);
    
    const [binRows] = await connection.execute(`
      SELECT 
        location_id,
        warehouse,
        zone,
        aisle,
        parent_rack,
        level,
        bin_id,
        location_type,
        is_available
      FROM tabLocation
      WHERE location_id = ?
    `, [testBinCode]);
    
    if (binRows.length > 0) {
      console.log(`✅ Bin "${testBinCode}" found:`);
      console.log(JSON.stringify(binRows[0], null, 2));
    } else {
      console.log(`❌ Bin "${testBinCode}" NOT found in database`);
    }
    
    console.log('\n');
    
    // Test 2: List all bins (first 10)
    console.log('2. Listing first 10 bins in database...');
    const [allBins] = await connection.execute(`
      SELECT 
        location_id,
        warehouse,
        zone,
        aisle,
        parent_rack,
        level,
        bin_id
      FROM tabLocation
      ORDER BY location_id
      LIMIT 10
    `);
    
    console.log(`Found ${allBins.length} bins (showing first 10):`);
    allBins.forEach((bin, index) => {
      console.log(`  ${index + 1}. ${bin.location_id} (warehouse: ${bin.warehouse}, rack: ${bin.parent_rack})`);
    });
    
    console.log('\n');
    
    // Test 3: Check bin master endpoint format
    console.log('3. Testing bin master endpoint format...');
    const [masterBins] = await connection.execute(`
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
      WHERE location_id = ?
    `, [testBinCode]);
    
    if (masterBins.length > 0) {
      const bin = masterBins[0];
      const formattedBin = {
        location_id: bin.location_id,
        bin_code: bin.location_id, // Mobile app uses bin_code
        bin_id: bin.bin_id || null,
        warehouse: bin.warehouse,
        zone: bin.zone || null,
        aisle: bin.aisle || null,
        parent_rack: bin.parent_rack || null,
        rack: bin.parent_rack || null, // Alias for mobile app
        level: bin.level || null,
        location_type: bin.location_type || null,
        location_type_detailed: bin.location_type_detailed || null,
        is_available: Boolean(bin.is_available),
        capacity_volume_weight: bin.capacity_volume_weight ? parseFloat(bin.capacity_volume_weight) : null,
        created_at: bin.created_at ? bin.created_at.toISOString() : null,
        updated_at: bin.updated_at ? bin.updated_at.toISOString() : null
      };
      
      console.log('✅ Bin master format (as returned by API):');
      console.log(JSON.stringify(formattedBin, null, 2));
    } else {
      console.log(`❌ Bin "${testBinCode}" not found for format test`);
    }
    
    console.log('\n');
    
    // Test 4: Count total bins
    const [countRows] = await connection.execute(`
      SELECT COUNT(*) as total FROM tabLocation
    `);
    console.log(`4. Total bins in database: ${countRows[0].total}`);
    
    // Test 5: Check for similar bin codes
    console.log('\n5. Searching for bins with similar codes...');
    const [similarBins] = await connection.execute(`
      SELECT location_id, warehouse, parent_rack, bin_id
      FROM tabLocation
      WHERE location_id LIKE '%A1%' OR location_id LIKE '%R01%' OR location_id LIKE '%B1%'
      ORDER BY location_id
      LIMIT 20
    `);
    
    if (similarBins.length > 0) {
      console.log(`Found ${similarBins.length} bins with similar codes:`);
      similarBins.forEach((bin, index) => {
        console.log(`  ${index + 1}. ${bin.location_id}`);
      });
    } else {
      console.log('No similar bins found');
    }
    
  } catch (error) {
    console.error('❌ Error testing bin master:', error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

testBinMaster();

