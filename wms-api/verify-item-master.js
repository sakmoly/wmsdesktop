// Verify Item Master contains all items from transactions
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function verify() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'root',
        database: process.env.DB_NAME || 'wms_desktop'
    });

    try {
        console.log('==========================================');
        console.log('Item Master Verification');
        console.log('==========================================\n');

        // Get all unique items from ASN Item Details
        const [asnItems] = await connection.execute(`
            SELECT DISTINCT item_code
            FROM tabAsnItemDetails
            WHERE item_code IS NOT NULL AND item_code != ''
            ORDER BY item_code
        `);

        // Get all unique items from Transfer Order Items
        const [toItems] = await connection.execute(`
            SELECT DISTINCT item_code
            FROM tabTransferOrderItem
            WHERE item_code IS NOT NULL AND item_code != ''
            ORDER BY item_code
        `);

        // Get all unique items from WMS Scan Events
        const [eventItems] = await connection.execute(`
            SELECT DISTINCT item_code
            FROM tabWmsScanEvent
            WHERE item_code IS NOT NULL AND item_code != ''
            ORDER BY item_code
        `);

        // Combine all unique items from all sources
        const allTransactionItems = new Set();
        asnItems.forEach(row => allTransactionItems.add(row.item_code));
        toItems.forEach(row => allTransactionItems.add(row.item_code));
        eventItems.forEach(row => allTransactionItems.add(row.item_code));

        console.log(`📊 Items found in transactions:`);
        console.log(`   ASN Items: ${asnItems.length}`);
        console.log(`   Transfer Order Items: ${toItems.length}`);
        console.log(`   Scan Event Items: ${eventItems.length}`);
        console.log(`   Total Unique Items: ${allTransactionItems.size}\n`);

        // Get all items from Item Master (tabItem table, column is 'code')
        const [masterItems] = await connection.execute(`
            SELECT code
            FROM tabItem
            WHERE code IS NOT NULL AND code != ''
            ORDER BY code
        `);

        const masterItemSet = new Set(masterItems.map(row => row.code));

        console.log(`📋 Items in Item Master: ${masterItems.length}\n`);

        // Find missing items
        const missingItems = Array.from(allTransactionItems).filter(
            item => !masterItemSet.has(item)
        );

        if (missingItems.length === 0) {
            console.log('✅ All transaction items exist in Item Master!');
        } else {
            console.log(`❌ Found ${missingItems.length} missing items in Item Master:\n`);
            console.table(missingItems);

            // Show which transactions reference missing items
            console.log('\n📊 Missing Items by Source:\n');

            for (const itemCode of missingItems) {
                const [asnCount] = await connection.execute(`
                    SELECT COUNT(*) as count
                    FROM tabAsnItemDetails
                    WHERE item_code = ?
                `, [itemCode]);

                const [toCount] = await connection.execute(`
                    SELECT COUNT(*) as count
                    FROM tabTransferOrderItem
                    WHERE item_code = ?
                `, [itemCode]);

                const [eventCount] = await connection.execute(`
                    SELECT COUNT(*) as count
                    FROM tabWmsScanEvent
                    WHERE item_code = ?
                `, [itemCode]);

                console.log(`  ${itemCode}:`);
                console.log(`    - ASN: ${asnCount[0].count} references`);
                console.log(`    - Transfer Order: ${toCount[0].count} references`);
                console.log(`    - Scan Events: ${eventCount[0].count} references`);
            }
        }

        return missingItems;

    } finally {
        await connection.end();
    }
}

verify().then(missingItems => {
    if (missingItems && missingItems.length > 0) {
        console.log(`\n⚠️  ${missingItems.length} items need to be added to Item Master`);
        process.exit(1);
    } else {
        console.log('\n✅ All items verified!');
        process.exit(0);
    }
}).catch(console.error);

