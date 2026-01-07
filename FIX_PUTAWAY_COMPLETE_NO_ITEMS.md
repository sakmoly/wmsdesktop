# Fix: Putaway Complete Returns items_updated: 0

## Problem

When calling `POST /api/putaway/complete`, the response shows:
```json
{
  "ok": true,
  "message": "Putaway completed successfully",
  "data": {
    "putaway_task": "PUT-20251230-0001",
    "status": "Completed",
    "stock_updated": true,
    "warehouse": "Main Warehouse",
    "items_updated": 0,  // ← Problem: No items were updated
    "stock_updates": []   // ← Problem: No stock updates
  }
}
```

## Root Causes

### 1. Items Array Not Provided or Empty

If the `items` array is not provided or is empty, the function only processes existing putaway lines from the database. If there are no lines in the database with valid locations (rack/bin), nothing gets processed.

### 2. Items Missing Required Fields

The condition on line 779 requires:
```javascript
if (item.item_code && item.completed && item.qty > 0 && item.target_bin) {
```

**Required fields:**
- ✅ `item_code` - Item code
- ✅ `completed` - Must be `true`
- ✅ `qty` - Must be > 0
- ✅ `target_bin` - Target bin location (e.g., "A1-R01-L1-B1-B1")

**If any of these are missing, the item is skipped!**

### 3. Putaway Lines Have No Locations

If putaway lines exist in the database but don't have `rack` and `bin` values (they're NULL or empty), they won't be processed for stock updates.

## Solutions

### Solution 1: Provide Items Array with Required Fields

**Correct JSON Payload:**
```json
{
  "putaway_task": "PUT-20251230-0001",
  "performed_by": "USER-786249",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 75,
      "target_bin": "A1-R01-L1-B1-B1",
      "completed": true,  // ← REQUIRED!
      "carton_id": "PAW-ASN12225-1767129206"
    }
  ]
}
```

**Note:** `target_bin` format is `rack-bin` (e.g., `A1-R01-L1-B1-B1` means rack=`A1-R01-L1-B1`, bin=`B1`)

### Solution 2: Ensure Database Lines Have Locations

If you're not providing items, ensure the putaway lines in the database have `rack` and `bin` values:

```sql
-- Check putaway lines
SELECT 
  item_code, 
  qty, 
  rack, 
  bin, 
  carton_id
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001';

-- If rack/bin are NULL, update them:
UPDATE tabPutawayLine
SET rack = 'A1-R01-L1-B1',
    bin = 'B1'
WHERE parent_title = 'PUT-20251230-0001'
  AND item_code = 'SKU-HAT-301-BLU-OS'
  AND (rack IS NULL OR rack = 'TBD' OR bin IS NULL OR bin = 'TBD');
```

### Solution 3: Use scan-transfer-carton First

If you haven't scanned the transfer carton yet, use that endpoint first to create lines with locations:

```json
POST /api/putaway/scan-transfer-carton
{
  "tc_id": "TC-1767129300851",
  "rack": "A1-R01-L1-B1",
  "bin": "B1",
  "user_id": "USER-786249"
}
```

This will:
1. Create/update putaway task
2. Create putaway lines with locations
3. Update stock ledger

Then you can complete the putaway without providing items.

## Debugging Steps

### 1. Check What Was Sent

Verify your request includes:
- ✅ `items` array (if not using database lines)
- ✅ Each item has `completed: true`
- ✅ Each item has `target_bin`
- ✅ Each item has `qty > 0`

### 2. Check Database Lines

```sql
SELECT 
  item_code,
  qty,
  rack,
  bin,
  carton_id
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
  AND item_code IS NOT NULL
  AND qty > 0;
```

### 3. Check Stock Ledger

```sql
SELECT 
  item_code,
  warehouse,
  bin_location,
  qty
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-BLU-OS'
ORDER BY updated_at DESC;
```

## Expected Behavior

### If Items Provided:
- Items are processed and added to `putawayLines` array
- Stock ledger is updated for each item
- `items_updated` = number of items processed
- `stock_updates` = array of stock update details

### If Items Not Provided:
- Uses existing putaway lines from database
- Only processes lines with valid `rack` and `bin` values
- `items_updated` = number of lines processed
- `stock_updates` = array of stock update details

## Quick Fix

**If you're getting `items_updated: 0`, try this payload:**

```json
{
  "putaway_task": "PUT-20251230-0001",
  "performed_by": "USER-786249",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 75,
      "target_bin": "A1-R01-L1-B1-B1",
      "completed": true,
      "carton_id": "PAW-ASN12225-1767129206"
    }
  ]
}
```

**Make sure:**
- ✅ `completed: true` is included
- ✅ `target_bin` is in format `rack-bin` (e.g., `A1-R01-L1-B1-B1`)
- ✅ `qty` is a positive number

---

**The most common issue is missing `completed: true` in the items array!**

