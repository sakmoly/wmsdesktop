// Verify Item Master has barcode and all information filled
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
        console.log('Item Master Details Verification');
        console.log('==========================================\n');

        // Get all items with their details
        const [items] = await connection.execute(`
            SELECT 
                code,
                name,
                item_group,
                brand,
                barcode,
                default_uom,
                stock_uom,
                maintain_stock,
                stock_qty,
                reserved_qty
            FROM tabItem
            ORDER BY code
            LIMIT 20
        `);

        console.log('📋 Sample Items (first 20):\n');
        console.table(items.map(item => ({
            code: item.code,
            name: item.name,
            item_group: item.item_group || '(empty)',
            brand: item.brand || '(empty)',
            barcode: item.barcode || '(empty)',
            default_uom: item.default_uom || '(empty)',
            stock_uom: item.stock_uom || '(empty)'
        })));

        // Count items with missing information
        const [missingBarcode] = await connection.execute(`
            SELECT COUNT(*) as count
            FROM tabItem
            WHERE barcode IS NULL OR barcode = ''
        `);

        const [missingUOM] = await connection.execute(`
            SELECT COUNT(*) as count
            FROM tabItem
            WHERE default_uom IS NULL OR default_uom = ''
        `);

        const [missingGroup] = await connection.execute(`
            SELECT COUNT(*) as count
            FROM tabItem
            WHERE item_group IS NULL OR item_group = ''
        `);

        const [totalItems] = await connection.execute(`
            SELECT COUNT(*) as count
            FROM tabItem
        `);

        console.log(`\n📊 Summary:`);
        console.log(`   Total Items: ${totalItems[0].count}`);
        console.log(`   Items with Barcode: ${totalItems[0].count - missingBarcode[0].count} / ${totalItems[0].count}`);
        console.log(`   Items with UOM: ${totalItems[0].count - missingUOM[0].count} / ${totalItems[0].count}`);
        console.log(`   Items with Item Group: ${totalItems[0].count - missingGroup[0].count} / ${totalItems[0].count}`);

        if (missingBarcode[0].count === 0 && missingUOM[0].count === 0) {
            console.log(`\n✅ All items have barcode and UOM filled!`);
        } else {
            console.log(`\n⚠️  Some items still missing information:`);
            if (missingBarcode[0].count > 0) {
                console.log(`   - ${missingBarcode[0].count} items missing barcode`);
            }
            if (missingUOM[0].count > 0) {
                console.log(`   - ${missingUOM[0].count} items missing UOM`);
            }
        }

    } finally {
        await connection.end();
    }
}

verify().catch(console.error);

