# Fix: All Duplicate Putaway Lines Creation Points

## Problem

**Two putaway lines are being created automatically** for the same carton and item:
- Line 1: `PAW-ASN12225-1767` + `SKU-HAT-301-BLU-OS` + Rack: `A1-R01-L1-B1` + Bin: `B1` + Qty: `75`
- Line 2: `PAW-ASN12225-1767` + `SKU-HAT-301-BLU-OS` + Rack: (empty) + Bin: `B1` + Qty: `75`
- **Total: 150** (should be 75)

## Root Cause

The issue was in **THREE different functions** in the backend API, all with the same problem: **NULL/empty rack values were not handled correctly** in the deduplication checks.

### The Problem

All three functions were using:
```sql
AND rack = ?
```

This SQL comparison **doesn't handle NULL/empty rack values correctly**. When:
- First call has `rack = 'A1-R01-L1-B1'` → Creates line with rack
- Second call has `rack = NULL` or `rack = ''` → SQL `rack = ?` doesn't match the first line, so it creates a **second line**

## Fixes Applied

### 1. Event Processing (`processPutawayEvent`)
**File:** `wms-api/src/modules/events/eventController.js`

**Before:**
```sql
AND rack = ?
AND (bin = ? OR (bin IS NULL AND ? IS NULL))
```

**After:**
```sql
AND (rack = ? OR (rack IS NULL AND ? = '') OR (rack = '' AND ? IS NULL))
AND (bin = ? OR (bin IS NULL AND ? = '') OR (bin = '' AND ? IS NULL))
```

### 2. Scan Transfer Carton (`scanTransferCarton`)
**File:** `wms-api/src/modules/putaway/putawayController.js` (line ~1737)

**Before:**
```sql
AND rack = ?
AND (bin = ? OR (bin IS NULL AND ? IS NULL))
```

**After:**
```sql
AND (rack = ? OR (rack IS NULL AND ? = '') OR (rack = '' AND ? IS NULL))
AND (bin = ? OR (bin IS NULL AND ? = '') OR (bin = '' AND ? IS NULL))
```

### 3. Complete Putaway (`completePutaway`)
**File:** `wms-api/src/modules/putaway/putawayController.js` (line ~821)

**Before:**
```sql
AND rack = ?
AND (bin = ? OR (bin IS NULL AND ? IS NULL))
```

**After:**
```sql
AND (rack = ? OR (rack IS NULL AND ? = '') OR (rack = '' AND ? IS NULL))
AND (bin = ? OR (bin IS NULL AND ? = '') OR (bin = '' AND ? IS NULL))
```

## Why This Happens

The second line is created automatically when:

1. **Event Processing** creates a line with `rack = 'A1-R01-L1-B1'`
2. Then **`scanTransferCarton`** or **`completePutaway`** is called with `rack = NULL` or empty
3. The deduplication check fails because `rack = NULL` doesn't match `rack = 'A1-R01-L1-B1'`
4. A **second line is created** with empty rack

## Files Modified

1. ✅ `wms-api/src/modules/events/eventController.js`
   - Fixed `processPutawayEvent` function (2 locations)

2. ✅ `wms-api/src/modules/putaway/putawayController.js`
   - Fixed `scanTransferCarton` function (2 locations)
   - Fixed `completePutaway` function (1 location)

## Testing

### To Verify the Fix

1. **Test Event Processing**:
   - Send `PUTAWAY_TO_RACK` event with rack
   - Send another event with same carton+item but NULL rack
   - Should create **only one line** (not two)

2. **Test Scan Transfer Carton**:
   - Scan transfer carton with rack
   - Scan same carton again with NULL rack
   - Should update existing line (not create new one)

3. **Test Complete Putaway**:
   - Complete putaway with rack
   - Complete same putaway again with NULL rack
   - Should update existing line (not create new one)

## Expected Result

After applying all fixes:
- **One line** should be created per carton+item+location combination
- If rack is NULL in one call and has a value in another, they should be treated as **different locations** (correct behavior)
- If rack is NULL in both calls, they should be treated as **same location** (deduplicated)

## Next Steps

1. **Restart API server**:
   ```bash
   cd wms-api
   npm start
   ```

2. **Test putaway creation** from mobile app

3. **Check existing duplicates**:
   - Run `CHECK_DUPLICATE_PUTAWAY_LINES_SOURCE.sql` to find existing duplicates
   - Optionally run `FIX_DUPLICATE_CARTON_QUANTITIES.sql` to clean up existing duplicates

---

**All duplicate putaway line creation points are now fixed in the backend API.**

