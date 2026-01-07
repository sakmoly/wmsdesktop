// Verify dispatch logic is working
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function verifyDispatch() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "root",
    database: process.env.DB_NAME || "wms_desktop",
  });

  try {
    // Find a dispatched Transfer Carton
    const [dispatched] = await connection.execute(`
      SELECT tc_id, status, to_no, dispatched_on
      FROM tabTransferCarton
      WHERE status = 'Dispatched' AND to_no LIKE 'MR-%'
      ORDER BY dispatched_on DESC
      LIMIT 1
    `);

    if (dispatched.length === 0) {
      console.log("❌ No dispatched Transfer Cartons found.");
      console.log("   Please dispatch a Transfer Carton first.");
      await connection.end();
      return;
    }

    const tc = dispatched[0];
    const tcId = tc.tc_id;
    const materialRequest = tc.to_no;

    console.log(`\n✅ Checking dispatched Transfer Carton: ${tcId}`);
    console.log(`   Material Request: ${materialRequest}`);
    console.log(`   Dispatched On: ${tc.dispatched_on}`);

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

    // Get items that should have been dispatched
    const tcCreatedOn = tc.dispatched_on;
    const startTime = new Date(tcCreatedOn);
    startTime.setHours(startTime.getHours() - 6);
    const endTime = new Date(tcCreatedOn);
    endTime.setHours(endTime.getHours() + 2);

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

    console.log(`\n📦 Items that should have been dispatched: ${tcItems.length}`);
    tcItems.forEach((item) => {
      console.log(
        `  - ${item.item_code}: ${parseFloat(item.total_qty)} at ${item.source_bin}`
      );
    });

    // Check stock transactions
    console.log(`\n📋 Checking Stock Transactions for ${tcId}...`);
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
      console.log(`  ❌ No Dispatch transactions found for ${tcId}`);
      console.log(`  ⚠️  This indicates stock reduction did NOT occur!`);
    } else {
      console.log(`  ✅ Found ${transactions.length} Dispatch transaction(s):`);
      transactions.forEach((t) => {
        console.log(
          `    ${t.item_code} at ${t.bin_location}: ${t.qty_before} → ${t.qty_after} (${t.qty_change})`
        );
      });
    }

    // Check stock ledger for each item
    console.log(`\n📊 Checking Stock Ledger...`);
    for (const item of tcItems) {
      const itemCode = item.item_code;
      const sourceBin = item.source_bin;

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
        console.log(
          `  ${itemCode} at ${sourceBin}: ${currentQty} (should be reduced from dispatch)`
        );
      } else {
        console.log(`  ${itemCode} at ${sourceBin}: NOT FOUND in stock ledger`);
      }
    }

    // Check if API server is running and test dispatch endpoint
    console.log(`\n🔍 Checking if API is using correct bin logic...`);
    console.log(`   Please verify the API code uses 'bin' directly, not CONCAT_WS('-', rack, bin)`);

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    await connection.end();
  }
}

verifyDispatch();

