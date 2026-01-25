# CARTON_MERGE Two-Transaction Implementation

## Overview
Modified the CARTON_MERGE transaction recording to create **TWO transactions per item** instead of one:
1. **OUT transaction** from source carton (negative qty_change, qty_after = 0)
2. **IN transaction** to destination carton (positive qty_change, qty_after = new qty)

This ensures proper ledger accounting and fixes the Item Location Breakdown issue where old carton locations were still showing after merge.

## Problem
Previously, CARTON_MERGE only created one transaction per item (for the destination carton). This caused:
- Item Location Breakdown showing both old and new locations
- Unclear audit trail (no explicit OUT transaction)
- Incorrect `qty_after` values in transaction history

## Solution
For each item in a CARTON_MERGE operation, create two transactions:

### Transaction 1: Source Carton (OUT)
```sql
- carton_id: FROM carton (e.g., PAW-ASN365425486-...)
- bin_location: FROM bin (e.g., A1-R02-L1-B2)
- qty_change: -25 (negative)
- qty_before: 25 (qty in source carton before merge)
- qty_after: 0 (source carton becomes empty)
- stock_direction: OUT
- transaction_type: CARTON_MERGE
```

### Transaction 2: Destination Carton (IN)
```sql
- carton_id: TO carton (e.g., CTN-555445)
- bin_location: TO bin (e.g., A1-R02-L2-B2)
- qty_change: +25 (positive)
- qty_before: 0 (or existing qty in TO carton before merge)
- qty_after: 25 (or existing + 25)
- stock_direction: IN
- transaction_type: CARTON_MERGE
```

## Implementation Details

### File Modified
- `wms-api/src/modules/relocation/relocationController.js`
- Function: `commitFullCartonMove`
- Section: CARTON_MERGE transaction history insertion (lines ~2270-2500)

### Key Changes

1. **Capture destination qty_before before merge** (line ~1607-1622):
   - Query `tabCartonStock` for destination carton quantities BEFORE merge
   - Store in `destCartonQtysBeforeMerge` Map
   - This ensures accurate `qty_before` for the IN transaction

2. **Create two transactions per item** (line ~2290-2500):
   - **Source transaction (OUT)**:
     - `carton_id` = `session.from_carton`
     - `bin_location` = `session.from_bin`
     - `qty_change` = `-item.qty` (negative)
     - `qty_before` = `item.qty` (from `movedItemsForHistory`)
     - `qty_after` = `0`
     - `stock_direction` = `'OUT'`
   
   - **Destination transaction (IN)**:
     - `carton_id` = `actualToCarton`
     - `bin_location` = `session.to_bin`
     - `qty_change` = `+item.qty` (positive)
     - `qty_before` = `destQtyBefore` (from `destCartonQtysBeforeMerge`)
     - `qty_after` = `destQtyBefore + item.qty`
     - `stock_direction` = `'IN'`

3. **Optimized column detection**:
   - Check `stock_direction` column existence once before the loop
   - Reuse `hasStockDirection` flag for both transactions

## Benefits

1. **Clear Audit Trail**: Explicit OUT and IN transactions show the complete movement
2. **Correct Item Location Breakdown**: Source location shows `qty_after = 0` and is filtered out
3. **Proper Ledger Accounting**: Matches double-entry bookkeeping principles
4. **Delta Sum Compatibility**: Works with both `qty_after` snapshot and delta-sum approaches

## Testing

After implementation, verify:

1. **Transaction History**:
   ```sql
   SELECT item_code, carton_id, bin_location, qty_change, qty_before, qty_after, stock_direction
   FROM tabTransactionHistory
   WHERE transaction_type = 'CARTON_MERGE'
   ORDER BY transaction_date DESC, item_code, stock_direction;
   ```
   - Should show 2 rows per item (OUT and IN)
   - OUT: negative qty_change, qty_after = 0
   - IN: positive qty_change, qty_after > 0

2. **Item Location Breakdown**:
   - Query Item Location Breakdown API for merged items
   - Should only show destination location (source location filtered out)
   - Carton ID should match destination carton

3. **Stock Ledger**:
   - Source bin should have qty = 0 (or entry removed)
   - Destination bin should have correct qty

## Backup
Backup created: `relocationController.js.backup_20260124_161913.js`

## Related Issues
- Item Location Breakdown showing old carton at old location after merge
- Transaction history not clearly showing OUT movement
- Delta sum calculation for current stock
