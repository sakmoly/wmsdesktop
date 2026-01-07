// Verify ASN and Transfer Order items/quantities match
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        console.log('ASN and Transfer Order Matching Verification');
        console.log('==========================================\n');

        // Get all ASNs with their items
        const [asns] = await connection.execute(`
            SELECT 
                a.title as asn_no,
                a.status as asn_status,
                d.item_code,
                d.shipped_qty as asn_qty,
                d.carton_id
            FROM tabAdvanceShippingNotice a
            INNER JOIN tabAsnItemDetails d ON d.parent_title = a.title
            ORDER BY a.title, d.item_code
        `);

        // Get all Transfer Orders with their items
        const [tos] = await connection.execute(`
            SELECT 
                t.title as to_no,
                t.advance_shipping_notice as asn_no,
                t.status as to_status,
                ti.item_code,
                ti.store,
                ti.allocated_qty as to_qty
            FROM tabTransferOrder t
            INNER JOIN tabTransferOrderItem ti ON ti.parent_title = t.title
            ORDER BY t.advance_shipping_notice, t.title, ti.item_code
        `);

        // Group ASN items by ASN
        const asnItems = {};
        for (const row of asns) {
            if (!asnItems[row.asn_no]) {
                asnItems[row.asn_no] = {};
            }
            if (!asnItems[row.asn_no][row.item_code]) {
                asnItems[row.asn_no][row.item_code] = 0;
            }
            asnItems[row.asn_no][row.item_code] += parseFloat(row.asn_qty) || 0;
        }

        // Group TO items by ASN and TO
        const toItems = {};
        for (const row of tos) {
            if (!toItems[row.asn_no]) {
                toItems[row.asn_no] = {};
            }
            if (!toItems[row.asn_no][row.to_no]) {
                toItems[row.asn_no][row.to_no] = {};
            }
            if (!toItems[row.asn_no][row.to_no][row.item_code]) {
                toItems[row.asn_no][row.to_no][row.item_code] = 0;
            }
            toItems[row.asn_no][row.to_no][row.item_code] += parseFloat(row.to_qty) || 0;
        }

        // Compare and report mismatches
        console.log('📊 Comparison Results:\n');

        let hasMismatches = false;

        for (const asnNo in asnItems) {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`ASN: ${asnNo}`);
            console.log(`${'='.repeat(80)}`);

            const asnItemMap = asnItems[asnNo];
            const toItemMap = toItems[asnNo] || {};

            // Check if ASN has Transfer Orders
            if (Object.keys(toItemMap).length === 0) {
                console.log(`⚠️  No Transfer Orders found for ${asnNo}`);
                console.log(`   ASN Items:`);
                for (const itemCode in asnItemMap) {
                    console.log(`     - ${itemCode}: ${asnItemMap[itemCode]} units`);
                }
                continue;
            }

            // For each TO, compare items
            for (const toNo in toItemMap) {
                console.log(`\n  Transfer Order: ${toNo}`);
                console.log(`  ${'-'.repeat(76)}`);

                const toItemMapForTO = toItemMap[toNo];
                const allItems = new Set([...Object.keys(asnItemMap), ...Object.keys(toItemMapForTO)]);

                let toMismatch = false;

                for (const itemCode of allItems) {
                    const asnQty = asnItemMap[itemCode] || 0;
                    const toQty = toItemMapForTO[itemCode] || 0;

                    if (asnQty === 0 && toQty > 0) {
                        console.log(`  ❌ ${itemCode}: ASN=0, TO=${toQty} (Item in TO but not in ASN!)`);
                        toMismatch = true;
                        hasMismatches = true;
                    } else if (asnQty > 0 && toQty === 0) {
                        console.log(`  ⚠️  ${itemCode}: ASN=${asnQty}, TO=0 (Item in ASN but not allocated in TO)`);
                    } else if (asnQty > 0 && toQty > 0) {
                        if (toQty > asnQty) {
                            console.log(`  ❌ ${itemCode}: ASN=${asnQty}, TO=${toQty} (TO exceeds ASN by ${toQty - asnQty})`);
                            toMismatch = true;
                            hasMismatches = true;
                        } else {
                            console.log(`  ✅ ${itemCode}: ASN=${asnQty}, TO=${toQty} (OK)`);
                        }
                    }
                }

                // Calculate totals
                const totalAsnQty = Object.values(asnItemMap).reduce((sum, qty) => sum + qty, 0);
                const totalToQty = Object.values(toItemMapForTO).reduce((sum, qty) => sum + qty, 0);

                console.log(`  ${'-'.repeat(76)}`);
                console.log(`  Total ASN Qty: ${totalAsnQty}`);
                console.log(`  Total TO Qty:  ${totalToQty}`);
                if (totalToQty > totalAsnQty) {
                    console.log(`  ❌ TO total exceeds ASN total by ${totalToQty - totalAsnQty}`);
                    hasMismatches = true;
                } else if (totalToQty < totalAsnQty) {
                    console.log(`  ⚠️  TO total is less than ASN total (${totalAsnQty - totalToQty} units not allocated)`);
                } else {
                    console.log(`  ✅ Totals match`);
                }
            }
        }

        console.log(`\n${'='.repeat(80)}`);
        if (hasMismatches) {
            console.log('❌ MISMATCHES FOUND - Data needs correction');
        } else {
            console.log('✅ All ASN and Transfer Order items/quantities match correctly');
        }
        console.log(`${'='.repeat(80)}\n`);

    } finally {
        await connection.end();
    }
}

verify().catch(console.error);

