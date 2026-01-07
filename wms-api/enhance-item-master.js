// Enhance Item Master with barcode and additional information
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function enhanceItemMaster() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'root',
        database: process.env.DB_NAME || 'wms_desktop'
    });

    try {
        console.log('==========================================');
        console.log('Enhancing Item Master with Barcode & Details');
        console.log('==========================================\n');

        // Get all items from Item Master
        const [items] = await connection.execute(`
            SELECT code, name, item_group, brand, barcode, default_uom, stock_uom
            FROM tabItem
            ORDER BY code
        `);

        console.log(`📋 Found ${items.length} items in Item Master\n`);
        console.log('🔄 Updating items with barcode and enhanced information...\n');

        let updatedCount = 0;

        for (const item of items) {
            const itemCode = item.code;
            let needsUpdate = false;
            const updates = [];

            // Generate barcode if missing
            let barcode = item.barcode;
            if (!barcode || barcode.trim() === '') {
                // Generate barcode from item code
                // Remove SKU- prefix and use remaining, or use full code
                barcode = itemCode.replace(/^SKU-/i, '');
                // If too short, pad with zeros or use full code
                if (barcode.length < 8) {
                    // Generate EAN-13 compatible barcode (13 digits)
                    // Use item code hash or sequential number
                    const hash = itemCode.split('').reduce((acc, char) => {
                        return ((acc << 5) - acc) + char.charCodeAt(0);
                    }, 0);
                    barcode = Math.abs(hash).toString().padStart(13, '0').substring(0, 13);
                }
                updates.push(`barcode = '${barcode}'`);
                needsUpdate = true;
            }

            // Enhance item name if it's too basic
            let enhancedName = item.name;
            if (!enhancedName || enhancedName === itemCode || enhancedName.length < 5) {
                enhancedName = itemCode
                    .replace(/SKU-/gi, '')
                    .replace(/-/g, ' ')
                    .split(' ')
                    .map(word => {
                        // Convert abbreviations to full words
                        if (word === 'BLK') return 'Black';
                        if (word === 'BLU') return 'Blue';
                        if (word === 'WHT') return 'White';
                        if (word === 'GRY') return 'Gray';
                        if (word === 'RED') return 'Red';
                        if (word === 'GRN') return 'Green';
                        if (word === 'YLW') return 'Yellow';
                        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                    })
                    .join(' ');

                // Add size information if present
                if (itemCode.match(/-\d{2}$/)) {
                    const size = itemCode.match(/-(\d{2})$/)[1];
                    enhancedName += ` (Size ${size})`;
                } else if (itemCode.match(/-[SLM]$/i)) {
                    const size = itemCode.match(/-([SLM])$/i)[1].toUpperCase();
                    enhancedName += ` (Size ${size})`;
                } else if (itemCode.match(/-[XL]+$/i)) {
                    const size = itemCode.match(/-([XL]+)$/i)[1].toUpperCase();
                    enhancedName += ` (Size ${size})`;
                }

                updates.push(`name = '${enhancedName.replace(/'/g, "''")}'`);
                needsUpdate = true;
            }

            // Enhance item group if missing or generic
            let itemGroup = item.item_group;
            if (!itemGroup || itemGroup === 'General') {
                if (itemCode.includes('JEANS')) {
                    itemGroup = 'Apparel';
                    updates.push(`item_group = 'Apparel'`);
                    needsUpdate = true;
                } else if (itemCode.includes('SHIRT')) {
                    itemGroup = 'Apparel';
                    updates.push(`item_group = 'Apparel'`);
                    needsUpdate = true;
                } else if (itemCode.includes('PANT') || itemCode.includes('TROUSERS')) {
                    itemGroup = 'Apparel';
                    updates.push(`item_group = 'Apparel'`);
                    needsUpdate = true;
                } else if (itemCode.includes('SKU-')) {
                    itemGroup = 'Products';
                    updates.push(`item_group = 'Products'`);
                    needsUpdate = true;
                }
            }

            // Set brand if missing
            let brand = item.brand;
            if (!brand || brand.trim() === '') {
                // Extract brand from item code pattern
                if (itemCode.match(/-\d{3}-/)) {
                    brand = 'Standard';
                    updates.push(`brand = 'Standard'`);
                    needsUpdate = true;
                } else if (itemCode.includes('JEANS-0')) {
                    brand = 'Jeans Brand';
                    updates.push(`brand = 'Jeans Brand'`);
                    needsUpdate = true;
                } else if (itemCode.includes('SHIRT-0')) {
                    brand = 'Shirt Brand';
                    updates.push(`brand = 'Shirt Brand'`);
                    needsUpdate = true;
                }
            }

            // Ensure UOM is set
            if (!item.default_uom || item.default_uom.trim() === '') {
                updates.push(`default_uom = 'Nos'`);
                needsUpdate = true;
            }
            if (!item.stock_uom || item.stock_uom.trim() === '') {
                updates.push(`stock_uom = 'Nos'`);
                needsUpdate = true;
            }

            if (needsUpdate) {
                const updateSql = `
                    UPDATE tabItem
                    SET ${updates.join(', ')}, updated_at = NOW()
                    WHERE code = ?
                `;
                
                await connection.execute(updateSql, [itemCode]);
                updatedCount++;
                
                console.log(`  ✅ Updated: ${itemCode}`);
                if (barcode && barcode !== item.barcode) {
                    console.log(`     Barcode: ${barcode}`);
                }
                if (enhancedName !== item.name) {
                    console.log(`     Name: ${item.name} → ${enhancedName}`);
                }
            }
        }

        console.log(`\n==========================================`);
        console.log(`✅ Item Master Enhancement Complete!`);
        console.log(`   Updated: ${updatedCount} items`);
        console.log(`==========================================\n`);

        // Show summary of items with barcodes
        const [barcodeCount] = await connection.execute(`
            SELECT COUNT(*) as count
            FROM tabItem
            WHERE barcode IS NOT NULL AND barcode != ''
        `);
        console.log(`📊 Items with barcode: ${barcodeCount[0].count} / ${items.length}`);

    } finally {
        await connection.end();
    }
}

enhanceItemMaster().catch(console.error);

