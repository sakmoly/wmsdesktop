// Fix ASN-0001 and TO-0001 Quantity Mismatch
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function fixMismatch() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'root',
        database: process.env.DB_NAME || 'wms_desktop',
        multipleStatements: true
    });

    try {
        console.log('\n==========================================');
        console.log('Fixing ASN-0001 and TO-0001 Mismatch');
        console.log('==========================================\n');

        // Step 1: Insert Missing ASN-0001 Item Details
        console.log('📦 Step 1: Inserting missing ASN-0001 item details...');
        
        await connection.execute(`
            INSERT INTO tabAsnItemDetails 
                (parent_title, item_code, po_item_reference, shipped_qty, carton_id, carton_assigned_status)
            VALUES
                ('ASN-0001', 'SKU-JEANS-001-BLU-32', 'PO-ITEM-001', 50.00, 'CTN-0101', 'Assigned'),
                ('ASN-0001', 'SKU-JEANS-001-BLU-34', 'PO-ITEM-002', 50.00, 'CTN-0101', 'Assigned'),
                ('ASN-0001', 'SKU-JEANS-001-BLK-32', 'PO-ITEM-003', 50.00, 'CTN-0102', 'Assigned')
            ON DUPLICATE KEY UPDATE
                shipped_qty = VALUES(shipped_qty),
                carton_id = VALUES(carton_id),
                carton_assigned_status = VALUES(carton_assigned_status)
        `);
        
        console.log('✅ ASN-0001 item details inserted/updated\n');

        // Step 2: Delete existing TO-0001 items
        console.log('🗑️  Step 2: Deleting existing TO-0001 items...');
        
        const [deleteResult] = await connection.execute(
            'DELETE FROM tabTransferOrderItem WHERE parent_title = ?',
            ['TO-0001']
        );
        
        console.log(`✅ Deleted ${deleteResult.affectedRows} existing TO-0001 items\n`);

        // Step 3: Insert corrected TO-0001 items to match ASN-0001
        console.log('📋 Step 3: Inserting corrected TO-0001 items to match ASN-0001...');
        
        await connection.execute(`
            INSERT INTO tabTransferOrderItem 
                (parent_title, store, item_code, allocated_qty, sorted_qty, packed_qty, pending_qty, created_at, updated_at)
            VALUES
                ('TO-0001', 'STORE-001', 'SKU-JEANS-001-BLU-32', 25.00, 0.00, 0.00, 25.00, NOW(), NOW()),
                ('TO-0001', 'STORE-002', 'SKU-JEANS-001-BLU-32', 25.00, 0.00, 0.00, 25.00, NOW(), NOW()),
                ('TO-0001', 'STORE-001', 'SKU-JEANS-001-BLU-34', 30.00, 0.00, 0.00, 30.00, NOW(), NOW()),
                ('TO-0001', 'STORE-002', 'SKU-JEANS-001-BLU-34', 20.00, 0.00, 0.00, 20.00, NOW(), NOW()),
                ('TO-0001', 'STORE-001', 'SKU-JEANS-001-BLK-32', 25.00, 0.00, 0.00, 25.00, NOW(), NOW()),
                ('TO-0001', 'STORE-002', 'SKU-JEANS-001-BLK-32', 25.00, 0.00, 0.00, 25.00, NOW(), NOW())
        `);
        
        console.log('✅ TO-0001 items inserted\n');

        // Step 4: Update TO-0001 header total_allocated_qty
        console.log('📊 Step 4: Updating TO-0001 header total_allocated_qty...');
        
        await connection.execute(`
            UPDATE tabTransferOrder 
            SET total_allocated_qty = (
                SELECT COALESCE(SUM(allocated_qty), 0) 
                FROM tabTransferOrderItem 
                WHERE parent_title = 'TO-0001'
            ),
            updated_at = NOW()
            WHERE title = 'TO-0001'
        `);
        
        console.log('✅ TO-0001 header updated\n');

        // Step 5: Verification
        console.log('🔍 Step 5: Verifying fixes...\n');

        // ASN Items
        const [asnItems] = await connection.execute(
            'SELECT item_code, shipped_qty FROM tabAsnItemDetails WHERE parent_title = ? ORDER BY item_code',
            ['ASN-0001']
        );
        
        console.log('📦 ASN-0001 Items:');
        console.table(asnItems);
        const asnTotal = asnItems.reduce((sum, item) => sum + parseFloat(item.shipped_qty), 0);
        console.log(`   Total: ${asnTotal}\n`);

        // TO Items
        const [toItems] = await connection.execute(
            'SELECT store, item_code, allocated_qty FROM tabTransferOrderItem WHERE parent_title = ? ORDER BY store, item_code',
            ['TO-0001']
        );
        
        console.log('📋 TO-0001 Items:');
        console.table(toItems);
        const toTotal = toItems.reduce((sum, item) => sum + parseFloat(item.allocated_qty), 0);
        console.log(`   Total: ${toTotal}\n`);

        // Comparison by Item
        const [comparison] = await connection.execute(`
            SELECT 
                COALESCE(asn.item_code, to_items.item_code) AS item_code,
                COALESCE(asn.asn_qty, 0) AS asn_qty,
                COALESCE(to_items.to_qty, 0) AS to_qty,
                (COALESCE(to_items.to_qty, 0) - COALESCE(asn.asn_qty, 0)) AS difference
            FROM (
                SELECT item_code, SUM(shipped_qty) AS asn_qty
                FROM tabAsnItemDetails
                WHERE parent_title = 'ASN-0001'
                GROUP BY item_code
            ) AS asn
            LEFT JOIN (
                SELECT item_code, SUM(allocated_qty) AS to_qty
                FROM tabTransferOrderItem
                WHERE parent_title = 'TO-0001'
                GROUP BY item_code
            ) AS to_items ON asn.item_code = to_items.item_code
            ORDER BY item_code
        `);

        console.log('🔍 Comparison by Item:');
        console.table(comparison.map(c => ({
            item_code: c.item_code,
            asn_qty: parseFloat(c.asn_qty),
            to_qty: parseFloat(c.to_qty),
            difference: parseFloat(c.difference),
            status: parseFloat(c.asn_qty) === parseFloat(c.to_qty) ? '✅ MATCH' : '❌ MISMATCH'
        })));

        // Check if all match
        const allMatch = comparison.every(c => parseFloat(c.asn_qty) === parseFloat(c.to_qty));
        
        console.log('\n📊 Overall Totals:');
        console.log(`   ASN-0001 Total: ${asnTotal}`);
        console.log(`   TO-0001 Total: ${toTotal}`);
        console.log(`   Difference: ${toTotal - asnTotal}\n`);

        if (allMatch && asnTotal === toTotal) {
            console.log('✅ SUCCESS: All quantities match!');
        } else {
            console.log('❌ WARNING: Some quantities still do not match');
        }

    } catch (error) {
        console.error('❌ Error:', error);
        await connection.rollback();
    } finally {
        await connection.end();
    }
}

fixMismatch();

