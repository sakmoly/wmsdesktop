// Test Transfer Order API endpoint
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
        console.log('Testing Transfer Order API Query...\n');

        const asnNo = 'ASN-0002';

        // Test the exact query used in the API
        const [rows] = await connection.execute(`
            SELECT 
                title as transfer_order,
                status,
                advance_shipping_notice as asn_no,
                from_warehouse,
                prepared_by,
                required_date,
                total_allocated_qty,
                created_at,
                updated_at
            FROM tabTransferOrder
            WHERE advance_shipping_notice = ?
            LIMIT 1
        `, [asnNo]);

        console.log(`Query: WHERE advance_shipping_notice = '${asnNo}'`);
        console.log(`Found ${rows.length} row(s)\n`);

        if (rows.length === 0) {
            console.log('❌ No Transfer Order found - This explains the mobile app error!');
            
            // Check what ASN formats exist
            const [allTOs] = await connection.execute(`
                SELECT title, advance_shipping_notice 
                FROM tabTransferOrder 
                ORDER BY advance_shipping_notice
            `);
            console.log('\nAll Transfer Orders in database:');
            console.table(allTOs);
            
            // Check ASN formats
            const [asns] = await connection.execute(`
                SELECT title 
                FROM tabAdvanceShippingNotice 
                WHERE title LIKE '%0002%'
            `);
            console.log('\nASN formats matching "0002":');
            console.table(asns);
        } else {
            console.log('✅ Transfer Order found:');
            const transferOrder = {
                transfer_order: rows[0].transfer_order,
                status: rows[0].status,
                asn_no: rows[0].asn_no,
                from_warehouse: rows[0].from_warehouse,
                prepared_by: rows[0].prepared_by,
                required_date: rows[0].required_date ? rows[0].required_date.toISOString().split('T')[0] : null,
                total_allocated_qty: parseFloat(rows[0].total_allocated_qty) || 0,
                created_at: rows[0].created_at ? rows[0].created_at.toISOString() : null,
                updated_at: rows[0].updated_at ? rows[0].updated_at.toISOString() : null
            };
            console.table([transferOrder]);
            console.log('\nThis should be returned by the API endpoint.');
        }

    } finally {
        await connection.end();
    }
}

test().catch(console.error);

