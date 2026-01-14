# Bin Location Parsing Fix

## Issue

The API was returning incomplete `bin_location` values like `"Rack 02-B2"` instead of the full location ID format like `"A1-R02-L1-B2"`. The stored value in `tabCartonStock` or `tabStockLedger` doesn't exactly match any `location_id` in `tabLocation`, so the LEFT JOIN was falling back to the incomplete stored value.

## Root Cause

1. **Data stored with incomplete format**: `tabCartonStock.bin_location = "Rack 02-B2"`
2. **No exact match in tabLocation**: There's no `location_id = "Rack 02-B2"` in `tabLocation`
3. **LEFT JOIN fails**: The JOIN on `location_id` doesn't find a match, returns NULL
4. **Fallback to incomplete value**: `COALESCE` falls back to stored `"Rack 02-B2"`

## Solution

Updated the `getStockLedgerByItem` function to:

1. **Fetch raw data first** (without JOIN)
2. **Try exact match** with `tabLocation.location_id`
3. **Parse incomplete formats** like "Rack 02-B2":
   - Extract rack part: "Rack 02" (before last '-')
   - Extract bin part: "B2" (after last '-')
4. **Match by `parent_rack` and `bin_id`** in `tabLocation`:
   - Match `parent_rack = "Rack 02"` OR `parent_rack LIKE "%02%"` OR `parent_rack LIKE "%Rack 02%"`
   - AND `bin_id = "B2"`
5. **Use matched `location_id`** or fall back to stored value

## Changes Applied

### File: `wms-api/src/modules/stock-ledger/stockLedgerController.js`

#### 1. Updated `tabStockLedger` Query Processing

**Before:**
```javascript
const [stockLedgerRows] = await connection.execute(`
  SELECT ..., COALESCE(loc.location_id, sl.bin_location) as bin_location
  FROM tabStockLedger sl
  LEFT JOIN tabLocation loc ON sl.bin_location = loc.location_id
  ...
`);
```

**After:**
```javascript
// 1. Get raw data
const [stockLedgerRowsRaw] = await connection.execute(`...`);

// 2. Process each row to find matching location_id
for (const row of stockLedgerRowsRaw) {
  // Try exact match
  // If not found, parse "Rack 02-B2" and match by parent_rack + bin_id
  // Use matched location_id or fall back
}
```

#### 2. Updated `tabCartonStock` Query Processing

**Before:**
```javascript
const [cartonRows] = await connection.execute(`
  SELECT ..., COALESCE(loc.location_id, cs.bin_location) as bin_location
  FROM tabCartonStock cs
  LEFT JOIN tabLocation loc ON cs.bin_location = loc.location_id
  ...
`);
```

**After:**
```javascript
// 1. Get raw data
const [cartonRowsRaw] = await connection.execute(`...`);

// 2. Process each row to find matching location_id
for (const row of cartonRowsRaw) {
  // Try exact match
  // If not found, parse "Rack 02-B2" and match by parent_rack + bin_id
  // Use matched location_id or fall back
}
```

## Parsing Logic

### Input Format: `"Rack 02-B2"`

1. **Split by `-`**: `["Rack 02", "B2"]`
2. **Extract rack part**: `parts.slice(0, -1).join('-')` → `"Rack 02"`
3. **Extract bin part**: `parts[parts.length - 1]` → `"B2"`

### Matching Strategy

```sql
SELECT location_id 
FROM tabLocation 
WHERE warehouse = ?
  AND (
    parent_rack = 'Rack 02'           -- Exact match
    OR parent_rack LIKE '%02%'        -- Contains "02"
    OR parent_rack LIKE '%Rack 02%'   -- Contains "Rack 02"
  )
  AND bin_id = 'B2'                   -- Exact bin match
LIMIT 1
```

**Example Match:**
- `tabLocation` has: `location_id = "A1-R02-L1-B2"`, `parent_rack = "Rack 02"`, `bin_id = "B2"`
- Query matches → Returns `"A1-R02-L1-B2"`

## Example Transformation

### Before Fix
```json
{
  "bin_location": "Rack 02-B2",  // ❌ Incomplete format
  "cartons": [...]
}
```

### After Fix
```json
{
  "bin_location": "A1-R02-L1-B2",  // ✅ Full location ID
  "cartons": [...]
}
```

## Testing

### Test Case 1: Exact Match
```sql
-- tabCartonStock: bin_location = "A1-R02-L1-B2"
-- tabLocation: location_id = "A1-R02-L1-B2"
-- Expected: Returns "A1-R02-L1-B2" (exact match)
```

### Test Case 2: Parsing Match
```sql
-- tabCartonStock: bin_location = "Rack 02-B2"
-- tabLocation: location_id = "A1-R02-L1-B2", parent_rack = "Rack 02", bin_id = "B2"
-- Expected: Returns "A1-R02-L1-B2" (matched by parsing)
```

### Test Case 3: No Match Found
```sql
-- tabCartonStock: bin_location = "Unknown-Location"
-- tabLocation: No matching location
-- Expected: Returns "Unknown-Location" (fallback to stored value)
```

## Benefits

✅ **Handles Incomplete Formats**: Parses "Rack 02-B2" and finds matching location  
✅ **Backward Compatible**: Falls back to stored value if no match found  
✅ **Data Consistency**: Returns full location IDs when possible  
✅ **Flexible Matching**: Handles variations in parent_rack format  

## Notes

- The parsing logic handles formats like "Rack 02-B2" by splitting on `-` and extracting the last part as bin
- Matching by `parent_rack` and `bin_id` is more flexible than exact string matching
- If no match is found, the original stored value is returned (backward compatible)
- The fix applies to both `tabStockLedger` and `tabCartonStock` queries

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-11  
**Files Modified:** `wms-api/src/modules/stock-ledger/stockLedgerController.js`
