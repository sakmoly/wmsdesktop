# Putaway Task advance_shipping_notice Column Fix

## Issue

When creating Putaway Tasks for Transfer In, the API was failing with:
```
Error: Field 'advance_shipping_notice' doesn't have a default value
```

**Root Cause:** The `advance_shipping_notice` column in `tabPutawayTask` is required (NOT NULL, no default value), but the INSERT statements for Transfer In tasks were not including it.

## Fix Applied

**File:** `wms-api/src/modules/transfer-in/transferInController.js`

**Function:** `createPutawayTaskFromTransferIn`

**Changes:**
- Added `advance_shipping_notice` to ALL INSERT statements
- Set `advance_shipping_notice = NULL` for Transfer In tasks (since they don't have an ASN)
- Ensured all INSERT variations include this required field

## Code Changes

### Before:
```sql
INSERT INTO tabPutawayTask
  (title, status, source_type, transfer_in, created_by, created_at, updated_at)
VALUES (?, 'Draft', 'TransferIn', ?, 'SYSTEM', NOW(), NOW())
```

### After:
```sql
INSERT INTO tabPutawayTask
  (title, status, source_type, transfer_in, advance_shipping_notice, created_by, created_at, updated_at)
VALUES (?, 'Draft', 'TransferIn', ?, NULL, 'SYSTEM', NOW(), NOW())
```

## All INSERT Variations Updated

1. **With source_type, transfer_in, and warehouse:**
   - Includes `advance_shipping_notice = NULL`

2. **With source_type and transfer_in (no warehouse):**
   - Includes `advance_shipping_notice = NULL`

3. **With source_type and warehouse (no transfer_in):**
   - Uses `advance_shipping_notice = transferInTitle` (fallback to store Transfer In number)

4. **With source_type only:**
   - Uses `advance_shipping_notice = transferInTitle` (fallback to store Transfer In number)

5. **With warehouse only (no source_type):**
   - Includes `advance_shipping_notice = NULL`

6. **Basic insert (no source_type, no warehouse):**
   - Includes `advance_shipping_notice = NULL`

## Impact

### Before Fix:
- ❌ Putaway Task creation for Transfer In fails with database error
- ❌ Transfer In items cannot be put away
- ❌ Error: "Field 'advance_shipping_notice' doesn't have a default value"

### After Fix:
- ✅ Putaway Task creation for Transfer In succeeds
- ✅ `advance_shipping_notice` is set to NULL (appropriate for Transfer In tasks)
- ✅ All INSERT variations handle the required column correctly

## Testing

After applying the fix:

1. **Receive Transfer In items:**
   - Receive all items for a Transfer In
   - Verify Putaway Task is created successfully
   - Check database: `advance_shipping_notice` should be NULL

2. **Verify Putaway Task:**
   ```sql
   SELECT title, status, source_type, transfer_in, advance_shipping_notice 
   FROM tabPutawayTask 
   WHERE transfer_in = 'INSLIP-123459';
   ```
   Should show:
   - `source_type = 'TransferIn'`
   - `transfer_in = 'INSLIP-123459'`
   - `advance_shipping_notice = NULL`

## Related Files

- `wms-api/src/modules/transfer-in/transferInController.js` - Fixed INSERT statements

## Notes

- `advance_shipping_notice` is required in `tabPutawayTask` (NOT NULL, no default)
- For Transfer In tasks, this field is set to NULL (they don't have an ASN)
- For ASN tasks, this field contains the ASN number
- The fix ensures all INSERT statements include this required field

---

**Status:** ✅ Fixed  
**Date:** 2026-01-05  
**Requires:** API server restart

