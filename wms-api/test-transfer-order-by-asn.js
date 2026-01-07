// Test the updated Transfer Order by ASN API endpoint
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'root',
        database: process.env.DB_NAME || 'wms_desktop'
    });

    try {
        console.log('Testing Transfer Order by ASN API Response Format...\n');

        const asnNo = 'ASN-0002';

        // Get Transfer Order header
        const [rows] = await connection.execute(`
            SELECT 
                title as transfer_order,
                advance_shipping_notice as asn_no
            FROM tabTransferOrder
            WHERE advance_shipping_notice = ?
            LIMIT 1
        `, [asnNo]);

        if (rows.length === 0) {
            console.log('❌ No Transfer Order found');
            return;
        }

        const toTitle = rows[0].transfer_order;

        // Get Transfer Order Items (allocations)
        const [items] = await connection.execute(`
            SELECT 
                store,
                item_code,
                allocated_qty
            FROM tabTransferOrderItem
            WHERE parent_title = ?
            ORDER BY store, item_code
        `, [toTitle]);

        // Format allocations array
        const allocations = items.map(item => ({
            store: item.store,
            item_code: item.item_code,
            allocated_qty: parseFloat(item.allocated_qty) || 0
        }));

        const response = {
            to_no: toTitle,
            asn_no: rows[0].asn_no,
            allocations: allocations
        };

        console.log('✅ API Response Format:');
        console.log(JSON.stringify(response, null, 2));
        console.log(`\n📊 Summary:`);
        console.log(`   TO: ${toTitle}`);
        console.log(`   ASN: ${rows[0].asn_no}`);
        console.log(`   Allocations: ${allocations.length} items`);

    } finally {
        await connection.end();
    }
}

test().catch(console.error);

