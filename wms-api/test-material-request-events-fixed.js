import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function testMaterialRequestEvents() {
    console.log('==========================================');
    console.log('Testing Material Request Events Query');
    console.log('==========================================\n');

    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'root',
            database: process.env.DB_NAME || 'wms_desktop'
        });

        console.log(`✅ Connected to database\n`);

        // Check table structure first
        const [columns] = await connection.execute(`DESCRIBE tabWmsScanEvent`);
        const columnNames = columns.map(col => col.Field);
        
        console.log('📋 Available columns:', columnNames.join(', '));
        console.log('');

        // Determine which columns to use
        const hasSourceBin = columnNames.includes('source_bin');
        const hasMaterialRequest = columnNames.includes('material_request');
        const hasLocationId = columnNames.includes('location_id');
        const hasRack = columnNames.includes('rack');
        const hasBin = columnNames.includes('bin');

        // Build SELECT clause based on available columns
        let selectClause = `
            event_type,
            transfer_order,
            item_code,
            qty,
            event_time`;
        
        if (hasSourceBin) selectClause += ',\n            source_bin';
        if (hasMaterialRequest) selectClause += ',\n            material_request';
        if (hasLocationId) selectClause += ',\n            location_id';
        if (hasRack) selectClause += ',\n            rack';
        if (hasBin) selectClause += ',\n            bin';

        // Test query 1: Events with transfer_order LIKE "MR-%"
        console.log('📊 Query 1: Events with transfer_order LIKE "MR-%"\n');
        try {
            const [results1] = await connection.execute(`
                SELECT ${selectClause}
                FROM tabWmsScanEvent
                WHERE transfer_order LIKE 'MR-%'
                ORDER BY event_time DESC
                LIMIT 20
            `);

            console.log(`Found ${results1.length} event(s):\n`);
            if (results1.length > 0) {
                results1.forEach((row, index) => {
                    console.log(`Event ${index + 1}:`);
                    console.log(`  Event Type: ${row.event_type}`);
                    console.log(`  Transfer Order: ${row.transfer_order}`);
                    console.log(`  Item Code: ${row.item_code || 'NULL'}`);
                    console.log(`  Qty: ${row.qty || 'NULL'}`);
                    if (hasSourceBin) console.log(`  Source Bin: ${row.source_bin || 'NULL'}`);
                    if (hasMaterialRequest) console.log(`  Material Request: ${row.material_request || 'NULL'}`);
                    if (hasLocationId) console.log(`  Location ID: ${row.location_id || 'NULL'}`);
                    if (hasRack) console.log(`  Rack: ${row.rack || 'NULL'}`);
                    if (hasBin) console.log(`  Bin: ${row.bin || 'NULL'}`);
                    console.log(`  Event Time: ${row.event_time}`);
                    console.log('');
                });
            } else {
                console.log('  ❌ No events found with transfer_order LIKE "MR-%"\n');
            }
        } catch (error) {
            console.error('❌ Error in Query 1:', error.message);
            console.log('');
        }

        // Test query 2: Events with transfer_order = 'MR-0001'
        console.log('📊 Query 2: Events with transfer_order = "MR-0001"\n');
        try {
            const [results2] = await connection.execute(`
                SELECT ${selectClause}
                FROM tabWmsScanEvent
                WHERE transfer_order = 'MR-0001'
                ORDER BY event_time DESC
                LIMIT 20
            `);

            console.log(`Found ${results2.length} event(s):\n`);
            if (results2.length > 0) {
                results2.forEach((row, index) => {
                    console.log(`Event ${index + 1}:`);
                    console.log(`  Event Type: ${row.event_type}`);
                    console.log(`  Transfer Order: ${row.transfer_order}`);
                    console.log(`  Item Code: ${row.item_code || 'NULL'}`);
                    console.log(`  Qty: ${row.qty || 'NULL'}`);
                    if (hasSourceBin) console.log(`  Source Bin: ${row.source_bin || 'NULL'}`);
                    console.log(`  Event Time: ${row.event_time}`);
                    console.log('');
                });
            } else {
                console.log('  ❌ No events found with transfer_order = "MR-0001"\n');
            }
        } catch (error) {
            console.error('❌ Error in Query 2:', error.message);
            console.log('');
        }

        // Test query 3: All unique transfer_order values (including NULL)
        console.log('📊 Query 3: All unique transfer_order values\n');
        try {
            const [results3] = await connection.execute(`
                SELECT 
                    transfer_order,
                    COUNT(*) as event_count,
                    MIN(event_time) as first_event,
                    MAX(event_time) as last_event
                FROM tabWmsScanEvent
                GROUP BY transfer_order
                ORDER BY event_count DESC, transfer_order
                LIMIT 20
            `);

            console.log(`Found ${results3.length} unique transfer_order value(s):\n`);
            if (results3.length > 0) {
                results3.forEach((row, index) => {
                    const transferOrder = row.transfer_order || 'NULL';
                    console.log(`  ${index + 1}. ${transferOrder} - ${row.event_count} event(s)`);
                    if (transferOrder !== 'NULL') {
                        console.log(`     First: ${row.first_event}, Last: ${row.last_event}`);
                    }
                });
                console.log('');
            } else {
                console.log('  ❌ No events found\n');
            }
        } catch (error) {
            console.error('❌ Error in Query 3:', error.message);
            console.log('');
        }

        // Test query 4: Recent events (all types)
        console.log('📊 Query 4: Recent events (last 10, all types)\n');
        try {
            const [results4] = await connection.execute(`
                SELECT ${selectClause}
                FROM tabWmsScanEvent
                ORDER BY event_time DESC
                LIMIT 10
            `);

            console.log(`Found ${results4.length} recent event(s):\n`);
            if (results4.length > 0) {
                results4.forEach((row, index) => {
                    console.log(`Event ${index + 1}:`);
                    console.log(`  Event Type: ${row.event_type}`);
                    console.log(`  Transfer Order: ${row.transfer_order || 'NULL'}`);
                    if (hasMaterialRequest) console.log(`  Material Request: ${row.material_request || 'NULL'}`);
                    console.log(`  Item Code: ${row.item_code || 'NULL'}`);
                    console.log(`  Qty: ${row.qty || 'NULL'}`);
                    if (hasSourceBin) console.log(`  Source Bin: ${row.source_bin || 'NULL'}`);
                    if (hasLocationId) console.log(`  Location ID: ${row.location_id || 'NULL'}`);
                    if (hasRack) console.log(`  Rack: ${row.rack || 'NULL'}`);
                    if (hasBin) console.log(`  Bin: ${row.bin || 'NULL'}`);
                    console.log(`  Event Time: ${row.event_time}`);
                    console.log('');
                });
            } else {
                console.log('  ❌ No events found in database\n');
            }
        } catch (error) {
            console.error('❌ Error in Query 4:', error.message);
            console.log('');
        }

        // Test query 5: Check Material Request items
        console.log('📊 Query 5: Material Request Items for MR-0001\n');
        try {
            const [results5] = await connection.execute(`
                SELECT 
                    parent_title,
                    item_code,
                    requested_qty,
                    picked_qty,
                    status,
                    updated_at
                FROM tabMaterialRequestItem
                WHERE parent_title = 'MR-0001'
                ORDER BY item_code
            `);

            console.log(`Found ${results5.length} item(s):\n`);
            if (results5.length > 0) {
                results5.forEach((row, index) => {
                    console.log(`Item ${index + 1}: ${row.item_code}`);
                    console.log(`  Requested: ${row.requested_qty}, Picked: ${row.picked_qty}, Status: ${row.status}`);
                });
                console.log('');
            } else {
                console.log('  ❌ No items found for MR-0001\n');
            }
        } catch (error) {
            console.error('❌ Error in Query 5:', error.message);
            console.log('');
        }

        console.log('==========================================');
        console.log('✅ Test completed');
        console.log('==========================================\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

testMaterialRequestEvents().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});

