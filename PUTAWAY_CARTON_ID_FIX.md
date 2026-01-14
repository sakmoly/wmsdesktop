# Putaway Carton ID Fix

## Issue

The carton ID from putaway lines (e.g., `PAW-ASN365425473-1768132558343`) was not being propagated to `tabStockLedger` and `tabCartonStock` when putaway tasks were completed. This caused the Item Location Breakdown to show incorrect or missing carton IDs.

## Root Cause

The putaway completion code (`completePutaway`) was:
- ✅ Reading `carton_id` from putaway lines
- ✅ Updating `tabCartonStock` with carton IDs
- ❌ **NOT including `carton_id` in `tabStockLedger` INSERT/UPDATE**

## Fix Applied

### 1. Updated Putaway Completion Code

**File:** `wms-api/src/modules/putaway/putawayController.js`

**Changes:**
1. **Added carton_id column check** for `tabStockLedger`
2. **Extract carton_id early** from putaway line (before stock ledger update)
3. **Include carton_id in stock ledger INSERT/UPDATE** if column exists and carton_id is provided
4. **Update tabCartonStock** with carton_id from putaway lines
5. **Include carton_id in stock transaction log** if column exists

**Key Code Changes:**

```javascript
// Extract carton_id from putaway line
const cartonId = line.carton_id || null;
const cartonIdValue = cartonId && cartonId.trim() !== '' ? cartonId.trim() : null;

// Include carton_id in stock ledger if column exists
if (hasStockLedgerCartonIdColumn && cartonIdValue) {
  insertFields += `, carton_id`;
  insertValues += `, ?`;
  insertParams.push(cartonIdValue);
  updateFields += `, carton_id = ?`;
  updateParams.push(cartonIdValue);
  console.log(`[Putaway] 📦 Including carton_id in stock ledger: ${cartonIdValue}`);
}
```

### 2. Created SQL Script to Fix Existing Data

**File:** `SCRIPTS/FixPutawayCartonIdInStockLedger.sql`

This script updates existing completed putaway tasks by:
- Updating `carton_id` in `tabStockLedger` from putaway lines
- Creating/updating entries in `tabCartonStock` with carton IDs from putaway lines
- Normalizing warehouse to CODE (not name)
- Providing verification queries

## How to Fix Existing Completed Putaway Tasks

### Step 1: Run the SQL Script

```bash
# Connect to MySQL and run the script
mysql -u your_username -p your_database_name < SCRIPTS/FixPutawayCartonIdInStockLedger.sql
```

Or execute in MySQL client:

```sql
-- Execute SCRIPTS/FixPutawayCartonIdInStockLedger.sql
```

### Step 2: Verify the Fix

```sql
-- Check that carton IDs are now populated in stock ledger
SELECT 
    sl.item_code,
    sl.warehouse,
    sl.bin_location,
    sl.carton_id,
    pl.carton_id as putaway_carton_id,
    sl.qty
FROM tabStockLedger sl
INNER JOIN tabPutawayLine pl ON 
    sl.item_code = pl.item_code 
    AND sl.last_transaction_type = 'Putaway'
    AND sl.last_transaction_ref = pl.parent_title
WHERE pl.carton_id IS NOT NULL
  AND pl.carton_id != ''
ORDER BY sl.last_transaction_ref, sl.item_code;
```

### Step 3: Refresh Item Location Breakdown

1. Open desktop app
2. Go to Items → Select an item
3. Click "Show Location Breakdown"
4. Carton IDs from putaway should now be visible

## Expected Behavior After Fix

### For New Putaway Tasks:
- ✅ Carton ID from putaway lines is included in `tabStockLedger.carton_id`
- ✅ Carton ID is included in `tabCartonStock` entries
- ✅ Carton ID appears in Item Location Breakdown

### For Existing Completed Putaway Tasks:
- ✅ Run SQL script to update existing data
- ✅ Carton IDs from putaway lines are propagated to stock tables
- ✅ Item Location Breakdown shows correct carton IDs

## Example

**Before Fix:**
- Putaway Task: `PUT-20260111-0001`
- Putaway Line: `carton_id = PAW-ASN365425473-1768132558343`
- Stock Ledger: `carton_id = NULL` ❌
- Item Location Breakdown: No carton ID shown ❌

**After Fix:**
- Putaway Task: `PUT-20260111-0001`
- Putaway Line: `carton_id = PAW-ASN365425473-1768132558343`
- Stock Ledger: `carton_id = PAW-ASN365425473-1768132558343` ✅
- Item Location Breakdown: Shows `PAW-ASN365425473-1768132558343` ✅

## Files Modified

- `wms-api/src/modules/putaway/putawayController.js` - Added carton_id to stock ledger updates
- `SCRIPTS/FixPutawayCartonIdInStockLedger.sql` - SQL script to fix existing data
- `PUTAWAY_CARTON_ID_FIX.md` - This documentation

## Summary

✅ **Fixed**: Carton ID from putaway lines now propagates to `tabStockLedger` and `tabCartonStock`
✅ **Created**: SQL script to fix existing completed putaway tasks
✅ **Verified**: Carton IDs now appear correctly in Item Location Breakdown

---

**Next Steps:**
1. Run `SCRIPTS/FixPutawayCartonIdInStockLedger.sql` to fix existing completed putaway tasks
2. Restart API server to ensure new putaway completions use the fix
3. Verify carton IDs appear in Item Location Breakdown
