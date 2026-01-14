// ============================================================
// Script: Update Discrepancy to Return 0 Instead of NULL
// ============================================================
// This script fixes the discrepancy column in tabCycleCountLine
// to ensure it always returns 0 instead of NULL when there's no value
// ============================================================

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function updateDiscrepancyToZero() {
  console.log('==========================================');
  console.log('Updating Discrepancy to Return 0 Instead of NULL');
  console.log('==========================================\n');

  let connection;

  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'wms_desktop',
      multipleStatements: true
    });

    console.log(`✅ Connected to database: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '3306'}/${process.env.DB_NAME || 'wms_desktop'}\n`);

    // Step 1: Check current discrepancy column definition
    console.log('📋 Step 1: Checking current discrepancy column definition...');
    const [columns] = await connection.execute(`
      SELECT 
        COLUMN_NAME,
        COLUMN_TYPE,
        IS_NULLABLE,
        GENERATION_EXPRESSION,
        EXTRA
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCycleCountLine'
        AND COLUMN_NAME = 'discrepancy'
    `);

    if (columns.length === 0) {
      console.log('⚠️  discrepancy column does not exist. Creating it...');
    } else {
      console.log('✅ Found discrepancy column:');
      console.log(`   Type: ${columns[0].COLUMN_TYPE}`);
      console.log(`   Nullable: ${columns[0].IS_NULLABLE}`);
      console.log(`   Expression: ${columns[0].GENERATION_EXPRESSION || 'N/A'}`);
      console.log(`   Extra: ${columns[0].EXTRA}\n`);
    }

    // Step 2: Update expected_qty to 0 where it's NULL
    console.log('📋 Step 2: Updating expected_qty to 0 where it\'s NULL...');
    const [updateExpectedQty] = await connection.execute(`
      UPDATE tabCycleCountLine
      SET expected_qty = 0
      WHERE expected_qty IS NULL
    `);
    console.log(`✅ Updated ${updateExpectedQty.affectedRows} records with NULL expected_qty to 0\n`);

    // Step 3: Check if discrepancy is a generated column
    console.log('📋 Step 3: Checking if discrepancy is a generated column...');
    const isGenerated = columns.length > 0 && columns[0].EXTRA && columns[0].EXTRA.includes('STORED');
    
    if (isGenerated) {
      console.log('✅ discrepancy is a generated column. Dropping and recreating it...\n');
      
      // Step 4: Drop the existing discrepancy column
      try {
        await connection.execute(`ALTER TABLE tabCycleCountLine DROP COLUMN discrepancy`);
        console.log('✅ Dropped existing discrepancy column\n');
      } catch (error) {
        if (error.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
          console.log('⚠️  Could not drop discrepancy column (may need to drop index first)...');
          // Try to drop index first
          try {
            await connection.execute(`ALTER TABLE tabCycleCountLine DROP INDEX IF EXISTS idx_discrepancy`);
            await connection.execute(`ALTER TABLE tabCycleCountLine DROP COLUMN discrepancy`);
            console.log('✅ Dropped index and discrepancy column\n');
          } catch (indexError) {
            console.log('⚠️  Error dropping index/column:', indexError.message);
            throw error;
          }
        } else {
          throw error;
        }
      }
    } else {
      console.log('⚠️  discrepancy is not a generated column. It may be a regular column.\n');
    }

    // Step 5: Recreate discrepancy column with improved formula
    console.log('📋 Step 4: Recreating discrepancy column with improved formula...');
    console.log('   Formula: CASE WHEN actual_qty IS NULL THEN 0 ELSE (actual_qty - COALESCE(expected_qty, 0)) END');
    console.log('   Logic: When actual_qty is NULL (not counted), return 0. Otherwise, calculate actual_qty - expected_qty\n');
    
    await connection.execute(`
      ALTER TABLE tabCycleCountLine
      ADD COLUMN discrepancy DECIMAL(10,2) AS (
        CASE 
          WHEN actual_qty IS NULL THEN 0
          ELSE (actual_qty - COALESCE(expected_qty, 0))
        END
      ) STORED
    `);
    console.log('✅ Recreated discrepancy column with improved formula\n');

    // Step 6: Recreate index on discrepancy
    console.log('📋 Step 5: Recreating index on discrepancy...');
    try {
      await connection.execute(`
        CREATE INDEX idx_discrepancy ON tabCycleCountLine(discrepancy)
      `);
      console.log('✅ Created index on discrepancy column\n');
    } catch (error) {
      if (error.code === 'ER_DUP_KEYNAME') {
        console.log('⚠️  Index already exists, skipping...\n');
      } else {
        throw error;
      }
    }

    // Step 7: Verify the changes
    console.log('📋 Step 6: Verifying changes...');
    const [verifyColumns] = await connection.execute(`
      SELECT 
        COLUMN_NAME,
        COLUMN_TYPE,
        IS_NULLABLE,
        GENERATION_EXPRESSION,
        EXTRA
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCycleCountLine'
        AND COLUMN_NAME = 'discrepancy'
    `);

    if (verifyColumns.length > 0) {
      console.log('✅ Verified discrepancy column:');
      console.log(`   Type: ${verifyColumns[0].COLUMN_TYPE}`);
      console.log(`   Nullable: ${verifyColumns[0].IS_NULLABLE}`);
      console.log(`   Expression: ${verifyColumns[0].GENERATION_EXPRESSION || 'N/A'}`);
      console.log(`   Extra: ${verifyColumns[0].EXTRA}\n`);
    }

    // Step 8: Check for NULL discrepancy values (should be 0 now)
    console.log('📋 Step 7: Checking for NULL discrepancy values...');
    const [nullCheck] = await connection.execute(`
      SELECT 
        COUNT(*) as total_records,
        SUM(CASE WHEN discrepancy IS NULL THEN 1 ELSE 0 END) as records_with_null_discrepancy,
        SUM(CASE WHEN discrepancy = 0 THEN 1 ELSE 0 END) as records_with_zero_discrepancy,
        SUM(CASE WHEN discrepancy != 0 THEN 1 ELSE 0 END) as records_with_variance
      FROM tabCycleCountLine
    `);

    console.log('✅ Discrepancy Statistics:');
    console.log(`   Total Records: ${nullCheck[0].total_records || 0}`);
    console.log(`   Records with NULL discrepancy: ${nullCheck[0].records_with_null_discrepancy || 0} ${nullCheck[0].records_with_null_discrepancy > 0 ? '⚠️' : '✅'}`);
    console.log(`   Records with 0 discrepancy: ${nullCheck[0].records_with_zero_discrepancy || 0}`);
    console.log(`   Records with variance (discrepancy != 0): ${nullCheck[0].records_with_variance || 0}\n`);

    // Step 9: Show sample records
    console.log('📋 Step 8: Sample records (latest 10):');
    const [sampleRecords] = await connection.execute(`
      SELECT 
        id,
        item_code,
        expected_qty,
        actual_qty,
        discrepancy,
        CASE 
          WHEN discrepancy IS NULL THEN '❌ NULL (should be 0)'
          WHEN discrepancy = 0 THEN '✅ 0 (correct)'
          ELSE CONCAT('✅ ', discrepancy, ' (variance)')
        END as discrepancy_status
      FROM tabCycleCountLine
      ORDER BY id DESC
      LIMIT 10
    `);

    if (sampleRecords.length > 0) {
      console.table(sampleRecords);
    } else {
      console.log('   No records found\n');
    }

    console.log('==========================================');
    console.log('✅ Migration completed successfully!');
    console.log('==========================================');
    console.log('\nSummary:');
    console.log('1. ✅ Updated expected_qty to 0 where it was NULL');
    console.log('2. ✅ Recreated discrepancy column with improved formula');
    console.log('3. ✅ Formula: CASE WHEN actual_qty IS NULL THEN 0 ELSE (actual_qty - COALESCE(expected_qty, 0)) END');
    console.log('4. ✅ Logic: When actual_qty is NULL (not counted), return 0. Otherwise, calculate actual_qty - expected_qty');
    console.log('5. ✅ This ensures discrepancy is always calculated and never NULL');
    console.log('6. ✅ API layer also handles NULL values (double protection)\n');

  } catch (error) {
    console.error('❌ Error updating discrepancy:', error);
    console.error('Error details:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('✅ Database connection closed');
    }
  }
}

// Run the migration
updateDiscrepancyToZero()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
