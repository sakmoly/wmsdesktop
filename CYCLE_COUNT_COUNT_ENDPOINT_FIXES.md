# Cycle Count Count Endpoint Fixes

## Issues Fixed

### 1. **Response Data Types**
   - **Problem:** `items_with_discrepancy` was being returned as a string `"2"` instead of a number
   - **Root Cause:** MySQL's `COUNT()` and `SUM()` functions return BigInt values, which can be serialized as strings in JSON
   - **Fix:** Changed from `parseInt()` to `Number()` to properly handle BigInt values
   - **Location:** `wms-api/src/modules/cycle-count/cycleCountController.js` line ~973-975

### 2. **Discrepancy Calculation**
   - **Problem:** Items with `expected_qty = 0` were being counted in `items_with_discrepancy`
   - **Fix:** Updated SQL query to only count discrepancies when `expected_qty > 0`:
     ```sql
     SUM(CASE WHEN expected_qty > 0 AND ABS(COALESCE(discrepancy, 0)) > 0 THEN 1 ELSE 0 END) as with_discrepancy
     ```
   - **Location:** `wms-api/src/modules/cycle-count/cycleCountController.js` line ~961

### 3. **Carton Matching**
   - **Problem:** Carton matching was too loose, using `OR carton_id IS NULL` which could match wrong lines
   - **Fix:** Changed to exact matching:
     - If `cartonId` is provided: match exactly `carton_id = ?`
     - If `cartonId` is not provided: match `carton_id IS NULL`
   - **Location:** `wms-api/src/modules/cycle-count/cycleCountController.js` line ~814-820

### 4. **Transaction Handling**
   - **Problem:** Validation errors returned before transaction started, but transaction wasn't rolled back on early returns
   - **Fix:** Moved validation before transaction start, and added rollback for task creation failures
   - **Location:** `wms-api/src/modules/cycle-count/cycleCountController.js` line ~615-630

### 5. **Verification and Logging**
   - Added post-commit verification query to confirm data was persisted
   - Added detailed logging for statistics calculation and data types
   - **Location:** `wms-api/src/modules/cycle-count/cycleCountController.js` line ~996-1007

## Response Format

The endpoint now returns all numeric fields as proper numbers:

```json
{
  "ok": true,
  "message": "Successfully updated 1 lines",
  "data": {
    "title": "CC-A1-R01-L1-B1-MK6MZ1UR",
    "updated_count": 1,           // number
    "counted_items": 2,            // number
    "items_with_discrepancy": 2,  // number (was string before)
    "total_items": 15              // number
  }
}
```

## Testing

A test script is available at `wms-api/test-cycle-count-simple.js`:

```bash
node test-cycle-count-simple.js [task-title] [api-url]
```

Example:
```bash
node test-cycle-count-simple.js CC-A1-R01-L1-B1-MK6MZ1UR http://localhost:3000
```

## Verification

To verify the database directly:

```bash
node verify-cycle-count-update.js CC-A1-R01-L1-B1-MK6MZ1UR
```

This will show:
- Task statistics from database
- All lines with their counts
- Verification that statistics match actual line counts

