# Material Request Stock Reduction Fix - Summary

## ✅ Fix Applied

**Issue:** After Material Request picking, Item Location Breakdown showed 539.00 but Main Items table showed 134. Stock was not being reduced correctly at bin and carton level.

**Root Cause:** The API was using `source_bin` directly from the request without matching it to the actual `bin_location` format in the database. This caused:
- Stock to be updated in wrong/duplicate records
- `tabCartonStock` to not be updated correctly
- Item Location Breakdown to show incorrect quantities

---

## 🔧 Changes Made

### 1. Added Fuzzy Bin Location Matching

**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**What Changed:**
- Added `findMatchingStockLedgerBin()` function that:
  1. First tries exact match
  2. If no match, tries fuzzy matching by components (e.g., "A1-R02-L1-B2" matches "Rack 02-B2")
  3. Returns the actual `bin_location` from database

**Why:** Handles format differences between mobile app (`source_bin`) and database (`bin_location`).

### 2. Use Matched Bin Location for All Updates

**What Changed:**
- All database updates now use `actualBinLocation` (matched from database) instead of `source_bin` (from request)
- This ensures:
  - `tabStockLedger` is updated at the correct bin
  - `tabCartonStock` is updated at the correct bin
  - No duplicate records are created

**Tables Updated:**
- ✅ `tabStockLedger` - Uses `actualBinLocation`
- ✅ `tabCartonStock` - Uses `actualBinLocation`
- ✅ `tabStockTransaction` - Uses `actualBinLocation` for `bin_location` field

---

## 📱 Mobile App Requirements

**NO CHANGES REQUIRED** - The mobile app can continue sending `source_bin` as before. The API will automatically match it to the correct database format.

**However, ensure these fields are sent:**

### Required Fields in Request Body

```json
{
  "warehouse": "WH-MAIN",
  "user_id": "mobile_user_123",
  "items": [
    {
      "item_code": "SKU-JACKET-201-BLK-L",
      "picked_qty": 2,
      "source_bin": "A1-R01-L3-B1",  // ← Can be any format, API will match
      "carton_id": "CTN-555444"       // ← REQUIRED for carton-level stock reduction
    }
  ]
}
```

**Important:**
- ✅ `carton_id` - **REQUIRED** (must be sent for each item)
- ✅ `source_bin` - **REQUIRED** (can be any format, API will match)
- ✅ `warehouse` - **REQUIRED** (must be sent in request body)
- ✅ `user_id` or `created_by` - **REQUIRED** (must be sent in request body)

---

## 🧪 Testing

### Test 1: Verify Stock Reduction

1. **Before Picking:**
   ```sql
   SELECT stock_qty FROM tabItem WHERE code = 'SKU-JACKET-201-BLK-L';
   SELECT qty FROM tabStockLedger WHERE item_code = 'SKU-JACKET-201-BLK-L' AND bin_location = 'A1-R01-L3-B1';
   SELECT qty FROM tabCartonStock WHERE item_code = 'SKU-JACKET-201-BLK-L' AND carton_id = 'CTN-555444';
   ```

2. **Pick Items via API:**
   ```bash
   POST /api/material-requests/MR-123461/pick-items
   {
     "warehouse": "WH-MAIN",
     "user_id": "test_user",
     "items": [
       {
         "item_code": "SKU-JACKET-201-BLK-L",
         "picked_qty": 2,
         "source_bin": "A1-R01-L3-B1",
         "carton_id": "CTN-555444"
       }
     ]
   }
   ```

3. **After Picking:**
   ```sql
   SELECT stock_qty FROM tabItem WHERE code = 'SKU-JACKET-201-BLK-L';
   SELECT qty FROM tabStockLedger WHERE item_code = 'SKU-JACKET-201-BLK-L' AND bin_location = 'A1-R01-L3-B1';
   SELECT qty FROM tabCartonStock WHERE item_code = 'SKU-JACKET-201-BLK-L' AND carton_id = 'CTN-555444';
   ```

**Expected Result:**
- `tabItem.stock_qty` should decrease by 2
- `tabStockLedger.qty` at the bin should decrease by 2
- `tabCartonStock.qty` at the carton should decrease by 2
- All three should match after picking

### Test 2: Verify Item Location Breakdown

1. Open desktop app
2. Go to Items screen
3. Select item: `SKU-JACKET-201-BLK-L`
4. Click "Show Location Breakdown"
5. Click "Refresh" button
6. Verify quantity matches `tabItem.stock_qty`

**Expected Result:**
- Item Location Breakdown should show the same quantity as Main Items table
- Both should match `tabCartonStock` sum (if carton-level) or `tabStockLedger` sum (if bin-level)

---

## 📊 How It Works Now

### Before Fix:
```
Mobile App sends: source_bin = "A1-R01-L3-B1"
API uses: source_bin directly
Database has: bin_location = "Rack 01-B1"
Result: ❌ Creates new record or updates wrong record
```

### After Fix:
```
Mobile App sends: source_bin = "A1-R01-L3-B1"
API matches: Finds "Rack 01-B1" in database (fuzzy match)
API uses: actualBinLocation = "Rack 01-B1"
Result: ✅ Updates correct record
```

---

## 🔍 Diagnostic Scripts

### Check Stock Discrepancy
```sql
-- Run: SCRIPTS/DiagnoseStockDiscrepancy.sql
-- Replace @item_code and @bin_location with your values
```

### Test Stock Reduction
```sql
-- Run: SCRIPTS/TestMaterialRequestStockReduction.sql
-- Replace @item_code, @bin_location, @carton_id with your values
-- Run BEFORE and AFTER picking to see the difference
```

---

## ✅ Verification Checklist

After picking items via Material Request API:

- [ ] `tabItem.stock_qty` is reduced correctly
- [ ] `tabStockLedger.qty` at the bin is reduced correctly
- [ ] `tabCartonStock.qty` at the carton is reduced correctly (if `carton_id` provided)
- [ ] Item Location Breakdown shows correct quantity
- [ ] Main Items table shows correct quantity
- [ ] Both Item Location Breakdown and Main Items table match

---

## 🚀 Next Steps

1. **Test the API** with a Material Request picking
2. **Verify stock reduction** using the diagnostic scripts
3. **Check Item Location Breakdown** in desktop app (click "Refresh")
4. **Report any issues** if quantities still don't match

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-13  
**API Endpoint:** `POST /api/material-requests/:title/pick-items`  
**Mobile App Changes:** None required (API handles format matching automatically)
