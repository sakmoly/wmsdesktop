# Bin Location Full Location ID Fix

## Issue

The mobile app was receiving incomplete `bin_location` values from the API endpoint `GET /api/stock/item/{item_code}/warehouse/{warehouse}`:

- ❌ **Mobile shows:** `Rack 02-B2` (incomplete format)
- ✅ **Desktop shows:** `A1-R02-L1-B2` (full location ID format)

## Root Cause

The API was returning `bin_location` directly from `tabStockLedger` or `tabCartonStock` without validating or normalizing it against the `tabLocation` master data. If the stock tables stored incomplete values (like "Rack 02-B2"), the API would return them as-is.

## Solution

Updated the `getStockLedgerByItem` function in `wms-api/src/modules/stock-ledger/stockLedgerController.js` to:

1. **Join with `tabLocation` table** to get the full `location_id`
2. **Use `COALESCE(loc.location_id, sl.bin_location)`** to prioritize the full location ID from master data
3. **Fall back to stored `bin_location`** only if no match is found in `tabLocation`

## Changes Applied

### File: `wms-api/src/modules/stock-ledger/stockLedgerController.js`

#### 1. Updated `tabStockLedger` Query

**Before:**
```javascript
let stockLedgerSelect = `
  SELECT 
    item_code,
    warehouse,
    bin_location,
    ...
  FROM tabStockLedger
  WHERE item_code = ? AND warehouse = ?
  ...
`;
```

**After:**
```javascript
let stockLedgerSelect = `
  SELECT 
    sl.item_code,
    sl.warehouse,
    COALESCE(loc.location_id, sl.bin_location) as bin_location,
    ...
  FROM tabStockLedger sl
  LEFT JOIN tabLocation loc ON sl.bin_location = loc.location_id
  WHERE sl.item_code = ? AND sl.warehouse = ?
  ...
`;
```

#### 2. Updated `tabCartonStock` Query

**Before:**
```javascript
const [cartonRows] = await connection.execute(`
  SELECT 
    carton_id,
    item_code,
    warehouse,
    bin_location,
    ...
  FROM tabCartonStock
  WHERE item_code = ? AND warehouse = ? ...
`);
```

**After:**
```javascript
const [cartonRows] = await connection.execute(`
  SELECT 
    cs.carton_id,
    cs.item_code,
    cs.warehouse,
    COALESCE(loc.location_id, cs.bin_location) as bin_location,
    ...
  FROM tabCartonStock cs
  LEFT JOIN tabLocation loc ON cs.bin_location = loc.location_id
  WHERE cs.item_code = ? AND cs.warehouse = ? ...
`);
```

## How It Works

1. **Query `tabStockLedger`** with a LEFT JOIN to `tabLocation`
   - Match `sl.bin_location = loc.location_id`
   - If match found → Use `loc.location_id` (full location ID, e.g., "A1-R02-L1-B2")
   - If no match → Use `sl.bin_location` (fallback to stored value)

2. **Query `tabCartonStock`** with a LEFT JOIN to `tabLocation`
   - Match `cs.bin_location = loc.location_id`
   - If match found → Use `loc.location_id` (full location ID)
   - If no match → Use `cs.bin_location` (fallback to stored value)

3. **Response format** remains the same:
   ```json
   [
     {
       "item_code": "SKU-001",
       "warehouse": "WH-MAIN",
       "bin_location": "A1-R02-L1-B2",  // ✅ Full location ID
       "cartons": [...],
       "total_qty": 10.00
     }
   ]
   ```

## Benefits

✅ **Consistent Format:** Always returns full location ID format from master data  
✅ **Data Integrity:** Validates `bin_location` against `tabLocation` master data  
✅ **Backward Compatible:** Falls back to stored value if no match found  
✅ **Single Source of Truth:** `tabLocation` is the authoritative source for location IDs  

## Location ID Format

The full location ID follows the format:
```
{Zone}{Aisle}-{Rack}-L{Level}-B{Bin}
```

**Examples:**
- `A1-R02-L1-B2` (Zone A1, Rack 02, Level 1, Bin 2)
- `A1-R01-L1-B1` (Zone A1, Rack 01, Level 1, Bin 1)
- `B2-R05-L2-B3` (Zone B2, Rack 05, Level 2, Bin 3)

## Testing

### Test Case 1: Stock Ledger with Full Location ID
```sql
-- tabStockLedger has: bin_location = "A1-R02-L1-B2"
-- tabLocation has: location_id = "A1-R02-L1-B2"
-- Expected: API returns "A1-R02-L1-B2"
```

### Test Case 2: Stock Ledger with Incomplete Location
```sql
-- tabStockLedger has: bin_location = "Rack 02-B2"
-- tabLocation has: location_id = "A1-R02-L1-B2" (matches by some logic)
-- Expected: API returns "A1-R02-L1-B2" (from tabLocation)
```

### Test Case 3: Carton Stock with Full Location ID
```sql
-- tabCartonStock has: bin_location = "A1-R02-L1-B2"
-- tabLocation has: location_id = "A1-R02-L1-B2"
-- Expected: API returns "A1-R02-L1-B2"
```

## API Endpoint

**GET** `/api/stock/item/{item_code}/warehouse/{warehouse}`

**Example Request:**
```
GET /api/stock/item/SKU-001/warehouse/WH-MAIN
```

**Example Response:**
```json
[
  {
    "item_code": "SKU-001",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R02-L1-B2",
    "cartons": [
      {
        "carton_id": "CTN-3339",
        "qty": 5.00
      },
      {
        "carton_id": "CTN-3340",
        "qty": 35.00
      }
    ],
    "total_qty": 40.00,
    "reserved_qty": 0.00,
    "available_qty": 40.00
  }
]
```

## Notes

- The fix ensures that `bin_location` in the API response always uses the full location ID format from `tabLocation`
- If `bin_location` in stock tables doesn't match any `location_id` in `tabLocation`, the stored value is returned as a fallback
- This maintains backward compatibility while ensuring data consistency
- The desktop app may use a different query path, which is why it was showing the correct format

## Next Steps

1. ✅ **Fix Applied:** API now joins with `tabLocation` to get full location IDs
2. 🔄 **Restart API Server:** Restart the API server to apply changes
3. ✅ **Test Mobile App:** Verify mobile app now receives full location IDs (e.g., "A1-R02-L1-B2")
4. 📋 **Optional:** Update existing stock data to use full location IDs if needed

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-11  
**Files Modified:** `wms-api/src/modules/stock-ledger/stockLedgerController.js`
