// Backfill qty_before and qty_reduced in tabStockLedger from tabStockTransaction
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function backfill() {
  console.log("==========================================");
  console.log("Backfilling qty_before and qty_reduced in tabStockLedger");
  console.log("==========================================\n");

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "root",
    database: process.env.DB_NAME || "wms_desktop",
    multipleStatements: true,
  });

  try {
    console.log(
      `✅ Connected to database: ${process.env.DB_HOST || "localhost"}:${
        process.env.DB_PORT || "3306"
      }/${process.env.DB_NAME || "wms_desktop"}\n`
    );

    // Check if columns exist
    const [cols] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabStockLedger'
      AND COLUMN_NAME IN ('qty_before', 'qty_reduced');
    `);

    if (cols.length !== 2) {
      console.log(
        "❌ qty_before and qty_reduced columns do not exist. Run migration first."
      );
      await connection.end();
      return;
    }

    console.log("✅ Columns exist in tabStockLedger\n");

    // Get all stock ledger entries that need to be backfilled
    const [stockLedgerRows] = await connection.execute(`
      SELECT item_code, warehouse, bin_location, qty
      FROM tabStockLedger
      WHERE qty_before IS NULL OR qty_reduced IS NULL
      ORDER BY last_transaction_date IS NULL, last_transaction_date DESC, updated_at DESC
    `);

    console.log(
      `Found ${stockLedgerRows.length} stock ledger entries to process\n`
    );

    if (stockLedgerRows.length === 0) {
      console.log(
        "✅ All records already have qty_before and qty_reduced populated."
      );
      await connection.end();
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;

    await connection.beginTransaction();

    try {
      for (const row of stockLedgerRows) {
        const itemCode = row.item_code;
        const warehouse = row.warehouse;
        const binLocation = row.bin_location;
        const currentQty = parseFloat(row.qty);

        // Find the most recent transaction for this item/warehouse/bin combination
        const [transactions] = await connection.execute(
          `
          SELECT qty_before, qty_change, transaction_date
          FROM tabStockTransaction
          WHERE item_code = ?
            AND warehouse = ?
            AND (bin_location = ? OR (? IS NULL AND bin_location IS NULL))
          ORDER BY transaction_date DESC, id DESC
          LIMIT 1
        `,
          [itemCode, warehouse, binLocation, binLocation]
        );

        if (transactions.length > 0) {
          const tx = transactions[0];
          const qtyBefore = parseFloat(tx.qty_before);
          const qtyChange = parseFloat(tx.qty_change); // This is qty_reduced (can be negative or positive)

          // Update the stock ledger entry
          await connection.execute(
            `
            UPDATE tabStockLedger
            SET qty_before = ?,
                qty_reduced = ?
            WHERE item_code = ?
              AND warehouse = ?
              AND (bin_location = ? OR (? IS NULL AND bin_location IS NULL))
          `,
            [
              qtyBefore,
              qtyChange,
              itemCode,
              warehouse,
              binLocation,
              binLocation,
            ]
          );

          updatedCount++;
          if (updatedCount % 100 === 0) {
            console.log(`  Processed ${updatedCount} records...`);
          }
        } else {
          skippedCount++;
        }
      }

      await connection.commit();
      console.log(`\n✅ Backfill complete!`);
      console.log(`   Updated: ${updatedCount} records`);
      console.log(`   Skipped: ${skippedCount} records (no transaction found)`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    // Verify the update
    const [verify] = await connection.execute(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN qty_before IS NOT NULL AND qty_reduced IS NOT NULL THEN 1 ELSE 0 END) as populated,
        SUM(CASE WHEN qty_before IS NULL OR qty_reduced IS NULL THEN 1 ELSE 0 END) as null_count
      FROM tabStockLedger
    `);

    console.log(`\n📊 Verification:`);
    console.log(`   Total records: ${verify[0].total}`);
    console.log(`   Populated: ${verify[0].populated}`);
    console.log(`   NULL: ${verify[0].null_count}`);

    await connection.end();
    console.log("\n==========================================");
    console.log("Backfill complete.");
    console.log("==========================================");
  } catch (error) {
    console.error("❌ Error during backfill:", error);
    process.exit(1);
  }
}

backfill();
