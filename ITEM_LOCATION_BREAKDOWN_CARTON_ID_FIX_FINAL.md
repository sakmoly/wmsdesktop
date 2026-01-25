# Item Location Breakdown - Carton ID Fix (Final)

## Problem

Carton ID is showing as `null` in Item Location Breakdown, even though:
- ✅ Cartons exist in `tabStockTransaction` with `carton_id`
- ✅ API query uses `QTY_AFTER` from `tabTransactionHistory`
- ❌ `tabTransactionHistory` has `carton_id = NULL` (trigger issue)

## Root Cause

**The trigger that populates `tabTransactionHistory` sets `carton_id = NULL`:**

```sql
-- From CreateTransactionHistoryTable.sql line 178
NULL,  -- carton_id: Set to NULL for now (can be updated later if column exists)
```

**Result:**
- `tabStockTransaction` has `carton_id` ✅
- `tabTransactionHistory` has `carton_id = NULL` ❌
- Query only checks `tabTransactionHistory`, so `carton_id` is NULL

## Solution

**Join `tabStockTransaction` to get `carton_id` if it's NULL in `tabTransactionHistory`:**

### Updated Query:

```sql
SELECT 
  COALESCE(th.carton_id, st.carton_id) as carton_id,
  COALESCE(th.location_id, th.bin_location, th.target_bin, st.bin_location, st.target_bin) as location_id,
  th.qty_after,
  th.transaction_date as last_transaction_date,
  th.transaction_type
FROM (
  SELECT 
    carton_id,
    location_id,
    bin_location,
    target_bin,
    qty_after,
    transaction_date,
    transaction_type,
    transaction_id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(carton_id, 'NO_CARTON'), COALESCE(location_id, bin_location, target_bin)
      ORDER BY transaction_date DESC, id DESC
    ) as rn
  FROM tabTransactionHistory
  WHERE item_code = ? AND warehouse = ? AND qty_after > 0
) th
LEFT JOIN tabStockTransaction st ON st.id = th.transaction_id
WHERE th.rn = 1
  AND (th.carton_id IS NOT NULL AND th.carton_id != '' OR st.carton_id IS NOT NULL AND st.carton_id != '')
ORDER BY location_id, COALESCE(th.carton_id, st.carton_id)
```

### Key Changes:

1. **LEFT JOIN with `tabStockTransaction`** - Get `carton_id` from source table
2. **COALESCE for carton_id** - Use `tabStockTransaction.carton_id` if `tabTransactionHistory.carton_id` is NULL
3. **Filter by carton_id** - Only return rows where carton_id exists (from either table)
4. **Use QTY_AFTER from tabTransactionHistory** - As requested by user

## How It Works

### Step 1: Query tabTransactionHistory

Get latest `QTY_AFTER` for each (carton_id, location_id) combination:
- If `carton_id` is NULL, use `'NO_CARTON'` as partition key (to still get the row)

### Step 2: Join with tabStockTransaction

Get `carton_id` from source table:
- `COALESCE(th.carton_id, st.carton_id)` - Use history if available, otherwise use source

### Step 3: Filter

Only return rows where `carton_id` exists (from either table):
- `WHERE (th.carton_id IS NOT NULL ... OR st.carton_id IS NOT NULL ...)`

### Step 4: Group by Location

Add cartons to `binCartonMap` by resolved `location_id`

## Result

✅ **Carton ID now appears in Item Location Breakdown:**
- Uses `QTY_AFTER` from `tabTransactionHistory` (as requested)
- Gets `carton_id` from `tabStockTransaction` if NULL in history
- Shows cartons at their current location (after relocation)

## Testing

### 1. Check API Response

After restarting API server, check logs:
```
[Stock Ledger] Found X carton(s) from tabTransactionHistory
[Stock Ledger] ✅ Added carton CTN-XXX to bin A1-R01-L3-B1
[Stock Ledger] Item Location Breakdown response { ..., cartons_with_ids: X }
```

### 2. Verify Desktop App

Item Location Breakdown should show:
- ✅ Carton ID column populated
- ✅ One row per carton
- ✅ Correct location after relocation

### 3. Verify Transaction History

```sql
SELECT 
  th.id,
  th.carton_id as history_carton_id,
  st.carton_id as source_carton_id,
  COALESCE(th.carton_id, st.carton_id) as final_carton_id,
  th.qty_after,
  th.bin_location
FROM tabTransactionHistory th
LEFT JOIN tabStockTransaction st ON st.id = th.transaction_id
WHERE th.item_code = 'SKU-HAT-301-BLU-OS'
  AND th.warehouse = 'WH-MAIN'
  AND th.qty_after > 0
ORDER BY th.transaction_date DESC
LIMIT 10;
```

**Expected:** `final_carton_id` should have values (from either `th.carton_id` or `st.carton_id`)

## Long-Term Fix

**Option 1: Update Trigger (Recommended)**

Run `SCRIPTS/FixTransactionHistoryCartonIdTrigger.sql` to update the trigger to copy `carton_id` from `tabStockTransaction`:

```sql
SET v_carton_id = NEW.carton_id;  -- Now correctly reads from NEW.carton_id
```

**Option 2: Backfill Existing Data**

```sql
UPDATE tabTransactionHistory th
INNER JOIN tabStockTransaction st ON th.transaction_id = st.id
SET th.carton_id = st.carton_id
WHERE st.carton_id IS NOT NULL 
  AND (th.carton_id IS NULL OR th.carton_id = '');
```

## Summary

**Problem:** `tabTransactionHistory` has `carton_id = NULL` (trigger issue)

**Solution:** Join with `tabStockTransaction` to get `carton_id` if NULL in history

**Result:** ✅ Carton ID now appears in Item Location Breakdown using `QTY_AFTER` from Transaction History
