// Verify Cycle Count Task Update in Database
// Run: node verify-cycle-count-update.js CC-A1-R01-L1-B1-MK6MZ1UR

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const taskTitle = process.argv[2] || 'CC-A1-R01-L1-B1-MK6MZ1UR';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms_db',
  port: parseInt(process.env.DB_PORT || '3306')
};

async function verifyTask() {
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    
    console.log(`\n🔍 Verifying Cycle Count Task: ${taskTitle}\n`);
    
    // Check task
    const [taskRows] = await connection.execute(`
      SELECT title, status, total_items, counted_items, items_with_discrepancy, updated_at
      FROM tabCycleCountTask
      WHERE title = ?
    `, [taskTitle]);
    
    if (taskRows.length === 0) {
      console.log(`❌ Task ${taskTitle} not found in database`);
      return;
    }
    
    const task = taskRows[0];
    console.log('📊 Task Statistics:');
    console.log(`   Title: ${task.title}`);
    console.log(`   Status: ${task.status}`);
    console.log(`   Total Items: ${task.total_items}`);
    console.log(`   Counted Items: ${task.counted_items}`);
    console.log(`   Items with Discrepancy: ${task.items_with_discrepancy}`);
    console.log(`   Updated At: ${task.updated_at}`);
    
    // Check lines
    const [lineRows] = await connection.execute(`
      SELECT 
        id, item_code, bin_location, carton_id,
        expected_qty, actual_qty, discrepancy,
        counted_by, counted_on, status
      FROM tabCycleCountLine
      WHERE parent_title = ?
      ORDER BY id
    `, [taskTitle]);
    
    console.log(`\n📋 Lines (${lineRows.length} total):`);
    
    const countedLines = lineRows.filter(l => l.actual_qty !== null);
    const linesWithDiscrepancy = lineRows.filter(l => l.discrepancy !== null && Math.abs(l.discrepancy) > 0);
    
    console.log(`   Total Lines: ${lineRows.length}`);
    console.log(`   Counted Lines: ${countedLines.length}`);
    console.log(`   Lines with Discrepancy: ${linesWithDiscrepancy.length}`);
    
    if (countedLines.length > 0) {
      console.log(`\n✅ Counted Lines:`);
      countedLines.forEach((line, idx) => {
        console.log(`   ${idx + 1}. ${line.item_code} @ ${line.bin_location || 'NULL'} - Expected: ${line.expected_qty || 0}, Actual: ${line.actual_qty}, Discrepancy: ${line.discrepancy || 0}`);
      });
    }
    
    // Verify statistics match
    console.log(`\n🔍 Verification:`);
    console.log(`   Task counted_items: ${task.counted_items} vs Actual counted lines: ${countedLines.length} ${task.counted_items === countedLines.length ? '✅' : '❌ MISMATCH'}`);
    console.log(`   Task items_with_discrepancy: ${task.items_with_discrepancy} vs Actual: ${linesWithDiscrepancy.length} ${task.items_with_discrepancy === linesWithDiscrepancy.length ? '✅' : '❌ MISMATCH'}`);
    console.log(`   Task total_items: ${task.total_items} vs Actual: ${lineRows.length} ${task.total_items === lineRows.length ? '✅' : '❌ MISMATCH'}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

verifyTask();

