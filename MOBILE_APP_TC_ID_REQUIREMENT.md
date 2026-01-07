# Mobile App: Transfer Carton ID (tc_id) Requirement

## Critical Issue Found

**Test Results Show:**
- ✅ Transfer Carton `TC-MR-0001-1767520301021` exists and is sealed
- ❌ **0 events found with `tc_id = 'TC-MR-0001-1767520301021'`**
- ⚠️  **20 packing events found for MR-0001, but ALL have `TC: NULL`**

## Root Cause

The mobile app is **NOT including `tc_id`** in the packing events (`PACK_BOX_TO_TC` or `PACK_ITEM_TO_TC`). This causes:
1. Items not showing in desktop app (desktop app queries by `tc_id`)
2. Items cannot be linked to specific transfer cartons
3. Fallback logic must be used (less reliable)

## Required Fix: Mobile App MUST Include tc_id

### Event Format - REQUIRED Fields

When packing items to a transfer carton, the mobile app **MUST** include `tc_id`:

```json
{
  "events": [
    {
      "event_type": "PACK_ITEM_TO_TC",
      "event_time": "2026-01-04T13:05:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-150526",
      "item_code": "SKU-JACKET-201-BLK-I",
      "qty": 20.00,
      "store": "STORE-001",
      "tc_id": "TC-MR-0001-1767520301021",  // ✅ REQUIRED - MUST be included!
      "transfer_order": "MR-0001",
      "material_request": "MR-0001"
    }
  ]
}
```

### Why tc_id is Critical

1. **Desktop App Query**: Desktop app queries items by `tc_id`:
   ```sql
   SELECT * FROM tabWmsScanEvent
   WHERE tc_id = 'TC-MR-0001-1767520301021'
     AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
   ```

2. **Transfer Carton Contents**: Without `tc_id`, items cannot be linked to the specific transfer carton

3. **Validation**: Backend validates sealed cartons by checking `tc_id` in events

## Current Workaround (Fallback)

The desktop app now has fallback logic that:
- Finds events by Material Request number (`transfer_order = 'MR-0001'`)
- Uses time window around TC creation/seal time
- Only works if events are within the time window

**However, this is NOT reliable** because:
- Multiple transfer cartons for same MR will show same items
- Time window might miss events
- Less accurate than direct `tc_id` lookup

## Mobile App Implementation

### Step 1: Store TC ID When Creating Transfer Carton

```javascript
// After creating transfer carton
const createResponse = await fetch('/api/transfer-cartons/create', {
  method: 'POST',
  body: JSON.stringify({
    tc_id: generatedTcId,
    asn_no: null,
    to_no: "MR-0001",
    store: "STORE-001",
    user_id: userId
  })
});

const { data } = await createResponse.json();
const tcId = data.tc_id; // Store this!

// Store in app state/local storage
localStorage.setItem('current_tc_id', tcId);
```

### Step 2: Include tc_id in All Packing Events

```javascript
// When packing items
const packEvent = {
  event_type: "PACK_ITEM_TO_TC",
  event_time: new Date().toISOString(),
  device_id: deviceId,
  user_id: userId,
  item_code: itemCode,
  qty: qty,
  store: store,
  tc_id: tcId,  // ✅ MUST include from Step 1
  transfer_order: "MR-0001",
  material_request: "MR-0001"
};

await fetch('/api/events/batch', {
  method: 'POST',
  body: JSON.stringify({ events: [packEvent] })
});
```

## Validation Added

The backend now **rejects** packing events for sealed transfer cartons:

**Error Response:**
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

## Testing

Run the test script to verify:
```bash
cd wms-api
node test-transfer-carton-api.js
```

**Expected Results After Fix:**
- ✅ Events should have `tc_id` populated
- ✅ Items should show in desktop app's "Carton Contents"
- ✅ Sealed cartons should reject new packing events

## Summary

**Mobile App MUST:**
1. ✅ Store `tc_id` after creating transfer carton
2. ✅ Include `tc_id` in ALL packing events (`PACK_BOX_TO_TC`, `PACK_ITEM_TO_TC`)
3. ✅ Check transfer carton status before allowing packing
4. ✅ Display error if packing is attempted on sealed carton

**Backend Changes (Already Applied):**
1. ✅ Validates sealed carton status before accepting packing events
2. ✅ Rejects events for sealed/dispatched/completed cartons
3. ✅ Fallback logic for events without `tc_id` (temporary workaround)
4. ✅ Includes both `PACK_BOX_TO_TC` and `PACK_ITEM_TO_TC` in queries

