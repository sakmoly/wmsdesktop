// Test dispatch with fixed bin logic (use 'bin' directly instead of CONCAT_WS)
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function testFixed() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "root",
    database: process.env.DB_NAME || "wms_desktop",
  });

  try {
    // Reset a dispatched TC for testing
    const [reset] = await connection.execute(`
      UPDATE tabTransferCarton 
      SET status = 'Sealed', 
          dispatched_by = NULL, 
          dispatched_on = NULL 
      WHERE tc_id = 'TC-MR-0001-1767524449896'
    `);
    console.log("✅ Reset Transfer Carton status to Sealed\n");

    const tcId = "TC-MR-0001-1767524449896";
    const materialRequest = "MR-0001";

    // Get Material Request details
    const [mrDetails] = await connection.execute(
      `
      SELECT title, from_warehouse
      FROM tabMaterialRequest
      WHERE title = ?
    `,
      [materialRequest]
    );
    const warehouse = mrDetails[0].from_warehouse;

    // Get items using 'bin' directly (not CONCAT_WS)
    const [tcItems] = await connection.execute(
      `
      SELECT 
        item_code,
        bin as source_bin,
        SUM(qty) as total_qty
      FROM tabWmsScanEvent
      WHERE (tc_id = ? OR transfer_order = ?)
        AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
        AND item_code IS NOT NULL
        AND qty > 0
        AND bin IS NOT NULL
      GROUP BY item_code, bin
    `,
      [tcId, materialRequest]
    );

    console.log(`📦 Items in Transfer Carton: ${tcItems.length}`);
    tcItems.forEach((item) => {
      console.log(
        `  - ${item.item_code}: ${parseFloat(item.total_qty)} at ${
          item.source_bin || "N/A"
        }`
      );
    });

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

      // Reduce stock
      for (const item of tcItems) {
        const itemCode = item.item_code;
        const qty = parseFloat(item.total_qty);
        const sourceBin = item.source_bin;

        if (sourceBin && qty > 0) {
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

testFixed();
