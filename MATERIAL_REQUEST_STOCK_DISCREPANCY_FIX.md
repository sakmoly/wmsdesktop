# Material Request Stock Discrepancy Fix

## 🐛 Issue

After Material Request picking:
- **Item Location Breakdown** shows: 539.00 (from `tabCartonStock`)
- **Main Items table** shows: 134 (from `tabItem.stock_qty`)

**Expected:** Both should match after picking.

---

## 🔍 Root Cause Analysis

### Problem 1: Item Location Breakdown shows `tabCartonStock` data

The **Item Location Breakdown** window queries `tabCartonStock` directly (line 503-515 in `ItemLocationBreakdownViewModel.cs`):

```csharp
var cartonSql = @"SELECT carton_id, qty
    FROM tabCartonStock
    WHERE item_code = @itemCode
      AND bin_location = @binLocation
      AND qty > 0
      AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
    ORDER BY carton_id";
```

**Issue:** If `tabCartonStock` has old/unreduced data, it will show incorrect quantities.

### Problem 2: `tabItem.stock_qty` should sync with `tabCartonStock`

The database triggers (from `CreateStockSyncTriggers.sql`) should automatically update `tabItem.stock_qty` when `tabCartonStock` changes. However, if:
- Triggers are not installed
- Triggers are not firing correctly
- `tabCartonStock` update fails silently

Then `tabItem.stock_qty` will be out of sync.

### Problem 3: API may not be updating `tabCartonStock` correctly

In `pickMaterialRequestItems` (line 1305-1336), the API:
1. Gets current carton stock at `source_bin`
2. Calculates new quantity
3. Updates `tabCartonStock`

**Potential Issues:**
- `source_bin` format mismatch (e.g., "Rack 02-B2" vs "A1-R02-L1-B2")
- `carton_id` not provided by mobile app
- `bin_location` mismatch between request and database

---

## ✅ Fix Strategy

### Step 1: Verify API is updating `tabCartonStock` correctly

**Check:** Ensure `carton_id` and `source_bin` are being sent by mobile app and used correctly.

**API Code Location:** `wms-api/src/modules/material-request/materialRequestController.js` (line 1305-1336)

**Current Logic:**
```javascript
// Get current carton stock at the source bin
const [currentCartonStock] = await connection.execute(
  `SELECT qty, bin_location FROM tabCartonStock 
   WHERE carton_id = ? AND item_code = ? AND warehouse = ? AND bin_location = ?`,
  [finalCartonId, item_code, targetWarehouse, source_bin]
);
```

**Issue:** Uses `source_bin` directly - may not match database format.

### Step 2: Ensure bin_location matching

The API should use **fuzzy matching** for `bin_location` (similar to stock validation) to handle format differences.

### Step 3: Verify triggers are installed and working

Run diagnostic script: `SCRIPTS/DiagnoseStockDiscrepancy.sql`

### Step 4: Fix `tabCartonStock` update logic

**Current Issue:** The API updates `tabCartonStock` using `source_bin` from the request, but the database may have a different format.

**Solution:** Use the **actual bin_location from `tabStockLedger`** (which was matched using fuzzy logic) instead of `source_bin` from the request.

---

## 🔧 Implementation

### Fix 1: Use actual bin_location from stock ledger (✅ COMPLETED)

**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**Changes Applied:**
1. **Added fuzzy matching for bin_location** (line 1151-1210):
   - First tries exact match
   - If no match, tries fuzzy matching by components (e.g., "A1-R02-L1-B2" matches "Rack 02-B2")
   - Returns the actual `bin_location` from database

2. **Use matched `actualBinLocation` for all updates**:
   - `tabStockLedger` update uses `actualBinLocation` (line 1258)
   - `tabCartonStock` query and update use `actualBinLocation` (line 1350, 1365)
   - `tabStockTransaction` uses `actualBinLocation` for `bin_location` field (line 1315)

**Key Code:**
```javascript
// Find matching bin_location in stock ledger
const stockLedgerEntry = await findMatchingStockLedgerBin(item_code, source_bin, targetWarehouse);

// Use actual bin_location from stock ledger if found, otherwise use source_bin from request
const actualBinLocation = stockLedgerEntry ? stockLedgerEntry.bin_location : source_bin;

// All subsequent queries and updates use actualBinLocation instead of source_bin
```

### Fix 2: Add logging for debugging

Add console logs to track:
- `carton_id` received from request
- `source_bin` from request
- `actualBinLocation` from stock ledger
- `currentCartonQty` before update
- `newCartonQty` after update

### Fix 3: Ensure mobile app sends required fields

**Mobile App Requirements:**
- ✅ `carton_id` - **REQUIRED** (must be sent for each item)
- ✅ `source_bin` - **REQUIRED** (must be sent for each item)
- ✅ `warehouse` - **REQUIRED** (must be sent in request body)

**API Endpoint:** `POST /api/material-requests/:title/pick-items`

**Request Body:**
```json
{
  "warehouse": "WH-MAIN",
  "user_id": "user123",
  "items": [
    {
      "item_code": "SKU-JACKET-201-BLK-L",
      "picked_qty": 2,
      "source_bin": "A1-R01-L3-B1",
      "carton_id": "CTN-555444"  // ← REQUIRED
    }
  ]
}
```

---

## 🧪 Testing

### Test 1: Verify API updates `tabCartonStock`

1. Pick items via Material Request API
2. Check `tabCartonStock`:
   ```sql
   SELECT * FROM tabCartonStock 
   WHERE item_code = 'SKU-JACKET-201-BLK-L' 
     AND bin_location = 'A1-R01-L3-B1';
   ```
3. Verify quantity is reduced correctly

### Test 2: Verify `tabItem.stock_qty` syncs

1. After picking, check `tabItem.stock_qty`:
   ```sql
   SELECT stock_qty FROM tabItem WHERE code = 'SKU-JACKET-201-BLK-L';
   ```
2. Compare with `tabCartonStock` sum:
   ```sql
   SELECT SUM(qty) FROM tabCartonStock 
   WHERE item_code = 'SKU-JACKET-201-BLK-L' 
     AND qty > 0 
     AND (status IS NULL OR status = '' OR status = 'PUTAWAY');
   ```
3. They should match (or be very close)

### Test 3: Verify Item Location Breakdown

1. Open Item Location Breakdown in desktop app
2. Click "Refresh" button
3. Verify quantity matches `tabItem.stock_qty`

---

## 📋 Mobile App Checklist

**Before calling `POST /api/material-requests/:title/pick-items`:**

- [ ] `carton_id` is included for each item in the request
- [ ] `source_bin` is included for each item in the request
- [ ] `warehouse` is included in the request body
- [ ] `user_id` or `created_by` is included in the request body

**Example Request:**
```json
{
  "warehouse": "WH-MAIN",
  "user_id": "mobile_user_123",
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

---

## 🔄 Next Steps

1. **Run diagnostic script** to identify the exact issue
2. **Fix API** to use `actualBinLocation` from stock ledger
3. **Verify mobile app** is sending `carton_id` and `source_bin`
4. **Test end-to-end** Material Request picking flow
5. **Verify triggers** are installed and working

---

**Status:** 🔧 **IN PROGRESS**  
**Date:** 2026-01-13
