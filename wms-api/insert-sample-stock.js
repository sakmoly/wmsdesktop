// Script to insert sample stock for all items across different locations
// Distributes stock for each item across multiple locations with random quantities

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function insertSampleStock() {
    console.log('==========================================');
    console.log('Inserting Sample Stock for All Items');
    console.log('==========================================\n');

    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'root',
            database: process.env.DB_NAME || 'wms_desktop',
            multipleStatements: true
        });

        console.log(`✅ Connected to database: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '3306'}/${process.env.DB_NAME || 'wms_desktop'}\n`);

        // Ensure table exists
        const createTableSQL = `
CREATE TABLE IF NOT EXISTS tabStockLedger (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  item_code VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NULL,
  qty DECIMAL(10,2) NOT NULL DEFAULT 0,
  reserved_qty DECIMAL(10,2) DEFAULT 0,
  available_qty DECIMAL(10,2) AS (qty - reserved_qty) STORED,
  last_transaction_date TIMESTAMP NULL,
  last_transaction_type VARCHAR(50) NULL,
  last_transaction_ref VARCHAR(100) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_item_warehouse_bin (item_code, warehouse, bin_location),
  INDEX idx_item_code (item_code),
  INDEX idx_warehouse (warehouse),
  INDEX idx_bin_location (bin_location),
  INDEX idx_last_transaction_date (last_transaction_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;

        await connection.query(createTableSQL);
        console.log("✅ Table checked/created\n");

        // Get all items
        console.log("📦 Fetching items from tabItem...\n");
        const [items] = await connection.execute(`
            SELECT code, name 
            FROM tabItem 
            WHERE maintain_stock = 1
            ORDER BY code
        `);

        if (items.length === 0) {
            console.error("❌ No items found in tabItem table. Please add items first.");
            await connection.end();
            return;
        }

        console.log(`✅ Found ${items.length} items\n`);

        // Get all locations
        console.log("📍 Fetching locations from tabLocation...\n");
        const [locations] = await connection.execute(`
            SELECT location_id, warehouse 
            FROM tabLocation 
            WHERE is_available = 1
            ORDER BY location_id
        `);

        if (locations.length === 0) {
            console.error("❌ No locations found in tabLocation table. Please add locations first.");
            await connection.end();
            return;
        }

        console.log(`✅ Found ${locations.length} locations\n`);

        // Get default warehouse (use first location's warehouse or WH-MAIN)
        const defaultWarehouse = locations.length > 0 ? locations[0].warehouse : 'WH-MAIN';

        console.log(`📊 Distributing stock for ${items.length} items across ${locations.length} locations...\n`);
        console.log(`🏭 Using warehouse: ${defaultWarehouse}\n`);

        let totalStockEntries = 0;
        let insertedCount = 0;
        let updatedCount = 0;
        let errorCount = 0;

        // For each item, assign stock to 2-5 random locations
        for (const item of items) {
            try {
                // Randomly select 2-5 locations for this item
                const numLocations = Math.min(
                    Math.floor(Math.random() * 4) + 2, // 2-5 locations
                    locations.length
                );

                // Shuffle and select random locations
                const shuffledLocations = [...locations].sort(() => Math.random() - 0.5);
                const selectedLocations = shuffledLocations.slice(0, numLocations);

                for (const location of selectedLocations) {
                    // Generate random quantity between 10 and 500
                    const qty = Math.floor(Math.random() * 490) + 10; // 10-500

                    try {
                        // Try to insert, update if exists
                        const [result] = await connection.execute(`
                            INSERT INTO tabStockLedger 
                                (item_code, warehouse, bin_location, qty, reserved_qty, 
                                 last_transaction_type, last_transaction_date)
                            VALUES (?, ?, ?, ?, 0, 'Initial Stock', NOW())
                            ON DUPLICATE KEY UPDATE
                                qty = VALUES(qty),
                                last_transaction_type = VALUES(last_transaction_type),
                                last_transaction_date = VALUES(last_transaction_date),
                                updated_at = CURRENT_TIMESTAMP
                        `, [
                            item.code,
                            location.warehouse || defaultWarehouse,
                            location.location_id,
                            qty
                        ]);

                        if (result.affectedRows === 1 && result.insertId) {
                            insertedCount++;
                        } else {
                            updatedCount++;
                        }

                        totalStockEntries++;
                    } catch (error) {
                        if (error.code !== 'ER_DUP_ENTRY') {
                            console.error(`❌ Error inserting stock for ${item.code} at ${location.location_id}: ${error.message}`);
                            errorCount++;
                        }
                    }
                }

                if (totalStockEntries % 10 === 0) {
                    console.log(`   Processed ${totalStockEntries} stock entries...`);
                }
            } catch (error) {
                console.error(`❌ Error processing item ${item.code}: ${error.message}`);
                errorCount++;
            }
        }

        console.log('\n==========================================');
        console.log('Stock Insert Summary');
        console.log('==========================================');
        console.log(`✅ Total stock entries created: ${totalStockEntries}`);
        console.log(`   - New entries: ${insertedCount}`);
        console.log(`   - Updated entries: ${updatedCount}`);
        console.log(`❌ Errors: ${errorCount}`);
        console.log('==========================================\n');

        // Update tabItem.stock_qty and reserved_qty to match stock ledger totals
        console.log('🔄 Updating tabItem.stock_qty from stock ledger...\n');
        
        const [updateResult] = await connection.execute(`
            UPDATE tabItem i
            SET stock_qty = (
                SELECT COALESCE(SUM(qty), 0)
                FROM tabStockLedger sl
                WHERE sl.item_code = i.code
            ),
            reserved_qty = (
                SELECT COALESCE(SUM(reserved_qty), 0)
                FROM tabStockLedger sl
                WHERE sl.item_code = i.code
            ),
            updated_at = NOW()
            WHERE EXISTS (
                SELECT 1 
                FROM tabStockLedger sl 
                WHERE sl.item_code = i.code
            )
        `);

        console.log(`✅ Updated ${updateResult.affectedRows} items' stock quantities\n`);

        // Verify stock distribution
        const [stockStats] = await connection.execute(`
            SELECT 
                COUNT(DISTINCT item_code) as unique_items,
                COUNT(*) as total_entries,
                SUM(qty) as total_qty,
                AVG(qty) as avg_qty,
                MIN(qty) as min_qty,
                MAX(qty) as max_qty
            FROM tabStockLedger
            WHERE warehouse = ?
        `, [defaultWarehouse]);

        if (stockStats.length > 0) {
            const stats = stockStats[0];
            console.log('📊 Stock Statistics:');
            console.log(`   Unique Items: ${stats.unique_items}`);
            console.log(`   Total Stock Entries: ${stats.total_entries}`);
            console.log(`   Total Quantity: ${parseFloat(stats.total_qty || 0).toFixed(2)}`);
            console.log(`   Average Quantity per Entry: ${parseFloat(stats.avg_qty || 0).toFixed(2)}`);
            console.log(`   Min Quantity: ${parseFloat(stats.min_qty || 0).toFixed(2)}`);
            console.log(`   Max Quantity: ${parseFloat(stats.max_qty || 0).toFixed(2)}`);
            console.log('');
        }

        // Show sample stock entries
        const [sampleStock] = await connection.execute(`
            SELECT item_code, bin_location, qty
            FROM tabStockLedger
            WHERE warehouse = ?
            ORDER BY item_code, bin_location
            LIMIT 10
        `, [defaultWarehouse]);

        if (sampleStock.length > 0) {
            console.log('📋 Sample Stock Entries:');
            sampleStock.forEach(row => {
                console.log(`   ${row.item_code} @ ${row.bin_location || 'NULL'}: ${parseFloat(row.qty).toFixed(2)}`);
            });
            console.log('');
        }

        // Show items with most locations
        const [topItems] = await connection.execute(`
            SELECT 
                item_code,
                COUNT(*) as location_count,
                SUM(qty) as total_qty
            FROM tabStockLedger
            WHERE warehouse = ?
            GROUP BY item_code
            ORDER BY location_count DESC, total_qty DESC
            LIMIT 5
        `, [defaultWarehouse]);

        if (topItems.length > 0) {
            console.log('🏆 Top Items by Location Count:');
            topItems.forEach(row => {
                console.log(`   ${row.item_code}: ${row.location_count} locations, ${parseFloat(row.total_qty).toFixed(2)} total qty`);
            });
            console.log('');
        }

        await connection.end();
        console.log('✅ Script completed successfully');
    } catch (error) {
        console.error('❌ Script failed:', error);
        process.exit(1);
    }
}

insertSampleStock();

