# Cycle Count Stock Update Logic Fix

## 🔍 Issue

**Stock should only be updated when:**
1. `actual_qty > 0` (to confirm items are scanned)
2. `discrepancy != 0` (if discrepancy is 0, nothing to update - no change needed)

## ✅ Fix Applied

### Changed Logic

**Previous Logic:**
- Updated stock for:
  - Lines with `expected_qty > 0` and `discrepancy != 0` (existing stock with variance)
  - Lines with `expected_qty = 0` and `actual_qty > 0` (opening stock - new items)
- This could update stock even when `actual_qty = 0` or `discrepancy = 0`

**New Logic:**
- **Only** updates stock for:
  - Lines with `actual_qty > 0` **AND** `discrepancy != 0`
- This means:
  - ✅ Items with `actual_qty = 0` will **NOT** update stock (not scanned yet)
  - ✅ Items with `discrepancy = 0` will **NOT** update stock (no change, matches expected)
  - ✅ Only items with `actual_qty > 0` **AND** `discrepancy != 0` will update stock

### Updated Query

**File:** `wms-api/src/modules/cycle-count/cycleCountController.js`

**Location:** `updateStockFromCycleCount()` function (line ~303)

**Changed SQL Query:**
```sql
-- OLD:
SELECT ...
FROM tabCycleCountLine
WHERE parent_title = ?
  AND actual_qty IS NOT NULL
  AND (
    (expected_qty > 0 AND discrepancy IS NOT NULL AND discrepancy != 0)
    OR
    (COALESCE(expected_qty, 0) = 0 AND actual_qty > 0)
  )

-- NEW:
SELECT ...
FROM tabCycleCountLine
WHERE parent_title = ?
  AND actual_qty > 0
  AND discrepancy IS NOT NULL
  AND discrepancy != 0
```

### Examples

#### Example 1: Item Matches Expected (No Update)
- `expected_qty = 2`, `actual_qty = 2`
- `discrepancy = 0`
- **Result:** ❌ Stock **NOT** updated (discrepancy = 0, no change needed)

#### Example 2: Item Overcounted (Update Stock)
- `expected_qty = 2`, `actual_qty = 3`
- `discrepancy = 1`
- **Result:** ✅ Stock **updated** (actual_qty > 0 AND discrepancy != 0)

#### Example 3: Item Undercounted (Update Stock)
- `expected_qty = 2`, `actual_qty = 1`
- `discrepancy = -1`
- **Result:** ✅ Stock **updated** (actual_qty > 0 AND discrepancy != 0)

#### Example 4: Item Not Scanned (No Update)
- `expected_qty = 2`, `actual_qty = 0`
- `discrepancy = -2`
- **Result:** ❌ Stock **NOT** updated (actual_qty = 0, not scanned yet)

#### Example 5: Opening Stock with Variance (Update Stock)
- `expected_qty = 0`, `actual_qty = 5`
- `discrepancy = 5`
- **Result:** ✅ Stock **updated** (actual_qty > 0 AND discrepancy != 0)

#### Example 6: Opening Stock, Counted Zero (No Update)
- `expected_qty = 0`, `actual_qty = 0`
- `discrepancy = 0`
- **Result:** ❌ Stock **NOT** updated (actual_qty = 0, not scanned)

## 📋 Impact

### Stock Update Behavior

**Before Fix:**
- Stock could be updated even when `actual_qty = 0` (if other conditions met)
- Stock could be updated even when `discrepancy = 0` (if opening stock)

**After Fix:**
- Stock **only** updates when items are scanned (`actual_qty > 0`) **AND** there's a variance (`discrepancy != 0`)
- Prevents unnecessary stock updates when items match expected quantities
- Prevents stock updates for items that haven't been scanned yet

### Response Fields

**API Response (`/submit` endpoint):**
```json
{
  "ok": true,
  "message": "Cycle Count Task submitted successfully. Status: Completed",
  "data": {
    "title": "CC-...",
    "status": "Completed",
    "items_with_discrepancy": 1,
    "stock_updated": true,      // Only true if actual_qty > 0 AND discrepancy != 0
    "items_adjusted": 1         // Count of items with actual_qty > 0 AND discrepancy != 0
  }
}
```

## 🧪 Testing

### Test Case 1: Perfect Match (No Update)
```javascript
// Item: SKU-001, Expected: 10, Actual: 10
// Expected: stock_updated = false, items_adjusted = 0
```

### Test Case 2: Variance (Update Stock)
```javascript
// Item: SKU-002, Expected: 10, Actual: 12
// Expected: stock_updated = true, items_adjusted = 1
```

### Test Case 3: Not Scanned (No Update)
```javascript
// Item: SKU-003, Expected: 10, Actual: 0
// Expected: stock_updated = false, items_adjusted = 0
```

## 📝 Files Modified

1. **`wms-api/src/modules/cycle-count/cycleCountController.js`**
   - Updated `updateStockFromCycleCount()` function:
     - Changed SQL query to only select lines with `actual_qty > 0` AND `discrepancy != 0`
     - Updated query for `tabItem.stock_qty` update to use same criteria
     - Updated comments to reflect new logic

## ✅ Verification

- ✅ Query updated to check `actual_qty > 0`
- ✅ Query updated to check `discrepancy != 0`
- ✅ Query for `tabItem.stock_qty` update uses same criteria
- ✅ Comments updated to reflect new logic
- ✅ Build successful

---

**Status**: ✅ Fix applied and verified. Stock will only update when `actual_qty > 0` AND `discrepancy != 0`.
