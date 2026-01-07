# Location ID Fix - Complete

## 🔍 Issue Found

**Problem:** When completing putaway, the `location_id` stored in `tabPutawayLine` was not being read from the database, so it wasn't used as `bin_location` in the stock ledger.

**Root Cause:** The `SELECT` query in `completePutaway` function was not including the `location_id` column from `tabPutawayLine`.

---

## ✅ Fix Applied

### File: `wms-api/src/modules/putaway/putawayController.js`

**Before:**
```javascript
// Get all putaway lines with locations
const [putawayLines] = await connection.execute(
  `
  SELECT 
    pl.item_code,
    pl.qty,
    pl.rack,
    pl.bin,
    pl.carton_id
  FROM tabPutawayLine pl
  WHERE pl.parent_title = ?
    AND pl.item_code IS NOT NULL
    AND pl.qty > 0
  `,
  [putaway_task]
);
```

**After:**
```javascript
// Check if location_id column exists in tabPutawayLine
const [lineLocationColumns] = await connection.execute(`
  SELECT COLUMN_NAME 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'tabPutawayLine' 
  AND COLUMN_NAME = 'location_id'
`);
const hasLineLocationIdColumn = lineLocationColumns.length > 0;

// Get all putaway lines with locations
const locationIdSelect = hasLineLocationIdColumn 
  ? "pl.location_id,"
  : "NULL as location_id,";

const [putawayLines] = await connection.execute(
  `
  SELECT 
    pl.item_code,
    pl.qty,
    pl.rack,
    pl.bin,
    pl.carton_id,
    ${locationIdSelect}
  FROM tabPutawayLine pl
  WHERE pl.parent_title = ?
    AND pl.item_code IS NOT NULL
    AND pl.qty > 0
  `,
  [putaway_task]
);
```

---

## 🔄 How It Works Now

### Step 1: Location Assignment (via `updatePutawayTaskLocation` or `scanTransferCarton`)

When location is scanned:
1. `location_id` is stored in `tabPutawayLine.location_id` ✅
2. `rack` and `bin` are also stored for backward compatibility ✅

### Step 2: Complete Putaway

When putaway is completed:
1. **Reads `location_id` from `tabPutawayLine`** ✅ (FIXED)
2. Uses `location_id` as `bin_location` in stock ledger ✅
3. Falls back to `rack-bin` combination if `location_id` is null ✅

**Code:**
```javascript
// Use location_id as bin_location (preferred) or combine rack and bin
let binLocation = line.location_id || null;
if (!binLocation) {
  // Fallback: combine rack and bin if location_id not available
  if (rack && bin) {
    binLocation = `${rack}-${bin}`;
  } else if (rack) {
    binLocation = rack;
  } else if (bin) {
    binLocation = bin;
  }
}
```

---

## ✅ Expected Result

### Before Fix:
- Scanned location: "A1-R01-L1-B1"
- Stored in `tabPutawayLine.location_id`: "A1-R01-L1-B1" ✅
- But when completing putaway, `location_id` was not read ❌
- Stock Ledger `bin_location`: "A1-R01-L1-B1" (from rack+bin combination, might be wrong) ❌

### After Fix:
- Scanned location: "A1-R01-L1-B1"
- Stored in `tabPutawayLine.location_id`: "A1-R01-L1-B1" ✅
- When completing putaway, `location_id` is read ✅
- Stock Ledger `bin_location`: "A1-R01-L1-B1" (exact scanned location) ✅

---

## 🧪 Testing

### Test Case: Complete Putaway with Location ID

**Steps:**
1. Create putaway task
2. Assign location using `POST /api/putaway/scan-transfer-carton` with `putaway_task` and `location_id`
3. Verify `tabPutawayLine.location_id` is set correctly
4. Complete putaway using `POST /api/putaway/complete`
5. Check `tabStockLedger.bin_location`

**Expected:**
- `tabStockLedger.bin_location` should match the exact scanned `location_id`
- Should NOT be a combination of rack+bin

---

## 📋 Summary

**Issue:** `location_id` was not being read from database when completing putaway  
**Fix:** Added `location_id` to SELECT query in `completePutaway` function  
**Result:** Stock Ledger now shows exact scanned location ID

---

**Status:** ✅ Fixed  
**Date:** 2026-01-06  
**Requires:** API server restart

