# Backfill qty_before and qty_reduced - Results

## Summary

✅ **Backfill Script Executed Successfully!**

### Results
- **Total records processed:** 118
- **Successfully updated:** 5 records
- **Skipped (no transaction found):** 113 records

## How It Works

The script:
1. Finds all stock ledger entries with NULL `qty_before` or `qty_reduced`
2. For each entry, looks up the most recent transaction in `tabStockTransaction`
3. Extracts `qty_before` and `qty_change` from the transaction
4. Updates the stock ledger entry with these values

## Why Some Records Were Skipped

113 records were skipped because they don't have corresponding transactions in `tabStockTransaction`. This can happen when:
- Stock was created through direct database inserts (initial stock, imports, etc.)
- Transactions were not logged for some operations
- Records were created before transaction logging was implemented

## What Was Updated

5 records were successfully updated with `qty_before` and `qty_reduced` values from their most recent transactions. These are likely records that were created through normal dispatch/receive operations.

## Script Location

- **File:** `wms-api/backfill-qty-before-reduced.js`
- **Usage:** `node backfill-qty-before-reduced.js`

## Future Records

- All **new dispatches/receives** (after API server restart) will automatically populate `qty_before` and `qty_reduced`
- No manual backfill needed for new records

## Recommendation

The backfill script can be run anytime to update records that have transactions. Records without transactions will remain NULL, which is acceptable - they represent stock that was created outside the normal transaction flow.

