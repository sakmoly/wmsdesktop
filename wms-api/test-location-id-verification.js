/**
 * Automatic Test: Verify Location ID Storage and Usage
 * 
 * This test verifies that:
 * 1. Location ID is stored correctly in tabPutawayLine
 * 2. Location ID is used correctly in tabStockLedger as bin_location
 * 3. The exact scanned location is preserved throughout the workflow
 * 
 * Usage:
 *   node test-location-id-verification.js
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

async function testLocationIdVerification() {
  let connection;
  
  try {
    console.log("🧪 Automatic Location ID Verification Test\n");
    console.log("=" .repeat(60));
    
    // Connect to database
    connection = await mysql.createConnection(config);
    console.log("✅ Connected to database\n");

    // Test 1: Check recent putaway tasks with locations
    console.log("Test 1: Check Recent Putaway Tasks with Locations");
    console.log("-".repeat(60));
    
    const [recentTasks] = await connection.execute(
      `SELECT title, status, source_type, transfer_in, advance_shipping_notice, created_at
       FROM tabPutawayTask 
       WHERE status IN ('Draft', 'In Progress', 'Completed')
       ORDER BY created_at DESC 
       LIMIT 10`
    );
    
    console.log(`Found ${recentTasks.length} recent putaway task(s)\n`);
    
    if (recentTasks.length === 0) {
      console.log("⚠️ No putaway tasks found. Cannot verify location_id storage.\n");
      return;
    }

    // Test 2: Check if location_id column exists in tabPutawayLine
    console.log("\nTest 2: Check Location ID Column Existence");
    console.log("-".repeat(60));
    
    const [locationColumns] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayLine' 
      AND COLUMN_NAME = 'location_id'
    `);
    
    const hasLocationIdColumn = locationColumns.length > 0;
    console.log(`Location ID column exists: ${hasLocationIdColumn ? '✅ YES' : '❌ NO'}`);
    
    if (hasLocationIdColumn) {
      console.log(`  - Data Type: ${locationColumns[0].DATA_TYPE}`);
      console.log(`  - Nullable: ${locationColumns[0].IS_NULLABLE}`);
    }

    // Test 3: Check putaway lines with location_id
    console.log("\nTest 3: Check Putaway Lines with Location ID");
    console.log("-".repeat(60));
    
    const taskTitles = recentTasks.map(t => t.title);
    const placeholders = taskTitles.map(() => '?').join(',');
    
    let locationIdSelect = hasLocationIdColumn 
      ? "pl.location_id,"
      : "NULL as location_id,";
    
    const [putawayLines] = await connection.execute(
      `SELECT 
        pl.parent_title,
        pl.item_code,
        pl.qty,
        pl.rack,
        pl.bin,
        ${locationIdSelect}
        pt.source_type,
        pt.transfer_in
      FROM tabPutawayLine pl
      INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title
      WHERE pl.parent_title IN (${placeholders})
      ORDER BY pl.parent_title DESC, pl.item_code
      LIMIT 20`,
      taskTitles
    );
    
    console.log(`Found ${putawayLines.length} putaway line(s)\n`);
    
    if (putawayLines.length === 0) {
      console.log("⚠️ No putaway lines found.\n");
      return;
    }

    // Analyze location_id usage
    let linesWithLocationId = 0;
    let linesWithoutLocationId = 0;
    const locationIdMismatches = [];
    
    for (const line of putawayLines) {
      const locationId = line.location_id;
      const rack = line.rack || '';
      const bin = line.bin || '';
      const combinedRackBin = rack && bin ? `${rack}-${bin}` : (rack || bin || '');
      
      if (locationId) {
        linesWithLocationId++;
        // Check if location_id matches rack-bin combination
        if (locationId !== combinedRackBin && combinedRackBin !== '') {
          locationIdMismatches.push({
            task: line.parent_title,
            item: line.item_code,
            location_id: locationId,
            rack: rack,
            bin: bin,
            combined: combinedRackBin
          });
        }
      } else {
        linesWithoutLocationId++;
      }
    }
    
    console.log(`Lines with location_id: ${linesWithLocationId} ✅`);
    console.log(`Lines without location_id: ${linesWithoutLocationId} ${linesWithoutLocationId > 0 ? '⚠️' : '✅'}`);
    
    if (locationIdMismatches.length > 0) {
      console.log(`\n⚠️ Found ${locationIdMismatches.length} location_id mismatches:`);
      locationIdMismatches.slice(0, 5).forEach((mismatch, index) => {
        console.log(`  ${index + 1}. Task: ${mismatch.task}, Item: ${mismatch.item}`);
        console.log(`     location_id: "${mismatch.location_id}"`);
        console.log(`     rack-bin: "${mismatch.combined}"`);
      });
    }

    // Test 4: Check Stock Ledger bin_location
    console.log("\nTest 4: Check Stock Ledger bin_location");
    console.log("-".repeat(60));
    
    const [stockLedgerEntries] = await connection.execute(
      `SELECT 
        sl.item_code,
        sl.bin_location,
        sl.qty,
        sl.last_transaction_ref,
        sl.last_transaction_type,
        sl.last_transaction_date
      FROM tabStockLedger sl
      WHERE sl.last_transaction_ref IN (${placeholders})
        AND sl.last_transaction_type = 'Putaway'
      ORDER BY sl.last_transaction_date DESC
      LIMIT 20`,
      taskTitles
    );
    
    console.log(`Found ${stockLedgerEntries.length} stock ledger entry/entries\n`);
    
    // Match stock ledger entries with putaway lines
    const matchedEntries = [];
    const unmatchedEntries = [];
    let correctMatches = 0;
    let incorrectMatches = 0;
    const incorrectDetails = [];
    
    if (stockLedgerEntries.length === 0) {
      console.log("⚠️ No stock ledger entries found for these tasks.\n");
      console.log("   This might mean putaway tasks haven't been completed yet.\n");
    } else {
      
      for (const entry of stockLedgerEntries) {
        const matchingLine = putawayLines.find(
          line => line.item_code === entry.item_code && 
                  line.parent_title === entry.last_transaction_ref
        );
        
        if (matchingLine) {
          matchedEntries.push({
            entry: entry,
            line: matchingLine
          });
        } else {
          unmatchedEntries.push(entry);
        }
      }
      
      console.log(`Matched entries: ${matchedEntries.length} ✅`);
      console.log(`Unmatched entries: ${unmatchedEntries.length} ${unmatchedEntries.length > 0 ? '⚠️' : '✅'}\n`);
      
      // Verify location_id matches bin_location
      for (const match of matchedEntries) {
        const entryBinLocation = match.entry.bin_location || '';
        const lineLocationId = match.line.location_id || '';
        const lineRackBin = match.line.rack && match.line.bin 
          ? `${match.line.rack}-${match.line.bin}` 
          : (match.line.rack || match.line.bin || '');
        
        // Check if bin_location matches location_id (preferred) or rack-bin (fallback)
        const isCorrect = entryBinLocation === lineLocationId || 
                         (lineLocationId === '' && entryBinLocation === lineRackBin);
        
        if (isCorrect) {
          correctMatches++;
        } else {
          incorrectMatches++;
          incorrectDetails.push({
            task: match.line.parent_title,
            item: match.entry.item_code,
            stock_bin_location: entryBinLocation,
            line_location_id: lineLocationId,
            line_rack_bin: lineRackBin
          });
        }
      }
      
      console.log(`Correct matches: ${correctMatches} ✅`);
      console.log(`Incorrect matches: ${incorrectMatches} ${incorrectMatches > 0 ? '❌' : '✅'}\n`);
      
      if (incorrectDetails.length > 0) {
        console.log("❌ Incorrect bin_location values found:");
        incorrectDetails.slice(0, 5).forEach((detail, index) => {
          console.log(`  ${index + 1}. Task: ${detail.task}, Item: ${detail.item}`);
          console.log(`     Stock Ledger bin_location: "${detail.stock_bin_location}"`);
          console.log(`     Putaway Line location_id: "${detail.line_location_id}"`);
          console.log(`     Putaway Line rack-bin: "${detail.line_rack_bin}"`);
        });
      }
    }

    // Test 5: Check Location Table Data
    console.log("\nTest 5: Check Location Table Data");
    console.log("-".repeat(60));
    
    // Get unique location_ids from putaway lines
    const uniqueLocationIds = [...new Set(putawayLines
      .map(line => line.location_id)
      .filter(id => id && id.trim() !== ''))];
    
    if (uniqueLocationIds.length > 0) {
      const locationPlaceholders = uniqueLocationIds.map(() => '?').join(',');
      const [locations] = await connection.execute(
        `SELECT location_id, parent_rack, bin_id, is_available
         FROM tabLocation
         WHERE location_id IN (${locationPlaceholders})
         ORDER BY location_id`,
        uniqueLocationIds
      );
      
      console.log(`Found ${locations.length} location(s) in tabLocation\n`);
      
      if (locations.length > 0) {
        console.log("Sample locations:");
        locations.slice(0, 5).forEach((loc, index) => {
          console.log(`  ${index + 1}. location_id: "${loc.location_id}"`);
          console.log(`     parent_rack: "${loc.parent_rack || 'NULL'}"`);
          console.log(`     bin_id: "${loc.bin_id || 'NULL'}"`);
          console.log(`     is_available: ${loc.is_available ? 'Yes' : 'No'}`);
          
          // Check if parent_rack matches location_id pattern
          if (loc.location_id && loc.parent_rack) {
            const locationIdParts = loc.location_id.split('-');
            const rackMatches = locationIdParts.slice(0, -1).join('-');
            if (loc.parent_rack !== rackMatches && loc.parent_rack !== '') {
              console.log(`     ⚠️ Warning: parent_rack doesn't match location_id pattern`);
            }
          }
        });
      }
    } else {
      console.log("No location_ids found in putaway lines to verify.\n");
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(60));
    
    const allTestsPassed = 
      hasLocationIdColumn &&
      (stockLedgerEntries.length === 0 || correctMatches === matchedEntries.length);
    
    if (allTestsPassed) {
      console.log("✅ All tests passed!");
      console.log(`   - Location ID column exists: ✅`);
      console.log(`   - Location IDs stored in putaway lines: ${linesWithLocationId} ✅`);
      console.log(`   - Stock ledger matches: ${correctMatches}/${matchedEntries.length} ✅`);
    } else {
      console.log("⚠️ Some issues found:");
      if (!hasLocationIdColumn) {
        console.log("   - Location ID column does not exist in tabPutawayLine ❌");
      }
      if (linesWithLocationId === 0) {
        console.log("   - No location_ids found in putaway lines ⚠️");
      }
      if (incorrectMatches > 0) {
        console.log(`   - ${incorrectMatches} stock ledger entries don't match location_id ❌`);
      }
    }
    
    console.log("\n✅✅✅ TEST COMPLETE ✅✅✅\n");

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
testLocationIdVerification().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

