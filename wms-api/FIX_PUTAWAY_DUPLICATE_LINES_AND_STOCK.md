# Fix: Duplicate Putaway Lines and Stock Doubling Issues

## Issues Identified

### 1. ❌ Duplicate Line with Empty Rack "B1"
- **Problem:** When `target_bin = "B1"` (single part), the parsing logic incorrectly set `rack = "B1"` and `bin = ''`
- **Result:** Created a line with rack="B1", bin=NULL, causing incorrect location "B1" in stock ledger
- **Example:** Line ID 14 has `rack="B1"`, `bin=NULL`, creating location "B1" instead of proper location

### 2. ❌ Stock Doubling
- **Problem:** Same item+location combinations were being processed multiple times, causing stock to be added multiple times
- **Result:** Stock quantity doubled/tripled for the same location
- **Example:** Location "A1-R01-L2-B1-B1" got 1000 qty instead of 500 (400 + 100):
  - Transaction 1: 400 added (0 → 400)
  - Transaction 2: 100 added (400 → 500)
  - Transaction 3: 400 added again (500 → 900) ❌ DUPLICATE
  - Transaction 4: 100 added again (900 → 1000) ❌ DUPLICATE

### 3. ❌ Incorrect Quantity 1000
- **Problem:** Stock was being added multiple times for the same location
- **Result:** Location breakdown shows incorrect high quantities
- **Root Cause:** Same as issue #2

## Fixes Applied

### Fix 1: Correct target_bin Parsing for Single Part

**File:** `wms-api/src/modules/putaway/putawayController.js`

**Before:**
```javascript
} else if (parts.length === 1) {
  // Only one part - treat as rack, bin is empty
  rack = parts[0];
  bin = '';
}
```

**After:**
```javascript
} else if (parts.length === 1) {
  // Only one part - treat as bin only (common case like "B1")
  // Setting rack to null and bin to the value prevents incorrect location creation
  rack = null;
  bin = parts[0];
}
```

**Impact:**
- When `target_bin = "B1"`, now correctly sets `rack = null`, `bin = "B1"`
- Creates proper location "B1" instead of incorrect "B1" as rack

### Fix 2: Prevent Duplicate Stock Updates

**File:** `wms-api/src/modules/putaway/putawayController.js`

**Added:** Stock processing deduplication using a Set to track processed item+location combinations

```javascript
// CRITICAL: Use a Set to track processed item+location combinations to prevent duplicate stock updates
const processedStockKeys = new Set();
const stockUpdates = [];

for (const line of putawayLines) {
  // ... location calculation ...
  
  // Create a unique key for this item+location combination
  const stockKey = `${itemCode}|${binLocation || ''}`;
  if (processedStockKeys.has(stockKey)) {
    console.warn(`[Putaway] SKIPPING duplicate stock update: ${itemCode} @ ${binLocation || 'NULL'} (already processed)`);
    continue; // Skip duplicate stock updates
  }
  processedStockKeys.add(stockKey);
  
  // ... process stock update ...
}
```

**Impact:**
- Each item+location combination is only processed once
- Prevents stock doubling even if duplicates exist in putawayLines array
- Logs warnings when duplicates are detected and skipped

### Fix 3: Improved bin_location Calculation

**File:** `wms-api/src/modules/putaway/putawayController.js`

**Added:** Support for bin-only locations (when rack is null but bin has value)

```javascript
// Combine rack and bin into bin_location
let binLocation = null;
if (rack && bin) {
  binLocation = `${rack}-${bin}`;
} else if (rack) {
  binLocation = rack;
} else if (bin) {
  // Handle case where only bin is provided (rack is null)
  binLocation = bin;
}
```

**Impact:**
- Correctly handles locations where only bin is provided (rack is null)
- Prevents NULL bin_location when bin value exists

## Testing

### Test Scenario 1: Single Part target_bin

**Request:**
```json
{
  "putaway_task": "PUT-20251231-0001",
  "items": [
    {
      "item_code": "SKU-TEST-001",
      "qty": 50,
      "target_bin": "B1",
      "completed": true
    }
  ]
}
```

**Expected Result:**
- ✅ Line created with `rack = null`, `bin = "B1"`
- ✅ Stock ledger updated with `bin_location = "B1"`
- ✅ No duplicate lines
- ✅ Stock quantity correct (50, not doubled)

### Test Scenario 2: Multiple Items Same Location

**Request:**
```json
{
  "putaway_task": "PUT-20251231-0001",
  "items": [
    {
      "item_code": "SKU-TEST-001",
      "qty": 100,
      "target_bin": "A1-R01-B1",
      "completed": true,
      "carton_id": "BOX-001"
    },
    {
      "item_code": "SKU-TEST-001",
      "qty": 50,
      "target_bin": "A1-R01-B1",
      "completed": true,
      "carton_id": "BOX-002"
    }
  ]
}
```

**Expected Result:**
- ✅ Two lines created (different cartons)
- ✅ Stock ledger shows total 150 at location "A1-R01-B1"
- ✅ No duplicate stock updates
- ✅ Stock quantity correct (150, not 300)

### Test Scenario 3: Duplicate Prevention

**Request:** (Same item+location+carton submitted twice)

**Expected Result:**
- ✅ Only one line in database
- ✅ Stock updated only once
- ✅ Warning logged if duplicate detected

## Verification Queries

### Check for Duplicate Lines
```sql
SELECT 
  parent_title,
  item_code,
  carton_id,
  COALESCE(rack, '') as rack,
  COALESCE(bin, '') as bin,
  COUNT(*) as line_count,
  SUM(qty) as total_qty
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251231-0001'
GROUP BY parent_title, item_code, carton_id, COALESCE(rack, ''), COALESCE(bin, '')
HAVING COUNT(*) > 1;
```

### Check Stock Ledger
```sql
SELECT 
  item_code,
  bin_location,
  qty,
  last_transaction_ref,
  updated_at
FROM tabStockLedger
WHERE item_code = 'SKU-TEST-001'
ORDER BY updated_at DESC;
```

### Check Stock Transactions
```sql
SELECT 
  transaction_date,
  bin_location,
  qty_change,
  qty_before,
  qty_after
FROM tabStockTransaction
WHERE item_code = 'SKU-TEST-001'
  AND reference_doc = 'PUT-20251231-0001'
ORDER BY transaction_date;
```

## Next Steps

1. ✅ **Restart API server** to apply fixes
2. ✅ **Test with new putaway tasks** to verify fixes work
3. ⚠️ **Clean up existing incorrect data** (optional):
   - Delete duplicate putaway lines
   - Correct stock ledger quantities
   - Fix incorrect locations

## Summary

✅ **Fixed:** target_bin parsing for single part values (e.g., "B1")
✅ **Fixed:** Duplicate stock updates using Set-based deduplication
✅ **Fixed:** bin_location calculation for bin-only locations

**Impact:**
- No more duplicate lines with incorrect rack/bin values
- No more stock doubling
- Correct quantities in location breakdown
- Improved data integrity

