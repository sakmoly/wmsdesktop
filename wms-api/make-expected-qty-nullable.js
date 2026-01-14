// Script to make expected_qty nullable in tabCycleCountLine
import { getConnection } from './src/db/connection.js';

async function makeExpectedQtyNullable() {
  const connection = await getConnection();
  
  try {
    console.log('🔧 Making expected_qty nullable in tabCycleCountLine...\n');
    
    // Step 1: Check current column definition
    const [currentDef] = await connection.execute(`
      SELECT 
        COLUMN_NAME,
        IS_NULLABLE,
        COLUMN_TYPE,
        COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCycleCountLine'
        AND COLUMN_NAME = 'expected_qty'
    `);
    
    if (currentDef.length > 0) {
      console.log('Current expected_qty definition:');
      console.log(`  Nullable: ${currentDef[0].IS_NULLABLE}`);
      console.log(`  Type: ${currentDef[0].COLUMN_TYPE}\n`);
      
      if (currentDef[0].IS_NULLABLE === 'YES') {
        console.log('✅ expected_qty is already nullable. No changes needed.\n');
        return;
      }
    }
    
    // Step 2: Check if discrepancy is a generated column
    const [discrepancyDef] = await connection.execute(`
      SELECT 
        COLUMN_NAME,
        GENERATION_EXPRESSION,
        EXTRA
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCycleCountLine'
        AND COLUMN_NAME = 'discrepancy'
    `);
    
    const isGenerated = discrepancyDef.length > 0 && discrepancyDef[0].EXTRA.includes('STORED');
    
    // Step 3: Drop discrepancy column if it's generated (we'll recreate it)
    if (isGenerated) {
      console.log('📝 Dropping generated discrepancy column...');
      await connection.execute(`
        ALTER TABLE tabCycleCountLine
        DROP COLUMN discrepancy
      `);
      console.log('✅ Discrepancy column dropped\n');
    }
    
    // Step 4: Make expected_qty nullable with default 0
    console.log('📝 Making expected_qty nullable with default 0...');
    await connection.execute(`
      ALTER TABLE tabCycleCountLine
      MODIFY COLUMN expected_qty DECIMAL(10,2) NULL DEFAULT 0
    `);
    console.log('✅ expected_qty is now nullable with default 0\n');
    
    // Step 5: Recreate discrepancy column with NULL handling
    if (isGenerated) {
      console.log('📝 Recreating discrepancy column with NULL handling...');
      await connection.execute(`
        ALTER TABLE tabCycleCountLine
        ADD COLUMN discrepancy DECIMAL(10,2) AS (
          CASE 
            WHEN actual_qty IS NOT NULL AND expected_qty IS NOT NULL AND expected_qty > 0
            THEN (actual_qty - expected_qty)
            ELSE NULL
          END
        ) STORED
      `);
      console.log('✅ Discrepancy column recreated\n');
    }
    
    // Step 6: Verify changes
    const [verify] = await connection.execute(`
      SELECT 
        COLUMN_NAME,
        IS_NULLABLE,
        COLUMN_TYPE,
        EXTRA
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCycleCountLine'
        AND COLUMN_NAME IN ('expected_qty', 'discrepancy')
      ORDER BY COLUMN_NAME
    `);
    
    console.log('✅ Verification:');
    verify.forEach(col => {
      console.log(`  ${col.COLUMN_NAME}: ${col.IS_NULLABLE === 'YES' ? 'NULLABLE' : 'NOT NULL'} ${col.EXTRA ? `(${col.EXTRA})` : ''}`);
    });
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    connection.release();
    process.exit(0);
  }
}

makeExpectedQtyNullable();

