// Update Item Master (tabItem) with missing items from transactions
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function updateItemMaster() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'root',
        database: process.env.DB_NAME || 'wms_desktop'
    });

    try {
        console.log('==========================================');
        console.log('Updating Item Master from Transactions');
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

        console.log(`📊 Found ${allTransactionItems.size} unique items in transactions\n`);

        // Get all items from Item Master
        const [masterItems] = await connection.execute(`
            SELECT code
            FROM tabItem
            WHERE code IS NOT NULL AND code != ''
            ORDER BY code
        `);

        const masterItemSet = new Set(masterItems.map(row => row.code));
        console.log(`📋 Found ${masterItems.length} items in Item Master\n`);

        // Find missing items
        const missingItems = Array.from(allTransactionItems).filter(
            item => !masterItemSet.has(item)
        );

        if (missingItems.length === 0) {
            console.log('✅ All transaction items already exist in Item Master!');
            return;
        }

        console.log(`📝 Found ${missingItems.length} missing items. Adding to Item Master...\n`);

        let insertedCount = 0;
        let updatedCount = 0;

        for (const itemCode of missingItems) {
            // Generate item name from item code (e.g., "SKU-JEANS-001-BLK-32" -> "Jeans 001 Blk 32")
            const itemName = itemCode
                .replace(/SKU-/gi, '')
                .replace(/-/g, ' ')
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');

            // Determine item group from item code pattern
            let itemGroup = 'General';
            if (itemCode.includes('JEANS')) {
                itemGroup = 'Apparel';
            } else if (itemCode.includes('SHIRT')) {
                itemGroup = 'Apparel';
            } else if (itemCode.includes('SKU-')) {
                itemGroup = 'Products';
            }

            // Determine brand (if pattern matches)
            let brand = null;
            if (itemCode.match(/-\d{3}-/)) {
                brand = 'Standard';
            }

            try {
                // Insert new item
                // Use item_code as default barcode if barcode is not provided
                await connection.execute(`
                    INSERT INTO tabItem 
                        (code, name, item_group, brand, barcode, default_uom, stock_uom, maintain_stock, stock_qty, reserved_qty, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, 'Nos', 'Nos', TRUE, 0, 0, NOW(), NOW())
                    ON DUPLICATE KEY UPDATE
                        name = COALESCE(VALUES(name), name),
                        updated_at = NOW()
                `, [itemCode, itemName, itemGroup, brand, itemCode]); // Use itemCode as default barcode

                insertedCount++;
                console.log(`  ✅ Added: ${itemCode} - ${itemName} (${itemGroup})`);
            } catch (error) {
                if (error.code === 'ER_DUP_ENTRY') {
                    // Item already exists (race condition), just update
                    await connection.execute(`
                        UPDATE tabItem
                        SET name = COALESCE(?, name),
                            item_group = COALESCE(?, item_group),
                            brand = COALESCE(?, brand),
                            updated_at = NOW()
                        WHERE code = ?
                    `, [itemName, itemGroup, brand, itemCode]);
                    updatedCount++;
                    console.log(`  🔄 Updated: ${itemCode}`);
                } else {
                    console.error(`  ❌ Error adding ${itemCode}:`, error.message);
                }
            }
        }

        console.log(`\n==========================================`);
        console.log(`✅ Item Master Update Complete!`);
        console.log(`   Inserted: ${insertedCount} items`);
        console.log(`   Updated: ${updatedCount} items`);
        console.log(`==========================================\n`);

        // Verify final count
        const [finalCount] = await connection.execute(`
            SELECT COUNT(*) as count
            FROM tabItem
        `);
        console.log(`📊 Total items in Item Master: ${finalCount[0].count}`);

    } finally {
        await connection.end();
    }
}

updateItemMaster().catch(console.error);

