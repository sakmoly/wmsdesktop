# Transfer In Carton ID Fix Summary

## ⚠️ CRITICAL FIX #1: Quantity Updates Not Working (FIXED)

**Issue**: When editing quantities in Transfer In Receiving Screen, changes are not reflected in the backend.

**Root Causes**:

1. Event processing was not updating `received_qty` (was removed to fix double-counting)
2. Receive-line API rejected items that already had `carton_id`
3. Event processing required `carton_id` to be present

**Fixes Applied**:

1. **Event Processing** - Now updates `received_qty` ADDITIVELY:

   - `event.qty` is the DIFFERENCE (change amount), not the total
   - Adds `qty` to existing `received_qty`: `newReceivedQty = currentReceivedQty + qty`
   - Handles both positive (increase) and negative (decrease) quantities
   - `carton_id` is now optional (not required)

2. **Receive-Line API** - Now allows updating items with `carton_id`:
   - Removed restriction that prevented updating items with `carton_id`
   - Can now update quantities for any item, regardless of carton_id status

**Status**: ✅ **FIXED** - Restart backend to apply fix.

**Files Changed**:

- `wms-api/src/modules/events/eventController.js` - Event processing
- `wms-api/src/modules/transfer-in/transferInController.js` - Receive-line API

---

## ⚠️ CRITICAL: Mobile App Event Missing `transfer_in` Field

**Your logs show**: The mobile app is sending `TRANSFER_IN_RECEIVE` events with `carton_id`, but **missing the `transfer_in` field**.

**Impact**: Events are saved to the database, but **carton_id is NOT being updated** in Transfer In items because event processing is skipped when `transfer_in` is missing.

**Fix Required in Mobile App**: Add `transfer_in` field to TRANSFER_IN_RECEIVE events:

```javascript
{
  "event_type": "TRANSFER_IN_RECEIVE",
  "transfer_in": "INSLIP-123465",  // ← ADD THIS FIELD
  "item_code": "SKU-HAT-301-RED-OS",
  "carton_id": "CTN-555445",
  "qty": 2,
  // ... other fields
}
```

**Alternative**: Use the direct API call instead of events:

```javascript
POST /api/transfer-in/:title/receive-line
{
  "carton_id": "CTN-555445",
  "received_by": "USER-001"
}
```

---

## Issues Identified

1. **Carton ID Not Updating for All Items**: When receiving items by carton, the system only found items that already had the carton_id set. Items with NULL carton_id were not being updated.

2. **Carton ID Mismatch**: Putaway Tasks were showing different carton IDs (like `TI-PUT-20260115-000`) instead of the actual carton IDs from Transfer In (like `CTN-9444537`).

## Backend Fixes Applied

### 1. Fixed Receive-Line Query (Scenario A: Receive by Carton)

**Problem**: The query only found items that already had the carton_id:

```sql
WHERE parent_title = ? AND carton_id = ?
```

**Solution**: Now finds items with matching carton_id OR items without carton_id (NULL):

```sql
WHERE parent_title = ? AND (carton_id = ? OR carton_id IS NULL)
```

**File**: `wms-api/src/modules/transfer-in/transferInController.js`
**Lines**: ~514-525

### 2. Enhanced Carton ID Assignment

**Changes**:

- Now assigns carton_id to items even if they're already fully received
- Better logging to track carton_id assignments
- Moved column check outside the loop for better performance

**File**: `wms-api/src/modules/transfer-in/transferInController.js`
**Lines**: ~537-590

### 3. Improved Putaway Task Creation Logging

**Added**:

- Logs showing how many items have carton_id vs. without
- Lists all unique carton_ids being used
- Logs each putaway line creation with carton_id status

**File**: `wms-api/src/modules/transfer-in/transferInController.js`
**Lines**: ~1107-1127, ~1186-1230

## Mobile App Requirements

### ✅ What Mobile App Should Do

#### 1. When Receiving by Carton ID

**Option A: Direct API Call (Recommended)**

```javascript
POST /api/transfer-in/:title/receive-line
{
  "carton_id": "CTN-9444537",  // ← MUST include carton_id
  "received_by": "USER-001"
}
```

**Option B: Using Events (Must include transfer_in)**

```javascript
POST /api/events/batch
{
  "events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440000",
      "event_type": "TRANSFER_IN_RECEIVE",
      "transfer_in": "INSLIP-123465",  // ← REQUIRED: Must include transfer_in
      "carton_id": "CTN-9444537",      // ← REQUIRED: Must include carton_id
      "item_code": "SKU-HAT-301-RED-OS",
      "qty": 2,
      "device_id": "DEV-001",
      "user_id": "USER-001",
      "event_time": "2025-01-25T10:30:00.000Z"
    }
  ]
}
```

**Important**:

- ✅ **Always send `carton_id`** when receiving by carton
- ✅ **If using events, MUST include `transfer_in` field** - otherwise event processing will be skipped
- ✅ The backend will now assign carton_id to items that don't have it
- ✅ Items with existing carton_id will be updated if they match

#### 2. When Receiving Loose Items (No Carton)

**API Call**:

```javascript
POST /api/transfer-in/:title/receive-line
{
  "item_code": "SKU-HAT-301-GRN-OS",
  "received_qty": 2.00,
  "received_by": "USER-001"
  // No carton_id needed for loose items
}
```

#### 3. Update Carton ID for Existing Items

**New API Endpoint** (if needed):

```javascript
POST /api/transfer-in/:title/update-line-carton
{
  "item_code": "SKU-HAT-301-GRN-OS",
  "carton_id": "CTN-9444537"
}
```

**Use Case**: If you need to update carton_id for an item after it's been received.

### 📱 Mobile App Implementation Checklist

- [ ] **Verify carton_id is sent** in receive-line API calls when receiving by carton
- [ ] **If using events, verify `transfer_in` field is included** in TRANSFER_IN_RECEIVE events
- [ ] **Test receiving items with carton_id** - verify all items get carton_id assigned
- [ ] **Test receiving items without carton_id** - verify loose items work correctly
- [ ] **Verify carton_id appears** in Transfer In details after receiving
- [ ] **Check Putaway Tasks** - verify carton_id matches Transfer In carton_id
- [ ] **Check backend logs** - verify no warnings about missing transfer_in field

### 🔍 Debugging

**Backend Logs to Check**:

```
[Transfer In] ✅ Assigned carton_id=CTN-9444537 for item SKU-HAT-301-GRN-OS in Transfer In INSLIP-123465
📦 Found 1 item(s) to put away for Transfer In INSLIP-123465
   - Items with carton_id: 1
   - Items without carton_id: 0
   - Carton IDs: CTN-9444537
   - Created putaway line: SKU-HAT-301-GRN-OS with carton_id=CTN-9444537, qty=2.00
```

**If you see**:

```
⚠️ Created putaway line: SKU-HAT-301-GRN-OS WITHOUT carton_id, qty=2.00
```

This means the item didn't have carton_id when the putaway task was created. Check:

1. Was the item received with carton_id?
2. Was the receive-line API called with carton_id parameter?

**If you see**:

```
⚠️  processTransferInReceiveEvent: Missing required fields. transfer_in=null, item_code=SKU-HAT-301-RED-OS, carton_id=CTN-555445
```

This means the mobile app is sending TRANSFER_IN_RECEIVE events but **missing the `transfer_in` field**. The mobile app must include `transfer_in` in the event payload.

## Testing Steps

### Test 1: Receive Items with Carton ID

1. Create Transfer In with items
2. Receive items by carton ID:
   ```bash
   POST /api/transfer-in/INSLIP-123465/receive-line
   {
     "carton_id": "CTN-9444537",
     "received_by": "USER-001"
   }
   ```
3. Verify:
   - ✅ All items in Transfer In have carton_id = `CTN-9444537`
   - ✅ Putaway Task is created
   - ✅ Putaway Lines have carton_id = `CTN-9444537` (not `TI-PUT-...`)

### Test 2: Receive Items Without Carton ID

1. Create Transfer In with items
2. Receive items individually:
   ```bash
   POST /api/transfer-in/INSLIP-123465/receive-line
   {
     "item_code": "SKU-HAT-301-GRN-OS",
     "received_qty": 2.00,
     "received_by": "USER-001"
   }
   ```
3. Verify:
   - ✅ Item received_qty is updated
   - ✅ carton_id remains NULL (for loose items)

### Test 3: Update Carton ID After Receiving

1. Receive item without carton_id
2. Update carton_id:
   ```bash
   POST /api/transfer-in/INSLIP-123465/update-line-carton
   {
     "item_code": "SKU-HAT-301-GRN-OS",
     "carton_id": "CTN-9444537"
   }
   ```
3. Verify:
   - ✅ Item carton_id is updated in Transfer In
   - ✅ If putaway task exists, it should also be updated

## Expected Behavior After Fix

### Before Fix:

- ❌ Items with NULL carton_id were not found when receiving by carton
- ❌ Putaway Tasks showed `TI-PUT-20260115-000` instead of actual carton_id
- ❌ Not all items had carton_id updated

### After Fix:

- ✅ Items with NULL carton_id are found and assigned carton_id when receiving by carton
- ✅ Putaway Tasks use the actual carton_id from Transfer In items
- ✅ All items receive carton_id when receiving by carton
- ✅ Better logging to track carton_id assignments

## ⚠️ CRITICAL FIX: Quantity Update Implementation

### How Quantity Updates Work

**Event Processing** - Updates `received_qty` ADDITIVELY:

- `event.qty` is the **DIFFERENCE** (change amount), not the total
- For increases: `event.qty` is positive (e.g., `+2`)
- For decreases: `event.qty` is negative (e.g., `-2`)
- Backend adds `qty` to existing `received_qty`:
  ```sql
  UPDATE tabTransferInItem
  SET received_qty = received_qty + ?
  WHERE parent_title = ? AND item_code = ?
  ```

**Receive-Line API** - Also updates `received_qty` ADDITIVELY:

- `received_qty` parameter is the **DIFFERENCE**, not the total
- Adds to existing quantity: `finalReceivedQty = currentReceivedQty + received_qty`
- Now works for items with or without `carton_id`

### Example Flow

**User changes quantity from 5 to 7**:

1. Mobile app sends event: `{ "qty": 2 }` (difference)
2. Backend processes: `received_qty = 5 + 2 = 7` ✅

**User changes quantity from 7 to 5**:

1. Mobile app sends event: `{ "qty": -2 }` (difference)
2. Backend processes: `received_qty = 7 + (-2) = 5` ✅

### Key Points

- ✅ Events update `received_qty` additively (adds qty to existing)
- ✅ Receive-line API also updates `received_qty` additively
- ✅ Both work for items with or without `carton_id`
- ✅ Handles both positive (increase) and negative (decrease) quantities
- ✅ Validates that `received_qty` doesn't go below 0
- ✅ Validates that `received_qty` doesn't exceed expected qty (optional)

### Mobile App Impact

**No changes needed** - The mobile app should:

- Send `qty` as the **DIFFERENCE** (change amount), not the total
- Can use either events or receive-line API (both work now)
- Events are preferred for items with `carton_id` (but API also works)

## ✅ NEW FEATURE: Transfer In Item Status Tracking

### Status Field Added

**New Column**: `status` in `tabTransferInItem` table

**Status Values**:

- **Pending**: `received_qty = 0` (not yet started receiving)
- **Picking**: `0 < received_qty < qty` (currently being picked/received)
- **Received**: `received_qty >= qty` (fully received, picking complete)

**Implementation**:

- ✅ Status automatically updates when `received_qty` changes
- ✅ Status set to "Picking" when receiving starts
- ✅ Status set to "Received" when picking is complete or carton is closed
- ✅ Included in all API responses

**Migration Required**:

```bash
cd wms-api
node add-status-column-to-transfer-in-item.js
```

**Files Changed**:

- `wms-api/src/modules/transfer-in/transferInController.js` - Status updates in receive-line API
- `wms-api/src/modules/events/eventController.js` - Status updates in event processing
- `wms-api/add-status-column-to-transfer-in-item.js` - Migration script (NEW)

**See**: `TRANSFER_IN_ITEM_STATUS_IMPLEMENTATION.md` for full details

## Notes

- The `TI-PUT-20260115-000` format you saw might be from a different source (possibly generated elsewhere in the putaway process). The fix ensures that when creating putaway tasks from Transfer In, the actual carton_id from `tabTransferInItem` is used.

- If you still see incorrect carton_ids in putaway tasks, check:

  1. Are items being received with carton_id?
  2. Is the mobile app sending carton_id in the receive-line API call?
  3. Check backend logs for carton_id assignment messages

- If you see quantity discrepancies (received_qty > expected qty), check:

  1. Are events being processed multiple times?
  2. Is the receive-line API being called multiple times?
  3. Check backend logs for quantity update messages

- **Status Field**: Items now track their picking status. Status is automatically updated when receiving items. Check `status` field in API responses to see current picking state.
