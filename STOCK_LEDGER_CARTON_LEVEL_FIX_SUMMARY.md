# Stock Ledger Carton-Level Fix Summary

## Overview

This document summarizes the fixes applied to support carton-level stock tracking in the stock ledger, ensuring that multiple putaway operations with different carton IDs at the same bin location are handled correctly.

## Problems Fixed

1. **Stock Ledger Mismatch**: Stock ledger showed incorrect totals compared to transaction history
2. **Carton Overwriting**: Multiple putaway operations with different cartons at the same bin were overwriting each other
3. **Available Qty Calculation**: Verified and confirmed correct calculation (`available_qty = qty - reserved_qty`)
4. **Unique Key Constraint**: Updated to support carton-level tracking

## Changes Implemented

### 1. Database Migration

**File**: `SCRIPTS/MIGRATION_007_STOCK_LEDGER_CARTON_LEVEL.sql`

- ✅ Adds `carton_id` column to `tabStockLedger` if missing
- ✅ Removes old unique key `uk_item_warehouse_bin`
- ✅ Adds new unique key `uq_stockledger_item_bin_carton` with carton_id: `(warehouse, bin_location, item_code, carton_id)`
- ✅ Adds index on `carton_id` for performance
- ✅ Verifies `available_qty` is calculated correctly (as generated column: `qty - reserved_qty`)

**To Apply:**
```sql
-- Run the migration script
SOURCE SCRIPTS/MIGRATION_007_STOCK_LEDGER_CARTON_LEVEL.sql;
```

### 2. Putaway Controller Updates

**File**: `wms-api/src/modules/putaway/putawayController.js`

- ✅ Updated FROM location handling to support carton_id (lines 3085-3114)
- ✅ TO location handling already supported carton_id (lines 3168-3175)
- ✅ Properly handles carton-specific stock at staging locations when applicable

**Key Changes:**
- FROM location queries now check for carton-specific stock when carton_id is provided
- Maintains backward compatibility with bin-level stock at staging areas
- DELETE operations include carton_id filter when applicable

### 3. Desktop App Updates

**File**: `Services/StockLedgerService.cs`

- ✅ Updated `GetAllStockLedgerAsync` to include `carton_id` in SELECT queries
- ✅ Updated `GetStockByBinAsync` to include `carton_id` (already had support)
- ✅ Updated `GetAllStockLedgerPagedAsync` to include `carton_id` in SELECT queries
- ✅ All methods now map `carton_id` to `CartonId` property in `StockLedger` model

**Model**: `Models/StockLedger.cs`
- ✅ Already has `CartonId` property (line 11)

### 4. Rebuild Ledger Tool

**File**: `wms-api/rebuild-stock-ledger-from-history.js`

- ✅ New tool to rebuild stock ledger from transaction history
- ✅ Supports carton-level tracking
- ✅ Can filter by warehouse and/or item code
- ✅ Dry-run mode available for testing

**Usage:**
```bash
# Dry run (no changes)
node rebuild-stock-ledger-from-history.js --dry-run

# Rebuild all
node rebuild-stock-ledger-from-history.js

# Rebuild for specific warehouse
node rebuild-stock-ledger-from-history.js --warehouse WAREHOUSE_CODE

# Rebuild for specific item
node rebuild-stock-ledger-from-history.js --item ITEM_CODE

# Combine filters
node rebuild-stock-ledger-from-history.js --warehouse WAREHOUSE_CODE --item ITEM_CODE
```

### 5. Available Qty Calculation

**Status**: ✅ Already Correct

- Database: `available_qty DECIMAL(10,2) AS (qty - reserved_qty) STORED` (generated column)
- API: `availableQty = qtyAfter - reservedQty` (line 617 in stockLedgerController.js)
- Desktop: `AvailableQty => RemainingStock - ReservedQty` (line 15 in StockLedger.cs)

No changes needed - calculation is correct everywhere.

### 6. Idempotency Support

**Status**: ✅ Already Implemented

- Uses `offline_uuid` in `tabWmsScanEvent` table with UNIQUE constraint
- API checks `affectedRows` after INSERT to detect duplicates
- Multiple layers of duplicate prevention in event processing
- See `PUTAWAY_DUPLICATE_PREVENTION.md` for details

No additional changes needed.

## How It Works

### Before Fix

- Unique key: `(item_code, warehouse, bin_location)`
- Multiple putaway operations with different cartons at same bin would overwrite each other
- Example: Putaway Carton A (qty=25) then Carton B (qty=25) → Ledger shows qty=25 (wrong, should be 50)

### After Fix

- Unique key: `(warehouse, bin_location, item_code, carton_id)`
- Each carton gets its own ledger entry
- Example: Putaway Carton A (qty=25) then Carton B (qty=25) → Ledger shows:
  - Entry 1: carton_id=A, qty=25
  - Entry 2: carton_id=B, qty=25
  - Total at bin = 50 ✅

### Carton ID Handling

- **With Carton ID**: Creates/updates carton-specific ledger entry
- **Without Carton ID (NULL)**: Creates/updates bin-level ledger entry (for legacy records or staging areas)
- **Staging Areas**: Typically use bin-level tracking (carton_id = NULL)
- **Storage Bins**: Use carton-level tracking when carton_id is provided

## Verification Steps

1. **Run Migration**:
   ```sql
   SOURCE SCRIPTS/MIGRATION_007_STOCK_LEDGER_CARTON_LEVEL.sql;
   ```

2. **Verify Table Structure**:
   ```sql
   DESCRIBE tabStockLedger;
   -- Should show carton_id column
   
   SHOW INDEXES FROM tabStockLedger;
   -- Should show uq_stockledger_item_bin_carton unique key
   ```

3. **Test Putaway with Multiple Cartons**:
   - Create putaway task with Carton A
   - Complete putaway to bin location X
   - Create putaway task with Carton B (same item, same bin)
   - Complete putaway to bin location X
   - Check stock ledger: Should see 2 separate entries for same bin+item with different carton_id

4. **Verify Available Qty**:
   ```sql
   SELECT 
     item_code, 
     bin_location, 
     carton_id,
     qty, 
     reserved_qty, 
     available_qty,
     (qty - reserved_qty) as calculated_available
   FROM tabStockLedger
   WHERE item_code = 'YOUR_ITEM'
   ORDER BY bin_location, carton_id;
   -- available_qty should equal calculated_available
   ```

5. **Rebuild Ledger (if needed)**:
   ```bash
   # Test with dry-run first
   node rebuild-stock-ledger-from-history.js --dry-run
   
   # Then run for real
   node rebuild-stock-ledger-from-history.js
   ```

## Backward Compatibility

- ✅ Existing records without `carton_id` remain valid (carton_id = NULL)
- ✅ Bin-level queries still work (filter by carton_id IS NULL)
- ✅ Staging areas continue to use bin-level tracking
- ✅ Desktop app queries handle missing carton_id gracefully

## Files Modified

1. `SCRIPTS/MIGRATION_007_STOCK_LEDGER_CARTON_LEVEL.sql` (new)
2. `wms-api/src/modules/putaway/putawayController.js` (updated)
3. `Services/StockLedgerService.cs` (updated)
4. `wms-api/rebuild-stock-ledger-from-history.js` (new)
5. `STOCK_LEDGER_CARTON_LEVEL_FIX_SUMMARY.md` (this file, new)

## Next Steps

1. ✅ Run migration script on database
2. ✅ Test putaway operations with multiple cartons
3. ✅ Verify stock ledger shows correct totals
4. ✅ Run rebuild tool if existing data needs correction
5. ✅ Monitor for any issues with carton-level tracking

## Notes

- The `available_qty` calculation was already correct - no changes needed
- Idempotency was already implemented via `offline_uuid` - no changes needed
- The main fix was adding carton_id support to the unique key constraint
- Desktop app queries now include carton_id but handle its absence gracefully
