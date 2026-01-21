# Transfer In Carton Validation and Box Creation Fix

**Date**: 2026-01-20  
**Status**: ✅ **FIXED**

---

## 🎯 Issues Fixed

### 1. Carton Validation Blocking "Submitted" Status

**Problem**: Carton validation was blocking when Transfer In was in "Submitted" status, preventing users from validating cartons before scanning items.

**Solution**: Updated validation to only block "Draft" status. "Submitted" status is now allowed, enabling the flow:
1. Transfer In in "Submitted" status
2. Validate carton (generate carton ID)
3. Scan items
4. Complete receiving

**File**: `wms-api/src/modules/transfer-in/transferInController.js`  
**Function**: `validateTransferInCarton`  
**Lines**: 3082-3092

**Before:**
```javascript
if (transferInStatus === 'Draft' || transferInStatus === 'Submitted') {
  return res.status(400).json({
    error: {
      code: "TRANSFER_IN_NOT_RECEIVED",
      message: "Cartons are only available after receiving items..."
    }
  });
}
```

**After:**
```javascript
// Allow validation for "Submitted" status - user needs to validate carton before scanning items
// Only block "Draft" status where Transfer In hasn't been submitted yet
if (transferInStatus === 'Draft') {
  return res.status(400).json({
    error: {
      code: "TRANSFER_IN_NOT_SUBMITTED",
      message: "Please submit the Transfer In first before validating cartons."
    }
  });
}
```

---

### 2. Box Creation with Carton ID

**Problem**: Need to support creating boxes using carton ID (generated ID like `CTN-TI-123457-20260120-160936-988`) as `box_id` for Transfer In Putaway.

**Solution**: Updated `POST /api/boxes/create` and added `POST /api/sort-box/create` (alias) to accept `carton_id` as `box_id`.

**File**: `wms-api/src/modules/boxes/boxController.js`  
**Function**: `createBox`

**Changes**:
1. Added `carton_id` parameter support
2. Use `carton_id` as `box_id` if `box_id` not provided
3. Default `purpose` to `PUTAWAY` if `carton_id` provided
4. Return `carton_id` in response if used

**Request Format (Transfer In)**:
```json
POST /api/boxes/create
POST /api/sort-box/create  // Alias

{
  "box_id": "CTN-TI-123457-20260120-160936-988",  // Carton ID (generated ID)
  "advance_shipping_notice": "INSLIP-123457",
  "store": "WH-MAIN",
  "purpose": "PUTAWAY",
  "created_by": "USER-001"
}
```

**OR** (using `carton_id` field):
```json
{
  "carton_id": "CTN-TI-123457-20260120-160936-988",  // Will be used as box_id
  "advance_shipping_notice": "INSLIP-123457",
  "store": "WH-MAIN",
  "purpose": "PUTAWAY",
  "created_by": "USER-001"
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Box created successfully",
  "box_id": "CTN-TI-123457-20260120-160936-988",
  "status": "Open",
  "data": {
    "box_id": "CTN-TI-123457-20260120-160936-988",
    "status": "Open",
    "purpose": "PUTAWAY",
    "carton_id": "CTN-TI-123457-20260120-160936-988"
  }
}
```

---

## 🔄 Complete Flow

### Step 1: Transfer In in "Submitted" Status
```
Transfer In: INSLIP-123457
Status: Submitted
```

### Step 2: Validate Carton (Generate Carton ID)
```
POST /api/transfer-in/INSLIP-123457/validate-carton
Request: { "carton_id": "CTN-TI-123457-20260120-160936-988" }

Response: {
  "ok": true,
  "validated": {
    "carton_id": "CTN-TI-123457-20260120-160936-988",
    "box_id": "CTN-TI-123457-20260120-160936-988",
    "exists": true,
    "putaway_task": null,  // Not created yet
    "ready_for_putaway": false
  }
}
```

### Step 3: Create Box (Optional - if not auto-created)
```
POST /api/sort-box/create
Request: {
  "box_id": "CTN-TI-123457-20260120-160936-988",  // Carton ID
  "advance_shipping_notice": "INSLIP-123457",
  "store": "WH-MAIN",
  "purpose": "PUTAWAY",
  "created_by": "USER-001"
}

Response: {
  "ok": true,
  "box_id": "CTN-TI-123457-20260120-160936-988",
  "status": "Open"
}
```

### Step 4: Scan Items
```
User scans items into the carton/box
→ Items are received
→ Transfer In status changes to "Receiving"
```

### Step 5: Complete Receiving
```
When all items received:
→ Transfer In status changes to "Received"
→ Putaway task is auto-created
→ Box is linked to putaway task
```

---

## 📊 Status Flow

### Transfer In Status Flow:
```
Draft → Submitted → Receiving → Received
```

### Carton Validation Allowed:
- ✅ **Submitted**: Can validate carton (generate carton ID)
- ✅ **Receiving**: Can validate carton (items being received)
- ✅ **Received**: Can validate carton (ready for putaway)
- ❌ **Draft**: Cannot validate carton (not submitted yet)

---

## ✅ Changes Summary

### Files Modified:

1. **`wms-api/src/modules/transfer-in/transferInController.js`**
   - Updated `validateTransferInCarton` to allow "Submitted" status
   - Changed error code from `TRANSFER_IN_NOT_RECEIVED` to `TRANSFER_IN_NOT_SUBMITTED` for Draft status

2. **`wms-api/src/modules/boxes/boxController.js`**
   - Added `carton_id` parameter support
   - Use `carton_id` as `box_id` if `box_id` not provided
   - Default `purpose` to `PUTAWAY` if `carton_id` provided
   - Updated documentation

3. **`wms-api/src/routes/index.js`**
   - Added `/api/sort-box` route alias for `/api/boxes`

---

## 🚨 Important Notes

1. **Carton Validation Flow**:
   - Users can now validate cartons when Transfer In is in "Submitted" status
   - This allows them to generate carton IDs before scanning items
   - After validation, users proceed to scan items

2. **Box Creation**:
   - For Transfer In Putaway, `box_id` = `carton_id` (e.g., `CTN-TI-123457-20260120-160936-988`)
   - Can use either `box_id` or `carton_id` field in request
   - Purpose defaults to `PUTAWAY` if `carton_id` provided

3. **Route Aliases**:
   - `/api/boxes/create` - Original route
   - `/api/sort-box/create` - Alias (for compatibility)

---

## 📝 Summary

✅ **Carton validation now works for "Submitted" status** - users can validate cartons before scanning items

✅ **Box creation supports carton ID** - can create boxes using carton ID as box_id for Transfer In Putaway

✅ **Route alias added** - `/api/sort-box/create` works as alias for `/api/boxes/create`

**Result**: Transfer In receiving flow now works correctly: Validate carton → Scan items → Complete receiving! 🎉
