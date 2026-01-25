# Update Existing CARTON_MERGE Transactions Guide

## Overview
This script updates existing CARTON_MERGE transactions to the new two-transaction format (OUT + IN) so you can test the changes before creating new transactions.

## What It Does

1. **Finds existing CARTON_MERGE transactions** that only have IN (destination) transactions
2. **Creates missing OUT (source) transactions** for each item
3. **Updates existing IN transactions** to set `stock_direction = 'IN'` if needed

## Prerequisites

- Database connection configured in `wms-api/src/db/connection.js`
- Access to `tabStockTransaction` table
- Access to `tabRelocationSession` table (optional, for source carton lookup)

## Usage

### 1. Dry Run (Preview Changes)
```bash
node wms-api/update-carton-merge-transactions.js --dry-run
```

This will:
- Show what transactions will be created/updated
- **NOT make any changes** to the database
- Help you verify the logic before applying changes

### 2. Update All CARTON_MERGE Transactions
```bash
node wms-api/update-carton-merge-transactions.js
```

This will:
- Create missing OUT transactions
- Update existing IN transactions
- **Make actual changes** to the database

### 3. Update Specific Reference Document
```bash
node wms-api/update-carton-merge-transactions.js --reference-doc=RL-20260124-123456
```

This will:
- Only update transactions for the specified `reference_doc`
- Useful for testing on a specific relocation session

## How It Works

### Step 1: Find CARTON_MERGE Transactions
The script finds all `CARTON_MERGE` transactions in `tabStockTransaction` that:
- Have `transaction_type = 'CARTON_MERGE'`
- Don't have `stock_direction = 'OUT'` (or don't have stock_direction at all)
- These are likely the IN transactions that need corresponding OUT transactions

### Step 2: Determine Source Carton and Bin
For each transaction, the script tries to find the source carton and bin from:
1. **`from_carton` and `from_bin` columns** in `tabStockTransaction` (if they exist)
2. **`tabRelocationSession` table** (if available) - looks up by `reference_doc`
3. **`source_bin` column** (if `from_bin` not available)

### Step 3: Create OUT Transaction
For each missing OUT transaction, creates a new record with:
- `carton_id` = source carton (from_carton)
- `bin_location` = source bin (from_bin)
- `qty_change` = negative value (e.g., -25)
- `qty_before` = quantity that was in source carton (from IN transaction's qty_change)
- `qty_after` = 0 (source carton becomes empty)
- `stock_direction` = 'OUT'
- `from_carton` = source carton
- `to_carton` = destination carton (from existing IN transaction)
- `from_bin` = source bin
- `to_bin` = destination bin

### Step 4: Update IN Transaction
If the existing IN transaction doesn't have `stock_direction = 'IN'`, updates it.

## Example Output

### Dry Run:
```
=== Updating CARTON_MERGE Transactions to Two-Transaction Format ===

Mode: DRY RUN (no changes will be made)

Finding CARTON_MERGE transactions...
Found 4 CARTON_MERGE transaction(s)

Grouped into 2 unique reference_doc + item_code combination(s)

=== Summary ===
Transactions to create (OUT): 2
Transactions to update (IN): 2

=== Preview of Changes ===

Reference: RL-20260124-123456, Item: SKU-HAT-301-GRN-OS
  Existing (IN): carton=CTN-555445, bin=A1-R02-L2-B2, qty_change=25
  New (OUT):     carton=PAW-ASN365425486-..., bin=A1-R02-L1-B2, qty_change=-25

Reference: RL-20260124-123456, Item: SKU-HAT-301-BLU-OS
  Existing (IN): carton=CTN-555445, bin=A1-R02-L2-B2, qty_change=25
  New (OUT):     carton=PAW-ASN365425486-..., bin=A1-R02-L1-B2, qty_change=-25

DRY RUN: No changes made. Use without --dry-run to apply changes.
```

### Live Run:
```
=== Updating CARTON_MERGE Transactions to Two-Transaction Format ===

Mode: LIVE (will update database)

...

=== Applying Changes ===

  ✅ Created OUT transaction for RL-20260124-123456_SKU-HAT-301-GRN-OS
  ✅ Created OUT transaction for RL-20260124-123456_SKU-HAT-301-BLU-OS
  ✅ Updated transaction 12345 to stock_direction = 'IN'
  ✅ Updated transaction 12346 to stock_direction = 'IN'

=== Complete ===
Created 2 OUT transaction(s)
Updated 2 IN transaction(s)

Note: The database trigger will automatically create corresponding records in tabTransactionHistory.
```

## Verification

After running the script, verify the changes:

### 1. Check tabStockTransaction
```sql
SELECT 
  id,
  transaction_type,
  reference_doc,
  item_code,
  carton_id,
  bin_location,
  qty_change,
  qty_before,
  qty_after,
  stock_direction
FROM tabStockTransaction
WHERE transaction_type = 'CARTON_MERGE'
  AND reference_doc = 'RL-20260124-123456'
ORDER BY item_code, stock_direction;
```

Should show:
- 2 rows per item (OUT and IN)
- OUT: negative qty_change, qty_after = 0, stock_direction = 'OUT'
- IN: positive qty_change, qty_after > 0, stock_direction = 'IN'

### 2. Check tabTransactionHistory
```sql
SELECT 
  item_code,
  carton_id,
  bin_location,
  qty_change,
  qty_before,
  qty_after,
  stock_direction
FROM tabTransactionHistory
WHERE transaction_type = 'CARTON_MERGE'
  AND reference_doc = 'RL-20260124-123456'
ORDER BY item_code, stock_direction;
```

Should show the same 2 rows per item (automatically created by trigger).

### 3. Check Item Location Breakdown
Query the Item Location Breakdown API for the merged items:
- Should only show destination location (source location filtered out)
- Carton ID should match destination carton

## Troubleshooting

### Issue: "Cannot determine source carton"
**Cause:** The script couldn't find `from_carton` in the transaction or relocation session.

**Solution:**
- Check if `tabRelocationSession` has the session data
- Manually verify the source carton from transaction history
- The script will skip these transactions (they won't be updated)

### Issue: "Access denied for user"
**Cause:** Database credentials not configured.

**Solution:**
- Ensure `wms-api/src/db/connection.js` has correct database credentials
- Or set environment variables for database connection

### Issue: "Column doesn't exist"
**Cause:** Database schema doesn't have required columns.

**Solution:**
- The script checks for column existence dynamically
- Missing columns are handled gracefully (skipped)
- Ensure `stock_direction`, `from_carton`, `to_carton` columns exist if you want full functionality

## Notes

- The script is **idempotent** - safe to run multiple times
- It only creates OUT transactions for transactions that don't already have them
- The database trigger will automatically create corresponding records in `tabTransactionHistory`
- Always run with `--dry-run` first to preview changes

## Related Files

- Script: `wms-api/update-carton-merge-transactions.js`
- Implementation: `wms-api/src/modules/relocation/relocationController.js`
- Documentation: `CARTON_MERGE_TWO_TRANSACTION_FIX.md`
