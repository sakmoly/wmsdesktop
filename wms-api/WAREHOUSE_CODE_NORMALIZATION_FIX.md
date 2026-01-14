# Warehouse Code Normalization Fix

## Issue
The system was storing warehouse **NAMES** (e.g., "Main Warehouse") in `tabStockLedger.warehouse` instead of warehouse **CODES** (e.g., "WH-MAIN"). This caused inconsistencies in the stock ledger, with some transactions showing "WH-MAIN" and others showing "Main Warehouse".

## Root Cause
The code was:
1. Getting warehouse from ASN or defaulting to "Main Warehouse" (name)
2. Looking up warehouse name from `tabWarehouse`
3. Storing the warehouse **name** in stock ledger instead of **code**

## Solution

### 1. Created Helper Function: `normalizeWarehouseToCode()`

Added a helper function in both `putawayController.js` and `cycleCountController.js` to normalize warehouse to CODE:

```javascript
/**
 * Helper function to normalize warehouse to CODE (not name)
 * CRITICAL: tabStockLedger stores warehouse CODE, not NAME
 * @param {Object} connection - Database connection
 * @param {string} warehouse - Warehouse name or code
 * @returns {Promise<string>} - Warehouse code (e.g., "WH-MAIN")
 */
async function normalizeWarehouseToCode(connection, warehouse) {
  // 1. Check if already a code
  // 2. If name, look up code from tabWarehouse
  // 3. Fallback to default warehouse code
  // 4. Last resort: return as-is with warning
}
```

### 2. Updated All Stock Ledger Insertions

**Putaway Controller (`putawayController.js`):**
- `completePutaway()` - Line 1659-1691: Normalize warehouse before stock update
- `scanTransferCarton()` - Line 3321-3352: Normalize warehouse before stock update

**Cycle Count Controller (`cycleCountController.js`):**
- `submitCycleCount()` - Line 2407: Normalize warehouse before stock update
- `completeCycleCount()` - Line 2497: Normalize warehouse before stock update

**Events Controller (`eventController.js`):**
- `batchEvents()` - Line 735-743: Normalize warehouse before stock update

### 3. SQL Script to Fix Existing Data

Created `SCRIPTS/FixWarehouseToCode.sql` to:
- Convert all warehouse NAMES to CODES in:
  - `tabStockLedger`
  - `tabCartonStock`
  - `tabStockTransaction`
- Handle case-insensitive matches
- Set orphaned warehouse values to default warehouse code

## How to Fix Existing Data

### Step 1: Run the SQL Script

```bash
# Connect to MySQL database
mysql -u your_username -p your_database_name < SCRIPTS/FixWarehouseToCode.sql
```

Or execute the script in your MySQL client:

```sql
-- See SCRIPTS/FixWarehouseToCode.sql for full script
```

### Step 2: Verify the Fix

After running the script, verify:

```sql
-- Check warehouse codes in stock ledger
SELECT DISTINCT warehouse, COUNT(*) as entry_count
FROM tabStockLedger
GROUP BY warehouse
ORDER BY entry_count DESC;

-- Should show only warehouse CODES (e.g., "WH-MAIN"), not names
```

### Step 3: Restart API Server

Restart the API server to ensure all new transactions use warehouse codes:

```bash
# Stop the API server
# Start the API server again
```

## Expected Behavior After Fix

### Before Fix:
- `tabStockLedger.warehouse` could contain: "Main Warehouse", "WH-MAIN", "WH-Main", etc.
- Inconsistent warehouse values across transactions

### After Fix:
- `tabStockLedger.warehouse` contains only warehouse CODES: "WH-MAIN", "WH-SECONDARY", etc.
- Consistent warehouse values across all transactions
- All new transactions automatically use warehouse CODE

## Testing

1. **Create a Putaway Task:**
   - Complete the putaway task
   - Verify `tabStockLedger.warehouse` contains warehouse CODE (e.g., "WH-MAIN"), not name

2. **Create a Cycle Count:**
   - Complete the cycle count
   - Verify `tabStockLedger.warehouse` contains warehouse CODE

3. **Check Stock Ledger:**
   - Open Stock Ledger in desktop app
   - Verify all warehouse values are codes (e.g., "WH-MAIN"), not names

## Summary

✅ **Fixed**: All stock ledger insertions now use warehouse CODE instead of NAME
✅ **Created**: Helper function `normalizeWarehouseToCode()` in putaway and cycle count controllers
✅ **Updated**: Events controller to use warehouse CODE
✅ **Script**: SQL script to fix existing data in `tabStockLedger`, `tabCartonStock`, and `tabStockTransaction`

---

**Files Modified:**
- `wms-api/src/modules/putaway/putawayController.js` - Added `normalizeWarehouseToCode()` helper, updated 2 locations
- `wms-api/src/modules/cycle-count/cycleCountController.js` - Added `normalizeWarehouseToCode()` helper, updated 2 locations
- `wms-api/src/modules/events/eventController.js` - Updated warehouse normalization

**New Files:**
- `SCRIPTS/FixWarehouseToCode.sql` - SQL script to fix existing data
- `wms-api/WAREHOUSE_CODE_NORMALIZATION_FIX.md` - This documentation
