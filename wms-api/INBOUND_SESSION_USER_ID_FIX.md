# Inbound Session user_id Column Fix

## Issue

**Error:** `Unknown column 'user_id' in 'field list'`

The `POST /api/inbound/update` endpoint was trying to insert/update a `user_id` column that doesn't exist in the `tabInboundSession` table.

## Root Cause

The `tabInboundSession` table schema varies:
- Some databases have `user_id` column
- Some databases only have `started_by` column
- Some databases have both

The code was hardcoding `user_id` without checking if it exists.

## Solution Implemented

Updated `updateInboundSession` and `getInboundSessions` functions to:

1. **Detect Available Columns** - Check which user-related columns exist (`user_id`, `started_by`)
2. **Use Appropriate Column** - Use `user_id` if available, otherwise use `started_by`
3. **Handle Missing Columns** - Only include columns in INSERT/UPDATE/SELECT if they exist

## Implementation Details

### 1. Schema Detection

```javascript
// Detect user column (user_id or started_by)
const [userColumns] = await connection.execute(`
  SELECT COLUMN_NAME 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'tabInboundSession'
  AND COLUMN_NAME IN ('user_id', 'started_by')
`);
const hasUserId = userColumns.some(r => r.COLUMN_NAME === 'user_id');
const hasStartedBy = userColumns.some(r => r.COLUMN_NAME === 'started_by');
```

### 2. Dynamic INSERT Statement

```javascript
// Build INSERT statement dynamically based on available columns
const insertColumns = [
  sessionIdColumn,
  asnColumn,
  'transfer_order',
  'dock',
  'status',
  'completed_cartons',
  'total_cartons',
  startedColumn,
  'updated_at'
];

// Add user column if available
if (hasUserId) {
  insertColumns.push('user_id');
  insertValues.push(user_id || null);
} else if (hasStartedBy) {
  insertColumns.push('started_by');
  insertValues.push(user_id || null);
}
```

### 3. Dynamic UPDATE Statement

```javascript
// Update user column if available
if (user_id !== undefined) {
  if (hasUserId) {
    updates.push('user_id = ?');
    updateValues.push(user_id);
  } else if (hasStartedBy) {
    updates.push('started_by = ?');
    updateValues.push(user_id);
  }
}
```

### 4. Dynamic SELECT Statement

```javascript
// Build SELECT columns dynamically
const selectColumns = [
  `${sessionIdColumn} as inbound_session`,
  `${asnColumn} as asn_no`,
  // ... other columns
];

// Add optional columns only if they exist
if (hasStartedBy) {
  selectColumns.splice(7, 0, 'started_by');
}
if (hasUserId) {
  selectColumns.splice(insertIndex, 0, 'user_id');
}
if (hasDeviceId) {
  selectColumns.splice(insertIndex, 0, 'device_id');
}
```

## Column Mapping

| API Field | Database Column (if exists) | Fallback |
|-----------|----------------------------|----------|
| `user_id` | `user_id` | `started_by` |
| `device_id` | `device_id` | (optional, skipped if not exists) |

## Benefits

1. **Schema Agnostic** - Works with both `user_id` and `started_by` schemas
2. **Backward Compatible** - Doesn't break existing installations
3. **Error Prevention** - Prevents SQL errors from missing columns
4. **Automatic Detection** - No manual configuration needed

## Testing

After restarting the server, test the endpoint:

```bash
curl -X POST http://localhost:3000/api/inbound/update \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "inbound_session": "SESSION-TEST",
    "asn_no": "ASN-0002",
    "status": "Active",
    "user_id": "USER-001",
    "device_id": "DEVICE-001"
  }'
```

Expected: `200 OK` - Session created/updated successfully

## Files Modified

1. ✅ `wms-api/src/modules/inbound/inboundController.js`
   - `updateInboundSession` - Added schema detection for user columns
   - `getInboundSessions` - Added schema detection for user columns

## Next Steps

1. **Restart Backend Server**
   ```bash
   cd wms-api
   # Stop current server (Ctrl+C)
   npm start
   ```

2. **Test the Endpoint**
   - The mobile app should now be able to create/update inbound sessions
   - No more "Unknown column 'user_id'" errors

## Notes

- The endpoint now logs detected schema for debugging
- If neither `user_id` nor `started_by` exists, the user field is skipped
- The `device_id` column is also checked and only included if it exists
- All fixes maintain backward compatibility with existing database schemas

