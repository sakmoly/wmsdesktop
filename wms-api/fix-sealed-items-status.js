import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function fixSealedItemsStatus() {
    console.log('==========================================');
    console.log('Fixing Sealed Items Status for MR-0001');
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

        // Get all sealed transfer cartons for MR-0001
        const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
        const allColumns = new Set(tableInfo.map(row => row.Field));
        
        let toColumn;
        if (allColumns.has('to_no')) {
            toColumn = 'to_no';
        } else if (allColumns.has('transfer_order')) {
            toColumn = 'transfer_order';
        }

        if (!toColumn) {
            console.log('❌ Cannot find TO column in tabTransferCarton');
            await connection.end();
            return;
        }

        const [sealedTCs] = await connection.execute(`
            SELECT tc_id, sealed_on
            FROM tabTransferCarton
            WHERE ${toColumn} = 'MR-0001'
              AND status IN ('Sealed', 'Dispatched')
            ORDER BY sealed_on DESC
        `);

        console.log(`Found ${sealedTCs.length} sealed transfer carton(s)\n`);

        // Get all fully picked items that are not yet sealed
        const [fullyPickedItems] = await connection.execute(`
            SELECT item_code, picked_qty, requested_qty, status
            FROM tabMaterialRequestItem
            WHERE parent_title = 'MR-0001'
              AND picked_qty >= requested_qty
              AND requested_qty > 0
              AND status != 'Sealed'
            ORDER BY item_code
        `);

        console.log(`Found ${fullyPickedItems.length} fully picked item(s) that are not sealed:\n`);
        fullyPickedItems.forEach(item => {
            console.log(`  ${item.item_code}: ${item.picked_qty}/${item.requested_qty}, Status: ${item.status}`);
        });
        console.log('');

        if (fullyPickedItems.length > 0 && sealedTCs.length > 0) {
            // Update all fully picked items to "Sealed" status
            const itemCodes = fullyPickedItems.map(item => item.item_code);
            const placeholders = itemCodes.map(() => '?').join(',');

            await connection.beginTransaction();

            try {
                const [updateResult] = await connection.execute(`
                    UPDATE tabMaterialRequestItem
                    SET status = 'Sealed',
                        updated_at = NOW()
                    WHERE parent_title = 'MR-0001'
                      AND item_code IN (${placeholders})
                      AND status != 'Sealed'
                `, itemCodes);

                await connection.commit();

                console.log(`✅ Updated ${updateResult.affectedRows} item(s) to "Sealed" status\n`);

                // Verify update
                const [updatedItems] = await connection.execute(`
                    SELECT item_code, status
                    FROM tabMaterialRequestItem
                    WHERE parent_title = 'MR-0001'
                    ORDER BY item_code
                `);

                console.log('Updated Material Request Items:\n');
                updatedItems.forEach(item => {
                    console.log(`  ${item.item_code}: ${item.status}`);
                });

            } catch (error) {
                await connection.rollback();
                throw error;
            }
        } else {
            console.log('ℹ️  No items to update or no sealed transfer cartons found');
        }

        console.log('\n==========================================');
        console.log('✅ Fix completed');
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

fixSealedItemsStatus().catch(error => {
    console.error('Fix failed:', error);
    process.exit(1);
});

