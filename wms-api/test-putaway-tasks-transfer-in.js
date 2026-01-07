/**
 * Test script to verify Transfer In Putaway Tasks are returned correctly
 * 
 * Usage:
 *   node test-putaway-tasks-transfer-in.js
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const config = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "wms_db",
  port: process.env.DB_PORT || 3306,
};

async function testPutawayTasksQuery() {
  let connection;
  
  try {
    console.log("🧪 Testing Putaway Tasks Query for Transfer In\n");
    
    // Connect to database
    connection = await mysql.createConnection(config);
    console.log("✅ Connected to database\n");

    // Test 1: Check if Putaway Task exists
    console.log("Test 1: Check if Putaway Task exists for Transfer In...");
    const [tasks] = await connection.execute(
      `SELECT * FROM tabPutawayTask WHERE transfer_in = 'INSLIP-123467' OR title LIKE 'PUT-20260106%' ORDER BY created_at DESC LIMIT 5`
    );
    
    console.log(`Found ${tasks.length} Putaway Task(s):`);
    tasks.forEach((task, index) => {
      console.log(`\n${index + 1}. ${task.title}`);
      console.log(`   Status: ${task.status}`);
      console.log(`   Source Type: ${task.source_type || 'NULL'}`);
      console.log(`   Transfer In: ${task.transfer_in || 'NULL'}`);
      console.log(`   Advance Shipping Notice: ${task.advance_shipping_notice || 'NULL'}`);
      console.log(`   Created At: ${task.created_at}`);
    });

    if (tasks.length === 0) {
      console.log("\n❌ No Putaway Tasks found!");
      return;
    }

    // Test 2: Simulate the API query with source_type filter
    console.log("\n\nTest 2: Simulate API query with source_type='TransferIn' filter...");
    
    // Check if columns exist
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayTask' 
      AND COLUMN_NAME IN ('source_type', 'transfer_in')
    `);

    const hasSourceType = columns.some((col) => col.COLUMN_NAME === "source_type");
    const hasTransferIn = columns.some((col) => col.COLUMN_NAME === "transfer_in");

    console.log(`   Columns: source_type=${hasSourceType}, transfer_in=${hasTransferIn}`);

    // Build query like the API does
    const conditions = [];
    const params = [];

    // Filter by source_type = 'TransferIn'
    if (hasSourceType) {
      conditions.push('COALESCE(pt.source_type, "ASN") = ?');
      params.push('TransferIn');
    } else {
      console.log("   ⚠️ source_type column doesn't exist - query will return empty");
    }

    // Filter by status = 'Draft' (common filter)
    conditions.push("pt.status = ?");
    params.push('Draft');

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sourceTypeSelect = hasSourceType
      ? 'COALESCE(pt.source_type, "ASN") as source_type'
      : '"ASN" as source_type';
    const transferInSelect = hasTransferIn
      ? "pt.transfer_in"
      : "NULL as transfer_in";

    const query = `
      SELECT 
        pt.title,
        pt.status,
        ${sourceTypeSelect},
        pt.advance_shipping_notice,
        ${transferInSelect},
        pt.inbound_session,
        pt.created_by,
        pt.created_at,
        pt.updated_at
      FROM tabPutawayTask pt
      ${whereClause}
      ORDER BY pt.created_at DESC, pt.title
    `;

    console.log(`\n   Query: ${query.replace(/\s+/g, ' ').trim()}`);
    console.log(`   Params: [${params.join(', ')}]`);

    const [filteredTasks] = await connection.execute(query, params);

    console.log(`\n   Result: ${filteredTasks.length} task(s) found`);
    filteredTasks.forEach((task, index) => {
      console.log(`\n   ${index + 1}. ${task.title}`);
      console.log(`      Status: ${task.status}`);
      console.log(`      Source Type: ${task.source_type}`);
      console.log(`      Transfer In: ${task.transfer_in || 'NULL'}`);
    });

    // Test 3: Check COALESCE behavior
    console.log("\n\nTest 3: Check COALESCE behavior...");
    const [coalesceTest] = await connection.execute(
      `SELECT 
        title,
        source_type,
        COALESCE(source_type, "ASN") as coalesced_source_type,
        transfer_in
      FROM tabPutawayTask 
      WHERE title = ?`,
      [tasks[0].title]
    );

    if (coalesceTest.length > 0) {
      const task = coalesceTest[0];
      console.log(`   Task: ${task.title}`);
      console.log(`   source_type (raw): ${task.source_type || 'NULL'}`);
      console.log(`   COALESCE(source_type, "ASN"): ${task.coalesced_source_type}`);
      console.log(`   transfer_in: ${task.transfer_in || 'NULL'}`);
      
      if (task.source_type === 'TransferIn' && task.coalesced_source_type === 'TransferIn') {
        console.log(`   ✅ COALESCE works correctly for TransferIn`);
      } else if (task.source_type === null && task.coalesced_source_type === 'ASN') {
        console.log(`   ⚠️ source_type is NULL - will default to ASN (this is the problem!)`);
      }
    }

    // Test 4: Check Putaway Lines
    console.log("\n\nTest 4: Check Putaway Lines...");
    if (tasks.length > 0) {
      const [lines] = await connection.execute(
        `SELECT * FROM tabPutawayLine WHERE parent_title = ?`,
        [tasks[0].title]
      );
      console.log(`   Found ${lines.length} Putaway Line(s) for ${tasks[0].title}`);
      lines.forEach((line, index) => {
        console.log(`   ${index + 1}. Item: ${line.item_code}, Qty: ${line.qty}, Carton: ${line.carton_id || 'NULL'}`);
      });
    }

    // Test 5: Direct query without COALESCE
    console.log("\n\nTest 5: Direct query without COALESCE (exact match)...");
    const [directTasks] = await connection.execute(
      `SELECT * FROM tabPutawayTask WHERE source_type = 'TransferIn' AND status = 'Draft'`
    );
    console.log(`   Found ${directTasks.length} task(s) with source_type = 'TransferIn'`);
    directTasks.forEach((task, index) => {
      console.log(`   ${index + 1}. ${task.title} - Transfer In: ${task.transfer_in}`);
    });

    console.log("\n\n✅✅✅ TEST COMPLETE ✅✅✅\n");

  } catch (error) {
    console.error("\n❌❌❌ TEST FAILED ❌❌❌\n");
    console.error("Error:", error.message);
    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log("🔌 Database connection closed");
    }
  }
}

// Run the test
testPutawayTasksQuery().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

