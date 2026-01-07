# Transfer In Inbound Session Query Fix

## Issue

When creating Putaway Tasks for Transfer In, the code was trying to query `tabInboundSession` using a `transfer_in` column that doesn't exist in the database schema.

**Error:**
```
Unknown column 'transfer_in' in 'where clause'
SQL: SELECT inbound_session FROM tabInboundSession WHERE transfer_in = ? ORDER BY started_at DESC LIMIT 1
```

## Root Cause

The `tabInboundSession` table uses `asn_no` column to store ASN numbers. For Transfer In, we should use the `asn_no` field with the Transfer In title as the value, since `transfer_in` column may not exist.

## Solution

Updated the query logic to:
1. Check if `transfer_in` column exists in `tabInboundSession`
2. If it exists, use `transfer_in = transferInTitle`
3. If it doesn't exist, use `asn_no = transferInTitle` (use Transfer In title as ASN number)
4. Also dynamically detect `started_at`/`started_on` and `inbound_session`/`title` column names

## Code Changes

**File:** `wms-api/src/modules/transfer-in/transferInController.js`

**Function:** `createPutawayTaskFromTransferIn`

### Before:
```javascript
const [sessionRows] = await connection.execute(
  `SELECT inbound_session FROM tabInboundSession WHERE transfer_in = ? ORDER BY started_at DESC LIMIT 1`,
  [transferInTitle]
);
```

### After:
```javascript
// Check if transfer_in column exists in tabInboundSession
const [transferInColCheck] = await connection.execute(`
  SELECT COLUMN_NAME
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tabInboundSession'
    AND COLUMN_NAME = 'transfer_in'
`);
const hasTransferInInSession = transferInColCheck.length > 0;

// Detect column names dynamically
const [startedColCheck] = await connection.execute(`
  SELECT COLUMN_NAME
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tabInboundSession'
    AND COLUMN_NAME IN ('started_at', 'started_on')
  LIMIT 1
`);
const startedColumn = startedColCheck.length > 0 ? startedColCheck[0].COLUMN_NAME : 'started_at';

const [sessionIdColCheck] = await connection.execute(`
  SELECT COLUMN_NAME
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tabInboundSession'
    AND COLUMN_NAME IN ('inbound_session', 'title')
  LIMIT 1
`);
const sessionIdColumn = sessionIdColCheck.length > 0 ? sessionIdColCheck[0].COLUMN_NAME : 'inbound_session';

if (hasTransferInInSession) {
  // Use transfer_in column if it exists
  const [sessionRows] = await connection.execute(
    `SELECT ${sessionIdColumn} as inbound_session FROM tabInboundSession WHERE transfer_in = ? ORDER BY ${startedColumn} DESC LIMIT 1`,
    [transferInTitle]
  );
  inboundSession = sessionRows.length > 0 ? sessionRows[0].inbound_session : null;
} else {
  // Use asn_no column with Transfer In title as value
  const [sessionRows] = await connection.execute(
    `SELECT ${sessionIdColumn} as inbound_session FROM tabInboundSession WHERE asn_no = ? ORDER BY ${startedColumn} DESC LIMIT 1`,
    [transferInTitle]
  );
  inboundSession = sessionRows.length > 0 ? sessionRows[0].inbound_session : null;
}
```

## Database Schema Compatibility

The fix works with both schema configurations:

### Schema 1: With `transfer_in` column
```sql
SELECT inbound_session FROM tabInboundSession 
WHERE transfer_in = 'INSLIP-123463' 
ORDER BY started_at DESC LIMIT 1;
```

### Schema 2: Without `transfer_in` column (uses `asn_no`)
```sql
SELECT inbound_session FROM tabInboundSession 
WHERE asn_no = 'INSLIP-123463' 
ORDER BY started_at DESC LIMIT 1;
```

## Logic Flow

1. **Check if `inbound_session` column is required (NOT NULL)**
   - If nullable or doesn't exist → `inboundSession = null`
   - If NOT NULL → proceed to find session

2. **Check if `transfer_in` column exists in `tabInboundSession`**
   - If exists → query: `WHERE transfer_in = transferInTitle`
   - If doesn't exist → query: `WHERE asn_no = transferInTitle`

3. **If no session found and column is NOT NULL**
   - Use empty string `""` as placeholder

## Testing

✅ **Test Passed**

The automated test (`test-transfer-in-putaway-direct.js`) confirms:
- Putaway Task creation works correctly
- No SQL errors when querying `tabInboundSession`
- Handles both schema configurations gracefully

## Related Files

- `wms-api/src/modules/transfer-in/transferInController.js` - Main fix
- `wms-api/test-transfer-in-putaway-direct.js` - Updated test script
- `TRANSFER_IN_PUTAWAY_FIX_COMPLETE.md` - Previous fix documentation

## Status

✅ **FIXED** - Transfer In Putaway Task creation now correctly queries `tabInboundSession` using `asn_no` when `transfer_in` column doesn't exist.

---

**Date:** 2026-01-06  
**Error:** `Unknown column 'transfer_in' in 'where clause'`  
**Status:** ✅ RESOLVED

