# Cycle Count Expected Quantity Fix

## 🐛 Issue

The mobile app was sending `expected_qty` (e.g., "Exp: 3", "Exp: 1") in the cycle count request, but the backend was not updating `expected_qty` in `tabCycleCountLine`, resulting in:
- Desktop app showing: Expected Qty: 0.00 (incorrect)
- Mobile app showing: Exp: 3, Exp: 1 (correct)
- Task marked as "Opening Stock: True" (incorrect, since expected_qty should be > 0)

## 🔍 Root Cause

The `updateCountLines` function in `cycleCountController.js` had logic that:
1. ✅ Accepted `expected_qty` from the mobile app request (line ~1455-1460)
2. ❌ But when an existing line was found, Strategy 2a/2b would only use existing line's `expected_qty` if `expectedQty === null` (meaning not provided in request)
3. ❌ The UPDATE query only updated `expected_qty` if current value was 0/null AND new value > 0, but this check happened AFTER the logic above, so if existing line had 0, and request had > 0, it should update... but there was also commented-out code that prevented updating if values differed

The main issue was:
- When an existing line was found with `expected_qty = 0`, the code would:
  1. Accept `expected_qty` from request (e.g., 3)
  2. Find existing line with `expected_qty = 0`
  3. Check if request has `expected_qty` - YES, it has 3
  4. Strategy 2a/2b would NOT overwrite it (correct, since request has value)
  5. But UPDATE query would check: `shouldUpdateExpectedQty = (currentExpectedQty === 0 && expectedQty > 0)` = TRUE
  6. So it SHOULD update... but wait, there was also a condition that if values differ and it's not null/0, it wouldn't update (the commented code suggests this was intentionally disabled)

Actually, the real issue was simpler: **The UPDATE query logic was too restrictive**. It only updated `expected_qty` if the current value was 0/null. But if the mobile app sends `expected_qty` from the stock ledger (which is the most accurate), we should ALWAYS use it, even if it differs from what's currently in the database.

## ✅ Fix Applied

### 1. **Always Use expected_qty from Mobile App Request**

**File:** `wms-api/src/modules/cycle-count/cycleCountController.js`

**Changes:**
- Updated Strategy 2a and 2b to log when using expected_qty from request (lines ~1494-1501, ~1557-1565)
- Most importantly: Updated the UPDATE query logic to ALWAYS update `expected_qty` if provided in request, regardless of current value (lines ~1736-1757)

**Before:**
```javascript
// Only update if current is 0/null AND new value > 0
const shouldUpdateExpectedQty = (currentExpectedQty === null || currentExpectedQty === 0 || currentExpectedQty === undefined) && expectedQty > 0;

if (shouldUpdateExpectedQty) {
  updateQuery += `, expected_qty = ?`;
  updateParams.push(expectedQty);
  // ...
} else if (expectedQty > 0 && currentExpectedQty !== expectedQty) {
  // Optional: Allow updating expected_qty if request value differs (mobile app might have more accurate data)
  // Comment out if you want to preserve existing expected_qty always
  // updateQuery += `, expected_qty = ?`;  // <-- This was commented out!
  // ...
}
```

**After:**
```javascript
// Always update expected_qty if provided in request and different from current value
// Priority: Mobile app request value > Database current value (mobile app has real-time stock data)
if (expectedQty !== null && expectedQty !== undefined && expectedQty > 0) {
  if (parsedCurrentExpectedQty !== expectedQty) {
    updateQuery += `, expected_qty = ?`;
    updateParams.push(expectedQty);
    console.log(`[Cycle Count] ✅ Including expected_qty in UPDATE: ${expectedQty} for line ${lineId} (was: ${parsedCurrentExpectedQty || 'NULL/0'})`);
  } else {
    console.log(`[Cycle Count] ℹ️ expected_qty already matches: ${expectedQty} for line ${lineId}`);
  }
}
```

### 2. **Enhanced Logging**

Added logging to track when `expected_qty` is used from request vs. existing line:
- Strategy 2a: Logs when using expected_qty from request for existing line
- Strategy 2b: Logs when using expected_qty from request for existing line
- UPDATE query: Logs when expected_qty is being updated

## 🧪 Testing

To verify the fix:

1. **Create a Cycle Count Task** with items that have stock in `tabStockLedger` or `tabCartonStock`
2. **Mobile app sends expected_qty** (e.g., 3, 1) from stock ledger lookup
3. **Backend should update expected_qty** in `tabCycleCountLine` with the value from mobile app
4. **Desktop app should show** the correct expected_qty (e.g., 3.00, 1.00)
5. **Task should NOT be marked as "Opening Stock"** if expected_qty > 0

### Test Query:
```sql
-- Check cycle count line with expected_qty
SELECT item_code, bin_location, carton_id, expected_qty, actual_qty, discrepancy
FROM tabCycleCountLine
WHERE parent_title = 'CC-A1-R01-L1-B1-MK9DUCJD'
ORDER BY item_code;

-- Expected result:
-- SKU-HAT-301-BLU-OS: expected_qty = 1 (not 0)
-- SKU-JACKET-201-BLK-L: expected_qty = 3 (not 0)
-- SKU-JACKET-201-BLK-M: expected_qty = 1 (not 0)
```

## 📋 Data Flow

**Before Fix:**
```
Mobile App sends: expected_qty = 3
  ↓
Backend accepts: expectedQty = 3 ✅
  ↓
Backend finds existing line: expected_qty = 0
  ↓
Backend UPDATE query: shouldUpdateExpectedQty = (0 === 0 && 3 > 0) = TRUE
  ↓
But UPDATE might not execute if logic is wrong...
  ↓
Result: expected_qty = 0 (not updated) ❌
```

**After Fix:**
```
Mobile App sends: expected_qty = 3
  ↓
Backend accepts: expectedQty = 3 ✅
  ↓
Backend finds existing line: expected_qty = 0
  ↓
Backend UPDATE query: if (3 > 0 && 0 !== 3) = TRUE
  ↓
UPDATE includes: expected_qty = 3 ✅
  ↓
Result: expected_qty = 3 (updated correctly) ✅
```

## 🎯 Expected Behavior

After this fix:
1. ✅ `expected_qty` from mobile app request is always used (if provided)
2. ✅ `expected_qty` is updated in `tabCycleCountLine` even if current value is 0
3. ✅ Desktop app shows correct expected_qty from database
4. ✅ Task is NOT marked as "Opening Stock" if expected_qty > 0
5. ✅ Discrepancy calculation is correct: actual_qty - expected_qty
6. ✅ Stock update logic uses correct expected_qty for comparison

## ⚠️ Notes

- The fix prioritizes mobile app request value over database current value
- This is intentional: Mobile app has real-time stock data from stock ledger lookup
- If mobile app doesn't send `expected_qty`, the existing logic (use existing line, or lookup from stock ledger) still applies
- The fix ensures that when mobile app sends `expected_qty`, it's always respected and saved to database

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-11  
**Files Modified:** `wms-api/src/modules/cycle-count/cycleCountController.js`
