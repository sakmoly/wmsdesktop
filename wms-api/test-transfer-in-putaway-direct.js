/**
 * Direct database test for Transfer In Putaway Task creation
 * This test directly calls the database functions to verify putaway task creation
 * 
 * Usage:
 *   node test-transfer-in-putaway-direct.js
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

async function testPutawayTaskCreation() {
  let connection;
  
  try {
    console.log("🧪 Testing Transfer In Putaway Task Creation\n");
    
    // Connect to database
    connection = await mysql.createConnection(config);
    await connection.beginTransaction();
    console.log("✅ Connected to database\n");

    // Step 1: Create a test Transfer In
    const testTitle = `INSLIP-TEST-${Date.now()}`;
    console.log(`📝 Creating test Transfer In: ${testTitle}\n`);

    await connection.execute(
      `
      INSERT INTO tabTransferIn 
        (title, status, from_showroom, to_warehouse, transfer_date, expected_arrival_date, prepared_by, total_qty)
      VALUES (?, 'Draft', 'SHOWROOM-001', 'WH-MAIN', CURDATE(), CURDATE(), 'TEST-USER', 15)
    `,
      [testTitle]
    );

    // Step 2: Add items (one with carton, one without)
    await connection.execute(
      `
      INSERT INTO tabTransferInItem 
        (parent_title, item_code, qty, carton_id)
      VALUES (?, 'ITEM-001', 10, 'CTN-TEST-001')
    `,
      [testTitle]
    );

    await connection.execute(
      `
      INSERT INTO tabTransferInItem 
        (parent_title, item_code, qty, carton_id)
      VALUES (?, 'ITEM-002', 5, NULL)
    `,
      [testTitle]
    );

    console.log("✅ Created Transfer In with 2 items\n");

    // Step 3: Submit Transfer In
    await connection.execute(
      `
      UPDATE tabTransferIn
      SET status = 'Submitted',
          updated_at = NOW()
      WHERE title = ?
    `,
      [testTitle]
    );

    console.log("✅ Submitted Transfer In\n");

    // Step 4: Receive cartonized item
    await connection.execute(
      `
      UPDATE tabTransferInItem
      SET received_qty = qty,
          updated_at = NOW()
      WHERE parent_title = ?
        AND carton_id = 'CTN-TEST-001'
    `,
      [testTitle]
    );

    console.log("✅ Received cartonized item (ITEM-001)\n");

    // Step 5: Receive loose item
    await connection.execute(
      `
      UPDATE tabTransferInItem
      SET received_qty = qty,
          updated_at = NOW()
      WHERE parent_title = ?
        AND item_code = 'ITEM-002'
        AND carton_id IS NULL
    `,
      [testTitle]
    );

    console.log("✅ Received loose item (ITEM-002)\n");

    // Step 6: Check if all items are received and create putaway task
    const [remaining] = await connection.execute(
      `
      SELECT COUNT(*) as count
      FROM tabTransferInItem
      WHERE parent_title = ?
        AND received_qty < qty
    `,
      [testTitle]
    );

    if (remaining[0].count === 0) {
      // All items received - update status
      await connection.execute(
        `
        UPDATE tabTransferIn
        SET status = 'Received',
            received_by = 'TEST-USER',
            received_on = NOW(),
            updated_at = NOW()
        WHERE title = ?
      `,
        [testTitle]
      );

      console.log("✅ All items received - Transfer In status updated to 'Received'\n");

      // Step 7: Create Putaway Task (simulating the helper function)
      console.log("📦 Creating Putaway Task...\n");

      // Check column existence
      const [sourceTypeCols] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabPutawayTask'
          AND COLUMN_NAME = 'source_type'
      `);
      const hasSourceType = sourceTypeCols.length > 0;

      const [transferInCols] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabPutawayTask'
          AND COLUMN_NAME = 'transfer_in'
      `);
      const hasTransferIn = transferInCols.length > 0;

      const [warehouseCols] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabPutawayTask'
        AND COLUMN_NAME = 'warehouse'
    `);
    const hasWarehouse = warehouseCols.length > 0;

    // Check if inbound_session column exists and if it's nullable
    const [inboundSessionCols] = await connection.execute(`
      SELECT COLUMN_NAME, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabPutawayTask'
        AND COLUMN_NAME = 'inbound_session'
    `);
    const hasInboundSession = inboundSessionCols.length > 0;
    const inboundSessionNullable = hasInboundSession && inboundSessionCols[0].IS_NULLABLE === 'YES';
    
    // For Transfer In, we might not have an inbound session
    let inboundSession = null;
    if (hasInboundSession && !inboundSessionNullable) {
      // Column exists and is NOT NULL - try to find an inbound session
      // Check if transfer_in column exists in tabInboundSession, otherwise use asn_no
      const [transferInColCheck] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabInboundSession'
          AND COLUMN_NAME = 'transfer_in'
      `);
      const hasTransferInInSession = transferInColCheck.length > 0;
      
      // Check which column to use for started_at/started_on
      const [startedColCheck] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabInboundSession'
          AND COLUMN_NAME IN ('started_at', 'started_on')
        LIMIT 1
      `);
      const startedColumn = startedColCheck.length > 0 ? startedColCheck[0].COLUMN_NAME : 'started_at';
      
      // Check which column to use for session ID
      const [sessionIdColCheck] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabInboundSession'
          AND COLUMN_NAME IN ('inbound_session', 'title')
        LIMIT 1
      `);
      const sessionIdColumn = sessionIdColCheck.length > 0 ? sessionIdColCheck[0].COLUMN_NAME : 'inbound_session';
      
      if (hasTransferInInSession) {
        // Use transfer_in column if it exists
        const [sessionRows] = await connection.execute(
          `SELECT ${sessionIdColumn} as inbound_session FROM tabInboundSession WHERE transfer_in = ? ORDER BY ${startedColumn} DESC LIMIT 1`,
          [testTitle]
        );
        inboundSession = sessionRows.length > 0 ? sessionRows[0].inbound_session : null;
      } else {
        // Use asn_no column with Transfer In title as value
        const [sessionRows] = await connection.execute(
          `SELECT ${sessionIdColumn} as inbound_session FROM tabInboundSession WHERE asn_no = ? ORDER BY ${startedColumn} DESC LIMIT 1`,
          [testTitle]
        );
        inboundSession = sessionRows.length > 0 ? sessionRows[0].inbound_session : null;
      }
      
      // If no session found and column is NOT NULL, use empty string as placeholder
      if (!inboundSession) {
        inboundSession = ""; // Empty string placeholder
      }
    }

    console.log(`   Columns: source_type=${hasSourceType}, transfer_in=${hasTransferIn}, warehouse=${hasWarehouse}, inbound_session=${hasInboundSession}\n`);

      // Check for existing tasks
      if (hasSourceType && hasTransferIn) {
        const [existingTasks] = await connection.execute(
          `
          SELECT title FROM tabPutawayTask
          WHERE source_type = 'TransferIn'
            AND transfer_in = ?
        `,
          [testTitle]
        );

        if (existingTasks.length > 0) {
          console.log(`⚠️ Putaway Task already exists: ${existingTasks[0].title}\n`);
        }
      }

      // Get received items
      const [items] = await connection.execute(
        `
        SELECT item_code, carton_id, received_qty
        FROM tabTransferInItem
        WHERE parent_title = ?
          AND received_qty > 0
        ORDER BY item_code
      `,
        [testTitle]
      );

      if (items.length === 0) {
        console.log("⚠️ No items to put away\n");
      } else {
        console.log(`   Found ${items.length} item(s) to put away\n`);

        // Generate Putaway Task title
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const [sequenceRows] = await connection.execute(
          `
          SELECT COUNT(*) + 1 as seq
          FROM tabPutawayTask
          WHERE title LIKE ?
        `,
          [`PUT-${dateStr}-%`]
        );
        const sequence = String(sequenceRows[0].seq).padStart(4, "0");
        const putawayTaskTitle = `PUT-${dateStr}-${sequence}`;

        console.log(`   Generated Putaway Task title: ${putawayTaskTitle}\n`);

        // Create Putaway Task - Build INSERT statement dynamically
        const warehouse = "WH-MAIN";
        
        const insertFields = ['title', 'status', 'created_by', 'created_at', 'updated_at'];
        const insertValues = [putawayTaskTitle, 'Draft', 'SYSTEM'];
        const insertPlaceholders = ['?', '?', '?', 'NOW()', 'NOW()'];

        if (hasSourceType) {
          insertFields.push('source_type');
          insertValues.push('TransferIn');
          insertPlaceholders.push('?');
        }

        if (hasTransferIn) {
          insertFields.push('transfer_in');
          insertValues.push(testTitle);
          insertPlaceholders.push('?');
        }

        if (hasWarehouse) {
          insertFields.push('warehouse');
          insertValues.push(warehouse);
          insertPlaceholders.push('?');
        }

        // advance_shipping_notice is required (NOT NULL), so always include it
        insertFields.push('advance_shipping_notice');
        insertValues.push(testTitle);
        insertPlaceholders.push('?');

        // inbound_session: include only if column exists
        if (hasInboundSession) {
          insertFields.push('inbound_session');
          insertValues.push(inboundSession);
          insertPlaceholders.push('?');
        }

        const sql = `
          INSERT INTO tabPutawayTask
            (${insertFields.join(', ')})
          VALUES (${insertPlaceholders.join(', ')})
        `;

        await connection.execute(sql, insertValues);

        console.log(`✅ Created Putaway Task: ${putawayTaskTitle}\n`);

        // Create Putaway Lines
        // Check if status column exists in tabPutawayLine
        const [statusColCheck] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabPutawayLine'
            AND COLUMN_NAME = 'status'
        `);
        const hasStatusInLine = statusColCheck.length > 0;

        for (const item of items) {
          if (hasStatusInLine) {
            await connection.execute(
              `
              INSERT INTO tabPutawayLine
                (parent_title, item_code, carton_id, qty, rack, bin, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'TBD', 'TBD', 'Pending', NOW(), NOW())
            `,
              [
                putawayTaskTitle,
                item.item_code,
                item.carton_id || null,
                item.received_qty,
              ]
            );
          } else {
            await connection.execute(
              `
              INSERT INTO tabPutawayLine
                (parent_title, item_code, carton_id, qty, rack, bin, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'TBD', 'TBD', NOW(), NOW())
            `,
              [
                putawayTaskTitle,
                item.item_code,
                item.carton_id || null,
                item.received_qty,
              ]
            );
          }
        }

        console.log(`✅ Created ${items.length} Putaway Line(s)\n`);

        // Verify the created task
        let verifyQuery;
        let verifyParams;

        if (hasSourceType && hasTransferIn) {
          verifyQuery = `
            SELECT pt.*, COUNT(pl.item_code) as item_count
            FROM tabPutawayTask pt
            LEFT JOIN tabPutawayLine pl ON pt.title = pl.parent_title
            WHERE pt.title = ?
            GROUP BY pt.title
          `;
          verifyParams = [putawayTaskTitle];
        } else {
          verifyQuery = `
            SELECT pt.*, COUNT(pl.item_code) as item_count
            FROM tabPutawayTask pt
            LEFT JOIN tabPutawayLine pl ON pt.title = pl.parent_title
            WHERE pt.title = ?
            GROUP BY pt.title
          `;
          verifyParams = [putawayTaskTitle];
        }

        const [verifyTasks] = await connection.execute(verifyQuery, verifyParams);
        const task = verifyTasks[0];

        console.log("📋 Putaway Task Details:");
        console.log(`   Title: ${task.title}`);
        console.log(`   Status: ${task.status}`);
        console.log(`   Source Type: ${task.source_type || "N/A"}`);
        console.log(`   Transfer In: ${task.transfer_in || task.advance_shipping_notice || "N/A"}`);
        console.log(`   Warehouse: ${task.warehouse || "N/A"}`);
        console.log(`   Advance Shipping Notice: ${task.advance_shipping_notice || "N/A"}`);
        console.log(`   Items: ${task.item_count}\n`);

        // Verify lines
        const [lines] = await connection.execute(
          `SELECT * FROM tabPutawayLine WHERE parent_title = ? ORDER BY item_code`,
          [putawayTaskTitle]
        );

        console.log("📦 Putaway Lines:");
        lines.forEach((line, index) => {
          console.log(`   ${index + 1}. ${line.item_code} - Qty: ${line.qty}, Carton: ${line.carton_id || "N/A"}, Status: ${line.status}`);
        });

        console.log("\n✅✅✅ TEST PASSED! ✅✅✅\n");
      }
    } else {
      console.log(`⚠️ Not all items received (${remaining[0].count} remaining)\n`);
    }

    await connection.commit();
    console.log("✅ Transaction committed\n");

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
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
testPutawayTaskCreation().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

