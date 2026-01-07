// Complete test script: Material Request → Picking → Transfer Carton → Dispatch → Stock Reduction
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function completeTest() {
  console.log('==========================================');
  console.log('Complete Material Request Flow Test');
  console.log('==========================================\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'wms_desktop'
  });

  try {
    // Step 1: Find a Material Request with items
    console.log('Step 1: Finding Material Request with items...');
    const [mrList] = await connection.execute(`
      SELECT title, status, from_warehouse, to_showroom, total_requested_qty, total_picked_qty
      FROM tabMaterialRequest
      ORDER BY created_at DESC
      LIMIT 5
    `);

    if (mrList.length === 0) {
      console.log('❌ No Material Requests found. Please create one first.');
      await connection.end();
      return;
    }

    console.log(`Found ${mrList.length} Material Request(s):`);
    mrList.forEach(mr => {
      console.log(`  - ${mr.title}: Status=${mr.status}, Requested=${mr.total_requested_qty}, Picked=${mr.total_picked_qty}`);
    });

    // Use the first Material Request that has items
    let materialRequest = null;
    for (const mr of mrList) {
      const [items] = await connection.execute(`
        SELECT COUNT(*) as item_count, SUM(requested_qty) as total_qty
        FROM tabMaterialRequestItem
        WHERE parent_title = ?
      `, [mr.title]);

      if (items[0].item_count > 0) {
        materialRequest = mr.title;
        console.log(`\n✅ Using Material Request: ${materialRequest}`);
        console.log(`   Items: ${items[0].item_count}, Total Qty: ${items[0].total_qty}`);
        break;
      }
    }

    if (!materialRequest) {
      console.log('❌ No Material Request with items found.');
      await connection.end();
      return;
    }

    // Step 2: Get Material Request items
    console.log('\nStep 2: Getting Material Request items...');
    const [mrItems] = await connection.execute(`
      SELECT item_code, requested_qty, picked_qty, status
      FROM tabMaterialRequestItem
      WHERE parent_title = ?
    `, [materialRequest]);

    console.log(`Found ${mrItems.length} item(s):`);
    mrItems.forEach(item => {
      console.log(`  - ${item.item_code}: Requested=${item.requested_qty}, Picked=${item.picked_qty}, Status=${item.status}`);
    });

    // Step 3: Get Material Request details
    const [mrDetails] = await connection.execute(`
      SELECT title, status, from_warehouse, to_showroom
      FROM tabMaterialRequest
      WHERE title = ?
    `, [materialRequest]);
    const warehouse = mrDetails[0].from_warehouse;

    // Step 4: Check stock BEFORE dispatch
    console.log('\nStep 3: Checking stock BEFORE dispatch...');
    const stockBefore = {};
    for (const item of mrItems) {
      const [stock] = await connection.execute(`
        SELECT bin_location, qty
        FROM tabStockLedger
        WHERE item_code = ? AND warehouse = ?
        ORDER BY qty DESC
        LIMIT 5
      `, [item.item_code, warehouse]);

      const totalStock = stock.reduce((sum, s) => sum + parseFloat(s.qty), 0);
      stockBefore[item.item_code] = {
        bins: stock.map(s => ({ bin: s.bin_location, qty: parseFloat(s.qty) })),
        total: totalStock
      };

      console.log(`  ${item.item_code}:`);
      stock.forEach(s => {
        console.log(`    ${s.bin_location}: ${parseFloat(s.qty)}`);
      });
      console.log(`    Total: ${totalStock}`);
    }

    // Step 5: Find Transfer Carton for this Material Request
    console.log('\nStep 4: Finding Transfer Carton for Material Request...');
    const [tcs] = await connection.execute(`
      SELECT tc_id, status, to_no, created_on, sealed_on, dispatched_on
      FROM tabTransferCarton
      WHERE to_no = ?
      ORDER BY created_on DESC
    `, [materialRequest]);

    if (tcs.length === 0) {
      console.log(`❌ No Transfer Carton found for Material Request ${materialRequest}`);
      console.log('   Please create and seal a Transfer Carton first.');
      await connection.end();
      return;
    }

    console.log(`Found ${tcs.length} Transfer Carton(s):`);
    tcs.forEach(tc => {
      console.log(`  - ${tc.tc_id}: Status=${tc.status}, Sealed=${tc.sealed_on ? 'Yes' : 'No'}, Dispatched=${tc.dispatched_on ? 'Yes' : 'No'}`);
    });

    // Find a sealed but not dispatched transfer carton
    const sealedTC = tcs.find(tc => tc.status === 'Sealed' && !tc.dispatched_on);
    
    if (!sealedTC) {
      console.log(`\n⚠️  No sealed (undispatched) Transfer Carton found.`);
      console.log('   Checking if any Transfer Carton is already dispatched...');
      
      const dispatchedTC = tcs.find(tc => tc.status === 'Dispatched');
      if (dispatchedTC) {
        console.log(`\n✅ Found dispatched Transfer Carton: ${dispatchedTC.tc_id}`);
        console.log('   Checking stock AFTER dispatch...\n');
        
        // Check stock AFTER dispatch
        const stockAfter = {};
        for (const item of mrItems) {
          const [stock] = await connection.execute(`
            SELECT bin_location, qty
            FROM tabStockLedger
            WHERE item_code = ? AND warehouse = ?
            ORDER BY qty DESC
            LIMIT 5
          `, [item.item_code, warehouse]);

          const totalStock = stock.reduce((sum, s) => sum + parseFloat(s.qty), 0);
          stockAfter[item.item_code] = {
            bins: stock.map(s => ({ bin: s.bin_location, qty: parseFloat(s.qty) })),
            total: totalStock
          };

          console.log(`  ${item.item_code}:`);
          stock.forEach(s => {
            console.log(`    ${s.bin_location}: ${parseFloat(s.qty)}`);
          });
          console.log(`    Total: ${totalStock}`);
          console.log(`    Change: ${stockBefore[item.item_code].total - totalStock} (should be negative if stock reduced)`);
        }

        // Check stock transactions
        console.log('\nStep 5: Checking Stock Transactions...');
        const [transactions] = await connection.execute(`
          SELECT transaction_date, transaction_type, reference_doc, item_code, bin_location, qty_change, qty_before, qty_after
          FROM tabStockTransaction
          WHERE reference_doc = ?
            AND transaction_type = 'Dispatch'
          ORDER BY transaction_date DESC
        `, [dispatchedTC.tc_id]);

        if (transactions.length === 0) {
          console.log(`  ❌ No Dispatch transactions found for ${dispatchedTC.tc_id}`);
        } else {
          console.log(`  ✅ Found ${transactions.length} Dispatch transaction(s):`);
          transactions.forEach(t => {
            console.log(`    ${t.item_code} at ${t.bin_location}: ${t.qty_before} → ${t.qty_after} (${t.qty_change})`);
          });
        }

        await connection.end();
        return;
      } else {
        console.log('   Please create and seal a Transfer Carton first.');
        await connection.end();
        return;
      }
    }

    const tcId = sealedTC.tc_id;
    console.log(`\n✅ Using Transfer Carton: ${tcId}`);

    // Step 6: Get items in Transfer Carton
    console.log('\nStep 5: Getting items in Transfer Carton...');
    const tcCreatedOn = sealedTC.created_on;
    const startTime = new Date(tcCreatedOn);
    startTime.setHours(startTime.getHours() - 6);
    const endTime = new Date();

    // Check which columns exist for source bin
    const [eventCols] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabWmsScanEvent' 
      AND COLUMN_NAME IN ('rack', 'bin', 'location_id', 'source_bin')
    `);
    const eventColumnNames = new Set(eventCols.map(row => row.COLUMN_NAME));
    const hasRack = eventColumnNames.has('rack');
    const hasBin = eventColumnNames.has('bin');
    const hasLocationId = eventColumnNames.has('location_id');
    const hasSourceBin = eventColumnNames.has('source_bin');

    let sourceBinExpr = 'NULL as source_bin';
    if (hasSourceBin) {
      sourceBinExpr = 'source_bin';
    } else if (hasLocationId) {
      sourceBinExpr = 'location_id';
    } else if (hasRack && hasBin) {
      sourceBinExpr = "CONCAT_WS('-', rack, bin)";
    } else if (hasRack) {
      sourceBinExpr = 'rack';
    } else if (hasBin) {
      sourceBinExpr = 'bin';
    }

    const [tcItems] = await connection.execute(`
      SELECT 
        item_code,
        ${sourceBinExpr} as source_bin,
        SUM(qty) as total_qty
      FROM tabWmsScanEvent
      WHERE (tc_id = ? OR (transfer_order = ? AND event_time >= ? AND event_time <= ?))
        AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
        AND item_code IS NOT NULL
        AND qty > 0
      GROUP BY item_code, ${sourceBinExpr.replace(' as source_bin', '')}
    `, [tcId, materialRequest, startTime, endTime]);

    console.log(`Found ${tcItems.length} item(s) in Transfer Carton:`);
    tcItems.forEach(item => {
      console.log(`  - ${item.item_code}: ${parseFloat(item.total_qty)} at ${item.source_bin || 'N/A'}`);
    });

    if (tcItems.length === 0) {
      console.log('❌ No items found in Transfer Carton. Cannot test dispatch.');
      await connection.end();
      return;
    }

    // Step 7: Simulate Dispatch (Update status and reduce stock)
    console.log('\nStep 6: Testing Dispatch...');
    console.log('⚠️  This will actually dispatch the Transfer Carton and reduce stock!');
    console.log('   To test without making changes, set TEST_MODE=true\n');

    if (process.env.TEST_MODE === 'true') {
      console.log('✅ TEST_MODE enabled - Skipping actual dispatch');
    } else {
      console.log('📋 Dispatch Process:');
      console.log('   1. Update transfer carton status to "Dispatched"');
      console.log('   2. Reduce stock from source bins');
      console.log('   3. Create stock transaction entries');
      console.log('   4. Update tabItem.stock_qty\n');

      await connection.beginTransaction();

      try {
        // Update status
        await connection.execute(`
          UPDATE tabTransferCarton 
          SET status = 'Dispatched',
              dispatched_by = 'TEST_USER',
              dispatched_on = NOW(),
              updated_on = NOW()
          WHERE tc_id = ?
        `, [tcId]);

        console.log('   ✅ Status updated to "Dispatched"');

        // Reduce stock for each item
        for (const item of tcItems) {
          const itemCode = item.item_code;
          const qty = parseFloat(item.total_qty);
          let sourceBin = item.source_bin;

          // Get source bin from picking events if not available
          if (!sourceBin) {
            const sourceBinCol = sourceBinExpr.replace(' as source_bin', '');
            const [pickingEvents] = await connection.execute(`
              SELECT ${sourceBinExpr} as source_bin
              FROM tabWmsScanEvent
              WHERE transfer_order = ?
                AND item_code = ?
                AND event_type IN ('PICK_ITEM', 'SORT_TO_BOX', 'PACK_BOX_TO_TC')
                AND event_time <= ?
                AND ${sourceBinCol} IS NOT NULL
              ORDER BY event_time DESC
              LIMIT 1
            `, [materialRequest, itemCode, endTime]);

            if (pickingEvents.length > 0) {
              sourceBin = pickingEvents[0].source_bin;
            }
          }

          if (sourceBin && qty > 0) {
            // Get current stock
            const [currentStock] = await connection.execute(`
              SELECT qty, reserved_qty
              FROM tabStockLedger
              WHERE item_code = ? AND warehouse = ? AND bin_location = ?
            `, [itemCode, warehouse, sourceBin]);

            if (currentStock.length > 0) {
              const currentQty = parseFloat(currentStock[0].qty);
              const currentReservedQty = parseFloat(currentStock[0].reserved_qty);
              const newQty = currentQty - qty;

              if (currentQty >= qty) {
                // Update stock ledger
                await connection.execute(`
                  INSERT INTO tabStockLedger 
                  (item_code, warehouse, bin_location, qty, reserved_qty,
                   last_transaction_date, last_transaction_type, last_transaction_ref,
                   updated_at, created_at)
                  VALUES (?, ?, ?, ?, ?,
                          NOW(), 'Dispatch', ?,
                          NOW(), NOW())
                  ON DUPLICATE KEY UPDATE
                    qty = ?,
                    last_transaction_date = NOW(),
                    last_transaction_type = 'Dispatch',
                    last_transaction_ref = ?,
                    updated_at = NOW()
                `, [itemCode, warehouse, sourceBin, newQty, currentReservedQty, tcId, newQty, tcId]);

                // Insert transaction
                await connection.execute(`
                  INSERT INTO tabStockTransaction 
                  (transaction_date, transaction_type, reference_doc_type, reference_doc,
                   item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
                   source_bin, target_bin, performed_by, created_at)
                  VALUES 
                  (NOW(), 'Dispatch', 'Transfer Carton', ?,
                   ?, ?, ?, ?, ?, ?,
                   ?, NULL, 'TEST_USER', NOW())
                `, [tcId, itemCode, warehouse, sourceBin, -qty, currentQty, newQty, sourceBin]);

                // Update tabItem.stock_qty
                const [stockSum] = await connection.execute(`
                  SELECT COALESCE(SUM(qty), 0) as total_qty
                  FROM tabStockLedger
                  WHERE item_code = ? AND warehouse = ?
                `, [itemCode, warehouse]);

                const totalStockQty = parseFloat(stockSum[0].total_qty);
                await connection.execute(`
                  UPDATE tabItem
                  SET stock_qty = ?,
                      updated_at = NOW()
                  WHERE code = ?
                `, [totalStockQty, itemCode]);

                console.log(`   ✅ Reduced stock for ${itemCode} at ${sourceBin}: ${currentQty} → ${newQty}`);
              } else {
                console.log(`   ⚠️  Insufficient stock for ${itemCode} at ${sourceBin}. Available: ${currentQty}, Required: ${qty}`);
              }
            } else {
              console.log(`   ⚠️  No stock found for ${itemCode} at ${sourceBin}`);
            }
          } else {
            console.log(`   ⚠️  Cannot reduce stock for ${itemCode}: source_bin not found or qty is 0`);
          }
        }

        await connection.commit();
        console.log('\n   ✅ Dispatch completed successfully!');
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    // Step 8: Check stock AFTER dispatch
    console.log('\nStep 7: Checking stock AFTER dispatch...');
    const stockAfter = {};
    for (const item of mrItems) {
      const [stock] = await connection.execute(`
        SELECT bin_location, qty
        FROM tabStockLedger
        WHERE item_code = ? AND warehouse = ?
        ORDER BY qty DESC
        LIMIT 5
      `, [item.item_code, warehouse]);

      const totalStock = stock.reduce((sum, s) => sum + parseFloat(s.qty), 0);
      stockAfter[item.item_code] = {
        bins: stock.map(s => ({ bin: s.bin_location, qty: parseFloat(s.qty) })),
        total: totalStock
      };

      console.log(`  ${item.item_code}:`);
      stock.forEach(s => {
        console.log(`    ${s.bin_location}: ${parseFloat(s.qty)}`);
      });
      console.log(`    Total: ${totalStock}`);
      
      if (stockBefore[item.item_code]) {
        const change = stockBefore[item.item_code].total - totalStock;
        console.log(`    Change: ${change} (${change > 0 ? '✅ Stock reduced' : change < 0 ? '❌ Stock increased' : '⚠️  No change'})`);
      }
    }

    // Step 9: Check stock transactions
    console.log('\nStep 8: Checking Stock Transactions...');
    const [transactions] = await connection.execute(`
      SELECT transaction_date, transaction_type, reference_doc, item_code, bin_location, qty_change, qty_before, qty_after
      FROM tabStockTransaction
      WHERE reference_doc = ?
        AND transaction_type = 'Dispatch'
      ORDER BY transaction_date DESC
    `, [tcId]);

    if (transactions.length === 0) {
      console.log(`  ⚠️  No Dispatch transactions found for ${tcId}`);
    } else {
      console.log(`  ✅ Found ${transactions.length} Dispatch transaction(s):`);
      transactions.forEach(t => {
        console.log(`    ${t.item_code} at ${t.bin_location}: ${t.qty_before} → ${t.qty_after} (${t.qty_change})`);
      });
    }

    // Step 10: Check tabItem.stock_qty
    console.log('\nStep 9: Checking tabItem.stock_qty...');
    for (const item of mrItems) {
      const [itemData] = await connection.execute(`
        SELECT code, stock_qty
        FROM tabItem
        WHERE code = ?
      `, [item.item_code]);

      if (itemData.length > 0) {
        const stockQty = parseFloat(itemData[0].stock_qty);
        console.log(`  ${item.item_code}: stock_qty = ${stockQty}`);
        
        if (stockAfter[item.item_code]) {
          const ledgerTotal = stockAfter[item.item_code].total;
          if (Math.abs(stockQty - ledgerTotal) < 0.01) {
            console.log(`    ✅ Matches ledger total (${ledgerTotal})`);
          } else {
            console.log(`    ⚠️  Does not match ledger total (${ledgerTotal})`);
          }
        }
      }
    }

    console.log('\n==========================================');
    console.log('Test Complete!');
    console.log('==========================================');

  } catch (error) {
    console.error('\n❌ Error during test:', error);
    console.error(error.stack);
  } finally {
    await connection.end();
  }
}

completeTest();

