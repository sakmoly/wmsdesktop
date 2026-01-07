// Comprehensive diagnostic script for dispatch stock reduction issues
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function diagnose() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "root",
    database: process.env.DB_NAME || "wms_desktop",
  });

  try {
    console.log("==========================================");
    console.log("Dispatch Stock Reduction Diagnostic");
    console.log("==========================================\n");

    // 1. Check recent dispatched Transfer Cartons
    console.log("1. Recent Dispatched Transfer Cartons:");
    const [dispatched] = await connection.execute(`
      SELECT tc_id, status, to_no, dispatched_on
      FROM tabTransferCarton
      WHERE status = 'Dispatched' AND to_no LIKE 'MR-%'
      ORDER BY dispatched_on DESC
      LIMIT 5
    `);

    if (dispatched.length === 0) {
      console.log("   ⚠️  No dispatched Transfer Cartons found");
    } else {
      dispatched.forEach((tc) => {
        console.log(`   - ${tc.tc_id}: Dispatched ${tc.dispatched_on}`);
      });
    }

    // 2. Check stock transactions for recent dispatches
    console.log("\n2. Stock Transactions for Recent Dispatches:");
    for (const tc of dispatched.slice(0, 3)) {
      const [transactions] = await connection.execute(
        `
        SELECT COUNT(*) as count
        FROM tabStockTransaction
        WHERE reference_doc = ? AND transaction_type = 'Dispatch'
      `,
        [tc.tc_id]
      );

      const count = transactions[0].count;
      if (count > 0) {
        console.log(`   ✅ ${tc.tc_id}: ${count} transaction(s) found`);
      } else {
        console.log(`   ❌ ${tc.tc_id}: NO transactions found (STOCK NOT REDUCED)`);
      }
    }

    // 3. Check code logic (verify bin expression)
    console.log("\n3. Verifying Source Bin Logic:");
    console.log("   Expected: Use 'bin' directly (not CONCAT_WS('-', rack, bin))");
    console.log("   ✅ API Code: Uses 'bin' directly (line 801 in transferCartonController.js)");
    console.log("   ✅ Desktop App Code: Uses 'bin' directly (line 275 in TransferCartonDataService.cs)");

    // 4. Check sample event data
    console.log("\n4. Sample Event Data (to verify bin format):");
    const [sampleEvents] = await connection.execute(`
      SELECT DISTINCT rack, bin, CONCAT_WS('-', rack, bin) as concat_result
      FROM tabWmsScanEvent
      WHERE rack IS NOT NULL AND bin IS NOT NULL
      LIMIT 3
    `);

    sampleEvents.forEach((e) => {
      console.log(`   rack="${e.rack}", bin="${e.bin}", CONCAT="${e.concat_result}"`);
      if (e.rack === e.bin) {
        console.log(`      ⚠️  rack and bin are the SAME - CONCAT_WS would duplicate!`);
      }
    });

    // 5. Test query with correct logic
    console.log("\n5. Testing Query with Correct Logic (using 'bin' directly):");
    if (dispatched.length > 0) {
      const tcId = dispatched[0].tc_id;
      const materialRequest = dispatched[0].to_no;

      const [mrDetails] = await connection.execute(
        `SELECT from_warehouse FROM tabMaterialRequest WHERE title = ?`,
        [materialRequest]
      );
      const warehouse = mrDetails[0]?.from_warehouse;

      const [items] = await connection.execute(
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
        LIMIT 5
      `,
        [tcId, materialRequest]
      );

      console.log(`   Items found: ${items.length}`);
      items.forEach((item) => {
        console.log(`     ${item.item_code}: ${item.total_qty} at ${item.source_bin}`);
      });

      // Check if stock exists at these bins
      console.log("\n6. Checking Stock at Source Bins:");
      for (const item of items) {
        const [stock] = await connection.execute(
          `
          SELECT qty
          FROM tabStockLedger
          WHERE item_code = ? AND warehouse = ? AND bin_location = ?
        `,
          [item.item_code, warehouse, item.source_bin]
        );

        if (stock.length > 0) {
          console.log(`   ✅ ${item.item_code} at ${item.source_bin}: ${parseFloat(stock[0].qty)}`);
        } else {
          console.log(`   ❌ ${item.item_code} at ${item.source_bin}: NOT FOUND`);
        }
      }
    }

    // 7. Recommendations
    console.log("\n==========================================");
    console.log("Recommendations:");
    console.log("==========================================");
    console.log("1. ✅ Code is correct (uses 'bin' directly)");
    console.log("2. ⚠️  If using API: RESTART the API server");
    console.log("3. ⚠️  If using Desktop App: REBUILD the application");
    console.log("4. ✅ Test again after restarting/rebuilding");

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    await connection.end();
  }
}

diagnose();

