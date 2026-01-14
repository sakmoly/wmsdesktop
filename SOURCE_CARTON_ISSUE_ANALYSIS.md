# Source Carton Not Showing - Issue Analysis

## Problem

**Transfer Carton Details** shows empty "Source Carton" for all items.

**Example:**
- Item: SKU-HAT-301-BLU-OS, Quantity: 2, **Source Carton: (empty)**
- Item: SKU-HAT-301-GRN-OS, Quantity: 2, **Source Carton: (empty)**

---

## Root Cause Analysis

### API Query (Backend)

The API query in `getTransferCartonById` selects `carton_id` from events:

```sql
SELECT 
  item_code,
  carton_id AS source_carton,  -- ← Selecting carton_id from event
  SUM(qty) AS quantity,
  MAX(user_id) AS packed_by,
  MAX(event_time) AS packed_on
FROM tabWmsScanEvent
WHERE tc_id = ?
  AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
  AND item_code IS NOT NULL
  AND item_code != ''
  AND qty > 0
GROUP BY item_code, carton_id
```

**This means:**
- ✅ If mobile app sends `carton_id` → It will show as `source_carton`
- ❌ If mobile app doesn't send `carton_id` → It will be NULL (empty)

---

## Investigation Steps

### Step 1: Check Database Events

Run this query to see what the mobile app is actually sending:

```sql
SELECT 
  event_type,
  item_code,
  carton_id,  -- ← Check if this is NULL
  box_id,
  qty,
  event_time,
  user_id
FROM tabWmsScanEvent
WHERE tc_id = 'TC-MR-123457-1768306175846'
  AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
ORDER BY event_time DESC;
```

**Expected Results:**
- If `carton_id` is NULL → **Mobile app is NOT sending it**
- If `carton_id` has values → **API issue (should be showing it)**

---

### Step 2: Check Mobile App Event Format

The mobile app should send `carton_id` in packing events:

**Required Event Format:**
```json
{
  "event_type": "PACK_ITEM_TO_TC",
  "event_time": "2026-01-13T15:09:00Z",
  "device_id": "DEVICE-001",
  "user_id": "USER-150526",
  "item_code": "SKU-HAT-301-BLU-OS",
  "qty": 2.00,
  "carton_id": "CTN-555444",  // ← REQUIRED: Source carton ID
  "tc_id": "TC-MR-123457-1768306175846",
  "transfer_order": "MR-123457",
  "material_request": "MR-123457"
}
```

**If mobile app is NOT sending `carton_id`:**
- ❌ **Issue: Mobile app not sending carton_id**
- ✅ **Fix: Mobile app must include `carton_id` in packing events**

---

## Possible Causes

### Cause 1: Mobile App Not Sending carton_id (Most Likely)

**Symptom:** `carton_id` is NULL in database events

**Solution:** Mobile app must include `carton_id` when packing items:

```javascript
// Mobile app code
const packEvent = {
  event_type: "PACK_ITEM_TO_TC",
  item_code: scannedItemCode,
  qty: scannedQty,
  carton_id: scannedCartonId,  // ← MUST include this!
  tc_id: currentTcId,
  transfer_order: materialRequest,
  // ... other fields
};
```

---

### Cause 2: API Not Handling carton_id Correctly

**Symptom:** `carton_id` exists in database but not showing in response

**Check:** The API query should work correctly. If `carton_id` is in the database, it should appear in the response.

**Possible Issue:** The query groups by `carton_id`, so if multiple items have different `carton_id` values, they will be grouped separately. If all items have `carton_id = NULL`, they will be grouped together with `source_carton = null`.

---

### Cause 3: Desktop App Not Displaying source_carton

**Symptom:** API returns `source_carton` but desktop app shows empty

**Check:** Desktop app code that displays "Source Carton" column

**File:** `Services/TransferCartonService.cs` or UI code

---

## How to Verify

### 1. Check Database Directly

```sql
-- Check if carton_id is being stored
SELECT 
  event_type,
  item_code,
  carton_id,
  COUNT(*) as event_count
FROM tabWmsScanEvent
WHERE tc_id = 'TC-MR-123457-1768306175846'
  AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
GROUP BY event_type, item_code, carton_id;
```

**If `carton_id` is NULL:**
- ✅ **Root Cause:** Mobile app not sending `carton_id`
- ✅ **Fix:** Update mobile app to include `carton_id`

**If `carton_id` has values:**
- ✅ **Root Cause:** API or desktop app issue
- ✅ **Fix:** Check API response and desktop app display

---

### 2. Check API Response

Call the API directly:

```http
GET /api/transfer-cartons/TC-MR-123457-1768306175846
Authorization: Bearer <token>
```

**Check the response:**
```json
{
  "ok": true,
  "data": {
    "tc_id": "TC-MR-123457-1768306175846",
    "contents": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "source_carton": "CTN-555444",  // ← Check if this is null or has value
        "qty": 2,
        "packed_by": "USER-150526",
        "packed_on": "2026-01-13T15:09:00Z"
      }
    ]
  }
}
```

**If `source_carton` is null in API response:**
- ✅ **Root Cause:** Mobile app not sending `carton_id` OR database has NULL values
- ✅ **Fix:** Check database first, then fix mobile app

**If `source_carton` has value in API response:**
- ✅ **Root Cause:** Desktop app not displaying it
- ✅ **Fix:** Check desktop app UI code

---

## Recommended Fix

### If Mobile App Not Sending carton_id:

**Mobile App Code Update:**

```javascript
// When packing item to transfer carton
const packItemToTC = async (itemCode, qty, sourceCartonId, tcId, materialRequest) => {
  const event = {
    offline_uuid: generateUUID(),
    event_type: "PACK_ITEM_TO_TC",
    event_time: new Date().toISOString(),
    device_id: deviceId,
    user_id: userId,
    item_code: itemCode,
    qty: qty,
    carton_id: sourceCartonId,  // ← ADD THIS: Source carton ID
    tc_id: tcId,
    transfer_order: materialRequest,
    material_request: materialRequest,
    store: store
  };
  
  // Send to backend
  await fetch('/api/events/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ events: [event] })
  });
};
```

---

## Summary

**Most Likely Issue:** Mobile app is **NOT sending `carton_id`** in packing events.

**Quick Check:**
1. Run SQL query to check if `carton_id` is NULL in database
2. If NULL → Mobile app issue (not sending it)
3. If has values → API or desktop app issue

**Fix:**
- Mobile app must include `carton_id` when creating `PACK_ITEM_TO_TC` events
- The `carton_id` should be the source carton ID (the carton the item is being picked from)

---

**Status:** 🔍 **INVESTIGATION REQUIRED**  
**Date:** 2026-01-13
