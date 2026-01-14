# Material Request Submit Status - Backend Analysis

## Current Backend Implementation

### ✅ Status Update Endpoint

**Endpoint:** `POST /api/material-requests/:title/update-status`

**Current Behavior:**
- ✅ Accepts "Submitted" as a valid status
- ✅ Updates status directly without validation
- ✅ Returns success response with updated status

**Request:**
```json
POST /api/material-requests/:title/update-status
{
  "status": "Submitted"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Material Request status updated successfully",
  "data": {
    "title": "MR-123459",
    "status": "Submitted"
  }
}
```

### ⚠️ Potential Issue: Auto-Status Change Logic

The backend has **automatic status change logic** in `getMaterialRequests` and `getMaterialRequestByTitle` that might interfere:

**In `getMaterialRequests` (line 192-193):**
```javascript
} else if (someItemsPicked && status === 'Submitted') {
  status = 'In Progress';
  // Automatically changes to "In Progress" if any items are picked
}
```

**In `getMaterialRequestByTitle` (line 411-412):**
```javascript
} else if (someItemsPicked && status === 'Submitted') {
  status = 'In Progress';
  // Automatically changes to "In Progress" if any items are picked
}
```

**In `pickMaterialRequestItems` (line 1281-1292):**
```javascript
if (materialRequest.status === 'Submitted' && newTotalPicked === 0) {
  newStatus = materialRequest.status === 'Submitted' ? 'Submitted' : 'In Progress';
  // Keeps as "Submitted" if no items picked yet
} else if (materialRequest.status === 'Submitted' && newTotalPicked > 0) {
  newStatus = 'In Progress';
  // Changes to "In Progress" when items start being picked
}
```

## Analysis

### ✅ What Works

1. **Status Update Endpoint**: Correctly accepts and sets "Submitted" status
2. **Initial Submit**: Status will be set to "Submitted" when called
3. **No Items Picked**: Status remains "Submitted" if no items have been picked

### ⚠️ What Might Cause Issues

1. **Auto-Status Change on GET**: When fetching Material Request details, if any items have `picked_qty > 0`, the status automatically changes from "Submitted" to "In Progress"
2. **Auto-Status Change on Pick**: When items are picked, status automatically changes from "Submitted" to "In Progress"

## Recommendation

### Option 1: Keep Current Behavior (Recommended)

**Current behavior is correct for workflow:**
- "Submitted" = Material Request is submitted, ready for picking (no items picked yet)
- "In Progress" = Picking has started (some items have been picked)
- "Picked" = All items fully picked and all TCs sealed

**This matches the expected workflow:**
1. User clicks "Submit" → Status = "Submitted" ✅
2. User starts picking → Status = "In Progress" ✅
3. All items picked + TCs sealed → Status = "Picked" ✅

### Option 2: Prevent Auto-Status Change (If Needed)

If you want "Submitted" to remain even after items are picked, you would need to modify the auto-status change logic. However, this is **NOT recommended** as it breaks the workflow logic.

## Backend Changes Required

### ✅ No Changes Needed

The backend is working correctly. The auto-status change logic is **intentional** and follows the correct workflow:

1. **"Submitted"** → Material Request is submitted, waiting for picking to start
2. **"In Progress"** → Picking has started (at least one item has been picked)
3. **"Picked"** → All items fully picked and all transfer cartons sealed

### Expected Behavior

**When user clicks "Submit":**
1. ✅ Transfer Carton is created
2. ✅ Status is set to "Submitted" via `updateMaterialRequestStatus`
3. ✅ Status remains "Submitted" until picking starts
4. ✅ When first item is picked, status automatically changes to "In Progress"

**This is the correct behavior!**

## Mobile App Behavior

The mobile app should:
1. ✅ Call `POST /api/material-requests/:title/update-status` with `status: "Submitted"`
2. ✅ Update local state to `status: "Submitted"`
3. ✅ Disable Submit button when `status === "Submitted"`
4. ✅ Accept that status will change to "In Progress" when picking starts (this is correct!)

## Summary

**✅ No backend changes required.**

The backend correctly:
- Accepts "Submitted" status
- Updates status to "Submitted"
- Automatically changes to "In Progress" when picking starts (this is correct workflow behavior)
- Preserves "Submitted" status until picking begins

The auto-status change from "Submitted" to "In Progress" is **intentional and correct** - it indicates that picking has started.

---

**Status:** ✅ **NO CHANGES REQUIRED**  
**Date:** 2026-01-12
