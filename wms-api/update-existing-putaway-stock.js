// Script to update existing putaway stock data
// Updates stock ledger, transactions, and item stock for existing putaway tasks

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'wms_desktop',
    multipleStatements: true
};

async function updateExistingPutawayStock() {
    let connection;
    
    try {
        console.log('\n🔄 Updating Existing Putaway Stock Data...\n');
        console.log(`📊 Database: ${dbConfig.database}@${dbConfig.host}:${dbConfig.port}\n`);
        
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to database\n');

        // Step 1: Check current state
        console.log('📋 Step 1: Checking current state...\n');
        const [currentState] = await connection.query(`
            SELECT 
              pt.title as putaway_task,
              pt.status as task_status,
              pt.advance_shipping_notice as asn,
              COUNT(pl.id) as lines_count,
              SUM(pl.qty) as total_qty,
              COUNT(CASE WHEN pl.rack IS NOT NULL THEN 1 END) as lines_with_location
            FROM tabPutawayTask pt
            LEFT JOIN tabPutawayLine pl ON pt.title = pl.parent_title
            WHERE pt.status != 'Completed' OR EXISTS (
              SELECT 1 FROM tabPutawayLine pl2 
              WHERE pl2.parent_title = pt.title 
                AND pl2.rack IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1 FROM tabStockLedger sl
                  WHERE sl.item_code = pl2.item_code
                    AND sl.last_transaction_ref = pt.title
                    AND sl.last_transaction_type = 'Putaway'
                )
            )
            GROUP BY pt.title, pt.status, pt.advance_shipping_notice
        `);
        
        if (currentState.length === 0) {
            console.log('✅ No putaway tasks need updating. All tasks are already processed.\n');
            return;
        }
        
        console.log(`📊 Found ${currentState.length} putaway tasks that may need updates:\n`);
        console.table(currentState);
        console.log('');

        // Step 2: Update Stock Ledger
        console.log('📦 Step 2: Updating Stock Ledger...\n');
        
        // First, get default warehouse
        const [defaultWarehouseRows] = await connection.query(
            `SELECT name FROM tabWarehouse WHERE warehouse_type = 'Warehouse' OR name LIKE '%Main%' OR name LIKE '%WH-MAIN%' LIMIT 1`
        );
        const defaultWarehouse = defaultWarehouseRows.length > 0 ? defaultWarehouseRows[0].name : 'Main Warehouse';
        
        // Use a simpler approach - process each putaway line individually
        const [putawayLinesToProcess] = await connection.query(`
            SELECT 
              pl.item_code,
              pl.qty,
              pl.rack,
              pl.bin,
              pt.title as putaway_task,
              pt.advance_shipping_notice as asn
            FROM tabPutawayLine pl
            INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title
            WHERE pl.item_code IS NOT NULL 
              AND pl.qty > 0
              AND pl.rack IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 
                FROM tabStockLedger sl
                WHERE sl.item_code = pl.item_code
                  AND sl.last_transaction_ref = pt.title
                  AND sl.last_transaction_type = 'Putaway'
              )
        `);
        
        let insertedCount = 0;
        let updatedCount = 0;
        
        for (const line of putawayLinesToProcess) {
            // Use default warehouse (ASN table doesn't have warehouse column)
            let warehouse = defaultWarehouse;
            
            // Build bin_location
            let binLocation = null;
            if (line.rack && line.bin) {
                binLocation = `${line.rack}-${line.bin}`;
            } else if (line.rack) {
                binLocation = line.rack;
            }
            
            // Get current stock
            const [currentStock] = await connection.query(
                `SELECT qty, reserved_qty FROM tabStockLedger 
                 WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))`,
                [line.item_code, warehouse, binLocation, binLocation]
            );
            
            const currentQty = currentStock.length > 0 ? parseFloat(currentStock[0].qty) || 0 : 0;
            const currentReservedQty = currentStock.length > 0 ? parseFloat(currentStock[0].reserved_qty) || 0 : 0;
            const newQty = currentQty + parseFloat(line.qty);
            
            // Insert or update stock ledger
            const [result] = await connection.query(`
                INSERT INTO tabStockLedger 
                  (item_code, warehouse, bin_location, qty, reserved_qty, 
                   last_transaction_date, last_transaction_type, last_transaction_ref, 
                   updated_at, created_at)
                VALUES (?, ?, ?, ?, ?, NOW(), 'Putaway', ?, NOW(), NOW())
                ON DUPLICATE KEY UPDATE
                  qty = ?,
                  last_transaction_date = NOW(),
                  last_transaction_type = 'Putaway',
                  last_transaction_ref = ?,
                  updated_at = NOW()
            `, [
                line.item_code,
                warehouse,
                binLocation,
                newQty,
                currentReservedQty,
                line.putaway_task,
                newQty,
                line.putaway_task
            ]);
            
            if (result.affectedRows === 1) {
                insertedCount++;
            } else {
                updatedCount++;
            }
        }
        
        console.log(`✅ Stock Ledger: ${insertedCount} inserted, ${updatedCount} updated\n`);

        // Step 3: Create Stock Transactions
        console.log('📝 Step 3: Creating Stock Transaction Records...\n');
        
        const [linesForTransactions] = await connection.query(`
            SELECT 
              pl.item_code,
              pl.qty,
              pl.rack,
              pl.bin,
              pt.title as putaway_task,
              pt.advance_shipping_notice as asn,
              COALESCE(pt.created_by, 'SYSTEM') as performed_by
            FROM tabPutawayLine pl
            INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title
            WHERE pl.item_code IS NOT NULL 
              AND pl.qty > 0
              AND pl.rack IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 
                FROM tabStockTransaction st
                WHERE st.reference_doc = pt.title
                  AND st.item_code = pl.item_code
                  AND st.transaction_type = 'Putaway'
                  AND st.wms_transaction_title = pt.title
              )
        `);
        
        let transactionCount = 0;
        
        for (const line of linesForTransactions) {
            // Use default warehouse (ASN table doesn't have warehouse column)
            let warehouse = defaultWarehouse;
            
            // Build bin_location
            let binLocation = null;
            if (line.rack && line.bin) {
                binLocation = `${line.rack}-${line.bin}`;
            } else if (line.rack) {
                binLocation = line.rack;
            }
            
            // Get current stock for qty_before and qty_after
            const [currentStock] = await connection.query(
                `SELECT qty FROM tabStockLedger 
                 WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))`,
                [line.item_code, warehouse, binLocation, binLocation]
            );
            
            const currentQty = currentStock.length > 0 ? parseFloat(currentStock[0].qty) || 0 : 0;
            const qtyChange = parseFloat(line.qty);
            const qtyBefore = Math.max(0, currentQty - qtyChange);
            const qtyAfter = currentQty;
            
            // Insert transaction
            await connection.query(`
                INSERT INTO tabStockTransaction
                  (transaction_date, transaction_type, reference_doc_type, reference_doc, wms_transaction_title,
                   item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
                   source_bin, target_bin, performed_by, created_at)
                VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `, [
                'Putaway',              // transaction_type
                'Putaway Task',         // reference_doc_type
                line.putaway_task,      // reference_doc
                line.putaway_task,      // wms_transaction_title
                line.item_code,         // item_code
                warehouse,              // warehouse
                binLocation,            // bin_location
                qtyChange,             // qty_change
                qtyBefore,             // qty_before
                qtyAfter,              // qty_after
                null,                  // source_bin
                binLocation,           // target_bin
                line.performed_by      // performed_by
            ]);
            
            transactionCount++;
        }
        
        console.log(`✅ Stock Transactions: ${transactionCount} created\n`);

        // Step 4: Update Item Stock
        console.log('📦 Step 4: Updating Item Stock Quantities...\n');
        const [itemResult] = await connection.query(`
            UPDATE tabItem i
            SET stock_qty = (
              SELECT COALESCE(SUM(qty), 0)
              FROM tabStockLedger 
              WHERE item_code = i.code
            ),
            updated_at = NOW()
            WHERE EXISTS (
              SELECT 1 
              FROM tabPutawayLine pl
              INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title
              WHERE pl.item_code = i.code
                AND pl.rack IS NOT NULL
            )
        `);
        
        console.log(`✅ Items Updated: ${itemResult.affectedRows} items\n`);

        // Step 5: Mark Tasks as Completed
        console.log('✅ Step 5: Marking Putaway Tasks as Completed...\n');
        const [taskResult] = await connection.query(`
            UPDATE tabPutawayTask pt
            SET status = 'Completed',
                updated_at = CURRENT_TIMESTAMP
            WHERE status != 'Completed'
              AND EXISTS (
                SELECT 1 
                FROM tabPutawayLine pl
                WHERE pl.parent_title = pt.title
                  AND pl.rack IS NOT NULL
                  AND pl.item_code IS NOT NULL
                  AND pl.qty > 0
              )
        `);
        
        console.log(`✅ Tasks Completed: ${taskResult.affectedRows} tasks\n`);

        // Step 6: Verification
        console.log('📊 Step 6: Verification Summary...\n');
        const [verification] = await connection.query(`
            SELECT 
              'Putaway Tasks Marked Completed' as summary,
              COUNT(*) as count
            FROM tabPutawayTask
            WHERE status = 'Completed'
              AND updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
            UNION ALL
            SELECT 
              'Stock Ledger Entries Created/Updated' as summary,
              COUNT(*) as count
            FROM tabStockLedger
            WHERE last_transaction_type = 'Putaway'
              AND updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
            UNION ALL
            SELECT 
              'Stock Transactions Created' as summary,
              COUNT(*) as count
            FROM tabStockTransaction
            WHERE transaction_type = 'Putaway'
              AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
            UNION ALL
            SELECT 
              'Items Stock Updated' as summary,
              COUNT(*) as count
            FROM tabItem
            WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
        `);
        
        console.table(verification);
        console.log('');

        // Step 7: Sample Data
        console.log('📋 Sample Updated Data:\n');
        const [sample] = await connection.query(`
            SELECT 
              pt.title as putaway_task,
              pt.status,
              pl.item_code,
              pl.qty,
              CONCAT(pl.rack, IFNULL(CONCAT('-', pl.bin), '')) as location,
              sl.qty as stock_qty,
              i.stock_qty as item_total_stock
            FROM tabPutawayTask pt
            INNER JOIN tabPutawayLine pl ON pt.title = pl.parent_title
            LEFT JOIN tabStockLedger sl ON sl.item_code = pl.item_code
              AND sl.last_transaction_ref = pt.title
              AND sl.last_transaction_type = 'Putaway'
            LEFT JOIN tabItem i ON i.code = pl.item_code
            WHERE pt.status = 'Completed'
              AND pl.rack IS NOT NULL
            ORDER BY pt.title, pl.item_code
            LIMIT 20
        `);
        
        if (sample.length > 0) {
            console.table(sample);
        } else {
            console.log('No sample data to display.\n');
        }

        console.log('\n✅ Update completed successfully!\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Database connection closed\n');
        }
    }
}

updateExistingPutawayStock();

