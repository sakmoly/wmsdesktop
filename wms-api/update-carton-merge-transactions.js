import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env file from wms-api directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

import { getConnection } from './src/db/connection.js';

/**
 * Update Existing CARTON_MERGE Transactions to Two-Transaction Format
 * 
 * This script finds existing CARTON_MERGE transactions that only have IN (destination) 
 * transactions and creates the missing OUT (source) transactions.
 * 
 * Usage:
 *   node update-carton-merge-transactions.js [--dry-run] [--reference-doc REF_DOC]
 */

async function updateCartonMergeTransactions(options = {}) {
  const { dryRun = false, referenceDoc = null } = options;
  const connection = await getConnection();

  try {
    console.log('=== Updating CARTON_MERGE Transactions to Two-Transaction Format ===\n');
    console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (will update database)'}`);
    if (referenceDoc) console.log(`Filter: reference_doc = ${referenceDoc}`);
    console.log('');

    // Check if stock_direction column exists
    const [stockDirectionCol] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabStockTransaction'
        AND COLUMN_NAME = 'stock_direction'
    `);
    const hasStockDirection = stockDirectionCol.length > 0;
    console.log(`stock_direction column exists: ${hasStockDirection}`);

    // Check if from_carton and to_carton columns exist
    const [cartonCols] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabStockTransaction'
        AND COLUMN_NAME IN ('from_carton', 'to_carton', 'from_bin', 'to_bin', 'source_bin', 'target_bin')
    `);
    const hasFromCarton = cartonCols.some(col => col.COLUMN_NAME === 'from_carton');
    const hasToCarton = cartonCols.some(col => col.COLUMN_NAME === 'to_carton');
    const hasFromBin = cartonCols.some(col => col.COLUMN_NAME === 'from_bin');
    const hasToBin = cartonCols.some(col => col.COLUMN_NAME === 'to_bin');
    const hasSourceBin = cartonCols.some(col => col.COLUMN_NAME === 'source_bin');
    const hasTargetBin = cartonCols.some(col => col.COLUMN_NAME === 'target_bin');

    console.log(`from_carton column exists: ${hasFromCarton}`);
    console.log(`to_carton column exists: ${hasToCarton}`);
    console.log('');

    // Find CARTON_MERGE transactions that might need OUT transactions
    // We'll look for transactions that:
    // 1. Have transaction_type = 'CARTON_MERGE'
    // 2. Have positive qty_change (IN transaction) or no stock_direction
    // 3. Don't have a corresponding OUT transaction with same reference_doc and item_code
    
    let query = `
      SELECT 
        st.id,
        st.transaction_date,
        st.transaction_type,
        st.reference_doc,
        st.reference_doc_type,
        st.item_code,
        st.warehouse,
        st.bin_location,
        st.carton_id,
        st.qty_change,
        st.qty_before,
        st.qty_after,
        st.performed_by,
        st.created_at,
        ${hasStockDirection ? 'st.stock_direction,' : 'NULL as stock_direction,'}
        ${hasFromCarton ? 'st.from_carton,' : 'NULL as from_carton,'}
        ${hasToCarton ? 'st.to_carton,' : 'NULL as to_carton,'}
        ${hasFromBin ? 'st.from_bin' : 'NULL as from_bin'},
        ${hasToBin ? 'st.to_bin' : 'NULL as to_bin'},
        ${hasSourceBin ? 'st.source_bin' : 'NULL as source_bin'},
        ${hasTargetBin ? 'st.target_bin' : 'NULL as target_bin'}
      FROM tabStockTransaction st
      WHERE st.transaction_type = 'CARTON_MERGE'
        AND st.item_code IS NOT NULL
    `;

    const params = [];
    if (referenceDoc) {
      query += ' AND st.reference_doc = ?';
      params.push(referenceDoc);
    }

    // Only get transactions that don't have stock_direction = 'OUT' (or don't have stock_direction at all)
    // These are likely the IN transactions that need corresponding OUT transactions
    if (hasStockDirection) {
      query += ` AND (st.stock_direction IS NULL OR st.stock_direction != 'OUT' OR st.stock_direction = 'IN')`;
    }

    query += ' ORDER BY st.reference_doc, st.item_code, st.transaction_date';

    console.log('Finding CARTON_MERGE transactions...');
    const [transactions] = await connection.execute(query, params);
    console.log(`Found ${transactions.length} CARTON_MERGE transaction(s)\n`);

    if (transactions.length === 0) {
      console.log('No CARTON_MERGE transactions found. Nothing to update.');
      return;
    }

    // Group transactions by reference_doc and item_code
    // For each group, check if we have both OUT and IN, or just IN
    const transactionGroups = new Map();
    
    for (const txn of transactions) {
      const key = `${txn.reference_doc}_${txn.item_code}`;
      if (!transactionGroups.has(key)) {
        transactionGroups.set(key, []);
      }
      transactionGroups.get(key).push(txn);
    }

    console.log(`Grouped into ${transactionGroups.size} unique reference_doc + item_code combination(s)\n`);

    let transactionsToCreate = [];
    let transactionsToUpdate = [];

    // For each group, determine if we need to create OUT transactions
    for (const [key, groupTxns] of transactionGroups) {
      // Check if we already have an OUT transaction
      const hasOut = groupTxns.some(txn => 
        hasStockDirection ? (txn.stock_direction === 'OUT') : false
      );

      // If we don't have OUT, we need to create one
      // Use the first transaction in the group as the base (should be the IN transaction)
      if (!hasOut && groupTxns.length > 0) {
        const baseTxn = groupTxns[0]; // Use first transaction as base
        
        // Determine source carton and bin
        // Priority: from_carton/from_bin > source_bin > infer from transaction
        let sourceCarton = null;
        let sourceBin = null;
        
        if (hasFromCarton && baseTxn.from_carton) {
          sourceCarton = baseTxn.from_carton;
        }
        
        if (hasFromBin && baseTxn.from_bin) {
          sourceBin = baseTxn.from_bin;
        } else if (hasSourceBin && baseTxn.source_bin) {
          sourceBin = baseTxn.source_bin;
        }

        // If we have to_carton, the source might be different
        // For CARTON_MERGE, the current carton_id is the destination (to_carton)
        // We need to find the source carton from relocation session or infer it
        
        // Try to get source carton from relocation session
        if (!sourceCarton && baseTxn.reference_doc) {
          try {
            const [relocationSessions] = await connection.execute(`
              SELECT from_carton, from_bin, to_carton, to_bin
              FROM tabRelocationSession
              WHERE session_id = ?
              LIMIT 1
            `, [baseTxn.reference_doc]);
            
            if (relocationSessions.length > 0) {
              const session = relocationSessions[0];
              sourceCarton = session.from_carton || sourceCarton;
              sourceBin = session.from_bin || sourceBin;
            }
          } catch (err) {
            // Table might not exist, ignore
            console.log(`  ⚠️  Could not query tabRelocationSession: ${err.message}`);
          }
        }

        // If we still don't have source carton, we can't create OUT transaction
        if (!sourceCarton) {
          console.log(`  ⚠️  Skipping ${key}: Cannot determine source carton`);
          continue;
        }

        // Determine source qty_before (qty that was in source carton before merge)
        // This should be the qty_change of the IN transaction (positive value)
        const sourceQtyBefore = Math.abs(baseTxn.qty_change) || baseTxn.qty_after || 0;
        const sourceQtyAfter = 0; // Source carton becomes empty

        // Create OUT transaction
        const outTxn = {
          transaction_date: baseTxn.transaction_date,
          transaction_type: 'CARTON_MERGE',
          reference_doc_type: baseTxn.reference_doc_type || 'Relocation Session',
          reference_doc: baseTxn.reference_doc,
          warehouse: baseTxn.warehouse,
          item_code: baseTxn.item_code,
          bin_location: sourceBin || baseTxn.bin_location, // Use source bin
          carton_id: sourceCarton, // Source carton
          qty_change: -Math.abs(baseTxn.qty_change), // Negative for OUT
          qty_before: sourceQtyBefore,
          qty_after: sourceQtyAfter,
          performed_by: baseTxn.performed_by || 'SYSTEM',
          created_at: baseTxn.created_at || new Date(),
          stock_direction: 'OUT',
          from_carton: sourceCarton,
          to_carton: baseTxn.carton_id, // Destination carton
          from_bin: sourceBin,
          to_bin: baseTxn.bin_location // Destination bin
        };

        transactionsToCreate.push({
          key,
          baseTxn,
          outTxn
        });

        // Also mark the existing IN transaction to update stock_direction if needed
        if (hasStockDirection && baseTxn.stock_direction !== 'IN') {
          transactionsToUpdate.push({
            id: baseTxn.id,
            stock_direction: 'IN'
          });
        }
      } else if (hasOut) {
        console.log(`  ✅ ${key}: Already has OUT transaction`);
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Transactions to create (OUT): ${transactionsToCreate.length}`);
    console.log(`Transactions to update (IN): ${transactionsToUpdate.length}\n`);

    if (transactionsToCreate.length === 0 && transactionsToUpdate.length === 0) {
      console.log('No updates needed. All CARTON_MERGE transactions already have OUT + IN pairs.');
      return;
    }

    // Show preview
    console.log('=== Preview of Changes ===\n');
    for (const { key, baseTxn, outTxn } of transactionsToCreate) {
      console.log(`Reference: ${baseTxn.reference_doc}, Item: ${baseTxn.item_code}`);
      console.log(`  Existing (IN): carton=${baseTxn.carton_id}, bin=${baseTxn.bin_location}, qty_change=${baseTxn.qty_change}`);
      console.log(`  New (OUT):     carton=${outTxn.carton_id}, bin=${outTxn.bin_location}, qty_change=${outTxn.qty_change}`);
      console.log('');
    }

    if (dryRun) {
      console.log('DRY RUN: No changes made. Use without --dry-run to apply changes.');
      return;
    }

    // Apply changes
    console.log('=== Applying Changes ===\n');

    // Get column information for dynamic INSERT
    const [allCols] = await connection.execute(`
      SELECT COLUMN_NAME, IS_NULLABLE, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabStockTransaction'
        AND COLUMN_NAME IN (
          'transaction_date', 'transaction_type', 'reference_doc_type', 'reference_doc',
          'warehouse', 'item_code', 'bin_location', 'carton_id',
          'qty_change', 'qty_before', 'qty_after', 'performed_by', 'created_at',
          'stock_direction', 'from_carton', 'to_carton', 'from_bin', 'to_bin',
          'source_bin', 'target_bin'
        )
    `);

    const colMap = new Map();
    for (const col of allCols) {
      colMap.set(col.COLUMN_NAME, col);
    }

    let createdCount = 0;
    let updatedCount = 0;

    // Create OUT transactions
    for (const { key, outTxn } of transactionsToCreate) {
      try {
        const fields = [];
        const values = [];
        const placeholders = [];

        // Required fields
        if (colMap.has('transaction_date')) {
          fields.push('transaction_date');
          values.push(outTxn.transaction_date);
          placeholders.push('?');
        }
        if (colMap.has('transaction_type')) {
          fields.push('transaction_type');
          values.push(outTxn.transaction_type);
          placeholders.push('?');
        }
        if (colMap.has('reference_doc')) {
          fields.push('reference_doc');
          values.push(outTxn.reference_doc);
          placeholders.push('?');
        }
        if (colMap.has('reference_doc_type')) {
          fields.push('reference_doc_type');
          values.push(outTxn.reference_doc_type);
          placeholders.push('?');
        }
        if (colMap.has('warehouse')) {
          fields.push('warehouse');
          values.push(outTxn.warehouse);
          placeholders.push('?');
        }
        if (colMap.has('item_code')) {
          fields.push('item_code');
          values.push(outTxn.item_code);
          placeholders.push('?');
        }
        if (colMap.has('bin_location')) {
          fields.push('bin_location');
          values.push(outTxn.bin_location);
          placeholders.push('?');
        }
        if (colMap.has('carton_id')) {
          fields.push('carton_id');
          values.push(outTxn.carton_id);
          placeholders.push('?');
        }
        if (colMap.has('qty_change')) {
          fields.push('qty_change');
          values.push(outTxn.qty_change);
          placeholders.push('?');
        }
        if (colMap.has('qty_before')) {
          fields.push('qty_before');
          values.push(outTxn.qty_before);
          placeholders.push('?');
        }
        if (colMap.has('qty_after')) {
          fields.push('qty_after');
          values.push(outTxn.qty_after);
          placeholders.push('?');
        }
        if (colMap.has('performed_by')) {
          fields.push('performed_by');
          values.push(outTxn.performed_by);
          placeholders.push('?');
        }
        if (colMap.has('created_at')) {
          fields.push('created_at');
          values.push(outTxn.created_at);
          placeholders.push('?');
        }

        // Optional fields
        if (hasStockDirection && colMap.has('stock_direction')) {
          fields.push('stock_direction');
          values.push(outTxn.stock_direction);
          placeholders.push('?');
        }
        if (hasFromCarton && colMap.has('from_carton')) {
          fields.push('from_carton');
          values.push(outTxn.from_carton);
          placeholders.push('?');
        }
        if (hasToCarton && colMap.has('to_carton')) {
          fields.push('to_carton');
          values.push(outTxn.to_carton);
          placeholders.push('?');
        }
        if (hasFromBin && colMap.has('from_bin')) {
          fields.push('from_bin');
          values.push(outTxn.from_bin);
          placeholders.push('?');
        }
        if (hasToBin && colMap.has('to_bin')) {
          fields.push('to_bin');
          values.push(outTxn.to_bin);
          placeholders.push('?');
        }

        await connection.execute(`
          INSERT INTO tabStockTransaction (${fields.join(', ')})
          VALUES (${placeholders.join(', ')})
        `, values);

        createdCount++;
        console.log(`  ✅ Created OUT transaction for ${key}`);
      } catch (err) {
        console.error(`  ❌ Error creating OUT transaction for ${key}: ${err.message}`);
      }
    }

    // Update existing IN transactions to set stock_direction = 'IN'
    for (const { id, stock_direction } of transactionsToUpdate) {
      try {
        await connection.execute(`
          UPDATE tabStockTransaction
          SET stock_direction = ?
          WHERE id = ?
        `, [stock_direction, id]);
        updatedCount++;
        console.log(`  ✅ Updated transaction ${id} to stock_direction = 'IN'`);
      } catch (err) {
        console.error(`  ❌ Error updating transaction ${id}: ${err.message}`);
      }
    }

    console.log(`\n=== Complete ===`);
    console.log(`Created ${createdCount} OUT transaction(s)`);
    console.log(`Updated ${updatedCount} IN transaction(s)`);
    console.log('\nNote: The database trigger will automatically create corresponding records in tabTransactionHistory.');

  } catch (error) {
    console.error('Error updating CARTON_MERGE transactions:', error);
    throw error;
  } finally {
    await connection.release();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  referenceDoc: args.find(arg => arg.startsWith('--reference-doc='))?.split('=')[1] || null
};

// Run the update
updateCartonMergeTransactions(options)
  .then(() => {
    console.log('\n✅ Update complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Update failed:', error);
    process.exit(1);
  });
