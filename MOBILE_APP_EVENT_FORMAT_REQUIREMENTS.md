# Mobile App Event Format Requirements - CRITICAL ⚠️

**Date**: 2026-01-20  
**Status**: ⚠️ **MOBILE APP UPDATE REQUIRED**

---

## 🚨 Problem

**Issue**: `store` and `box_id` are `NULL` in `tabWmsScanEvent` for some Transfer In putaway events.

**Root Cause**: Mobile app is sending events with incorrect format:
1. ❌ `carton_id` with item code appended: `"CTN-TI-123457-20260120-1948: SKU-HAT-301-BLU-OS"`
2. ❌ Missing `box_id` field
3. ❌ Using old `TI-PUT-*` format

**Backend Fix Applied**: Backend now strips item code from `carton_id` and uses it as `box_id`, but **mobile app should send correct format**.

---

## ✅ Required Mobile App Changes

### 1. Send `box_id` Field (CRITICAL)

**For Transfer In Putaway**, mobile app **MUST** send `box_id` field with the carton ID (CTN-TI-* format).

**❌ WRONG:**
```json
{
  "event_type": "PUTAWAY_TO_RACK",
  "carton_id": "CTN-TI-123457-20260120-1948: SKU-HAT-301-BLU-OS",  // ❌ Has item code
  "box_id": null,  // ❌ Missing
  "location_id": "A1-R02-L2-B2"
}
```

**✅ CORRECT:**
```json
{
  "event_type": "PUTAWAY_TO_RACK",
  "carton_id": "CTN-TI-123457-20260120-194818-864",  // ✅ Clean carton ID (no item code)
  "box_id": "CTN-TI-123457-20260120-194818-864",  // ✅ Same as carton_id
  "item_code": "SKU-HAT-301-BLU-OS",  // ✅ Separate field
  "location_id": "A1-R02-L2-B2",
  "store": "WH-MAIN"  // ✅ Optional but recommended
}
```

### 2. Do NOT Append Item Code to Carton ID

**❌ WRONG:**
```javascript
const cartonId = `${baseCartonId}: ${itemCode}`;  // ❌ Don't do this
```

**✅ CORRECT:**
```javascript
const cartonId = baseCartonId;  // ✅ Clean carton ID only
const itemCode = itemCode;  // ✅ Separate field
```

### 3. Use CTN-TI-* Format (NOT TI-PUT-*)

**❌ WRONG:**
```json
{
  "box_id": "TI-PUT-20260120-0001",  // ❌ Old format
  "carton_id": "TI-PUT-20260120-0001"  // ❌ Old format
}
```

**✅ CORRECT:**
```json
{
  "box_id": "CTN-TI-123457-20260120-194818-864",  // ✅ New format
  "carton_id": "CTN-TI-123457-20260120-194818-864"  // ✅ New format
}
```

---

## 📋 Complete Event Format

### PUTAWAY_TO_RACK Event (Transfer In)

```json
{
  "offline_uuid": "unique-uuid-here",
  "event_type": "PUTAWAY_TO_RACK",
  "event_time": "2026-01-20T19:48:18.864Z",
  "device_id": "DEVICE-001",
  "user_id": "USER-402498",
  "carton_id": "CTN-TI-123457-20260120-194818-864",  // ✅ Clean carton ID
  "box_id": "CTN-TI-123457-20260120-194818-864",  // ✅ REQUIRED: Same as carton_id
  "item_code": "SKU-HAT-301-BLU-OS",  // ✅ Separate field
  "qty": 2.00,
  "store": "WH-MAIN",  // ✅ Optional but recommended
  "location_id": "A1-R02-L2-B2",  // ✅ Required
  "rack": "A1-R02",  // ✅ Optional (can be derived from location_id)
  "bin": "L2-B2"  // ✅ Optional (can be derived from location_id)
}
```

---

## 🔄 How to Get Box ID

### Step 1: Validate Carton During Receiving

**API**: `POST /api/transfer-in/:title/validate-carton`

**Request:**
```json
{
  "carton_id": "CTN-TI-123457-20260120-194818-864"
}
```

**Response:**
```json
{
  "ok": true,
  "box_id": "CTN-TI-123457-20260120-194818-864",  // ✅ Use this as box_id
  "putaway_task": "PUT-20260120-0001"
}
```

### Step 2: Store Box ID for Putaway

```javascript
// After validating carton, store the box_id
const validationResponse = await validateCarton(transferInTitle, cartonId);
const boxId = validationResponse.box_id;  // ✅ Store this

// Later, when scanning for putaway, use this box_id
await sendPutawayEvent({
  box_id: boxId,  // ✅ Use stored box_id
  carton_id: cartonId,  // ✅ Same value
  location_id: locationId
});
```

---

## ✅ Backend Handling (Fallback)

**Backend will attempt to fix**:
1. ✅ Strips item code from `carton_id` if appended
2. ✅ Uses `carton_id` as `box_id` if `box_id` is missing
3. ✅ Resolves `TI-PUT-*` to `CTN-TI-*` from `tabSortBox`
4. ✅ Populates `store` from `tabSortBox` if missing

**BUT**: Mobile app should send correct format to ensure reliability.

---

## 📝 Summary

**Required Mobile App Changes**:
1. ✅ **Send `box_id` field** (same as `carton_id` for Transfer In)
2. ✅ **Do NOT append item code to `carton_id`** (use separate `item_code` field)
3. ✅ **Use `CTN-TI-*` format** (not `TI-PUT-*`)
4. ✅ **Get `box_id` from validate-carton API** response

**Result**: `store` and `box_id` will be properly populated in `tabWmsScanEvent`! 🎉
