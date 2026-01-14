# Material Request Status Transition Fix

## 🐛 Issue

**Error:** `Cannot change status from "Picked" to "In Progress" when all items are fully picked.`

**Root Cause:** The API validation was preventing users from resuming picking (changing status from "Picked" to "In Progress") when all items were fully picked.

**User Scenario:**
1. User picks all items → Status becomes "Picked"
2. User wants to resume picking (maybe to pick more items, adjust quantities, or correct mistakes)
3. User clicks "Resume Picking" → Tries to change status to "In Progress"
4. ❌ API rejects the request because all items are fully picked

---

## ✅ Fix Applied

**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**Change:** Removed the validation that prevented changing from "Picked" to "In Progress" when all items are fully picked.

**Before:**
```javascript
// Validate "In Progress" status transition
if (status === 'In Progress' && currentStatus === 'Picked') {
  // Check if items are still fully picked
  const allItemsFullyPicked = ...;
  
  if (allItemsFullyPicked) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'INVALID_STATUS_TRANSITION',
        message: 'Cannot change status from "Picked" to "In Progress" when all items are fully picked.'
      }
    });
  }
}
```

**After:**
```javascript
// Validate "In Progress" status transition
// Allow changing from "Picked" to "In Progress" to resume picking
// This is needed when users want to continue picking or adjust quantities
// No validation needed - users can always resume picking regardless of completion status
// if (status === 'In Progress' && currentStatus === 'Picked') {
//   // REMOVED: This validation was too restrictive
//   // Users should be able to resume picking even if all items are fully picked
//   // (e.g., to pick more items, adjust quantities, or correct mistakes)
// }
```

---

## 📋 Allowed Status Transitions

### ✅ Always Allowed:
- **"Submitted" → "In Progress"** - Start picking
- **"In Progress" → "In Progress"** - Resume picking (no-op, but allowed)
- **"Picked" → "In Progress"** - Resume picking (even if all items fully picked)
- **"In Progress" → "Picked"** - Complete picking (only if all items fully picked - still validated)

### ⚠️ Validated Transitions:
- **"In Progress" → "Picked"** - Only allowed if ALL items are fully picked

---

## 🎯 Workflow After Fix

### Scenario 1: Normal Picking Flow
1. User clicks "Start Picking" → Status: "Submitted" → "In Progress" ✅
2. User picks items → Status remains "In Progress" ✅
3. User clicks "Complete Picking" → Status: "In Progress" → "Picked" ✅ (if all items picked)
4. User clicks "Create Transfer Carton" → Creates TC ✅
5. User clicks "Seal Transfer Carton" → Status: "Picked" → "Sealed TC" ✅

### Scenario 2: Resume Picking After Completion
1. User picks all items → Status: "In Progress" → "Picked" ✅
2. User wants to pick more items or adjust quantities
3. User clicks "Resume Picking" → Status: "Picked" → "In Progress" ✅ (NOW ALLOWED)
4. User picks additional items → Status remains "In Progress" ✅
5. User clicks "Complete Picking" again → Status: "In Progress" → "Picked" ✅

### Scenario 3: Multiple Users Picking
1. User A starts picking → Status: "In Progress" ✅
2. User B also picks items → Status remains "In Progress" ✅
3. User A completes picking → Status: "In Progress" → "Picked" ✅
4. User B wants to continue picking → Status: "Picked" → "In Progress" ✅ (NOW ALLOWED)
5. User B picks more items → Status remains "In Progress" ✅

---

## 🧪 Testing

### Test 1: Resume Picking After All Items Picked

**Steps:**
1. Pick all items for a Material Request
2. Status should be "Picked"
3. Try to change status to "In Progress"
4. Should succeed (no error)

**API Call:**
```http
POST /api/material-requests/MR-123461/update-status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "In Progress"
}
```

**Expected Response:**
```json
{
  "ok": true,
  "message": "Material Request status updated successfully",
  "data": {
    "title": "MR-123461",
    "status": "In Progress"
  }
}
```

### Test 2: Complete Picking (Still Validated)

**Steps:**
1. Pick some (but not all) items for a Material Request
2. Status should be "In Progress"
3. Try to change status to "Picked"
4. Should fail with validation error (if not all items picked)

**API Call:**
```http
POST /api/material-requests/MR-123461/update-status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "Picked"
}
```

**Expected Response (if not all items picked):**
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Cannot set status to \"Picked\". Not all items are fully picked.",
    "details": {
      "pending_items": [...]
    }
  }
}
```

---

## 📱 Mobile App Impact

**No changes required** - The mobile app can continue using the same API calls. The fix allows more flexible status transitions.

**Button Logic:**
- **"Resume Picking"** button should now work even when status is "Picked" and all items are fully picked
- **"Complete Picking"** button should still check if all items are fully picked before allowing status change to "Picked"

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-13  
**API Endpoint:** `POST /api/material-requests/:title/update-status`
