# Putaway Event Missing Fields Fix

**Date**: 2026-01-19  
**Issue**: `PUTAWAY_TO_RACK` events missing `store`, `item_code`, and `carton_id` fields

---

## Problem

When mobile app sends `PUTAWAY_TO_RACK` events, they only include:
- ✅ `box_id` - Present
- ✅ `rack` / `bin` / `location_id` - Present
- ❌ `item_code` - Missing (NULL)
- ❌ `store` - Missing (NULL)
- ❌ `carton_id` - Missing (NULL)

However, this information IS available from earlier `SORT_TO_BOX` events for the same box.

---

## Root Cause

The mobile app sends `PUTAWAY_TO_RACK` events with only location and box information, not item details. The backend was not populating these missing fields from the box contents.

---

## Fix Implemented

**File**: `wms-api/src/modules/events/eventController.js`

**Location**: Event normalization logic (before event insertion)

### Changes

1. **Enhanced Event Normalization**:
   - For `PUTAWAY_TO_RACK`, `PUTAWAY_CONFIRM`, `PUTAWAY_COMPLETE` events
   - If `item_code`, `store`, or `carton_id` are missing
   - Lookup box contents from `SORT_TO_BOX` events
   - Populate missing fields from the first item found

2. **Lookup Logic**:
   ```javascript
   // Get box contents from SORT_TO_BOX events
   SELECT item_code, carton_id, store
   FROM tabWmsScanEvent
   WHERE event_type = 'SORT_TO_BOX'
     AND box_id = ?
     AND item_code IS NOT NULL
   ORDER BY event_time DESC
   LIMIT 1
   ```

3. **Fallback Logic**:
   - If no `SORT_TO_BOX` events found:
     - Try to get `store` from `tabsortbox.store`
     - Use `box_id` as `carton_id` (for putaway, box_id IS the carton)

---

## Code Changes

### Before
```javascript
if (isPutawayEvent) {
  normalizedBoxId = box_id || tc_id || null;
  normalizedTcId = null;
  // Missing fields not populated
}
```

### After
```javascript
if (isPutawayEvent) {
  normalizedBoxId = box_id || tc_id || null;
  normalizedTcId = null;
  
  // Populate missing fields from box contents
  if (normalizedBoxId && (!normalizedItemCode || !normalizedStore || !normalizedCartonId)) {
    // Lookup from SORT_TO_BOX events
    const [boxContents] = await connection.execute(`
      SELECT item_code, carton_id, store
      FROM tabWmsScanEvent
      WHERE event_type = 'SORT_TO_BOX'
        AND box_id = ?
        AND item_code IS NOT NULL
      ORDER BY event_time DESC
      LIMIT 1
    `, [normalizedBoxId]);
    
    // Populate missing fields...
  }
}
```

---

## Expected Results

After fix, `PUTAWAY_TO_RACK` events will have:

✅ **`box_id`**: `PAW-ASN365425473-1768842519219` (from event)  
✅ **`item_code`**: `SKU-HAT-301-BLU-OS` (populated from SORT_TO_BOX)  
✅ **`store`**: `WH-MAIN` (populated from SORT_TO_BOX)  
✅ **`carton_id`**: `PAW-ASN365425473-1768842519219` or original carton_id (populated from SORT_TO_BOX or box_id)  
✅ **`rack`**: `A1-R02-L1-B2` (from event)  
✅ **`bin`**: `B2` (from event)  

---

## Testing

### Test 1: PUTAWAY_TO_RACK with Missing Fields

**Send Event**:
```json
POST /api/events/batch
{
  "events": [
    {
      "offline_uuid": "test-putaway-123",
      "event_type": "PUTAWAY_TO_RACK",
      "event_time": "2026-01-19T18:00:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-001",
      "box_id": "PAW-ASN365425473-1768842519219",
      "location_id": "A1-R02-L1-B2",
      "rack": "A1-R02-L1",
      "bin": "B2"
      // Note: item_code, store, carton_id NOT provided
    }
  ]
}
```

**Verify**:
```sql
SELECT event_type, box_id, item_code, store, carton_id, rack, bin
FROM tabwmsscanevent
WHERE offline_uuid = 'test-putaway-123';
```

**Expected**:
- ✅ `item_code` populated from `SORT_TO_BOX` event
- ✅ `store` populated from `SORT_TO_BOX` event
- ✅ `carton_id` populated from `SORT_TO_BOX` event or `box_id`

---

### Test 2: PUTAWAY_TO_RACK with Partial Fields

**Send Event** (with `item_code` but missing `store` and `carton_id`):
```json
{
  "event_type": "PUTAWAY_TO_RACK",
  "box_id": "PAW-ASN365425473-1768842519219",
  "item_code": "SKU-HAT-301-BLU-OS",
  // store and carton_id missing
}
```

**Expected**:
- ✅ `item_code` kept as provided
- ✅ `store` populated from `SORT_TO_BOX` event
- ✅ `carton_id` populated from `SORT_TO_BOX` event or `box_id`

---

## Logs to Monitor

After sending `PUTAWAY_TO_RACK` event, check logs for:

1. **Field Population**:
   ```
   [Event] Populated missing item_code from box PAW-XXX: SKU-HAT-301-BLU-OS
   [Event] Populated missing store from box PAW-XXX: WH-MAIN
   [Event] Populated missing carton_id from box PAW-XXX: PAW-XXX
   ```

2. **Fallback**:
   ```
   [Event] Populated missing store from tabsortbox for box PAW-XXX: WH-MAIN
   [Event] Using box_id as carton_id for putaway: PAW-XXX
   ```

3. **Warnings** (if lookup fails):
   ```
   [Event] Failed to lookup box contents for PAW-XXX
   ```

---

## Verification Query

After fix, verify all `PUTAWAY_TO_RACK` events have required fields:

```sql
SELECT 
  event_type,
  box_id,
  item_code,
  store,
  carton_id,
  rack,
  bin,
  CASE 
    WHEN item_code IS NULL THEN 'MISSING item_code'
    WHEN store IS NULL THEN 'MISSING store'
    WHEN carton_id IS NULL THEN 'MISSING carton_id'
    ELSE 'OK'
  END as status
FROM tabwmsscanevent
WHERE event_type = 'PUTAWAY_TO_RACK'
ORDER BY id DESC
LIMIT 20;
```

**Expected**: All rows should show `status = 'OK'`

---

## Status

✅ **Fix Implemented**

- ✅ Event normalization enhanced to populate missing fields
- ✅ Lookup from `SORT_TO_BOX` events
- ✅ Fallback to `tabsortbox` for `store`
- ✅ Fallback to `box_id` for `carton_id`
- ✅ Error handling (doesn't fail event if lookup fails)

**Next Steps**:
1. Test with new `PUTAWAY_TO_RACK` events
2. Verify fields are populated in database
3. Check logs for population messages
