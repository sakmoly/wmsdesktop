// Test dispatch stock reduction directly for a specific Transfer Carton
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function testDispatch() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "root",
    database: process.env.DB_NAME || "wms_desktop",
  });

  try {
    // Find a sealed but not dispatched Transfer Carton
    const [tcs] = await connection.execute(`
      SELECT tc_id, status, to_no, created_on, sealed_on, dispatched_on
      FROM tabTransferCarton
      WHERE status = 'Sealed' AND dispatched_on IS NULL
      ORDER BY created_on DESC
      LIMIT 5
    `);

    if (tcs.length === 0) {
      console.log("❌ No sealed (undispatched) Transfer Cartons found.");
      console.log(
        "   Please create and seal a Transfer Carton first, or reset a dispatched one for testing."
      );

      // Option to reset a dispatched one for testing
      const [dispatched] = await connection.execute(`
        SELECT tc_id, to_no
        FROM tabTransferCarton
        WHERE status = 'Dispatched' AND to_no LIKE 'MR-%'
        ORDER BY dispatched_on DESC
        LIMIT 1
      `);

      if (dispatched.length > 0) {
        const tc = dispatched[0];
        console.log(`\n⚠️  Found dispatched TC: ${tc.tc_id}`);
        console.log("   To test, you can reset it:");
        console.log(
          `   UPDATE tabTransferCarton SET status='Sealed', dispatched_by=NULL, dispatched_on=NULL WHERE tc_id='${tc.tc_id}';`
        );
      }

      await connection.end();
      return;
    }

    const tc = tcs[0];
    const tcId = tc.tc_id;
    const materialRequest = tc.to_no;

    console.log(`\n✅ Using Transfer Carton: ${tcId}`);
    console.log(`   Material Request: ${materialRequest}`);
    console.log(`   Status: ${tc.status}`);
    console.log(`   Sealed On: ${tc.sealed_on}`);

    // Get Material Request details
    const [mrDetails] = await connection.execute(
      `
      SELECT title, from_warehouse, to_showroom
      FROM tabMaterialRequest
      WHERE title = ?
    `,
      [materialRequest]
    );
    const warehouse = mrDetails[0].from_warehouse;

    // Get items in Transfer Carton
    const tcCreatedOn = tc.created_on;
    const startTime = new Date(tcCreatedOn);
    startTime.setHours(startTime.getHours() - 6);
    const endTime = new Date();

    // Check which columns exist for source bin
    const [eventCols] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabWmsScanEvent' 
      AND COLUMN_NAME IN ('rack', 'bin', 'location_id', 'source_bin')
    `);
    const eventColumnNames = new Set(eventCols.map((row) => row.COLUMN_NAME));
    const hasRack = eventColumnNames.has("rack");
    const hasBin = eventColumnNames.has("bin");

    let sourceBinExpr = "CONCAT_WS('-', rack, bin)";
    if (hasRack && hasBin) {
      sourceBinExpr = "CONCAT_WS('-', rack, bin)";
    } else if (hasRack) {
      sourceBinExpr = "rack";
    } else if (hasBin) {
      sourceBinExpr = "bin";
    } else {
      sourceBinExpr = "NULL";
    }

    const [tcItems] = await connection.execute(
      `
      SELECT 
        item_code,
        ${sourceBinExpr} as source_bin,
        SUM(qty) as total_qty
      FROM tabWmsScanEvent
      WHERE (tc_id = ? OR (transfer_order = ? AND event_time >= ? AND event_time <= ?))
        AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
        AND item_code IS NOT NULL
        AND qty > 0
      GROUP BY item_code, ${sourceBinExpr.replace(" as source_bin", "")}
    `,
      [tcId, materialRequest, startTime, endTime]
    );

    console.log(`\n📦 Items in Transfer Carton: ${tcItems.length}`);
    tcItems.forEach((item) => {
      console.log(
        `  - ${item.item_code}: ${parseFloat(item.total_qty)} at ${
          item.source_bin || "N/A"
        }`
      );
    });

    if (tcItems.length === 0) {
      console.log(
        "\n❌ No items found in Transfer Carton. Cannot test dispatch."
      );
      await connection.end();
      return;
    }

    // Check stock BEFORE
    console.log("\n📊 Stock BEFORE dispatch:");
    const stockBefore = {};
    for (const item of tcItems) {
      const itemCode = item.item_code;
      const sourceBin = item.source_bin;

      if (sourceBin) {
        const [stock] = await connection.execute(
          `
          SELECT qty
          FROM tabStockLedger
          WHERE item_code = ? AND warehouse = ? AND bin_location = ?
        `,
          [itemCode, warehouse, sourceBin]
        );

        if (stock.length > 0) {
          const currentQty = parseFloat(stock[0].qty);
          stockBefore[itemCode] = { bin: sourceBin, qty: currentQty };
          console.log(`  ${itemCode} at ${sourceBin}: ${currentQty}`);
        } else {
          console.log(`  ${itemCode} at ${sourceBin}: 0 (not found)`);
          stockBefore[itemCode] = { bin: sourceBin, qty: 0 };
        }
      }
    }

    // Perform dispatch
    console.log("\n🚀 Performing Dispatch...");
    await connection.beginTransaction();

    try {
      // Update status
      await connection.execute(
        `
        UPDATE tabTransferCarton 
        SET status = 'Dispatched',
            dispatched_by = 'TEST_USER',
            dispatched_on = NOW(),
            updated_on = NOW()
        WHERE tc_id = ?
      `,
        [tcId]
      );
      console.log('  ✅ Status updated to "Dispatched"');

      // Reduce stock for each item
      for (const item of tcItems) {
        const itemCode = item.item_code;
        const qty = parseFloat(item.total_qty);
        let sourceBin = item.source_bin;

        // Get source bin from picking events if not available
        if (!sourceBin) {
          const sourceBinCol = sourceBinExpr.replace(" as source_bin", "");
          const [pickingEvents] = await connection.execute(
            `
            SELECT ${sourceBinExpr} as source_bin
            FROM tabWmsScanEvent
            WHERE transfer_order = ?
              AND item_code = ?
              AND event_type IN ('PICK_ITEM', 'SORT_TO_BOX', 'PACK_BOX_TO_TC')
              AND event_time <= ?
              AND ${sourceBinCol} IS NOT NULL
            ORDER BY event_time DESC
            LIMIT 1
          `,
            [materialRequest, itemCode, endTime]
          );

          if (pickingEvents.length > 0) {
            sourceBin = pickingEvents[0].source_bin;
          }
        }

        if (sourceBin && qty > 0) {
          // Get current stock
          const [currentStock] = await connection.execute(
            `
            SELECT qty, reserved_qty
            FROM tabStockLedger
            WHERE item_code = ? AND warehouse = ? AND bin_location = ?
          `,
            [itemCode, warehouse, sourceBin]
          );

          if (currentStock.length > 0) {
            const currentQty = parseFloat(currentStock[0].qty);
            const currentReservedQty = parseFloat(currentStock[0].reserved_qty);
            const newQty = currentQty - qty;

            if (currentQty >= qty) {
              // Update stock ledger
              await connection.execute(
                `
                INSERT INTO tabStockLedger 
                (item_code, warehouse, bin_location, qty, reserved_qty,
                 last_transaction_date, last_transaction_type, last_transaction_ref,
                 updated_at, created_at)
                VALUES (?, ?, ?, ?, ?,
                        NOW(), 'Dispatch', ?,
                        NOW(), NOW())
                ON DUPLICATE KEY UPDATE
                  qty = ?,
                  last_transaction_date = NOW(),
                  last_transaction_type = 'Dispatch',
                  last_transaction_ref = ?,
                  updated_at = NOW()
              `,
                [
                  itemCode,
                  warehouse,
                  sourceBin,
                  newQty,
                  currentReservedQty,
                  tcId,
                  newQty,
                  tcId,
                ]
              );

              // Insert transaction
              await connection.execute(
                `
                INSERT INTO tabStockTransaction 
                (transaction_date, transaction_type, reference_doc_type, reference_doc,
                 item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
                 source_bin, target_bin, performed_by, created_at)
                VALUES 
                (NOW(), 'Dispatch', 'Transfer Carton', ?,
                 ?, ?, ?, ?, ?, ?,
                 ?, NULL, 'TEST_USER', NOW())
              `,
                [
                  tcId,
                  itemCode,
                  warehouse,
                  sourceBin,
                  -qty,
                  currentQty,
                  newQty,
                  sourceBin,
                ]
              );

              // Update tabItem.stock_qty
              const [stockSum] = await connection.execute(
                `
                SELECT COALESCE(SUM(qty), 0) as total_qty
                FROM tabStockLedger
                WHERE item_code = ? AND warehouse = ?
              `,
                [itemCode, warehouse]
              );

              const totalStockQty = parseFloat(stockSum[0].total_qty);
              await connection.execute(
                `
                UPDATE tabItem
                SET stock_qty = ?,
                    updated_at = NOW()
                WHERE code = ?
              `,
                [totalStockQty, itemCode]
              );

              console.log(
                `  ✅ Reduced stock for ${itemCode} at ${sourceBin}: ${currentQty} → ${newQty}`
              );
            } else {
              console.log(
                `  ⚠️  Insufficient stock for ${itemCode} at ${sourceBin}. Available: ${currentQty}, Required: ${qty}`
              );
            }
          } else {
            console.log(`  ⚠️  No stock found for ${itemCode} at ${sourceBin}`);
          }
        } else {
          console.log(
            `  ⚠️  Cannot reduce stock for ${itemCode}: source_bin not found or qty is 0`
          );
        }
      }

      await connection.commit();
      console.log("\n✅ Dispatch completed successfully!");

      // Check stock AFTER
      console.log("\n📊 Stock AFTER dispatch:");
      for (const item of tcItems) {
        const itemCode = item.item_code;
        const sourceBin = item.source_bin;

        if (sourceBin && stockBefore[itemCode]) {
          const [stock] = await connection.execute(
            `
            SELECT qty
            FROM tabStockLedger
            WHERE item_code = ? AND warehouse = ? AND bin_location = ?
          `,
            [itemCode, warehouse, sourceBin]
          );

          if (stock.length > 0) {
            const newQty = parseFloat(stock[0].qty);
            const change = stockBefore[itemCode].qty - newQty;
            console.log(
              `  ${itemCode} at ${sourceBin}: ${newQty} (was ${stockBefore[itemCode].qty}, change: ${change})`
            );
            if (change > 0) {
              console.log(`    ✅ Stock reduced by ${change}`);
            } else if (change < 0) {
              console.log(`    ❌ Stock increased (unexpected)`);
            } else {
              console.log(`    ⚠️  No change`);
            }
          }
        }
      }

      // Check transactions
      console.log("\n📋 Stock Transactions:");
      const [transactions] = await connection.execute(
        `
        SELECT transaction_date, transaction_type, reference_doc, item_code, bin_location, qty_change, qty_before, qty_after
        FROM tabStockTransaction
        WHERE reference_doc = ?
          AND transaction_type = 'Dispatch'
        ORDER BY transaction_date DESC
      `,
        [tcId]
      );

      if (transactions.length === 0) {
        console.log("  ❌ No Dispatch transactions found");
      } else {
        console.log(`  ✅ Found ${transactions.length} transaction(s):`);
        transactions.forEach((t) => {
          console.log(
            `    ${t.item_code} at ${t.bin_location}: ${t.qty_before} → ${t.qty_after} (${t.qty_change})`
          );
        });
      }
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    await connection.end();
  }
}

testDispatch();
