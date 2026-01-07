# Fix: Stock Qty Updated but Location Breakdown Not Showing

## Problem
- Stock quantity (`tabItem.stock_qty`) is updated correctly after putaway
- Location breakdown (from `tabStockLedger`) shows "Total Qty: 0" or no locations

## Root Causes

### 1. **Warehouse Name Mismatch** (Most Common)
- Putaway writes to `tabStockLedger` with warehouse name from ASN (e.g., "WH-MAIN")
- Location breakdown searches for different warehouse name (e.g., "Main Warehouse")
- **Solution**: Normalize warehouse names in putaway code

### 2. **Missing `bin_location`**
- Putaway task doesn't have `rack` and `bin` values set
- `bin_location` in `tabStockLedger` is `NULL`
- Location breakdown filters out `NULL` bin locations
- **Solution**: Ensure `rack` and `bin` are set when scanning location

### 3. **Stock Ledger Not Updated**
- Putaway completes but `tabStockLedger` insert/update fails silently
- **Solution**: Add error logging and verification

## Diagnostic Steps

### Step 1: Run Verification Script
```bash
cd wms-api
node verify-putaway-stock-ledger.js
```

This will show:
- Recent putaway tasks and their status
- Putaway lines with locations
- Stock ledger entries for putaway items
- Warehouse name mismatches
- Missing stock ledger entries

### Step 2: Check Warehouse Names
```sql
-- Check warehouse names in ASN
SELECT DISTINCT warehouse, COUNT(*) as asn_count
FROM tabAdvanceShippingNotice
WHERE warehouse IS NOT NULL
GROUP BY warehouse;

-- Check warehouse names in Stock Ledger
SELECT DISTINCT warehouse, COUNT(*) as ledger_count
FROM tabStockLedger
GROUP BY warehouse;

-- Compare: If names differ, that's the issue
```

### Step 3: Check Putaway Lines vs Stock Ledger
```sql
-- Find putaway items missing in stock ledger
SELECT 
  pl.item_code,
  pl.parent_title as putaway_task,
  CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL, CONCAT('-', pl.bin), '')) as putaway_bin_location,
  pl.qty as putaway_qty,
  sl.warehouse as stock_warehouse,
  sl.bin_location as stock_bin_location,
  sl.qty as stock_qty
FROM tabPutawayLine pl
LEFT JOIN tabStockLedger sl ON 
  sl.item_code = pl.item_code 
  AND sl.bin_location = CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL, CONCAT('-', pl.bin), ''))
WHERE pl.rack IS NOT NULL
  AND sl.item_code IS NULL;  -- Missing in stock ledger
```

## Solutions

### Solution 1: Normalize Warehouse Names (Already Implemented)
The putaway code now normalizes warehouse names:
- "WH-MAIN" → "Main Warehouse"
- "Main" → "Main Warehouse"
- Keeps "Main Warehouse" as is

**Location**: `wms-api/src/modules/putaway/putawayController.js` (lines 1370-1389)

### Solution 2: Ensure Rack and Bin Are Set
When scanning location in mobile app:
- **Required**: `rack` parameter must be provided
- **Optional**: `bin` parameter (can be null)
- **API**: `POST /api/putaway/scan-transfer-carton` with `rack` and `bin`

### Solution 3: Verify Stock Ledger Updates
Check backend logs for:
```
[Putaway] Using warehouse: "Main Warehouse" for task PUT-...
[Putaway] Updating stock ledger: item=SKU-XXX, warehouse=Main Warehouse, bin_location=RACK-BIN, qty=100
[Putaway] Successfully updated stock ledger: item=SKU-XXX, warehouse=Main Warehouse, bin_location=RACK-BIN, qty=100
```

If you see errors, check:
- Database connection
- Unique key constraint violations
- Missing columns in `tabStockLedger`

## Manual Fix for Existing Data

If you have existing putaway tasks with stock but no location breakdown:

### Option 1: Update Warehouse Names in Stock Ledger
```sql
-- Normalize warehouse names in stock ledger
UPDATE tabStockLedger
SET warehouse = 'Main Warehouse'
WHERE warehouse IN ('WH-MAIN', 'WH-Main', 'Main');

-- Verify
SELECT DISTINCT warehouse FROM tabStockLedger;
```

### Option 2: Re-run Putaway Stock Update Script
```bash
cd wms-api
node update-existing-putaway-stock.js
```

This will:
- Update `tabStockLedger` for all putaway tasks
- Use normalized warehouse name ("Main Warehouse")
- Update `tabItem.stock_qty` from stock ledger sum

## Verification

After fixes, verify:

1. **Check Stock Ledger Has Entries**:
```sql
SELECT 
  item_code,
  warehouse,
  bin_location,
  qty
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-BLU-OS'
  AND warehouse = 'Main Warehouse'
  AND bin_location IS NOT NULL;
```

2. **Check Location Breakdown Can Find It**:
- Open Item Location Breakdown for the item
- Should show locations with quantities
- Total Qty should match `tabItem.stock_qty`

3. **Check Warehouse Name Consistency**:
```sql
-- All should use "Main Warehouse"
SELECT DISTINCT warehouse FROM tabStockLedger WHERE item_code = 'SKU-HAT-301-BLU-OS';
SELECT warehouse FROM tabAdvanceShippingNotice WHERE title = 'ASN-AAA';
```

## Prevention

1. **Always Normalize Warehouse Names**:
   - Use "Main Warehouse" as the standard
   - Normalize in putaway, receiving, and other stock update operations

2. **Ensure Rack and Bin Are Set**:
   - Mobile app must send `rack` parameter
   - Backend validates `rack` is not null before updating stock ledger

3. **Add Logging**:
   - Log warehouse name used
   - Log bin_location created
   - Log stock ledger update success/failure

4. **Test After Each Putaway**:
   - Verify `tabStockLedger` has entry
   - Verify location breakdown shows the entry
   - Verify warehouse name matches

## Summary

**The fix is already implemented** - warehouse name normalization is in place. 

**To fix existing data:**
1. Run `verify-putaway-stock-ledger.js` to diagnose
2. Normalize warehouse names in `tabStockLedger` (SQL above)
3. Re-run `update-existing-putaway-stock.js` if needed

**For new putaway tasks:**
- Ensure mobile app sends `rack` parameter
- Backend will normalize warehouse name automatically
- Stock ledger will be updated with correct warehouse and bin_location

