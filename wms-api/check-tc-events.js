import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function checkTCEvents() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'root',
            database: process.env.DB_NAME || 'wms_desktop'
        });

        console.log('🔍 Checking events for transfer carton TC-MR-0001-1767514268359\n');

        // Check all events with this tc_id
        const [allEvents] = await connection.execute(`
            SELECT 
                event_type,
                tc_id,
                transfer_order,
                item_code,
                qty,
                event_time
            FROM tabWmsScanEvent
            WHERE tc_id = 'TC-MR-0001-1767514268359'
            ORDER BY event_time DESC
            LIMIT 20
        `);

        console.log(`Found ${allEvents.length} event(s) with tc_id = 'TC-MR-0001-1767514268359':\n`);
        allEvents.forEach((event, index) => {
            console.log(`Event ${index + 1}:`);
            console.log(`  Type: ${event.event_type}`);
            console.log(`  TC ID: ${event.tc_id}`);
            console.log(`  Transfer Order: ${event.transfer_order || 'NULL'}`);
            console.log(`  Item Code: ${event.item_code || 'NULL'}`);
            console.log(`  Qty: ${event.qty || 'NULL'}`);
            console.log(`  Time: ${event.event_time}`);
            console.log('');
        });

        // Check events with transfer_order = MR-0001
        const [mrEvents] = await connection.execute(`
            SELECT 
                event_type,
                tc_id,
                transfer_order,
                item_code,
                qty,
                event_time
            FROM tabWmsScanEvent
            WHERE transfer_order = 'MR-0001'
            ORDER BY event_time DESC
            LIMIT 20
        `);

        console.log(`\nFound ${mrEvents.length} event(s) with transfer_order = 'MR-0001':\n`);
        mrEvents.forEach((event, index) => {
            console.log(`Event ${index + 1}:`);
            console.log(`  Type: ${event.event_type}`);
            console.log(`  TC ID: ${event.tc_id || 'NULL'}`);
            console.log(`  Transfer Order: ${event.transfer_order}`);
            console.log(`  Item Code: ${event.item_code || 'NULL'}`);
            console.log(`  Qty: ${event.qty || 'NULL'}`);
            console.log(`  Time: ${event.event_time}`);
            console.log('');
        });

        // Check unique event types for MR-0001
        const [eventTypes] = await connection.execute(`
            SELECT 
                event_type,
                COUNT(*) as count
            FROM tabWmsScanEvent
            WHERE transfer_order = 'MR-0001'
            GROUP BY event_type
            ORDER BY count DESC
        `);

        console.log(`\nEvent types for MR-0001:\n`);
        eventTypes.forEach(type => {
            console.log(`  ${type.event_type}: ${type.count} event(s)`);
        });

        await connection.end();
    } catch (error) {
        console.error('Error:', error.message);
        if (connection) await connection.end();
    }
}

checkTCEvents();

