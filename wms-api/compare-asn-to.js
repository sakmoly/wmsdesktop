// Compare ASN-0001 and TO-0001 Quantities
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function compare() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'root',
        database: process.env.DB_NAME || 'wms_desktop'
    });

    try {
        console.log('\n==========================================');
        console.log('ASN-0001 vs TO-0001 Quantity Comparison');
        console.log('==========================================\n');

        // Step 1: Get ASN-0001 Header
        const [asnHeader] = await connection.execute(
            'SELECT * FROM tabAdvanceShippingNotice WHERE title = ?',
            ['ASN-0001']
        );

        if (asnHeader.length === 0) {
            console.log('❌ ASN-0001 not found in database');
            return;
        }

        console.log('📦 ASN-0001 Header:');
        console.table(asnHeader.map(h => ({
            title: h.title,
            status: h.status,
            total_shipped_qty: parseFloat(h.total_shipped_qty),
            supplier: h.supplier
        })));

        // Step 2: Get ASN-0001 Items
        const [asnItems] = await connection.execute(
            'SELECT * FROM tabAsnItemDetails WHERE parent_title = ? ORDER BY item_code',
            ['ASN-0001']
        );

        console.log(`\n📋 ASN-0001 Items: ${asnItems.length} items found`);
        if (asnItems.length > 0) {
            console.table(asnItems.map(i => ({
                item_code: i.item_code,
                shipped_qty: parseFloat(i.shipped_qty),
                carton_id: i.carton_id
            })));

            // Calculate ASN total by item
            const asnItemTotals = {};
            asnItems.forEach(item => {
                const qty = parseFloat(item.shipped_qty);
                asnItemTotals[item.item_code] = (asnItemTotals[item.item_code] || 0) + qty;
            });

            console.log('\n📊 ASN-0001 Total Quantities by Item:');
            console.table(Object.entries(asnItemTotals).map(([item, qty]) => ({
                item_code: item,
                total_qty: qty
            })));
        } else {
            console.log('⚠️  WARNING: No items found in tabAsnItemDetails for ASN-0001');
        }

        // Step 3: Get TO-0001 Header
        const [toHeader] = await connection.execute(
            'SELECT * FROM tabTransferOrder WHERE title = ?',
            ['TO-0001']
        );

        if (toHeader.length === 0) {
            console.log('\n❌ TO-0001 not found in database');
            return;
        }

        console.log('\n📦 TO-0001 Header:');
        console.table(toHeader.map(h => ({
            title: h.title,
            status: h.status,
            asn_no: h.advance_shipping_notice,
            total_allocated_qty: parseFloat(h.total_allocated_qty)
        })));

        // Step 4: Get TO-0001 Items
        const [toItems] = await connection.execute(
            'SELECT * FROM tabTransferOrderItem WHERE parent_title = ? ORDER BY store, item_code',
            ['TO-0001']
        );

        console.log(`\n📋 TO-0001 Items: ${toItems.length} items found`);
        if (toItems.length > 0) {
            console.table(toItems.map(i => ({
                store: i.store,
                item_code: i.item_code,
                allocated_qty: parseFloat(i.allocated_qty),
                pending_qty: parseFloat(i.pending_qty)
            })));

            // Calculate TO total by item (across all stores)
            const toItemTotals = {};
            toItems.forEach(item => {
                const qty = parseFloat(item.allocated_qty);
                toItemTotals[item.item_code] = (toItemTotals[item.item_code] || 0) + qty;
            });

            console.log('\n📊 TO-0001 Total Quantities by Item (across all stores):');
            console.table(Object.entries(toItemTotals).map(([item, qty]) => ({
                item_code: item,
                total_qty: qty
            })));
        }

        // Step 5: Comparison
        console.log('\n🔍 QUANTITY COMPARISON:\n');

        const asnItemTotals = {};
        asnItems.forEach(item => {
            const qty = parseFloat(item.shipped_qty);
            asnItemTotals[item.item_code] = (asnItemTotals[item.item_code] || 0) + qty;
        });

        const toItemTotals = {};
        toItems.forEach(item => {
            const qty = parseFloat(item.allocated_qty);
            toItemTotals[item.item_code] = (toItemTotals[item.item_code] || 0) + qty;
        });

        // Get all unique item codes
        const allItems = new Set([
            ...Object.keys(asnItemTotals),
            ...Object.keys(toItemTotals)
        ]);

        if (allItems.size === 0) {
            console.log('⚠️  No items to compare (both ASN and TO have no items)');
            return;
        }

        const comparison = Array.from(allItems).map(itemCode => {
            const asnQty = asnItemTotals[itemCode] || 0;
            const toQty = toItemTotals[itemCode] || 0;
            const difference = toQty - asnQty;
            const status = asnQty === toQty ? '✅ MATCH' : 
                          toQty > asnQty ? '❌ TO EXCEEDS ASN' : 
                          '⚠️  ASN EXCEEDS TO';

            return {
                item_code: itemCode,
                asn_qty: asnQty,
                to_qty: toQty,
                difference: difference,
                status: status
            };
        });

        console.table(comparison);

        // Summary
        const matching = comparison.filter(c => c.status === '✅ MATCH').length;
        const exceeding = comparison.filter(c => c.status === '❌ TO EXCEEDS ASN').length;
        const missing = comparison.filter(c => c.status === '⚠️  ASN EXCEEDS TO').length;

        console.log('\n📈 SUMMARY:');
        console.log(`   ✅ Matching items: ${matching}`);
        console.log(`   ❌ TO exceeds ASN: ${exceeding}`);
        console.log(`   ⚠️  ASN exceeds TO: ${missing}`);
        console.log(`   📦 Total items compared: ${comparison.length}`);

        // Overall totals
        const asnTotal = Object.values(asnItemTotals).reduce((sum, qty) => sum + qty, 0);
        const toTotal = Object.values(toItemTotals).reduce((sum, qty) => sum + qty, 0);

        console.log('\n📊 OVERALL TOTALS:');
        console.log(`   ASN-0001 Total Qty: ${asnTotal}`);
        console.log(`   TO-0001 Total Qty: ${toTotal}`);
        console.log(`   Difference: ${toTotal - asnTotal}`);

        if (asnTotal === toTotal) {
            console.log('\n✅ Total quantities MATCH!');
        } else {
            console.log('\n❌ Total quantities DO NOT MATCH!');
        }

        // Check if ASN has no items but TO has items
        if (asnItems.length === 0 && toItems.length > 0) {
            console.log('\n⚠️  CRITICAL ISSUE: ASN-0001 has NO items but TO-0001 has items!');
            console.log('   This indicates a data inconsistency.');
            console.log('   ASN item details may be missing from tabAsnItemDetails table.');
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await connection.end();
    }
}

compare();

