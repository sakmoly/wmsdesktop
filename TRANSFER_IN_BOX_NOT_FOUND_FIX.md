# Transfer In Box Not Found Fix

**Date**: 2026-01-20  
**Status**: 🔍 **ANALYSIS & FIX REQUIRED**

---

## 🚨 Problem

**Error Message:**
```
Box TI-PUT-20260120-0001 not found in tabSortBox. 
Box must be created before putaway.
```

**Issue:**
- Mobile app is trying to scan box with old format: `TI-PUT-20260120-0001`
- But box should be created with `box_id = carton_id` (e.g., `CTN-TI-123457-20260120-184442-430`)
- Box doesn't exist in `tabSortBox` table

---

## 🔍 Root Cause Analysis

### Expected Flow:
1. ✅ Transfer In in "Submitted" status
2. ✅ Validate carton → Generate carton ID: `CTN-TI-123457-20260120-184442-430`
3. ✅ Scan items into carton
4. ✅ Complete receiving → Creates putaway task `PUT-20260120-0001`
5. ✅ **Auto-create box in `tabSortBox` with `box_id = carton_id`** ← **This should happen**
6. ❌ Mobile app tries to scan `TI-PUT-20260120-0001` (wrong format)

### Possible Issues:

1. **Box Not Created**: `ensurePutawayBoxesForTransferIn` might have failed silently
2. **Wrong Box ID Format**: Mobile app is using old `TI-PUT-*` format instead of carton_id
3. **Timing Issue**: Box creation happens after putaway task, but mobile app queries before box exists

---

## ✅ Solution

### 1. Ensure Box Creation Happens

**File**: `wms-api/src/modules/transfer-in/transferInController.js`  
**Function**: `ensurePutawayBoxesForTransferIn`

**Current Behavior:**
- Called when putaway task is created (line 2417)
- Creates box with `box_id = carton_id` (line 2689)
- Should create box for each distinct carton in putaway lines

**Verification Needed:**
- Check if function is being called
- Check if it's creating boxes successfully
- Check if carton_id exists in putaway lines

### 2. Update Error Message to Guide User

**File**: `wms-api/src/modules/putaway/putawayController.js`  
**Function**: `scanTransferCarton`

**Current Error:**
```json
{
  "code": "BOX_NOT_FOUND",
  "message": "Box TI-PUT-20260120-0001 not found in tabSortBox. Box must be created before putaway."
}
```

**Proposed Enhanced Error (for Transfer In):**
```json
{
  "code": "BOX_NOT_FOUND",
  "message": "Box TI-PUT-20260120-0001 not found in tabSortBox.",
  "hint": "For Transfer In Putaway, box_id should be the carton_id (e.g., CTN-TI-123457-20260120-184442-430). Please scan the carton ID instead.",
  "troubleshooting": [
    "1. Go to Transfer In Receiving",
    "2. Click 'Generate Carton ID' to create a box",
    "3. Scan items to the box",
    "4. Complete receiving to close the box",
    "5. Then scan the carton ID (CTN-TI-*) for putaway"
  ]
}
```

### 3. Add Box ID Format Validation

**File**: `wms-api/src/modules/putaway/putawayController.js`  
**Function**: `scanTransferCarton`

**Add Check:**
```javascript
// If box_id is in old TI-PUT-* format, suggest using carton_id instead
if (box_id && box_id.startsWith('TI-PUT-')) {
  // This is old format - try to find the actual carton_id
  // Check if this is a putaway task title instead
  const [taskCheck] = await connection.execute(
    `SELECT title, transfer_in FROM tabPutawayTask WHERE title = ? LIMIT 1`,
    [box_id]
  );
  
  if (taskCheck.length > 0) {
    // This is actually a putaway task title, not a box_id
    // Find the carton_id from putaway lines
    const [cartonCheck] = await connection.execute(
      `SELECT DISTINCT carton_id FROM tabPutawayLine 
       WHERE parent_title = ? AND carton_id IS NOT NULL LIMIT 1`,
      [box_id]
    );
    
    if (cartonCheck.length > 0) {
      const actualBoxId = cartonCheck[0].carton_id;
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "BOX_ID_FORMAT_ERROR",
          message: `TI-PUT-* format is no longer used. For Transfer In Putaway, use the carton_id as box_id.`,
          hint: `Try scanning: ${actualBoxId}`,
          troubleshooting: [
            "For Transfer In Putaway, box_id = carton_id (e.g., CTN-TI-123457-20260120-184442-430)",
            "The carton ID is generated when you validate the carton during receiving",
            "Scan the carton ID (not the putaway task title) for putaway"
          ]
        },
      });
    }
  }
}
```

---

## 🔄 Complete Flow (Corrected)

### Step 1: Transfer In Receiving
```
Transfer In: INSLIP-123457
Status: Receiving
Carton: CTN-TI-123457-20260120-184442-430
Items: 2 items scanned (4 units total)
```

### Step 2: Complete Receiving
```
POST /api/transfer-in/INSLIP-123457/complete-receiving
→ Creates putaway task: PUT-20260120-0001
→ Calls ensurePutawayBoxesForTransferIn()
→ Creates box in tabSortBox:
   - box_id: CTN-TI-123457-20260120-184442-430 (carton_id)
   - advance_shipping_notice: INSLIP-123457
   - purpose: PUTAWAY
   - status: Open
```

### Step 3: Scan Box for Putaway (Mobile App)
```
POST /api/putaway/scan-transfer-carton
Request: {
  "box_id": "CTN-TI-123457-20260120-184442-430",  // ✅ Correct: carton_id
  "location_id": "A1-R02-L1-B2"
}

Response: {
  "ok": true,
  "validated": {
    "box_id": "CTN-TI-123457-20260120-184442-430",
    "putaway_task": "PUT-20260120-0001"
  }
}
```

---

## 🚨 Mobile App Changes Required

**The mobile app needs to be updated to:**

1. **Use carton_id as box_id** (not `TI-PUT-*` format)
   - When scanning box for putaway, use the carton ID from receiving
   - Carton ID format: `CTN-TI-{transfer_in}-{timestamp}-{random}`

2. **Get box_id from putaway task response**
   - When putaway task is created, response should include `box_id` (carton_id)
   - Use this `box_id` for putaway scanning

3. **Display correct box_id in putaway list**
   - Show carton_id (e.g., `CTN-TI-123457-20260120-184442-430`)
   - NOT putaway task title (e.g., `PUT-20260120-0001`)
   - NOT old format (e.g., `TI-PUT-20260120-0001`)

---

## ✅ Verification Steps

1. **Check if box exists in database:**
   ```sql
   SELECT box_id, advance_shipping_notice, purpose, status 
   FROM tabSortBox 
   WHERE advance_shipping_notice = 'INSLIP-123457';
   ```
   - Should return box with `box_id = CTN-TI-123457-20260120-184442-430`

2. **Check putaway lines:**
   ```sql
   SELECT carton_id, COUNT(*) as items 
   FROM tabPutawayLine 
   WHERE parent_title = 'PUT-20260120-0001' 
   GROUP BY carton_id;
   ```
   - Should show carton_id: `CTN-TI-123457-20260120-184442-430`

3. **Check if box creation was called:**
   - Look for logs: `✅ Created box CTN-TI-123457-20260120-184442-430 (box_id = carton_id)`
   - If not found, box creation might have failed

---

## 📝 Summary

**Problem**: Mobile app using old `TI-PUT-*` format instead of carton_id

**Solution**:
1. ✅ Ensure box is created with `box_id = carton_id` when receiving completes
2. ✅ Add better error messages to guide users
3. ⚠️ **Mobile app needs update** to use carton_id as box_id

**Next Steps**:
1. Verify box creation is working (check logs)
2. Update mobile app to use carton_id format
3. Test complete flow: Receiving → Box Creation → Putaway Scanning
