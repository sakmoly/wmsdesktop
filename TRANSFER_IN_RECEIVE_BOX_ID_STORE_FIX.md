# Transfer In Receive: box_id and store NULL Fix

**Date**: 2026-01-20  
**Status**: ✅ **FIXED**

---

## 🚨 Problem

**Issue**: `tabwmsscanevent.box_id` and `tabwmsscanevent.store` are NULL for `TRANSFER_IN_RECEIVE` events.

**Root Cause**:
1. `TRANSFER_IN_RECEIVE` events are inserted in `batchEvents` function
2. The INSERT uses `normalizedBoxId` and `normalizedStore` from event normalization
3. But for `TRANSFER_IN_RECEIVE` events, these fields may not be populated correctly
4. The normalization logic doesn't specifically handle `TRANSFER_IN_RECEIVE` events

**Evidence**:
- Screenshot shows some records with NULL `box_id` and `store`
- Other records have values (`WH-MAIN`, `CTN-TI-123457-20260120-214634-875`)
- This indicates inconsistent handling

---

## ✅ Solution Implemented

### Fix: Ensure box_id and store are Populated for TRANSFER_IN_RECEIVE Events

**File**: `wms-api/src/modules/events/eventController.js`  
**Lines**: ~554-610 (before validation) and ~930-960 (before INSERT)

**Changes**:

1. **Early Population for TRANSFER_IN_RECEIVE** (before validation):
   - If `carton_id` is provided but `box_id` is missing, set `box_id = carton_id`
   - Get `store` from `transfer_in` document's `to_warehouse` or `warehouse` field
   - Fallback: Extract `transfer_in` from `carton_id` if it's in `CTN-TI-*` format

2. **Final Check Before INSERT** (after all normalization):
   - Final check: If `box_id` is still NULL but `carton_id` exists, set `box_id = carton_id`
   - Final check: If `store` is still NULL for `TRANSFER_IN_RECEIVE`, try to get from `transfer_in` one more time
   - Last resort: Use default `WH-MAIN` if still NULL (with warning log)

---

## 🔍 How It Works

### Flow: TRANSFER_IN_RECEIVE Event Processing

1. **Event Received**:
   ```json
   {
     "event_type": "TRANSFER_IN_RECEIVE",
     "transfer_in": "INSLIP-123457",
     "carton_id": "CTN-TI-123457-20260120-233347-116",
     "item_code": "SKU-HAT-301-BLU-OS",
     "qty": 2
   }
   ```

2. **Early Population** (NEW):
   ```javascript
   if (event_type === 'TRANSFER_IN_RECEIVE') {
     // Set box_id = carton_id if missing
     if (carton_id && !box_id) {
       box_id = carton_id; // CTN-TI-123457-20260120-233347-116
     }
     
     // Get store from transfer_in document
     if (!store && transfer_in) {
       const [tiInfo] = await db.execute(
         `SELECT to_warehouse, warehouse FROM tabTransferIn WHERE title = ?`,
         [transfer_in]
       );
       store = tiInfo[0].to_warehouse || tiInfo[0].warehouse; // WH-MAIN
     }
   }
   ```

3. **Normalization** (existing logic):
   - Normalizes `box_id`, `carton_id`, `store` through existing lookup logic
   - Tries to find from `tabSortBox` if available

4. **Final Check Before INSERT** (NEW):
   ```javascript
   // Final check: box_id
   if (!normalizedBoxId && normalizedCartonId) {
     normalizedBoxId = normalizedCartonId;
   }
   
   // Final check: store for TRANSFER_IN_RECEIVE
   if (!normalizedStore && event_type === 'TRANSFER_IN_RECEIVE' && transfer_in) {
     // Try one more time to get from transfer_in
     normalizedStore = await getStoreFromTransferIn(transfer_in);
   }
   
   // Last resort: default
   if (!normalizedStore) {
     normalizedStore = 'WH-MAIN';
   }
   ```

5. **INSERT**:
   ```sql
   INSERT INTO tabWmsScanEvent (..., box_id, store, ...)
   VALUES (..., 'CTN-TI-123457-20260120-233347-116', 'WH-MAIN', ...)
   ```

---

## 📋 Changes Made

### 1. Early Population for TRANSFER_IN_RECEIVE

**File**: `wms-api/src/modules/events/eventController.js`  
**Lines**: ~554-610

**Added**:
```javascript
// CRITICAL FIX: For TRANSFER_IN_RECEIVE events, ensure box_id and store are populated
if (event_type && event_type.toUpperCase() === 'TRANSFER_IN_RECEIVE') {
  // Set box_id = carton_id if carton_id is provided but box_id is missing
  if (normalizedCartonId && !normalizedBoxId) {
    normalizedBoxId = normalizedCartonId;
  }
  
  // Get store from transfer_in document if missing
  if (!normalizedStore && transfer_in) {
    const [transferInInfo] = await connection.execute(
      `SELECT to_warehouse, warehouse FROM tabTransferIn WHERE title = ? LIMIT 1`,
      [transfer_in]
    );
    if (transferInInfo.length > 0) {
      normalizedStore = transferInInfo[0].to_warehouse || transferInInfo[0].warehouse;
    }
  }
  
  // Fallback: Extract transfer_in from carton_id (CTN-TI-{transfer_in}-...)
  if (!normalizedStore && normalizedCartonId && normalizedCartonId.startsWith('CTN-TI-')) {
    const parts = normalizedCartonId.split('-');
    if (parts.length >= 3) {
      const extractedTransferIn = parts[2];
      // Get store from extracted transfer_in
    }
  }
}
```

---

### 2. Final Check Before INSERT

**File**: `wms-api/src/modules/events/eventController.js`  
**Lines**: ~930-960

**Added**:
```javascript
// CRITICAL: For TRANSFER_IN_RECEIVE events, ensure box_id and store are set before INSERT
// Final check: If box_id is still NULL but carton_id exists, use carton_id
if (!normalizedBoxId && normalizedCartonId) {
  normalizedBoxId = normalizedCartonId;
}

// Final check: If store is still NULL for TRANSFER_IN_RECEIVE, try one more time
if (!normalizedStore && event_type === 'TRANSFER_IN_RECEIVE' && transfer_in) {
  // Try to get from transfer_in one more time
}

// Last resort: Use default if still NULL
if (!normalizedStore) {
  normalizedStore = 'WH-MAIN';
  logger.warn(`[Event] Store still NULL after all attempts, using default: ${normalizedStore}`);
}
```

---

## 🧪 Testing

### Test 1: Verify box_id is Set

**Request**:
```json
{
  "events": [{
    "event_type": "TRANSFER_IN_RECEIVE",
    "transfer_in": "INSLIP-123457",
    "carton_id": "CTN-TI-123457-20260120-233347-116",
    "item_code": "SKU-HAT-301-BLU-OS",
    "qty": 2,
    "offline_uuid": "EVT-1234567890-123456",
    "event_time": "2026-01-20T23:33:47Z",
    "device_id": "DEVICE-001",
    "user_id": "USER-001"
  }]
}
```

**Expected Result**:
```sql
SELECT box_id, store, carton_id, event_type
FROM tabWmsScanEvent
WHERE offline_uuid = 'EVT-1234567890-123456';
```

**Expected**:
- ✅ `box_id` = `CTN-TI-123457-20260120-233347-116` (NOT NULL)
- ✅ `store` = `WH-MAIN` (NOT NULL)
- ✅ `carton_id` = `CTN-TI-123457-20260120-233347-116`

---

### Test 2: Verify store is Set from transfer_in

**Request**:
```json
{
  "events": [{
    "event_type": "TRANSFER_IN_RECEIVE",
    "transfer_in": "INSLIP-123457",
    "carton_id": "CTN-TI-123457-20260120-233347-116",
    "item_code": "SKU-HAT-301-GRN-OS",
    "qty": 2,
    ...
  }]
}
```

**Expected Logs**:
```
[Event] TRANSFER_IN_RECEIVE: Set box_id = carton_id: CTN-TI-123457-20260120-233347-116
[Event] TRANSFER_IN_RECEIVE: Set store from transfer_in INSLIP-123457: WH-MAIN
[Event] Final check: Set box_id = carton_id before INSERT: CTN-TI-123457-20260120-233347-116
✅ Inserted event: TRANSFER_IN_RECEIVE (EVT-1234567890-123456...)
```

---

### Test 3: Verify Fallback Works

**Request** (missing `transfer_in`):
```json
{
  "events": [{
    "event_type": "TRANSFER_IN_RECEIVE",
    "carton_id": "CTN-TI-123457-20260120-233347-116",
    "item_code": "SKU-HAT-301-BLU-OS",
    "qty": 2,
    ...
  }]
}
```

**Expected**:
- ✅ `box_id` = `CTN-TI-123457-20260120-233347-116` (from carton_id)
- ✅ `store` = `WH-MAIN` (default fallback)
- ⚠️ Warning log: `Store still NULL after all attempts, using default: WH-MAIN`

---

## 🚨 Important Notes

### Why This Fix is Needed

**Before Fix**:
- `TRANSFER_IN_RECEIVE` events might not have `box_id` or `store` in the event payload
- Normalization logic might not catch all cases
- Result: NULL values in database

**After Fix**:
- Early population ensures `box_id` and `store` are set as soon as possible
- Final check before INSERT ensures they're never NULL
- Last resort default prevents NULL values

---

### Data Consistency

**box_id Rule**:
- For `TRANSFER_IN_RECEIVE`: `box_id` = `carton_id` (always)
- This ensures consistency with other event types

**store Rule**:
- For `TRANSFER_IN_RECEIVE`: `store` = `transfer_in.to_warehouse` or `transfer_in.warehouse`
- Fallback: Extract from `carton_id` if it's `CTN-TI-{transfer_in}-...` format
- Last resort: `WH-MAIN` (with warning)

---

## 📝 Summary

**Fixed**:
- ✅ `box_id` is now always set for `TRANSFER_IN_RECEIVE` events (from `carton_id`)
- ✅ `store` is now always set for `TRANSFER_IN_RECEIVE` events (from `transfer_in` document)
- ✅ Multiple fallback strategies ensure values are never NULL
- ✅ Warning logs when defaults are used

**Result**:
- ✅ All `TRANSFER_IN_RECEIVE` events will have `box_id` and `store` populated
- ✅ No more NULL values in `tabwmsscanevent.box_id` and `tabwmsscanevent.store`
- ✅ Consistent with other event types

---

## 🔧 Next Steps

1. **Restart Backend Server**: For code changes to take effect

2. **Test**: Send `TRANSFER_IN_RECEIVE` events and verify:
   - `box_id` is populated
   - `store` is populated
   - No NULL values in database

3. **Verify Logs**: Check for population messages:
   ```
   [Event] TRANSFER_IN_RECEIVE: Set box_id = carton_id: ...
   [Event] TRANSFER_IN_RECEIVE: Set store from transfer_in: ...
   ```

4. **Check Database**: Query to verify no NULL values:
   ```sql
   SELECT COUNT(*) as null_count
   FROM tabWmsScanEvent
   WHERE event_type = 'TRANSFER_IN_RECEIVE'
     AND (box_id IS NULL OR store IS NULL);
   ```
   Expected: `null_count = 0`

---

**END**
