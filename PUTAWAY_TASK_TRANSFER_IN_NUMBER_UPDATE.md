# Putaway Task - Store Transfer In Number in advance_shipping_notice

## Update

Changed the `advance_shipping_notice` column to store the Transfer In number instead of an empty string.

## Rationale

- The `advance_shipping_notice` column cannot be NULL
- For ASN tasks: Stores ASN number (e.g., "ASN-0001")
- For Transfer In tasks: Now stores Transfer In number (e.g., "INSLIP-123461")
- This provides a consistent reference field that works for both task types
- Makes it easier to identify the source document for any putaway task

## Code Changes

**File:** `wms-api/src/modules/transfer-in/transferInController.js`

**Function:** `createPutawayTaskFromTransferIn`

**Change:** All INSERT statements now use `transferInTitle` instead of empty string for `advance_shipping_notice`

### Before:
```javascript
const asnPlaceholder = ""; // Empty string
// ...
VALUES (?, 'Draft', 'TransferIn', ?, ?, 'SYSTEM', NOW(), NOW())
[putawayTaskTitle, transferInTitle, warehouse, asnPlaceholder] // Empty string
```

### After:
```javascript
// Store Transfer In number in advance_shipping_notice
VALUES (?, 'Draft', 'TransferIn', ?, ?, 'SYSTEM', NOW(), NOW())
[putawayTaskTitle, transferInTitle, warehouse, transferInTitle] // Transfer In number
```

## Database Values

### ASN Putaway Task:
- `source_type = 'ASN'`
- `advance_shipping_notice = 'ASN-0001'` (ASN number)
- `transfer_in = NULL`

### Transfer In Putaway Task:
- `source_type = 'TransferIn'`
- `advance_shipping_notice = 'INSLIP-123461'` (Transfer In number) ✅ **UPDATED**
- `transfer_in = 'INSLIP-123461'` (if column exists)

## Benefits

1. **Consistent Reference Field:** `advance_shipping_notice` can be used to identify the source document for any putaway task
2. **Better Querying:** Can filter putaway tasks by source document number regardless of type
3. **Backward Compatibility:** Existing ASN tasks continue to work (ASN number in `advance_shipping_notice`)
4. **Clear Identification:** Transfer In number is visible in the `advance_shipping_notice` field

## Example Queries

### Find Putaway Task by Transfer In Number:
```sql
SELECT * FROM tabPutawayTask 
WHERE advance_shipping_notice = 'INSLIP-123461';
```

### Find All Putaway Tasks for a Specific Document:
```sql
SELECT * FROM tabPutawayTask 
WHERE advance_shipping_notice = 'INSLIP-123461' 
   OR advance_shipping_notice = 'ASN-0001';
```

### Distinguish by Source Type:
```sql
SELECT 
  title,
  source_type,
  advance_shipping_notice,
  transfer_in
FROM tabPutawayTask
WHERE source_type = 'TransferIn';
-- Shows: advance_shipping_notice = Transfer In number
```

## Impact

### Before:
- `advance_shipping_notice = ""` (empty string) for Transfer In tasks
- No way to identify Transfer In number from `advance_shipping_notice` field

### After:
- `advance_shipping_notice = 'INSLIP-123461'` (Transfer In number) for Transfer In tasks
- Can identify and query Transfer In tasks by number using `advance_shipping_notice`
- Consistent with ASN tasks (both store source document number)

## Testing

After applying the fix:

1. **Create Transfer In Putaway Task:**
   - Receive all items for Transfer In "INSLIP-123461"
   - Verify Putaway Task is created

2. **Verify Database:**
   ```sql
   SELECT title, source_type, transfer_in, advance_shipping_notice 
   FROM tabPutawayTask 
   WHERE transfer_in = 'INSLIP-123461';
   ```
   Should show:
   - `source_type = 'TransferIn'`
   - `transfer_in = 'INSLIP-123461'`
   - `advance_shipping_notice = 'INSLIP-123461'` ✅

3. **Query by advance_shipping_notice:**
   ```sql
   SELECT * FROM tabPutawayTask 
   WHERE advance_shipping_notice = 'INSLIP-123461';
   ```
   Should return the Transfer In putaway task

## Related Files

- `wms-api/src/modules/transfer-in/transferInController.js` - Updated to store Transfer In number

---

**Status:** ✅ Updated  
**Date:** 2026-01-05  
**Requires:** API server restart


