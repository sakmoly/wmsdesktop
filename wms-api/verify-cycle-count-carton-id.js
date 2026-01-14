// Verify Cycle Count carton_id functionality
import { getConnection } from './src/db/connection.js';

async function verifyCartonId() {
  const connection = await getConnection();
  
  try {
    console.log('🔍 Verifying carton_id in Cycle Count...\n');
    
    // 1. Check if column exists
    const [columnCheck] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCycleCountLine' 
      AND COLUMN_NAME = 'carton_id'
    `);
    
    if (columnCheck.length === 0) {
      console.log('❌ carton_id column does NOT exist in tabCycleCountLine');
      console.log('   Run: node add-carton-id-column.js');
      return;
    }
    
    console.log('✅ carton_id column exists:');
    console.log(`   Type: ${columnCheck[0].DATA_TYPE}`);
    console.log(`   Nullable: ${columnCheck[0].IS_NULLABLE}\n`);
    
    // 2. Check sample data
    const [sampleData] = await connection.execute(`
      SELECT 
        id,
        parent_title,
        item_code,
        bin_location,
        carton_id,
        expected_qty,
        actual_qty,
        status
      FROM tabCycleCountLine
      WHERE carton_id IS NOT NULL
      LIMIT 5
    `);
    
    if (sampleData.length === 0) {
      console.log('⚠️  No cycle count lines with carton_id found');
      console.log('   This is normal if no carton-level counts have been performed yet.\n');
    } else {
      console.log(`✅ Found ${sampleData.length} line(s) with carton_id:\n`);
      sampleData.forEach((line, idx) => {
        console.log(`   ${idx + 1}. Task: ${line.parent_title}`);
        console.log(`      Item: ${line.item_code}`);
        console.log(`      Bin: ${line.bin_location || 'N/A'}`);
        console.log(`      Carton: ${line.carton_id}`);
        console.log(`      Expected: ${line.expected_qty || 'N/A'}`);
        console.log(`      Actual: ${line.actual_qty || 'N/A'}`);
        console.log(`      Status: ${line.status || 'N/A'}\n`);
      });
    }
    
    // 3. Check all cycle count tasks
    const [tasks] = await connection.execute(`
      SELECT DISTINCT parent_title, COUNT(*) as line_count
      FROM tabCycleCountLine
      GROUP BY parent_title
      ORDER BY parent_title DESC
      LIMIT 5
    `);
    
    if (tasks.length > 0) {
      console.log(`📋 Recent Cycle Count Tasks (${tasks.length}):\n`);
      for (const task of tasks) {
        const [taskLines] = await connection.execute(`
          SELECT 
            id,
            item_code,
            bin_location,
            carton_id,
            expected_qty,
            actual_qty
          FROM tabCycleCountLine
          WHERE parent_title = ?
          LIMIT 3
        `, [task.parent_title]);
        
        console.log(`   Task: ${task.parent_title} (${task.line_count} lines)`);
        taskLines.forEach(line => {
          console.log(`      - ${line.item_code} | Bin: ${line.bin_location || 'N/A'} | Carton: ${line.carton_id || 'NULL'}`);
        });
        console.log('');
      }
    }
    
    // 4. Test the query structure used by API
    console.log('🔍 Testing API query structure...\n');
    const hasCartonIdColumn = columnCheck.length > 0;
    const testQuery = `
      SELECT 
        id,
        item_code,
        bin_location,
        ${hasCartonIdColumn ? 'carton_id,' : ''}
        expected_qty,
        actual_qty,
        status
      FROM tabCycleCountLine
      LIMIT 1
    `;
    
    console.log('Query structure:');
    console.log(testQuery);
    console.log('');
    
    const [testResult] = await connection.execute(testQuery);
    if (testResult.length > 0) {
      console.log('✅ Query executed successfully');
      console.log('Sample result:', JSON.stringify(testResult[0], null, 2));
    } else {
      console.log('⚠️  No data to test query');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    connection.release();
    process.exit(0);
  }
}

verifyCartonId();

