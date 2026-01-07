# Transfer Carton Sealed Validation & Items Not Showing - Fix

## Issues Identified

1. **Sealed Transfer Carton Still Accepting Items**: Transfer carton `TC-MR-0001-1767520301021` is sealed, but mobile app is still allowing new items to be added. This is illogical - sealed cartons should not accept new items.

2. **Items Not Updating in Transfer Carton**: Items packed into the transfer carton are not showing in the desktop app's "Carton Contents" section.

## Root Causes

### Issue 1: No Validation for Sealed Transfer Cartons
The event processing API (`POST /api/events/batch`) was not checking if a transfer carton is sealed before accepting `PACK_BOX_TO_TC` or `PACK_ITEM_TO_TC` events.

### Issue 2: Query Missing Event Type
The desktop app and API queries were only looking for `PACK_BOX_TO_TC` events, but not `PACK_ITEM_TO_TC` events. If the mobile app sends `PACK_ITEM_TO_TC` events, they wouldn't show up.

## Solutions Applied

### 1. Added Sealed Transfer Carton Validation

**File:** `wms-api/src/modules/events/eventController.js`

**Added validation before processing packing events:**
```javascript
// Validate transfer carton status before allowing packing events
if ((event_type === 'PACK_BOX_TO_TC' || event_type === 'PACK_ITEM_TO_TC') && tc_id) {
  const [tcStatusRows] = await connection.execute(`
    SELECT status
    FROM tabTransferCarton
    WHERE tc_id = ?
  `, [tc_id]);
  
  if (tcStatusRows.length > 0) {
    const tcStatus = tcStatusRows[0].status;
    if (tcStatus === 'Sealed' || tcStatus === 'Dispatched' || tcStatus === 'Completed') {
      console.warn(`⚠️  Rejecting ${event_type} event: Transfer carton ${tc_id} is ${tcStatus} and cannot accept new items`);
      failedEvents.push({
        event: event,
        error: `Transfer carton ${tc_id} is ${tcStatus} and cannot accept new items`
      });
      continue; // Skip this event
    }
  }
}
```

**Behavior:**
- ✅ Checks transfer carton status before processing `PACK_BOX_TO_TC` or `PACK_ITEM_TO_TC` events
- ✅ Rejects events if transfer carton is `Sealed`, `Dispatched`, or `Completed`
- ✅ Returns error message to mobile app indicating the transfer carton cannot accept new items

### 2. Fixed Query to Include PACK_ITEM_TO_TC Events

**File:** `Services/TransferCartonService.cs`

**Updated query to include both event types:**
```csharp
var sql = @"SELECT 
                item_code, 
                COALESCE(box_id, carton_id) as source_carton,
                SUM(qty) as total_qty,
                MAX(event_time) as latest_event_time,
                MAX(user_id) as latest_user_id
            FROM tabWmsScanEvent
            WHERE tc_id = @tc_id
            AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')  // ✅ Added PACK_ITEM_TO_TC
            AND item_code IS NOT NULL
            GROUP BY item_code, COALESCE(box_id, carton_id)
            ORDER BY latest_event_time DESC";
```

**File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

**Updated API query to include both event types:**
```javascript
const [sortEvents] = await connection.execute(`
  SELECT 
    item_code,
    box_id,
    COALESCE(box_id, carton_id) as source_carton,
    SUM(qty) as total_qty,
    MAX(event_time) as latest_event_time,
    MAX(user_id) as latest_user_id
  FROM tabWmsScanEvent
  WHERE tc_id = ?
    AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')  // ✅ Added PACK_ITEM_TO_TC
    AND item_code IS NOT NULL
    AND qty > 0
  GROUP BY item_code, box_id
  ORDER BY latest_event_time DESC
`, [tc_id]);
```

## Testing

### Test Script Created

**File:** `wms-api/test-transfer-carton-api.js`

This script tests:
1. ✅ Transfer Carton status check
2. ✅ Events with `tc_id` query
3. ✅ Events by Material Request number (fallback)
4. ✅ Carton contents query (desktop app query)
5. ✅ Events after sealing (should be none)

### Run Test:
```bash
cd wms-api
node test-transfer-carton-api.js
```

## Expected Behavior

### Before Fix:
- ❌ Sealed transfer cartons could accept new items
- ❌ Items packed via `PACK_ITEM_TO_TC` events didn't show in desktop app
- ❌ No validation to prevent packing into sealed cartons

### After Fix:
- ✅ Sealed transfer cartons **reject** new packing events
- ✅ Mobile app receives error: `"Transfer carton TC-MR-0001-1767520301021 is Sealed and cannot accept new items"`
- ✅ Both `PACK_BOX_TO_TC` and `PACK_ITEM_TO_TC` events are included in queries
- ✅ Items show correctly in desktop app's "Carton Contents" section

## API Response for Sealed Carton

When mobile app tries to pack items into a sealed transfer carton:

**Request:**
```json
{
  "events": [
    {
      "event_type": "PACK_ITEM_TO_TC",
      "tc_id": "TC-MR-0001-1767520301021",
      "item_code": "SKU-JACKET-201-BLK-I",
      "qty": 20.00
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "processed": 0,
  "failed": 1,
  "failed_events": [
    {
      "event": { ... },
      "error": "Transfer carton TC-MR-0001-1767520301021 is Sealed and cannot accept new items"
    }
  ]
}
```

## Mobile App Changes Required

The mobile app should:
1. ✅ Check transfer carton status before allowing packing
2. ✅ Display error message if packing is attempted on sealed carton
3. ✅ Disable "Pack" button if transfer carton is sealed
4. ✅ Use either `PACK_BOX_TO_TC` or `PACK_ITEM_TO_TC` event type (both are now supported)

## Next Steps

1. **Restart API Server** to load validation changes
2. **Test:** Try packing items into sealed transfer carton - should be rejected
3. **Verify:** Items should now show in desktop app's "Carton Contents"
4. **Run Test Script:** Execute `test-transfer-carton-api.js` to verify all queries work

## Files Modified

1. ✅ `wms-api/src/modules/events/eventController.js` - Added sealed carton validation
2. ✅ `Services/TransferCartonService.cs` - Added `PACK_ITEM_TO_TC` to query
3. ✅ `wms-api/src/modules/transfer-cartons/transferCartonController.js` - Added `PACK_ITEM_TO_TC` to query
4. ✅ `wms-api/test-transfer-carton-api.js` - Created test script

