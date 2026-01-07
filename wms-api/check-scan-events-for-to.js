// Check scan events for TO-0002 to see if they exist and have transfer_order set
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function check() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'root',
        database: process.env.DB_NAME || 'wms_desktop'
    });

    try {
        console.log('Checking scan events for ASN-0002 and TO-0002...\n');

        // Check SORT_TO_BOX events
        const [sortEvents] = await connection.execute(`
            SELECT 
                event_type,
                transfer_order,
                item_code,
                qty,
                store,
                box_id,
                event_time
            FROM tabWmsScanEvent
            WHERE advance_shipping_notice = 'ASN-0002'
               OR transfer_order = 'TO-0002'
            ORDER BY event_time DESC
            LIMIT 20
        `);

        console.log(`Found ${sortEvents.length} scan events for ASN-0002 or TO-0002:\n`);
        console.table(sortEvents);

        // Check specifically for SORT_TO_BOX and PACK_BOX_TO_TC
        const [sortToBox] = await connection.execute(`
            SELECT COUNT(*) as count
            FROM tabWmsScanEvent
            WHERE event_type = 'SORT_TO_BOX'
              AND (advance_shipping_notice = 'ASN-0002' OR transfer_order = 'TO-0002')
        `);

        const [packToTc] = await connection.execute(`
            SELECT COUNT(*) as count
            FROM tabWmsScanEvent
            WHERE event_type = 'PACK_BOX_TO_TC'
              AND (advance_shipping_notice = 'ASN-0002' OR transfer_order = 'TO-0002')
        `);

        console.log(`\nSORT_TO_BOX events: ${sortToBox[0].count}`);
        console.log(`PACK_BOX_TO_TC events: ${packToTc[0].count}`);

    } finally {
        await connection.end();
    }
}

check().catch(console.error);

