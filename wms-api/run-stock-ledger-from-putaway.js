// Script to create stock ledger entries from existing putaway tasks
// Uses actual item codes, warehouses, and bin locations from putaway lines

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'wms_desktop',
    multipleStatements: true
};

async function createStockLedgerFromPutaway() {
    let connection;
    
    try {
        console.log('\n🔄 Creating Stock Ledger from Putaway Tasks...\n');
        
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to database\n');

        // First, clear existing stock ledger
        await connection.query('TRUNCATE TABLE tabStockLedger');
        console.log('✅ Cleared existing stock ledger\n');

        // Get putaway lines with task info
        const [putawayLines] = await connection.query(`
            SELECT 
                pl.item_code,
                pl.qty,
                pl.rack,
                pl.bin,
                pt.advance_shipping_notice,
                pt.title as task_title,
                pt.status as task_status
            FROM tabPutawayLine pl
            JOIN tabPutawayTask pt ON pt.title = pl.parent_title
            WHERE pl.item_code IS NOT NULL
            ORDER BY pt.title, pl.item_code
        `);

        console.log(`📋 Found ${putawayLines.length} putaway lines\n`);

        // Get warehouse name - assume all go to Main Warehouse
        const [warehouses] = await connection.query("SELECT name FROM tabWarehouse WHERE name LIKE '%Main%' OR name LIKE '%WH-MAIN%' LIMIT 1");
        const warehouseName = warehouses.length > 0 ? warehouses[0].name : 'Main Warehouse';

        console.log(`📍 Using warehouse: ${warehouseName}\n`);

        let insertedCount = 0;
        let updatedCount = 0;

        for (const line of putawayLines) {
            const itemCode = line.item_code;
            const qty = parseFloat(line.qty) || 0;
            const rack = line.rack || '';
            const bin = line.bin || '';
            
            // Combine rack and bin into bin_location (format: "R-XX-B-XX")
            const binLocation = rack && bin ? `${rack}-${bin}` : null;
            
            const taskTitle = line.task_title || 'PUT-0001';
            const asn = line.advance_shipping_notice || 'ASN-0001';
            const taskStatus = line.task_status || 'Draft';
            
            // Only create stock ledger entries for completed or in-progress tasks
            if (taskStatus !== 'Completed' && taskStatus !== 'In Progress') {
                continue;
            }

            try {
                // Insert or update stock ledger
                const [result] = await connection.query(`
                    INSERT INTO tabStockLedger 
                        (item_code, warehouse, bin_location, qty, reserved_qty, last_transaction_type, last_transaction_ref, last_transaction_date)
                    VALUES (?, ?, ?, ?, 0, 'Putaway', ?, NOW())
                    ON DUPLICATE KEY UPDATE
                        qty = qty + VALUES(qty),
                        last_transaction_type = 'Putaway',
                        last_transaction_ref = VALUES(last_transaction_ref),
                        last_transaction_date = NOW()
                `, [itemCode, warehouseName, binLocation, qty, taskTitle]);

                if (result.affectedRows === 1) {
                    insertedCount++;
                } else {
                    updatedCount++;
                }
            } catch (error) {
                console.error(`❌ Error inserting ${itemCode} @ ${binLocation}:`, error.message);
            }
        }

        console.log(`\n📊 Summary:`);
        console.log(`   ✅ Inserted: ${insertedCount} new entries`);
        console.log(`   ✅ Updated: ${updatedCount} existing entries`);

        // Add some warehouse-level stock (at dock, not yet putaway)
        const dockStock = [
            { item_code: 'SKU-SHOES-101-WHT-42', qty: 50, ref: 'ASN-0005' },
            { item_code: 'SKU-TSHIRT-001-BLK-S', qty: 100, ref: 'ASN-0006' },
            { item_code: 'Basic T-Shirt Black M', qty: 75, ref: 'ASN-0006' }
        ];

        for (const stock of dockStock) {
            try {
                await connection.query(`
                    INSERT INTO tabStockLedger 
                        (item_code, warehouse, bin_location, qty, reserved_qty, last_transaction_type, last_transaction_ref, last_transaction_date)
                    VALUES (?, ?, NULL, ?, 0, 'Receiving', ?, NOW())
                    ON DUPLICATE KEY UPDATE
                        qty = qty + VALUES(qty),
                        last_transaction_type = 'Receiving',
                        last_transaction_ref = VALUES(last_transaction_ref),
                        last_transaction_date = NOW()
                `, [stock.item_code, warehouseName, stock.qty, stock.ref]);
            } catch (error) {
                // Ignore errors for dock stock
            }
        }

        // Verification
        const [summary] = await connection.query(`
            SELECT 
                warehouse,
                COUNT(DISTINCT item_code) as unique_items,
                SUM(qty) as total_qty,
                SUM(reserved_qty) as total_reserved,
                SUM(qty - reserved_qty) as available_qty,
                COUNT(*) as total_entries
            FROM tabStockLedger
            GROUP BY warehouse
        `);

        console.log('\n📋 Stock Ledger Summary:');
        console.table(summary);

        const [sample] = await connection.query(`
            SELECT 
                item_code,
                warehouse,
                bin_location,
                qty,
                reserved_qty,
                (qty - reserved_qty) as available_qty,
                last_transaction_type,
                last_transaction_ref
            FROM tabStockLedger
            ORDER BY warehouse, item_code, bin_location IS NULL, bin_location
            LIMIT 10
        `);

        console.log('\n📋 Sample Stock Ledger Entries:');
        console.table(sample);

        console.log('\n✅ Stock Ledger Created Successfully!\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Database connection closed');
        }
    }
}

createStockLedgerFromPutaway();

