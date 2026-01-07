// Quick verification script to check stock data
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'wms_desktop',
};

async function verifyStockData() {
    let connection;

    try {
        console.log('\n🔍 Verifying Stock Data for SKU-HAT-301-BLU-OS...\n');
        
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to database\n');

        // Check tabStockLedger
        const [stockLedger] = await connection.query(`
            SELECT item_code, warehouse, bin_location, qty
            FROM tabStockLedger
            WHERE item_code = 'SKU-HAT-301-BLU-OS'
        `);
        
        console.log('📊 Stock Ledger Entries:');
        console.table(stockLedger);
        
        const totalInLedger = stockLedger.reduce((sum, row) => sum + parseFloat(row.qty || 0), 0);
        console.log(`\nTotal in Stock Ledger: ${totalInLedger}\n`);

        // Check tabItem
        const [items] = await connection.query(`
            SELECT code, name, stock_qty
            FROM tabItem
            WHERE code = 'SKU-HAT-301-BLU-OS'
        `);
        
        console.log('📦 Item Master:');
        console.table(items);
        
        if (items.length > 0) {
            const itemStockQty = parseFloat(items[0].stock_qty || 0);
            console.log(`\nItem stock_qty: ${itemStockQty}`);
            console.log(`Stock Ledger Total: ${totalInLedger}`);
            console.log(`Match: ${Math.abs(itemStockQty - totalInLedger) < 0.01 ? '✅ YES' : '❌ NO'}\n`);
        }

        // Check putaway tasks
        const [putawayTasks] = await connection.query(`
            SELECT pt.title, pt.status, pl.item_code, pl.qty, pl.rack, pl.bin
            FROM tabPutawayTask pt
            JOIN tabPutawayLine pl ON pt.title = pl.parent_title
            WHERE pl.item_code = 'SKU-HAT-301-BLU-OS'
        `);
        
        console.log('📋 Putaway Tasks:');
        console.table(putawayTasks);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

verifyStockData();

