# Store and Box_ID Null Fix - Enhanced ⚠️

**Date**: 2026-01-20  
**Status**: ✅ **ENHANCED**

---

## 🚨 Problem

**Issue**: `store` and `box_id` are still `NULL` in `tabWmsScanEvent` for some Transfer In putaway events, even after initial fixes.

**Root Causes**:
1. Mobile app sends `carton_id` with item code appended: `"CTN-TI-123457-20260120-1948: SKU-HAT-301-BLU-OS"`
2. Timestamp mismatch: Event has `1948` but actual box_id has `194818-864`
3. `box_id` field is missing from event (mobile app only sends `carton_id`)
4. Exact match lookup fails due to timestamp differences

---

## ✅ Enhanced Fixes Applied

### File: `wms-api/src/modules/events/eventController.js`

#### 1. Use `carton_id` as `box_id` if `box_id` is Missing (Lines 156-163)

**Problem**: Mobile app sends `carton_id` but not `box_id`.

**Solution**: If `box_id` is missing, use cleaned `carton_id` as `box_id`.

**Code**:
```javascript
// CRITICAL FIX: If carton_id is provided but box_id is not, use carton_id as box_id
if (!normalizedBoxId && carton_id) {
  const cleanCartonId = carton_id.split(':')[0].trim();
  normalizedBoxId = cleanCartonId;
  normalizedCartonId = cleanCartonId;
  logger.info(`[Event] Using carton_id as box_id for putaway: ${normalizedBoxId}`);
}
```

#### 2. Enhanced Box Lookup with Multiple Strategies (Lines 250-290)

**Problem**: Exact match fails when timestamps differ.

**Solution**: Try multiple lookup strategies:
1. **Exact match** on `box_id` or `carton_id`
2. **Partial match** using LIKE pattern (for timestamp variations)
3. **Fallback** to putaway lines if still not found

**Code**:
```javascript
// Try exact match first (box_id or carton_id)
[sortBoxInfo] = await connection.execute(
  `SELECT box_id, store, carton_id, advance_shipping_notice 
   FROM tabSortBox 
   WHERE box_id = ? OR carton_id = ? 
   LIMIT 1`,
  [searchId, searchId]
);

// If not found, try partial match (for timestamp variations)
if (sortBoxInfo.length === 0 && searchId.startsWith('CTN-TI-')) {
  const parts = searchId.split('-');
  if (parts.length >= 4) {
    const basePattern = parts.slice(0, 4).join('-') + '%';
    [sortBoxInfo] = await connection.execute(
      `SELECT box_id, store, carton_id, advance_shipping_notice 
       FROM tabSortBox 
       WHERE (box_id LIKE ? OR carton_id LIKE ?) 
       LIMIT 1`,
      [basePattern, basePattern]
    );
  }
}
```

#### 3. Always Populate Store and Box_ID (Lines 292-310)

**Problem**: `store` and `box_id` not populated even when box is found.

**Solution**: Always populate these fields when box is found in `tabSortBox`.

**Code**:
```javascript
if (sortBoxInfo.length > 0) {
  const boxInfo = sortBoxInfo[0];
  
  // Update normalizedBoxId to actual box_id from tabSortBox
  if (boxInfo.box_id && boxInfo.box_id !== normalizedBoxId) {
    normalizedBoxId = boxInfo.box_id;
  }
  
  // CRITICAL FIX: Always populate store from tabSortBox if missing
  if (!normalizedStore && boxInfo.store) {
    normalizedStore = boxInfo.store;
    logger.info(`[Event] ✅ Populated store from tabSortBox: ${normalizedStore}`);
  }
}
```

---

## 🔄 Complete Flow

### Step 1: Mobile App Sends Event
```json
{
  "event_type": "PUTAWAY_TO_RACK",
  "carton_id": "CTN-TI-123457-20260120-1948: SKU-HAT-301-BLU-OS",  // ❌ Has item code, truncated timestamp
  "box_id": null,  // ❌ Missing
  "store": null,  // ❌ Missing
  "location_id": "A1-R02-L2-B2"
}
```

### Step 2: Event Processing
```
1. ✅ Detect PUTAWAY event
2. ✅ Use carton_id as box_id (since box_id is null):
   → normalizedBoxId = "CTN-TI-123457-20260120-1948"
3. ✅ Clean carton_id (strip item code):
   → normalizedCartonId = "CTN-TI-123457-20260120-1948"
4. ✅ Try exact match in tabSortBox:
   → Query: WHERE box_id = "CTN-TI-123457-20260120-1948" OR carton_id = "..."
   → Not found (timestamp mismatch)
5. ✅ Try partial match:
   → Query: WHERE box_id LIKE "CTN-TI-123457-20260120%"
   → Found: box_id = "CTN-TI-123457-20260120-194818-864", store = "WH-MAIN"
6. ✅ Update normalizedBoxId: "CTN-TI-123457-20260120-194818-864"
7. ✅ Populate normalizedStore: "WH-MAIN"
8. ✅ Insert event with populated values
```

### Step 3: Event Saved
```
tabWmsScanEvent:
- box_id: "CTN-TI-123457-20260120-194818-864" ✅ (not NULL)
- store: "WH-MAIN" ✅ (not NULL)
- carton_id: "CTN-TI-123457-20260120-194818-864" ✅
```

---

## ✅ Key Features

1. **Uses carton_id as box_id**: ✅ If `box_id` is missing, uses cleaned `carton_id`
2. **Multiple lookup strategies**: ✅ Exact match → Partial match → Fallback
3. **Handles timestamp variations**: ✅ Partial match using LIKE pattern
4. **Always populates store**: ✅ From `tabSortBox.store` when box is found
5. **Strips item code**: ✅ Removes `: SKU-*` suffix from `carton_id`

---

## 📝 Summary

✅ **Enhanced box lookup** with multiple strategies  
✅ **Uses carton_id as box_id** if box_id is missing  
✅ **Handles timestamp variations** with partial matching  
✅ **Always populates store** from tabSortBox  
✅ **Strips item code** from carton_id before lookup  

**Result**: `store` and `box_id` should now be properly populated even when mobile app sends incomplete data! 🎉

---

## ⚠️ Mobile App Still Needs Update

**While backend now handles these cases, mobile app should still be updated to**:
1. ✅ Send `box_id` field (same as `carton_id`)
2. ✅ Do NOT append item code to `carton_id`
3. ✅ Use correct timestamp format

See `MOBILE_APP_EVENT_FORMAT_REQUIREMENTS.md` for details.
