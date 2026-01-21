# Store and Box_ID Null Fix - COMPLETE ✅

**Date**: 2026-01-20  
**Status**: ✅ **FIXED**

---

## 🚨 Problem Fixed

**Issue**: `store` and `box_id` fields were `NULL` in `tabWmsScanEvent` for Transfer In putaway events, even though:
- ✅ Box exists in `tabSortBox` with `box_id = carton_id` (CTN-TI-...)
- ✅ `tabSortBox` has `store` populated
- ✅ Mobile app sends PUTAWAY_TO_RACK events

**Root Cause**: 
1. Mobile app was sending old format (`TI-PUT-*` or putaway task title) instead of carton_id (`CTN-TI-*`)
2. Event processing logic wasn't resolving the old format to the actual `box_id` in `tabSortBox`
3. `store` wasn't being populated from `tabSortBox` even when `box_id` was resolved

---

## ✅ Changes Applied

### File: `wms-api/src/modules/events/eventController.js`

#### 1. Resolve Putaway Task Title to Actual Box ID (Lines 163-220)

**Problem**: Mobile app sends `TI-PUT-*` or `PUT-*` (putaway task title), but `tabSortBox` uses `CTN-TI-*` as `box_id`.

**Solution**: Added logic to resolve putaway task title to actual carton_id:
- Check `tabSortBox.putaway_task_title` to find `box_id`
- Fallback to `tabPutawayLine.carton_id` if not found
- Update `normalizedBoxId` to the resolved `box_id`

**Code**:
```javascript
// Resolve TI-PUT-* or PUT-* to actual CTN-TI-* box_id
if (normalizedBoxId && (normalizedBoxId.startsWith('PUT-') || normalizedBoxId.startsWith('TI-PUT-'))) {
  // Try to find carton_id from tabSortBox using putaway_task_title
  const [boxByTask] = await connection.execute(
    `SELECT box_id, carton_id FROM tabSortBox WHERE putaway_task_title = ? LIMIT 1`,
    [normalizedBoxId]
  );
  
  if (boxByTask.length > 0) {
    actualBoxIdForLookup = boxByTask[0].box_id || boxByTask[0].carton_id;
    normalizedBoxId = actualBoxIdForLookup; // Update to actual box_id
  }
}
```

#### 2. Always Populate Store and Box_ID from tabSortBox (Lines 230-261)

**Problem**: `store` and `box_id` weren't being populated from `tabSortBox` even when box exists.

**Solution**: Added logic to ALWAYS check `tabSortBox` first and populate missing fields:
- Query `tabSortBox` using `normalizedBoxId`
- Populate `store` from `tabSortBox.store`
- Update `normalizedBoxId` to match `tabSortBox.box_id` (ensures consistency)
- Populate `carton_id` if missing

**Code**:
```javascript
// CRITICAL: First, try to get store and box_id from tabSortBox (for both ASN and Transfer In)
if (normalizedBoxId) {
  const [sortBoxInfo] = await connection.execute(
    `SELECT box_id, store, carton_id, advance_shipping_notice FROM tabSortBox WHERE box_id = ? LIMIT 1`,
    [normalizedBoxId]
  );
  
  if (sortBoxInfo.length > 0) {
    const boxInfo = sortBoxInfo[0];
    
    // Update normalizedBoxId to match tabSortBox.box_id
    if (boxInfo.box_id && boxInfo.box_id !== normalizedBoxId) {
      normalizedBoxId = boxInfo.box_id;
    }
    
    // CRITICAL FIX: Always populate store from tabSortBox if missing
    if (!normalizedStore && boxInfo.store) {
      normalizedStore = boxInfo.store;
      logger.info(`[Event] ✅ Populated store from tabSortBox for box ${normalizedBoxId}: ${normalizedStore}`);
    }
    
    // Populate carton_id if missing
    if (!normalizedCartonId && boxInfo.carton_id) {
      normalizedCartonId = boxInfo.carton_id;
    } else if (!normalizedCartonId && boxInfo.box_id) {
      // For Transfer In, box_id IS the carton_id
      normalizedCartonId = boxInfo.box_id;
    }
  }
}
```

#### 3. Event Insertion Uses Normalized Values (Line 792)

**Already Working**: The INSERT statement already uses `normalizedStore` and `normalizedBoxId`:
```javascript
INSERT INTO tabWmsScanEvent 
  (..., store, box_id, ...)
VALUES (..., normalizedStore, normalizedBoxId, ...)
```

---

## 🔄 Complete Flow

### Step 1: Mobile App Sends Event
```
PUTAWAY_TO_RACK event:
{
  "box_id": "TI-PUT-20260120-0001",  // Old format (putaway task title)
  "location_id": "A1-R02-L2-B2",
  "store": null,  // Missing
  ...
}
```

### Step 2: Event Processing
```
1. ✅ Normalize box_id: "TI-PUT-20260120-0001"
2. ✅ Resolve to actual box_id: Query tabSortBox.putaway_task_title
   → Found: box_id = "CTN-TI-123457-20260120-1937"
3. ✅ Update normalizedBoxId: "CTN-TI-123457-20260120-1937"
4. ✅ Query tabSortBox by box_id:
   → Found: store = "WH-MAIN", box_id = "CTN-TI-123457-20260120-1937"
5. ✅ Populate normalizedStore: "WH-MAIN"
6. ✅ Insert event with normalized values
```

### Step 3: Event Saved
```
tabWmsScanEvent:
- box_id: "CTN-TI-123457-20260120-1937" ✅ (not NULL)
- store: "WH-MAIN" ✅ (not NULL)
- carton_id: "CTN-TI-123457-20260120-1937" ✅
```

---

## ✅ Key Features

1. **Resolves Old Format**: ✅ Converts `TI-PUT-*` or `PUT-*` to actual `CTN-TI-*` box_id
2. **Populates Store**: ✅ Always populates `store` from `tabSortBox` if missing
3. **Populates Box_ID**: ✅ Ensures `box_id` matches `tabSortBox.box_id`
4. **Works for Both**: ✅ Works for both ASN and Transfer In putaway
5. **Backward Compatible**: ✅ Still works if mobile app sends correct `CTN-TI-*` format

---

## 📝 Summary

✅ **Resolves putaway task title to actual box_id** from `tabSortBox`  
✅ **Always populates `store`** from `tabSortBox` if missing  
✅ **Ensures `box_id` consistency** with `tabSortBox.box_id`  
✅ **Works for old and new formats** (TI-PUT-* and CTN-TI-*)  

**Result**: `store` and `box_id` are now properly populated in `tabWmsScanEvent` for Transfer In putaway events! 🎉
