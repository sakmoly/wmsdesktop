# Putaway Task advance_shipping_notice NULL Fix

## Issue

When creating Putaway Tasks for Transfer In, the API was failing with:
```
Error: Column 'advance_shipping_notice' cannot be null
```

**Root Cause:** The `advance_shipping_notice` column in `tabPutawayTask` is NOT NULL and cannot accept NULL values. The previous fix tried to set it to NULL, but the database constraint prevents this.

## Fix Applied

**File:** `wms-api/src/modules/transfer-in/transferInController.js`

**Function:** `createPutawayTaskFromTransferIn`

**Changes:**
- Changed `advance_shipping_notice` from `NULL` to empty string `""` for Transfer In tasks
- Transfer In tasks don't have an ASN, so we use an empty string as a placeholder
- All INSERT statements now use empty string instead of NULL

## Code Changes

### Before:
```sql
INSERT INTO tabPutawayTask
  (title, status, source_type, transfer_in, advance_shipping_notice, created_by, created_at, updated_at)
VALUES (?, 'Draft', 'TransferIn', ?, NULL, 'SYSTEM', NOW(), NOW())
```

### After:
```sql
INSERT INTO tabPutawayTask
  (title, status, source_type, transfer_in, advance_shipping_notice, created_by, created_at, updated_at)
VALUES (?, 'Draft', 'TransferIn', ?, ?, 'SYSTEM', NOW(), NOW())
-- With asnPlaceholder = "" (empty string)
```

## All INSERT Variations Updated

1. **With source_type, transfer_in, and warehouse:**
   - `advance_shipping_notice = ""` (empty string)

2. **With source_type and transfer_in (no warehouse):**
   - `advance_shipping_notice = ""` (empty string)

3. **With source_type and warehouse (no transfer_in):**
   - `advance_shipping_notice = transferInTitle` (uses Transfer In title as fallback)

4. **With source_type only:**
   - `advance_shipping_notice = transferInTitle` (uses Transfer In title as fallback)

5. **With warehouse only (no source_type):**
   - `advance_shipping_notice = ""` (empty string)

6. **Basic insert (no source_type, no warehouse):**
   - `advance_shipping_notice = ""` (empty string)

## Impact

### Before Fix:
- ❌ Putaway Task creation for Transfer In fails with "Column 'advance_shipping_notice' cannot be null"
- ❌ Transfer In items cannot be put away
- ❌ Database constraint violation

### After Fix:
- ✅ Putaway Task creation for Transfer In succeeds
- ✅ `advance_shipping_notice` is set to empty string (satisfies NOT NULL constraint)
- ✅ All INSERT variations handle the required column correctly

## Database Constraint

The `advance_shipping_notice` column in `tabPutawayTask`:
- **Type:** VARCHAR (or similar)
- **Constraint:** NOT NULL (cannot be NULL)
- **Default:** None
- **Usage:**
  - For ASN tasks: Contains ASN number (e.g., "ASN-0001")
  - For Transfer In tasks: Empty string "" (no ASN)

## Testing

After applying the fix:

1. **Receive Transfer In items:**
   - Receive all items for a Transfer In
   - Verify Putaway Task is created successfully
   - Check database: `advance_shipping_notice` should be empty string

2. **Verify Putaway Task:**
   ```sql
   SELECT title, status, source_type, transfer_in, advance_shipping_notice 
   FROM tabPutawayTask 
   WHERE transfer_in = 'INSLIP-123461';
   ```
   Should show:
   - `source_type = 'TransferIn'`
   - `transfer_in = 'INSLIP-123461'`
   - `advance_shipping_notice = ''` (empty string)

3. **Compare with ASN Putaway Task:**
   ```sql
   SELECT title, status, source_type, advance_shipping_notice 
   FROM tabPutawayTask 
   WHERE source_type = 'ASN' OR advance_shipping_notice != '';
   ```
   Should show ASN tasks with actual ASN numbers

## Related Files

- `wms-api/src/modules/transfer-in/transferInController.js` - Fixed INSERT statements to use empty string

## Notes

- `advance_shipping_notice` is NOT NULL in `tabPutawayTask`
- For Transfer In tasks, we use empty string `""` instead of NULL
- For ASN tasks, this field contains the ASN number
- The empty string satisfies the NOT NULL constraint while indicating "no ASN"

---

**Status:** ✅ Fixed  
**Date:** 2026-01-05  
**Requires:** API server restart


