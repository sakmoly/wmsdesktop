// Test script to verify qty_before and qty_reduced are being populated
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function test() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "root",
    database: process.env.DB_NAME || "wms_desktop",
  });

  try {
    console.log("Checking tabStockLedger columns...");
    const [cols] = await connection.execute("DESCRIBE tabStockLedger");
    const hasQtyBefore = cols.some((c) => c.Field === "qty_before");
    const hasQtyReduced = cols.some((c) => c.Field === "qty_reduced");

    console.log(`✅ qty_before column exists: ${hasQtyBefore}`);
    console.log(`✅ qty_reduced column exists: ${hasQtyReduced}\n`);

    if (!hasQtyBefore || !hasQtyReduced) {
      console.log("❌ Columns are missing! Run the migration script first.");
      await connection.end();
      return;
    }

    // Check recent stock ledger entries
    console.log("Checking recent stock ledger entries...");
    const [recent] = await connection.execute(`
      SELECT item_code, warehouse, bin_location, qty, qty_before, qty_reduced, 
             last_transaction_type, last_transaction_date
      FROM tabStockLedger
      WHERE last_transaction_type = 'Dispatch'
      ORDER BY last_transaction_date DESC
      LIMIT 10
    `);

    console.log(`\nFound ${recent.length} recent Dispatch transactions:\n`);
    if (recent.length === 0) {
      console.log("  No Dispatch transactions found in stock ledger");
    } else {
      recent.forEach((r) => {
        console.log(`  ${r.item_code} at ${r.bin_location}:`);
        console.log(`    qty: ${r.qty}`);
        console.log(`    qty_before: ${r.qty_before ?? "NULL"}`);
        console.log(`    qty_reduced: ${r.qty_reduced ?? "NULL"}`);
        console.log(`    transaction_date: ${r.last_transaction_date}`);
        console.log("");
      });
    }

    // Check if any records have qty_before/qty_reduced populated
    const [populated] = await connection.execute(`
      SELECT COUNT(*) as count
      FROM tabStockLedger
      WHERE qty_before IS NOT NULL OR qty_reduced IS NOT NULL
    `);

    console.log(`\nRecords with qty_before/qty_reduced populated: ${populated[0].count}`);

    if (populated[0].count === 0) {
      console.log("\n⚠️  No records have qty_before/qty_reduced populated yet.");
      console.log("   This means:");
      console.log("   1. The code changes are not active yet (API server needs restart)");
      console.log("   2. OR no dispatch has been performed after the code update");
      console.log("   3. OR the code update has an issue");
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await connection.end();
  }
}

test();

