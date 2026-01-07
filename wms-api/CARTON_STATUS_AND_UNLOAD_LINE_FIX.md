# Carton Status and Unload Line Fixes

## Issues Fixed

### 1. ❌ POST /api/cartons/update-status - Unknown column 'updated_by'
**Error:** `Unknown column 'updated_by' in 'field list'`

**Root Cause:** The `tabReceivingCarton` table doesn't have `updated_by` or `created_by` columns. It has status-specific columns like `opened_by`, `received_by`, `verified_by` instead.

### 2. ❌ POST /api/inbound/unload-line - Route not found
**Error:** `404: Route POST /api/inbound/unload-line not found`

**Root Cause:** The endpoint was not implemented.

## Solutions Implemented

### ✅ Fix 1: Carton Status Update - Dynamic Column Detection

Updated `updateCartonStatus` in `cartonStatusController.js` to:

1. **Detect Available Columns** - Check which user tracking columns exist:
   - `updated_by` / `created_by` (if available)
   - `received_by` (for "Received" status)
   - `opened_by` (for "Unloaded" status)
   - `device_id` (optional)

2. **Use Appropriate Columns** - Map user_id to the correct column based on:
   - Column availability
   - Carton status (e.g., use `opened_by` for "Unloaded", `received_by` for "Received")

3. **Handle Missing Columns** - Only include columns in INSERT/UPDATE if they exist

**Implementation:**
```javascript
// Detect available columns (once, outside loop)
const [cartonColumns] = await connection.execute(`
  SELECT COLUMN_NAME 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'tabReceivingCarton'
  AND COLUMN_NAME IN ('updated_by', 'created_by', 'device_id', 'received_by', 'opened_by', 'created_on', 'created_at')
`);

const hasUpdatedBy = cartonColumns.some(r => r.COLUMN_NAME === 'updated_by');
const hasCreatedBy = cartonColumns.some(r => r.COLUMN_NAME === 'created_by');
const hasReceivedBy = cartonColumns.some(r => r.COLUMN_NAME === 'received_by');
const hasOpenedBy = cartonColumns.some(r => r.COLUMN_NAME === 'opened_by');
```

**Column Mapping Logic:**
- If `updated_by` exists → Use it for all statuses
- If `created_by` exists → Use it for INSERT
- If `received_by` exists → Use it when status is "Received"
- If `opened_by` exists → Use it when status is "Unloaded"

### ✅ Fix 2: Unload Line Endpoint - Created

Created `POST /api/inbound/unload-line` endpoint in `inboundController.js`:

**Endpoint:** `POST /api/inbound/unload-line`

**Request Body:**
```json
{
  "parent_title": "SESSION-001",
  "unit_type": "Carton",
  "unit_id": "CTN-0101",
  "scanned_by": "USER-001",
  "scanned_on": "2024-12-24T10:20:00Z"  // Optional
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Unload line created/updated successfully",
  "data": {
    "parent_title": "SESSION-001",
    "unit_type": "Carton",
    "unit_id": "CTN-0101",
    "scanned_by": "USER-001",
    "scanned_on": "2024-12-24T10:20:00.000Z"
  }
}
```

**Features:**
- Validates session exists before creating unload line
- Uses UPSERT logic (INSERT ... ON DUPLICATE KEY UPDATE)
- Detects schema for session ID column (`title` vs `inbound_session`)
- Handles optional `scanned_on` timestamp

## Database Schema Notes

### tabReceivingCarton
The table has status-specific user tracking columns:
- `opened_by` - User who opened/unloaded the carton
- `received_by` - User who received the carton
- `verified_by` - User who verified the carton
- `updated_by` / `created_by` - May or may not exist (depends on schema)

### tabInboundUnloadLine
- `parent_title` - References session (uses `title` or `inbound_session` depending on schema)
- `unit_type` - Type of unit ("Carton", "Pallet", etc.)
- `unit_id` - Unit identifier (e.g., "CTN-0101")
- `scanned_by` - User who scanned/unloaded
- `scanned_on` - Timestamp of scan

## Files Modified

1. ✅ `wms-api/src/modules/cartons/cartonStatusController.js`
   - `updateCartonStatus` - Added dynamic column detection
   - Fixed INSERT/UPDATE to use appropriate columns

2. ✅ `wms-api/src/modules/inbound/inboundController.js`
   - Added `createUnloadLine` function

3. ✅ `wms-api/src/routes/inboundRoutes.js`
   - Registered `POST /api/inbound/unload-line` route

## Testing

After restarting the server, test both endpoints:

### Test Carton Status Update:
```bash
curl -X POST http://localhost:3000/api/cartons/update-status \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "asn_no": "ASN-0002",
    "inbound_session": "SESSION-001",
    "carton_id": "CTN-0101",
    "status": "Unloaded",
    "user_id": "USER-001",
    "device_id": "DEVICE-001"
  }'
```

### Test Unload Line:
```bash
curl -X POST http://localhost:3000/api/inbound/unload-line \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "parent_title": "SESSION-001",
    "unit_type": "Carton",
    "unit_id": "CTN-0101",
    "scanned_by": "USER-001"
  }'
```

## Next Steps

1. **Restart Backend Server**
   ```bash
   cd wms-api
   # Stop current server (Ctrl+C)
   npm start
   ```

2. **Verify Fixes**
   - Carton status updates should work without "updated_by" errors
   - Unload line creation should work without 404 errors

## Benefits

1. **Schema Agnostic** - Works with different database schemas
2. **Backward Compatible** - Doesn't break existing installations
3. **Error Prevention** - Prevents SQL errors from missing columns
4. **Automatic Detection** - No manual configuration needed
5. **Status-Aware** - Uses appropriate columns based on carton status

