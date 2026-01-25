# Item Location Breakdown - Carton ID Not Showing - Debug Guide

## Problem

Carton ID column is empty in Item Location Breakdown screen, even though:
- ✅ Cartons exist in `tabTransactionHistory` with `carton_id` and `qty_after > 0`
- ✅ API query uses `QTY_AFTER` from latest transaction
- ❌ Carton ID is not appearing in the response

## Root Cause Analysis

### Current Flow:

1. **Query ALL cartons from `tabTransactionHistory`** (no bin filter)
   ```sql
   SELECT carton_id, COALESCE(location_id, bin_location, target_bin) as location_id, qty_after
   FROM tabTransactionHistory
   WHERE item_code = ? AND warehouse = ? AND carton_id IS NOT NULL AND qty_after > 0
   ```

2. **Resolve location_id** using `resolveFullLocationId()`
   - Original: `A1-R01-L3-B1`
   - Resolved: `A1-R01-L3-B1` (should match)

3. **Add cartons to `binCartonMap`** by `finalLocationId`

4. **Per-bin fallback query** (might clear cartons if no history found)

### Potential Issues:

1. **Location ID Mismatch:**
   - Query returns `location_id` from Transaction History
   - But `binCartonMap` might have bins created from `tabStockLedger` with different location format
   - Resolution might not match

2. **Cartons Being Cleared:**
   - Per-bin fallback query clears cartons if no history found
   - **FIXED:** Now only clears if `binData.cartons.length === 0`

3. **Query Not Finding Cartons:**
   - `location_id` might be NULL in Transaction History
   - `bin_location` might not match resolved location
   - `target_bin` might be used for relocation but not matching

## Debug Steps

### 1. Check Transaction History Data

```sql
SELECT 
  location_id,
  bin_location,
  target_bin,
  carton_id,
  qty_after,
  transaction_date,
  transaction_type
FROM tabTransactionHistory
WHERE item_code = 'SKU-HAT-301-BLU-OS'
  AND warehouse = 'WH-MAIN'
  AND carton_id IS NOT NULL
  AND carton_id != ''
  AND qty_after > 0
ORDER BY transaction_date DESC, id DESC;
```

**Expected:** Should see cartons with `location_id`, `bin_location`, or `target_bin` set.

### 2. Check Latest Transaction Per Carton

```sql
SELECT 
  carton_id,
  COALESCE(location_id, bin_location, target_bin) as location_id,
  qty_after,
  transaction_date
FROM (
  SELECT 
    carton_id,
    location_id,
    bin_location,
    target_bin,
    qty_after,
    transaction_date,
    ROW_NUMBER() OVER (
      PARTITION BY carton_id, COALESCE(location_id, bin_location, target_bin)
      ORDER BY transaction_date DESC, id DESC
    ) as rn
  FROM tabTransactionHistory
  WHERE item_code = 'SKU-HAT-301-BLU-OS'
    AND warehouse = 'WH-MAIN'
    AND carton_id IS NOT NULL
    AND carton_id != ''
    AND qty_after > 0
) latest
WHERE rn = 1
ORDER BY location_id, carton_id;
```

**Expected:** Should see one row per (carton_id, location_id) with latest `qty_after`.

### 3. Check API Logs

Look for these log messages:
```
[Stock Ledger] Found X carton(s) from tabTransactionHistory for item SKU-HAT-301-BLU-OS across all bins
[Stock Ledger] Transaction History cartons (raw): [...]
[Stock Ledger] ✅ Added carton CTN-XXX to bin A1-R01-L3-B1 with qty X
[Stock Ledger] Item Location Breakdown response { ..., cartons_with_ids: X, cartons_without_ids: Y }
```

**If `cartons_with_ids: 0`:** Cartons are not being added to response
**If `cartons_without_ids > 0`:** Some bins don't have cartons

### 4. Check Location ID Resolution

The query uses:
```sql
COALESCE(location_id, bin_location, target_bin) as location_id
```

**Issue:** If `location_id` is NULL, it falls back to `bin_location` or `target_bin`, but these might not match the resolved location from `tabLocation`.

**Solution:** Ensure `location_id` is populated in Transaction History, or improve location resolution.

## Fixes Applied

### 1. Prevent Carton Clearing ✅

**Change:** Only clear cartons in fallback if `binData.cartons.length === 0`

**Before:**
```javascript
// Clear existing cartons and rebuild from transactions
binData.cartons = [];
```

**After:**
```javascript
if (binData.cartons.length === 0) {
  // Only use fallback if no cartons from all-cartons query
  // ... fallback logic
}
```

### 2. Enhanced Logging ✅

Added detailed logging:
- Number of cartons found from Transaction History
- Each carton being processed (location_id, resolved, final)
- Cartons added/updated
- Final response statistics (cartons_with_ids, cartons_without_ids)

### 3. Query All Cartons First ✅

**Change:** Query ALL cartons for the item first, then group by location

**Before:** Queried per bin (missed cartons at other bins)

**After:** Query all cartons, then group by resolved location_id

## Next Steps

1. **Restart API Server** to apply changes
2. **Check API Logs** when opening Item Location Breakdown
3. **Verify Transaction History** has `location_id` or `bin_location` populated
4. **Test with a relocated carton** to see if it appears at new location

## Expected Behavior After Fix

✅ Cartons should appear in Item Location Breakdown with:
- `carton_id` populated
- `location_id` showing current location (after relocation)
- `qty_after` from latest transaction
- One row per carton in flat format

## If Still Not Working

Check:
1. **Transaction History** - Does it have `carton_id` and `location_id`/`bin_location`?
2. **Location Resolution** - Does `resolveFullLocationId()` match the location in Transaction History?
3. **API Logs** - Are cartons being found and added?
4. **Response Format** - Is `carton_id` in the API response but not displayed in desktop app?
