import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function testSealedItemsStatus() {
    console.log('==========================================');
    console.log('Testing Sealed Items Status');
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

        // Check Material Request items
        console.log('📊 Material Request Items for MR-0001:\n');
        const [items] = await connection.execute(`
            SELECT 
                item_code,
                requested_qty,
                picked_qty,
                status,
                updated_at
            FROM tabMaterialRequestItem
            WHERE parent_title = 'MR-0001'
            ORDER BY item_code
        `);

        items.forEach(item => {
            console.log(`  ${item.item_code}:`);
            console.log(`    Requested: ${item.requested_qty}, Picked: ${item.picked_qty}, Status: ${item.status}`);
            console.log(`    Updated: ${item.updated_at}`);
        });
        console.log('');

        // Check Transfer Cartons for MR-0001
        console.log('📦 Transfer Cartons for MR-0001:\n');
        const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
        const allColumns = new Set(tableInfo.map(row => row.Field));
        
        let toColumn;
        if (allColumns.has('to_no')) {
            toColumn = 'to_no';
        } else if (allColumns.has('transfer_order')) {
            toColumn = 'transfer_order';
        }

        if (toColumn) {
            const [tcs] = await connection.execute(`
                SELECT 
                    tc_id,
                    status,
                    sealed_on,
                    sealed_by
                FROM tabTransferCarton
                WHERE ${toColumn} = 'MR-0001'
                ORDER BY created_on DESC
            `);

            tcs.forEach(tc => {
                console.log(`  ${tc.tc_id}:`);
                console.log(`    Status: ${tc.status}`);
                console.log(`    Sealed On: ${tc.sealed_on || 'Not sealed'}`);
                console.log(`    Sealed By: ${tc.sealed_by || 'N/A'}`);
            });
            console.log('');

            // Check items in sealed transfer cartons
            for (const tc of tcs) {
                if (tc.status === 'Sealed' || tc.status === 'Dispatched') {
                    console.log(`📋 Items in sealed transfer carton ${tc.tc_id}:\n`);
                    const [cartonItems] = await connection.execute(`
                        SELECT DISTINCT item_code
                        FROM tabWmsScanEvent
                        WHERE tc_id = ?
                          AND event_type = 'PACK_BOX_TO_TC'
                          AND item_code IS NOT NULL
                    `, [tc.tc_id]);

                    if (cartonItems.length > 0) {
                        console.log(`  Found ${cartonItems.length} item(s) in transfer carton:`);
                        cartonItems.forEach(item => {
                            console.log(`    - ${item.item_code}`);
                        });
                        console.log('');

                        // Check if these items have status "Sealed"
                        const itemCodes = cartonItems.map(item => item.item_code);
                        const placeholders = itemCodes.map(() => '?').join(',');
                        const [sealedItems] = await connection.execute(`
                            SELECT item_code, status
                            FROM tabMaterialRequestItem
                            WHERE parent_title = 'MR-0001'
                              AND item_code IN (${placeholders})
                        `, itemCodes);

                        console.log(`  Status of items in sealed carton:`);
                        sealedItems.forEach(item => {
                            const isSealed = item.status === 'Sealed' ? '✅' : '❌';
                            console.log(`    ${isSealed} ${item.item_code}: ${item.status}`);
                        });
                        console.log('');
                    } else {
                        console.log(`  ❌ No items found in transfer carton ${tc.tc_id}`);
                        console.log('');
                    }
                }
            }
        }

        // Check Material Request header status
        console.log('📊 Material Request Header:\n');
        const [mr] = await connection.execute(`
            SELECT 
                title,
                status,
                total_requested_qty,
                total_picked_qty,
                updated_at
            FROM tabMaterialRequest
            WHERE title = 'MR-0001'
        `);

        if (mr.length > 0) {
            const mrData = mr[0];
            console.log(`  Title: ${mrData.title}`);
            console.log(`  Status: ${mrData.status}`);
            console.log(`  Total Requested: ${mrData.total_requested_qty}`);
            console.log(`  Total Picked: ${mrData.total_picked_qty}`);
            console.log(`  Updated: ${mrData.updated_at}`);
        }

        console.log('\n==========================================');
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

testSealedItemsStatus().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});

