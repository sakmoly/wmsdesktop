// Debug source bin issue
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function debug() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "root",
    database: process.env.DB_NAME || "wms_desktop",
  });

  try {
    const tcId = "TC-MR-0001-1767524449896";
    const materialRequest = "MR-0001";

    // Check events for this TC
    console.log("Checking events for Transfer Carton...");
    const [events] = await connection.execute(
      `
      SELECT event_type, item_code, rack, bin, qty, event_time
      FROM tabWmsScanEvent
      WHERE (tc_id = ? OR transfer_order = ?)
        AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC', 'PICK_ITEM', 'SORT_TO_BOX')
      ORDER BY event_time DESC
      LIMIT 20
    `,
      [tcId, materialRequest]
    );

    console.log(`\nFound ${events.length} events:`);
    events.forEach((e) => {
      console.log(
        `  ${e.event_type}: ${e.item_code} - rack="${e.rack}", bin="${e.bin}", qty=${e.qty}`
      );
    });

    // Check CONCAT result
    console.log("\nCONCAT_WS result:");
    const [concatTest] = await connection.execute(
      `
      SELECT 
        item_code,
        rack,
        bin,
        CONCAT_WS('-', rack, bin) as concat_bin,
        qty
      FROM tabWmsScanEvent
      WHERE (tc_id = ? OR transfer_order = ?)
        AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
      LIMIT 5
    `,
      [tcId, materialRequest]
    );

    concatTest.forEach((e) => {
      console.log(
        `  ${e.item_code}: rack="${e.rack}", bin="${e.bin}", CONCAT="${e.concat_bin}"`
      );
    });

    // Check stock ledger for these items
    console.log("\nStock Ledger locations for these items:");
    const items = [...new Set(events.map((e) => e.item_code))];
    for (const itemCode of items) {
      const [stock] = await connection.execute(
        `
        SELECT bin_location, qty
        FROM tabStockLedger
        WHERE item_code = ?
        ORDER BY qty DESC
        LIMIT 5
      `,
        [itemCode]
      );

      if (stock.length > 0) {
        console.log(`  ${itemCode}:`);
        stock.forEach((s) => {
          console.log(`    ${s.bin_location}: ${parseFloat(s.qty)}`);
        });
      }
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await connection.end();
  }
}

debug();
