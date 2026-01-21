# Transfer In Status and Quantity Fix

## Issues Fixed

### 1. ✅ Status Auto-Change to "Received" (FIXED)

**Problem**: Status was automatically changing to "Received" when `received_qty >= qty`, but user wants status to remain "Picking" until explicitly marked as "Received".

**Fix Applied**:
- Modified `computeTransferInItemStatus()` function to **NOT** automatically set status to "Received"
- Status now remains "Picking" when `received_qty > 0`, regardless of whether it's fully received
- Status only changes to "Received" via explicit API call

**Files Changed**:
- `wms-api/src/modules/transfer-in/transferInController.js` - `computeTransferInItemStatus()` function
- `wms-api/src/modules/events/eventController.js` - Status computation in event processing

### 2. ✅ New API Endpoint: Mark as Received (ADDED)

**New Endpoint**: `POST /api/transfer-in/:title/mark-received`

**Purpose**: Explicitly mark Transfer In item(s) as "Received" status.

**Request Body**:
```json
{
  "item_code": "SKU-001"  // Optional - if not provided, marks all items as Received
}
```

**Examples**:

**Mark specific item as Received**:
```bash
POST /api/transfer-in/INSLIP-123461/mark-received
{
  "item_code": "SKU-HAT-301-RED-OS"
}
```

**Mark all items as Received**:
```bash
POST /api/transfer-in/INSLIP-123461/mark-received
{}
```

**Response**:
```json
{
  "ok": true,
  "message": "Marked item SKU-HAT-301-RED-OS as Received in Transfer In INSLIP-123461",
  "data": {
    "transfer_in": "INSLIP-123461",
    "item_code": "SKU-HAT-301-RED-OS",
    "status": "Received"
  }
}
```

**Files Changed**:
- `wms-api/src/modules/transfer-in/transferInController.js` - Added `markTransferInItemReceived()` function
- `wms-api/src/routes/transferInRoutes.js` - Added route registration

### 3. ⚠️ Quantity Issue: Double-Counting (INVESTIGATION NEEDED)

**Problem**: User reports receiving quantity shows 4 when they only input 2.

**Log Evidence**:
```
✅ Updated Transfer In item: SKU-HAT-301-RED-OS in INSLIP-123461 - received_qty: 2 → 4 (+2), status: Received, carton_id: CTN-TI-123461-20260115-170114-706
```

**Root Cause Analysis**:
- Current `received_qty` was 2
- Event sent `qty: +2` (difference)
- Backend calculated: `2 + 2 = 4` ✅ (Backend logic is correct)

**Possible Causes**:
1. **Mobile app sending TOTAL instead of DIFFERENCE**: 
   - If mobile app sends `qty: 2` (thinking it's the total), but backend expects difference
   - Backend does: `current (2) + event.qty (2) = 4` ❌
   - **Fix**: Mobile app should send `qty: 0` (no change) or `qty: difference`

2. **Previous event already set received_qty to 2**:
   - First event: `received_qty: 0 → 2` (+2)
   - Second event: `received_qty: 2 → 4` (+2)
   - User only sees the second event, but both were processed
   - **Fix**: Check if events are being sent multiple times

3. **Mobile app sending events multiple times**:
   - Same event processed twice
   - **Fix**: Check for duplicate events in database

**Backend Changes**:
- Added detailed logging to help debug quantity issues
- Added warning when event.qty looks like TOTAL instead of DIFFERENCE
- Backend still uses ADDITIVE updates (as designed)

**Mobile App Requirements**:
- ✅ **MUST send `qty` as DIFFERENCE (change amount), not TOTAL**
- ✅ If current `received_qty = 2` and user wants it to stay 2, send `qty: 0`
- ✅ If current `received_qty = 2` and user wants to increase to 3, send `qty: +1`
- ✅ If current `received_qty = 2` and user wants to decrease to 1, send `qty: -1`

**Example**:
```
Current received_qty = 2
User wants to set to 2 (no change)
Mobile app should send: { "qty": 0 }  ✅
Backend processes: 2 + 0 = 2 ✅

Current received_qty = 2
User wants to set to 3 (increase by 1)
Mobile app should send: { "qty": 1 }  ✅
Backend processes: 2 + 1 = 3 ✅

Current received_qty = 2
User wants to set to 1 (decrease by 1)
Mobile app should send: { "qty": -1 }  ✅
Backend processes: 2 + (-1) = 1 ✅
```

## Status Behavior After Fix

### Before Fix:
- ❌ Status automatically changed to "Received" when `received_qty >= qty`
- ❌ No way to keep status as "Picking" when fully received

### After Fix:
- ✅ Status remains "Picking" when `received_qty > 0` (regardless of whether fully received)
- ✅ Status only changes to "Received" via explicit API call: `POST /api/transfer-in/:title/mark-received`
- ✅ Status = "Pending" when `received_qty = 0`
- ✅ Status = "Picking" when `received_qty > 0` (even if `received_qty >= qty`)
- ✅ Status = "Received" only when explicitly marked via API

## Status Flow

### Normal Flow:
1. **Item Created**: Status = `Pending` (received_qty = 0)
2. **Receiving Starts**: Status = `Picking` (received_qty > 0)
3. **Fully Received**: Status = `Picking` (received_qty >= qty) ← **Still "Picking"**
4. **User Marks as Received**: Status = `Received` (via API call)

### Example Timeline:
```
Time 0:  Item created
         received_qty = 0, status = "Pending"

Time 1:  User starts receiving (scans carton or item)
         received_qty = 2, qty = 2
         status = "Picking" ✅ (NOT "Received")

Time 2:  User completes receiving (carton closed)
         received_qty = 2, qty = 2
         status = "Picking" ✅ (Still "Picking", NOT auto-changed to "Received")

Time 3:  User explicitly marks as Received (via API)
         received_qty = 2, qty = 2
         status = "Received" ✅ (Only changed via API)
```

## Testing

### Test 1: Status Remains "Picking"
1. Create Transfer In with items
2. Receive items (by carton or individually)
3. Verify status = "Picking" even when `received_qty >= qty`
4. Verify status does NOT automatically change to "Received"

### Test 2: Mark as Received API
1. Receive items (status should be "Picking")
2. Call `POST /api/transfer-in/:title/mark-received` with `item_code`
3. Verify status = "Received" for that item
4. Call `POST /api/transfer-in/:title/mark-received` without `item_code`
5. Verify all items have status = "Received"

### Test 3: Quantity Updates
1. Check backend logs for quantity update messages
2. Verify mobile app is sending `qty` as DIFFERENCE, not TOTAL
3. If quantity shows 4 when user input 2, check:
   - Are events being sent multiple times?
   - Is mobile app sending TOTAL instead of DIFFERENCE?
   - Are there previous events that already updated the quantity?

## Mobile App Changes Required

### 1. Status Display
- Display status from API response
- Show "Picking" status even when fully received
- Add button/action to mark as "Received" (calls new API endpoint)

### 2. Quantity Updates
- **CRITICAL**: Send `qty` as **DIFFERENCE**, not TOTAL
- Calculate difference: `difference = newQty - currentQty`
- Send `qty: difference` in events
- Example: If current = 2 and user sets to 2, send `qty: 0` (not `qty: 2`)

### 3. Mark as Received
- Add UI to mark items as "Received"
- Call `POST /api/transfer-in/:title/mark-received` with `item_code`
- Update UI to show "Received" status after API call

## API Endpoints Summary

### Existing Endpoints:
- `GET /api/transfer-in/:title` - Get Transfer In details (includes status)
- `POST /api/transfer-in/:title/receive-line` - Receive items (updates received_qty, sets status to "Picking")
- `POST /api/transfer-in/:title/update-line-carton` - Update carton_id

### New Endpoint:
- `POST /api/transfer-in/:title/mark-received` - Mark item(s) as "Received" status

## Files Changed

1. **wms-api/src/modules/transfer-in/transferInController.js**
   - Modified `computeTransferInItemStatus()` - No longer auto-sets to "Received"
   - Added `markTransferInItemReceived()` - New function to mark as Received

2. **wms-api/src/modules/events/eventController.js**
   - Modified status computation - No longer auto-sets to "Received"
   - Added detailed logging for quantity debugging

3. **wms-api/src/routes/transferInRoutes.js**
   - Added route: `POST /:title/mark-received`

## Next Steps

1. ✅ **Backend fixes applied** - Restart backend server
2. ⚠️ **Mobile app needs to verify**:
   - Is sending `qty` as DIFFERENCE (not TOTAL)?
   - Are events being sent multiple times?
   - Can add UI to mark items as "Received"?
3. 🔍 **Investigate quantity issue**:
   - Check backend logs for quantity update messages
   - Check database for duplicate events
   - Verify mobile app is calculating difference correctly

## Summary

- ✅ Status no longer auto-changes to "Received"
- ✅ New API endpoint to explicitly mark as "Received"
- ⚠️ Quantity issue needs investigation (likely mobile app sending TOTAL instead of DIFFERENCE)
