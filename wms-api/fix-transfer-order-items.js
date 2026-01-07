// Fix Transfer Order Items to Match ASN Items
// This script reads ASN items and creates matching TO items with correct quantities

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function fix() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'root',
        database: process.env.DB_NAME || 'wms_desktop'
    });

    try {
        console.log('==========================================');
        console.log('Fixing Transfer Order Items to Match ASN');
        console.log('==========================================\n');

        // Step 1: Get all ASN items grouped by ASN and item_code
        const [asnItems] = await connection.execute(`
            SELECT 
                parent_title as asn_no,
                item_code,
                SUM(shipped_qty) as total_qty
            FROM tabAsnItemDetails
            GROUP BY parent_title, item_code
            ORDER BY parent_title, item_code
        `);

        console.log(`Found ${asnItems.length} unique ASN items\n`);

        // Step 2: Get all Transfer Orders
        const [tos] = await connection.execute(`
            SELECT 
                title as to_no,
                advance_shipping_notice as asn_no,
                status
            FROM tabTransferOrder
            ORDER BY advance_shipping_notice, title
        `);

        console.log(`Found ${tos.length} Transfer Orders\n`);

        // Step 3: Delete all existing TO items
        await connection.execute('DELETE FROM tabTransferOrderItem');
        console.log('✅ Deleted all existing Transfer Order Items\n');

        // Step 4: Group TOs by ASN to handle multiple TOs per ASN
        const tosByAsn = {};
        for (const to of tos) {
            if (!tosByAsn[to.asn_no]) {
                tosByAsn[to.asn_no] = [];
            }
            tosByAsn[to.asn_no].push(to);
        }

        // Step 5: Create TO items based on ASN items, splitting across multiple TOs if needed
        for (const asnNo in tosByAsn) {
            const tosForAsn = tosByAsn[asnNo];
            const itemsForAsn = asnItems.filter(item => item.asn_no === asnNo);

            if (itemsForAsn.length === 0) {
                console.log(`⚠️  No ASN items found for ${asnNo}, skipping`);
                continue;
            }

            console.log(`\n📦 Processing ${asnNo} (${tosForAsn.length} Transfer Order(s)):`);
            console.log(`   Found ${itemsForAsn.length} items in ASN`);

            // If multiple TOs, split items across them
            // If single TO, allocate all items to it
            const numTOs = tosForAsn.length;

            for (const to of tosForAsn) {
                const toNo = to.to_no;
                console.log(`\n   Processing ${toNo}:`);

                for (const asnItem of itemsForAsn) {
                    const itemCode = asnItem.item_code;
                    const totalAsnQty = parseFloat(asnItem.total_qty);

                    // Calculate allocation per TO
                    // For multiple TOs, split evenly; for single TO, use all
                    let allocatedQty;
                    if (numTOs > 1) {
                        // Split: first TO gets floor, last TO gets remainder
                        const index = tosForAsn.indexOf(to);
                        if (index === 0) {
                            allocatedQty = Math.floor(totalAsnQty / numTOs);
                        } else if (index === numTOs - 1) {
                            // Last TO gets remainder
                            const alreadyAllocated = Math.floor(totalAsnQty / numTOs) * (numTOs - 1);
                            allocatedQty = totalAsnQty - alreadyAllocated;
                        } else {
                            allocatedQty = Math.floor(totalAsnQty / numTOs);
                        }
                    } else {
                        allocatedQty = totalAsnQty;
                    }

                    // Determine store based on item code pattern
                    let targetStore = 'STORE-001';
                    if (itemCode.includes('BLU')) {
                        targetStore = 'STORE-001';
                    } else if (itemCode.includes('BLK')) {
                        targetStore = 'STORE-002';
                    } else if (itemCode.includes('WHT') || itemCode.includes('GRY') || itemCode.includes('RED')) {
                        targetStore = 'STORE-003';
                    }

                    // For TO-0004 (Executing), set some progress
                    let sortedQty = 0;
                    let packedQty = 0;
                    if (toNo === 'TO-0004') {
                        // Some items are partially sorted/packed
                        if (itemCode.includes('BLK-32')) {
                            sortedQty = Math.floor(allocatedQty * 0.67); // 67% sorted
                            packedQty = Math.floor(allocatedQty * 0.5); // 50% packed
                        } else if (itemCode.includes('BLK-34')) {
                            sortedQty = Math.floor(allocatedQty * 0.75); // 75% sorted
                            packedQty = Math.floor(allocatedQty * 0.5); // 50% packed
                        } else if (itemCode.includes('GRY-M')) {
                            sortedQty = allocatedQty; // 100% sorted
                            packedQty = allocatedQty; // 100% packed
                        }
                    }

                    // For TO-0005 (Completed), set all as done
                    if (toNo === 'TO-0005') {
                        sortedQty = allocatedQty;
                        packedQty = allocatedQty;
                    }

                    const pendingQty = allocatedQty - packedQty;

                    await connection.execute(`
                        INSERT INTO tabTransferOrderItem 
                            (parent_title, store, item_code, allocated_qty, sorted_qty, packed_qty, pending_qty, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                    `, [toNo, targetStore, itemCode, allocatedQty, sortedQty, packedQty, pendingQty]);

                    console.log(`      ✅ ${itemCode}: ${allocatedQty}/${totalAsnQty} → ${targetStore} (Sorted: ${sortedQty}, Packed: ${packedQty})`);
                }

                // Update TO total_allocated_qty
                const [totalResult] = await connection.execute(`
                    SELECT COALESCE(SUM(allocated_qty), 0) as total
                    FROM tabTransferOrderItem
                    WHERE parent_title = ?
                `, [toNo]);

                await connection.execute(`
                    UPDATE tabTransferOrder
                    SET total_allocated_qty = ?
                    WHERE title = ?
                `, [totalResult[0].total, toNo]);

                console.log(`      📊 Total allocated for ${toNo}: ${totalResult[0].total}`);
            }
        }

        console.log('\n==========================================');
        console.log('✅ Transfer Order Items Fixed!');
        console.log('==========================================\n');

        // Step 5: Verify the fix
        console.log('🔍 Running verification...\n');
        const [verification] = await connection.execute(`
            SELECT 
                a.title as asn_no,
                d.item_code as asn_item,
                SUM(d.shipped_qty) as asn_qty,
                t.title as to_no,
                ti.item_code as to_item,
                SUM(ti.allocated_qty) as to_qty,
                CASE 
                    WHEN SUM(ti.allocated_qty) > SUM(d.shipped_qty) THEN '❌ TO exceeds'
                    WHEN SUM(ti.allocated_qty) = SUM(d.shipped_qty) THEN '✅ Match'
                    ELSE '⚠️ TO less'
                END as status
            FROM tabAdvanceShippingNotice a
            INNER JOIN tabAsnItemDetails d ON d.parent_title = a.title
            INNER JOIN tabTransferOrder t ON t.advance_shipping_notice = a.title
            LEFT JOIN tabTransferOrderItem ti ON ti.parent_title = t.title AND ti.item_code = d.item_code
            GROUP BY a.title, d.item_code, t.title, ti.item_code
            HAVING SUM(ti.allocated_qty) > SUM(d.shipped_qty) OR ti.item_code IS NULL
            ORDER BY a.title, t.title, d.item_code
        `);

        if (verification.length === 0) {
            console.log('✅ All items match correctly!');
        } else {
            console.log('⚠️  Found some mismatches:');
            console.table(verification);
        }

    } finally {
        await connection.end();
    }
}

fix().catch(console.error);

