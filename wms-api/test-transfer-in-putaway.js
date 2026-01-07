/**
 * Test script to verify Transfer In Putaway Task creation
 * 
 * Usage:
 *   node test-transfer-in-putaway.js
 * 
 * This script will:
 * 1. Create a test Transfer In document
 * 2. Submit it
 * 3. Receive all items (both cartonized and loose)
 * 4. Verify Putaway Task is created
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

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
const TEST_TOKEN = process.env.TEST_TOKEN || "test-token"; // You may need to generate a real token

async function testTransferInPutaway() {
  let connection;
  
  try {
    console.log("🧪 Starting Transfer In Putaway Task Test\n");
    
    // Connect to database
    connection = await mysql.createConnection(config);
    console.log("✅ Connected to database\n");

    // Generate test Transfer In title
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const testTitle = `INSLIP-TEST-${Date.now()}`;
    
    console.log(`📝 Test Transfer In: ${testTitle}\n`);

    // Step 1: Create Transfer In via API
    console.log("Step 1: Creating Transfer In document...");
    const createResponse = await fetch(`${API_BASE_URL}/api/transfer-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        title: testTitle,
        from_showroom: "SHOWROOM-001",
        to_warehouse: "WH-MAIN",
        transfer_date: new Date().toISOString().split("T")[0],
        expected_arrival_date: new Date().toISOString().split("T")[0],
        prepared_by: "TEST-USER",
        items: [
          {
            item_code: "ITEM-001",
            qty: 10,
            carton_id: "CTN-TEST-001",
          },
          {
            item_code: "ITEM-002",
            qty: 5,
            carton_id: null, // Loose item
          },
        ],
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(`Failed to create Transfer In: ${JSON.stringify(error)}`);
    }

    const createResult = await createResponse.json();
    console.log(`✅ Created: ${JSON.stringify(createResult, null, 2)}\n`);

    // Step 2: Submit Transfer In
    console.log("Step 2: Submitting Transfer In...");
    const submitResponse = await fetch(
      `${API_BASE_URL}/api/transfer-in/${testTitle}/submit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
        body: JSON.stringify({
          submitted_by: "TEST-USER",
        }),
      }
    );

    if (!submitResponse.ok) {
      const error = await submitResponse.json();
      throw new Error(`Failed to submit Transfer In: ${JSON.stringify(error)}`);
    }

    const submitResult = await submitResponse.json();
    console.log(`✅ Submitted: ${JSON.stringify(submitResult, null, 2)}\n`);

    // Step 3: Receive cartonized item
    console.log("Step 3: Receiving cartonized item (CTN-TEST-001)...");
    const receiveCartonResponse = await fetch(
      `${API_BASE_URL}/api/transfer-in/${testTitle}/receive-line`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
        body: JSON.stringify({
          carton_id: "CTN-TEST-001",
          received_by: "TEST-USER",
        }),
      }
    );

    if (!receiveCartonResponse.ok) {
      const error = await receiveCartonResponse.json();
      throw new Error(
        `Failed to receive carton: ${JSON.stringify(error)}`
      );
    }

    const receiveCartonResult = await receiveCartonResponse.json();
    console.log(
      `✅ Received carton: ${JSON.stringify(receiveCartonResult, null, 2)}\n`
    );

    // Step 4: Receive loose item
    console.log("Step 4: Receiving loose item (ITEM-002)...");
    const receiveLooseResponse = await fetch(
      `${API_BASE_URL}/api/transfer-in/${testTitle}/receive-line`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
        body: JSON.stringify({
          item_code: "ITEM-002",
          received_qty: 5,
          received_by: "TEST-USER",
        }),
      }
    );

    if (!receiveLooseResponse.ok) {
      const error = await receiveLooseResponse.json();
      throw new Error(
        `Failed to receive loose item: ${JSON.stringify(error)}`
      );
    }

    const receiveLooseResult = await receiveLooseResponse.json();
    console.log(
      `✅ Received loose item: ${JSON.stringify(receiveLooseResult, null, 2)}\n`
    );

    // Step 5: Verify Putaway Task was created
    console.log("Step 5: Verifying Putaway Task creation...");
    
    // Check if source_type and transfer_in columns exist
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayTask' 
      AND COLUMN_NAME IN ('source_type', 'transfer_in', 'warehouse')
    `);

    const hasSourceType = columns.some((col) => col.COLUMN_NAME === "source_type");
    const hasTransferIn = columns.some((col) => col.COLUMN_NAME === "transfer_in");
    const hasWarehouse = columns.some((col) => col.COLUMN_NAME === "warehouse");

    console.log(`   Columns: source_type=${hasSourceType}, transfer_in=${hasTransferIn}, warehouse=${hasWarehouse}`);

    let putawayQuery;
    let putawayParams;

    if (hasSourceType && hasTransferIn) {
      putawayQuery = `
        SELECT pt.*, COUNT(pl.item_code) as item_count
        FROM tabPutawayTask pt
        LEFT JOIN tabPutawayLine pl ON pt.title = pl.parent_title
        WHERE pt.source_type = 'TransferIn'
          AND pt.transfer_in = ?
        GROUP BY pt.title
      `;
      putawayParams = [testTitle];
    } else if (hasSourceType) {
      putawayQuery = `
        SELECT pt.*, COUNT(pl.item_code) as item_count
        FROM tabPutawayTask pt
        LEFT JOIN tabPutawayLine pl ON pt.title = pl.parent_title
        WHERE pt.source_type = 'TransferIn'
          AND pt.advance_shipping_notice = ?
        GROUP BY pt.title
      `;
      putawayParams = [testTitle];
    } else {
      putawayQuery = `
        SELECT pt.*, COUNT(pl.item_code) as item_count
        FROM tabPutawayTask pt
        LEFT JOIN tabPutawayLine pl ON pt.title = pl.parent_title
        WHERE pt.advance_shipping_notice = ?
        GROUP BY pt.title
      `;
      putawayParams = [testTitle];
    }

    const [putawayTasks] = await connection.execute(putawayQuery, putawayParams);

    if (putawayTasks.length === 0) {
      console.error("❌ ERROR: No Putaway Task found for Transfer In!");
      console.error("   This means the putaway task was not created.");
      
      // Check Transfer In status
      const [tiStatus] = await connection.execute(
        `SELECT status FROM tabTransferIn WHERE title = ?`,
        [testTitle]
      );
      console.error(`   Transfer In status: ${tiStatus[0]?.status || "NOT FOUND"}`);
      
      // Check received items
      const [receivedItems] = await connection.execute(
        `SELECT item_code, qty, received_qty FROM tabTransferInItem WHERE parent_title = ?`,
        [testTitle]
      );
      console.error(`   Received items:`, receivedItems);
      
      throw new Error("Putaway Task was not created");
    }

    const putawayTask = putawayTasks[0];
    console.log(`✅ Found Putaway Task: ${putawayTask.title}`);
    console.log(`   Status: ${putawayTask.status}`);
    console.log(`   Items: ${putawayTask.item_count}`);
    console.log(`   Source Type: ${putawayTask.source_type || "N/A"}`);
    console.log(`   Transfer In: ${putawayTask.transfer_in || putawayTask.advance_shipping_notice || "N/A"}`);
    console.log(`   Warehouse: ${putawayTask.warehouse || "N/A"}\n`);

    // Step 6: Verify Putaway Lines
    console.log("Step 6: Verifying Putaway Lines...");
    const [putawayLines] = await connection.execute(
      `SELECT * FROM tabPutawayLine WHERE parent_title = ? ORDER BY item_code`,
      [putawayTask.title]
    );

    console.log(`✅ Found ${putawayLines.length} Putaway Line(s):`);
    putawayLines.forEach((line, index) => {
      console.log(`   ${index + 1}. ${line.item_code} - Qty: ${line.qty}, Carton: ${line.carton_id || "N/A"}, Status: ${line.status}`);
    });

    console.log("\n✅✅✅ ALL TESTS PASSED! ✅✅✅\n");
    console.log(`Summary:`);
    console.log(`  Transfer In: ${testTitle}`);
    console.log(`  Putaway Task: ${putawayTask.title}`);
    console.log(`  Items: ${putawayLines.length}`);
    console.log(`  Status: ${putawayTask.status}\n`);

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
testTransferInPutaway().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

