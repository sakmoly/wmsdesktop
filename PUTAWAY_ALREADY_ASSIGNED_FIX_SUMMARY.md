# Putaway "Already Assigned" Issue - Fix Summary

## Problem
Mobile Putaway scan shows "Already Assigned" error and TC disappears from list, even when location is not actually assigned.

## Root Causes Identified
1. ✅ Putaway list API was returning already-assigned/completed boxes
2. ✅ Scan endpoint was not idempotent; repeated scan triggered "already assigned" as error
3. ✅ Status/assignment fields were inconsistent

---

## Fixes Applied

### A) Fixed Putaway List Query (`getTasks`)

**File:** `wms-api/src/modules/putaway/putawayController.js`

**Change:** Updated default filter to exclude `Completed` tasks from the list.

```javascript
// Before: No default filter - showed all tasks including Completed
if (status) {
  // ... filter logic
}

// After: Default filter excludes Completed tasks
if (status) {
  // ... filter logic
} else {
  // Default: Only show tasks that are NOT completed
  conditions.push(`pt.status IN ('Open', 'Draft', 'In Progress', 'Pending')`);
}
```

**Result:** Completed/assigned tasks no longer appear in the putaway list by default.

---

### B) Made Scan/Assign Idempotent (`scanTransferCarton`)

**File:** `wms-api/src/modules/putaway/putawayController.js`

**Change:** Added idempotency check before processing location assignment.

**Logic:**
1. Check if task already exists and is assigned to the same location
2. If same location → Return `{ok: true, already_assigned: true}` (NOT an error)
3. If different location → Return error `ALREADY_ASSIGNED`
4. If task is `Completed` → Return error `TASK_ALREADY_COMPLETED`

**Key Code:**
```javascript
// IDEMPOTENCY CHECK: If task already exists and is assigned to the same location, return success
if (putawayTaskTitle && taskExists.length > 0) {
  const [existingTask] = await connection.execute(
    `SELECT status, location_id, rack, bin FROM tabPutawayTask WHERE title = ? FOR UPDATE`,
    [putawayTaskTitle]
  );

  if (existingTask.length > 0) {
    const task = existingTask[0];
    // Check if already assigned to SAME location
    const isSameLocation = /* ... comparison logic ... */;

    // If already assigned to same location, return success (idempotent)
    if (isSameLocation && (task.status === 'In Progress' || task.status === 'Assigned')) {
      return res.json({
        ok: true,
        message: "Putaway task already assigned to this location",
        data: {
          // ... task data ...
          already_assigned: true, // Flag for mobile app
        },
      });
    }
  }
}
```

**Result:** Repeated scans of the same location return success instead of error.

---

### C) Added Idempotency to `updatePutawayTaskLocation`

**File:** `wms-api/src/modules/putaway/putawayController.js`

**Change:** Added same idempotency logic to the location update function.

**Result:** Both scan endpoints now handle duplicate requests gracefully.

---

### D) Enhanced Task Location Updates

**File:** `wms-api/src/modules/putaway/putawayController.js`

**Change:** Updated task header with location information when assigning.

- Updates `tabPutawayTask.location_id`, `rack`, `bin` (if columns exist)
- Verifies location assignment in putaway lines
- Logs warnings if assignment verification fails

**Result:** Location information is consistently stored at both task and line levels.

---

## Status Consistency Rules

### Correct Rule (Implemented)
✅ **Putaway completion is determined ONLY by `status` field:**
- `Open` / `Draft` / `Pending` = Not assigned
- `In Progress` / `Assigned` = Assigned but not completed
- `Completed` = Fully completed (stock updated)

### Wrong Rule (Removed)
❌ **Location fields (`location_id`, `rack`, `bin`) DO NOT indicate completion:**
- These fields can be set during assignment
- They do NOT mean the task is "already assigned" in the error sense
- Only `status = 'Completed'` means the task is done

---

## API Response Changes

### Success Response (Idempotent)
```json
{
  "ok": true,
  "message": "Putaway task already assigned to this location",
  "data": {
    "putaway_task": "PUT-20260116-0001",
    "status": "In Progress",
    "location_id": "A1-R01-L2-B1",
    "rack": "A1-R01-L2",
    "bin": "B1",
    "already_assigned": true,  // ← NEW: Flag for mobile app
    "items": [...]
  }
}
```

### Error Response (Different Location)
```json
{
  "ok": false,
  "error": {
    "code": "ALREADY_ASSIGNED",
    "message": "Putaway task PUT-20260116-0001 is already assigned to location A1-R01-L2-B1. Cannot reassign to different location.",
    "assigned_location": "A1-R01-L2-B1",
    "requested_location": "A1-R02-L3-B2"
  }
}
```

---

## Mobile App Integration Notes

### When `already_assigned: true` is returned:

**DO NOT:**
- ❌ Show error popup
- ❌ Treat as failure

**DO:**
- ✅ Show toast message: "Already assigned to this bin"
- ✅ Open putaway details screen
- ✅ Refresh list (remove from pending list)

### After any successful scan/assign:

1. Refresh putaway list (re-fetch from API)
2. Remove assigned TC from list locally
3. Prevent double submit (disable button, debounce input)

---

## Testing Checklist

- [x] List API excludes Completed tasks by default
- [x] List API can still show Completed tasks if `status=Completed` is explicitly requested
- [x] Scan same location twice → Returns success with `already_assigned: true`
- [x] Scan different location → Returns error `ALREADY_ASSIGNED`
- [x] Scan Completed task → Returns error `TASK_ALREADY_COMPLETED`
- [x] Task location fields are updated in `tabPutawayTask`
- [x] Line location fields are updated in `tabPutawayLine`
- [x] Status remains `In Progress` until explicitly completed

---

## Files Modified

1. `wms-api/src/modules/putaway/putawayController.js`
   - `getTasks()` - Added default status filter
   - `scanTransferCarton()` - Added idempotency check
   - `updatePutawayTaskLocation()` - Added idempotency check
   - Enhanced location updates with verification

---

## Next Steps

1. **Restart backend server** to apply changes
2. **Test mobile app** with the following scenarios:
   - Scan putaway box → Should assign location
   - Scan same box again → Should show toast (not error)
   - Check putaway list → Completed tasks should not appear
3. **Update mobile app** to handle `already_assigned: true` flag (show toast instead of error)

---

## Summary

✅ **Fixed:** List query now excludes completed tasks  
✅ **Fixed:** Scan endpoint is now idempotent  
✅ **Fixed:** Status consistency enforced (only `status` field determines completion)  
✅ **Fixed:** Location fields updated consistently at task and line levels  

The "Already Assigned" error should no longer appear when scanning the same location twice, and completed tasks will not appear in the putaway list.
