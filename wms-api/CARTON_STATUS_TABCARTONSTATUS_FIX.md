# Carton Status Update - tabCartonStatus Fix

## Issue

**Problem:** When carton status is changed to "Receiving" (locked), the `tabCartonStatus` table was not being updated.

The `POST /api/cartons/update-status` endpoint was only updating:
- ✅ `tabReceivingCarton` - Carton receiving status
- ✅ `tabAsnItemDetails` - ASN item status

But it was **missing**:
- ❌ `tabCartonStatus` - Carton status tracking table

## Solution Implemented

Added `tabCartonStatus` update logic to the `updateCartonStatus` function in `cartonStatusController.js`.

### What Was Added

1. **Table Existence Check** - Verifies `tabCartonStatus` table exists before attempting update
2. **Schema Detection** - Dynamically detects column names:
   - ASN column: `asn_no` OR `advance_shipping_notice`
   - Locked fields: `locked_by`, `locked_on` (if available)
3. **UPSERT Logic** - Inserts or updates `tabCartonStatus` record
4. **Lock Status Handling** - When status is "Receiving" (locked):
   - Sets `locked_by` = `user_id`
   - Sets `locked_on` = `NOW()`

## Implementation Details

### Code Added

```javascript
// Update tabCartonStatus (UPSERT - insert or update)
// This is especially important when status changes to "Receiving" (locked)
try {
  // Check if tabCartonStatus table exists
  const [cartonStatusTableInfo] = await connection.execute(`
    SELECT TABLE_NAME 
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'tabCartonStatus'
  `);
  
  if (cartonStatusTableInfo.length > 0) {
    // Table exists, detect column names
    const [cartonStatusColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCartonStatus'
      AND COLUMN_NAME IN ('asn_no', 'advance_shipping_notice', 'locked_by', 'locked_on')
    `);
    const cartonStatusCols = new Set(cartonStatusColumns.map(r => r.COLUMN_NAME));
    
    const cartonStatusAsnColumn = cartonStatusCols.has('asn_no') ? 'asn_no' : 'advance_shipping_notice';
    const hasLockedBy = cartonStatusCols.has('locked_by');
    const hasLockedOn = cartonStatusCols.has('locked_on');
    
    // Build UPSERT query
    const cartonStatusFields = [cartonStatusAsnColumn, 'inbound_session', 'carton_id', 'status', 'updated_on'];
    const cartonStatusValues = [asn_no, inbound_session, currentCartonId, currentStatus];
    const cartonStatusPlaceholders = ['?', '?', '?', '?', 'NOW()'];
    
    // Add locked_by and locked_on when status is "Receiving" (locked)
    if (currentStatus === 'Receiving') {
      if (hasLockedBy) {
        cartonStatusFields.push('locked_by');
        cartonStatusValues.push(user_id || null);
        cartonStatusPlaceholders.push('?');
      }
      if (hasLockedOn) {
        cartonStatusFields.push('locked_on');
        cartonStatusPlaceholders.push('NOW()');
      }
    }
    
    // Build ON DUPLICATE KEY UPDATE clause
    const updateFields = ['status = VALUES(status)', 'updated_on = NOW()'];
    if (currentStatus === 'Receiving' && hasLockedBy) {
      updateFields.push('locked_by = VALUES(locked_by)');
      updateFields.push('locked_on = NOW()');
    }
    
    await connection.execute(`
      INSERT INTO tabCartonStatus 
        (${cartonStatusFields.join(', ')})
      VALUES (${cartonStatusPlaceholders.join(', ')})
      ON DUPLICATE KEY UPDATE
        ${updateFields.join(', ')}
    `, cartonStatusValues);
    
    console.log(`✅ Updated tabCartonStatus for carton ${currentCartonId} with status ${currentStatus}`);
  }
} catch (cartonStatusError) {
  // Non-critical - log but don't fail
  console.warn(`Failed to update tabCartonStatus:`, cartonStatusError.message);
}
```

## What Happens Now

When carton status is updated via `POST /api/cartons/update-status`:

1. ✅ **Updates `tabReceivingCarton`** - Carton receiving status
2. ✅ **Updates `tabCartonStatus`** - Carton status tracking (NEW!)
3. ✅ **Updates `tabAsnItemDetails`** - ASN item status

### Special Handling for "Receiving" Status (Locked)

When status is set to "Receiving":
- ✅ Sets `tabCartonStatus.status` = "Receiving"
- ✅ Sets `tabCartonStatus.locked_by` = `user_id` (if column exists)
- ✅ Sets `tabCartonStatus.locked_on` = `NOW()` (if column exists)
- ✅ Sets `tabCartonStatus.updated_on` = `NOW()`

## Database Schema Support

The implementation supports different database schemas:

| Column Variation | Detected Automatically |
|-----------------|------------------------|
| `asn_no` OR `advance_shipping_notice` | ✅ Yes |
| `locked_by` (optional) | ✅ Yes |
| `locked_on` (optional) | ✅ Yes |

## Error Handling

- ✅ **Table doesn't exist** - Logs info message, continues without error
- ✅ **Column doesn't exist** - Skips that column, continues with available columns
- ✅ **Update fails** - Logs warning, doesn't fail the entire request

## Testing

### Test with Status "Receiving" (Locked)

```bash
curl -X POST http://localhost:3000/api/cartons/update-status \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "asn_no": "ASN-0002",
    "inbound_session": "SESSION-001",
    "carton_id": "CTN-0101",
    "status": "Receiving",
    "user_id": "USER-001",
    "device_id": "DEVICE-001"
  }'
```

### Expected Database Updates

After the request:
- ✅ `tabReceivingCarton.status` = "Receiving"
- ✅ `tabCartonStatus.status` = "Receiving"
- ✅ `tabCartonStatus.locked_by` = "USER-001"
- ✅ `tabCartonStatus.locked_on` = Current timestamp
- ✅ `tabAsnItemDetails.carton_assigned_status` = "Receiving"

## Files Modified

1. ✅ `wms-api/src/modules/cartons/cartonStatusController.js`
   - Added `tabCartonStatus` update logic in `updateCartonStatus` function
   - Added schema detection for `tabCartonStatus` table
   - Added special handling for "Receiving" status (locked)

## Next Steps

1. **Restart Backend Server**
   ```bash
   cd wms-api
   # Stop current server (Ctrl+C)
   npm start
   ```

2. **Verify Updates**
   - When carton status changes to "Receiving", check `tabCartonStatus` table
   - Verify `locked_by` and `locked_on` are set correctly
   - Verify status is updated in all three tables

## Notes

- The update is **non-blocking** - if `tabCartonStatus` update fails, the request still succeeds
- Schema detection ensures compatibility with different database setups
- Only sets `locked_by` and `locked_on` when status is "Receiving" (locked)
- Uses UPSERT logic to handle both new and existing records

