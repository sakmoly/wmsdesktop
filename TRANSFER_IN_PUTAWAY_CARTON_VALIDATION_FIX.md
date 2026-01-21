# Transfer In Putaway Carton Validation Fix

**Date**: 2026-01-20  
**Issue**: During Transfer In putaway, carton validation is not accepting any carton. Mobile app shows "Carton Not Found" error.

---

## Problem

When performing putaway for Transfer In:
1. ✅ Transfer In creates putaway task with `carton_id` in putaway lines (e.g., `CTN-555444`)
2. ✅ Putaway task is created successfully: `PUT-20260120-0001`
3. ❌ Mobile app sends `tc_id` = "TI-PUT-20260120-0001" (putaway task title) or `carton_id` = "CTN-555444"
4. ❌ Backend validates `tc_id` against `tabTransferCarton` table (ASN putaway validation)
5. ❌ Validation fails because Transfer In cartons are NOT in `tabTransferCarton` (they're in putaway lines)

**Root Cause:**
- `scanTransferCarton` endpoint was only validating against `tabTransferCarton` (for ASN putaway)
- Transfer In putaway uses `carton_id` from `tabPutawayLine`, not `tabTransferCarton`
- The validation logic didn't differentiate between ASN and Transfer In putaway types

---

## Solution

**Best Approach**: Accept Transfer In carton without validating against `tabTransferCarton`. Validate against putaway lines instead.

**Rationale:**
- Transfer In putaway lines already have `carton_id` populated during task creation
- No need to create cartons in `tabTransferCarton` for Transfer In
- Validation should check if carton exists in putaway lines for the task
- This is simpler and doesn't require creating additional records

---

## Fix Applied

**File**: `wms-api/src/modules/putaway/putawayController.js`

### Fix 1: Accept `putaway_task` and `carton_id` Parameters

**Change**: Added support for `putaway_task` and `carton_id` parameters in request body:

```javascript
const { tc_id, box_id, location_id, user_id, putaway_task, carton_id } = req.body;

// Prefer carton_id if provided, fallback to tc_id
const actualCartonId = carton_id || tc_id;

// Check if tc_id is a putaway task title (PUT- or TI-PUT-)
const actualPutawayTask = putaway_task || 
  (tc_id && (tc_id.startsWith('PUT-') || tc_id.startsWith('TI-PUT-')) ? tc_id : null);
```

### Fix 2: Determine Putaway Type from Task

**Change**: If `putaway_task` is provided (or `tc_id` is a task title), find the task and check if it's Transfer In:

```javascript
if (taskTitleToCheck) {
  // Find the putaway task
  const [taskRows] = await connection.execute(
    `SELECT title, source_type, transfer_in 
     FROM tabPutawayTask 
     WHERE title = ?`,
    [taskTitleToCheck]
  );
  
  if (taskRows.length > 0) {
    const task = taskRows[0];
    const isTransferInTask = task.source_type === 'TransferIn' || task.transfer_in;
    
    if (isTransferInTask) {
      // Transfer In putaway - validate carton_id from putaway lines
      if (actualCartonId && !isPutawayTaskTitle) {
        // Validate carton_id exists in putaway lines for this task
        const [lineRows] = await connection.execute(
          `SELECT carton_id FROM tabPutawayLine 
           WHERE parent_title = ? AND carton_id = ?`,
          [taskTitleToCheck, actualCartonId]
        );
        
        if (lineRows.length === 0) {
          return error: "Carton not found in putaway task";
        }
      }
      // Validation passed - skip tabTransferCarton check
      isAsnPutaway = false;
    } else {
      // ASN putaway - validate against tabTransferCarton
      isAsnPutaway = true;
    }
  }
}
```

### Fix 3: Fallback Validation for Carton ID

**Change**: If `tc_id` is not a task title and not found in `tabTransferCarton`, check if it exists in putaway lines (Transfer In scenario):

```javascript
// Not found in tabTransferCarton - check putaway lines
const [putawayLineRows] = await connection.execute(
  `SELECT DISTINCT pl.parent_title, pt.source_type, pt.transfer_in
   FROM tabPutawayLine pl
   LEFT JOIN tabPutawayTask pt ON pl.parent_title = pt.title
   WHERE pl.carton_id = ?`,
  [actualCartonId]
);

if (putawayLineRows.length > 0) {
  const line = putawayLineRows[0];
  const isTransferInTask = line.source_type === 'TransferIn' || line.transfer_in;
  
  if (isTransferInTask) {
    // Transfer In putaway - carton_id is valid
    isAsnPutaway = false;
    validatedCartonId = actualCartonId;
  } else {
    // ASN putaway - should be in tabTransferCarton
    return error: "Carton not found in tabTransferCarton";
  }
}
```

---

## Expected Flow After Fix

### Scenario 1: Mobile App Sends Putaway Task Title as `tc_id`

**Request:**
```json
POST /api/putaway/scan-transfer-carton
{
  "tc_id": "TI-PUT-20260120-0001",
  "location_id": "A1-R02-L1-B2"
}
```

**Backend Processing:**
1. ✅ Recognizes `tc_id` is a putaway task title (starts with "TI-PUT-")
2. ✅ Finds putaway task: `PUT-20260120-0001`
3. ✅ Checks `source_type = 'TransferIn'` → Transfer In putaway
4. ✅ **Skips `tabTransferCarton` validation** (Transfer In doesn't use it)
5. ✅ Returns success (carton_id will be validated in `completePutaway`)

**Response:**
```json
{
  "ok": true,
  "message": "Validation successful",
  "validated": {
    "carton_id": null,
    "putaway_task": "TI-PUT-20260120-0001",
    "location_id": "A1-R02-L1-B2",
    "putaway_type": "TRANSFER_IN"
  },
  "ready_for_completion": true
}
```

### Scenario 2: Mobile App Sends Carton ID

**Request:**
```json
POST /api/putaway/scan-transfer-carton
{
  "tc_id": "CTN-555444",
  "putaway_task": "TI-PUT-20260120-0001",
  "location_id": "A1-R02-L1-B2"
}
```

**Backend Processing:**
1. ✅ Finds putaway task: `PUT-20260120-0001`
2. ✅ Checks `source_type = 'TransferIn'` → Transfer In putaway
3. ✅ Validates `carton_id = 'CTN-555444'` exists in putaway lines for this task
4. ✅ Returns success

**Response:**
```json
{
  "ok": true,
  "message": "Validation successful",
  "validated": {
    "carton_id": "CTN-555444",
    "putaway_task": "TI-PUT-20260120-0001",
    "location_id": "A1-R02-L1-B2",
    "putaway_type": "TRANSFER_IN"
  },
  "ready_for_completion": true
}
```

### Scenario 3: ASN Putaway (Unchanged)

**Request:**
```json
POST /api/putaway/scan-transfer-carton
{
  "tc_id": "PAW-ASN365425473-1768828214946",
  "box_id": "PAW-ASN365425473-1768828214946",
  "location_id": "A1-R02-L1-B2"
}
```

**Backend Processing:**
1. ✅ Validates `tc_id` exists in `tabTransferCarton` (ASN putaway)
2. ✅ Validates `box_id` exists in `tabSortBox` (ASN putaway)
3. ✅ Returns success

---

## Validation Logic Summary

### For ASN Putaway:
- ✅ `tc_id` must exist in `tabTransferCarton`
- ✅ `box_id` must exist in `tabSortBox` (if provided)

### For Transfer In Putaway:
- ✅ `putaway_task` must exist in `tabPutawayTask` with `source_type = 'TransferIn'`
- ✅ `carton_id` must exist in `tabPutawayLine` for the putaway task (if provided)
- ❌ **NO validation against `tabTransferCarton`** (Transfer In doesn't use it)

---

## Mobile App Changes Required

The mobile app should:

1. **For Transfer In Putaway:**
   - Send `putaway_task` = "TI-PUT-20260120-0001" (putaway task title)
   - Optionally send `carton_id` = "CTN-555444" (if available)
   - **Do NOT send `tc_id`** (or send it as the putaway task title)

2. **For ASN Putaway:**
   - Send `tc_id` = "PAW-ASN365425473-1768828214946" (transfer carton ID)
   - Send `box_id` = "PAW-ASN365425473-1768828214946" (box ID)
   - **Do NOT send `putaway_task`**

---

## Testing

### Test 1: Transfer In Putaway with Task Title

**Request:**
```bash
POST /api/putaway/scan-transfer-carton
{
  "tc_id": "TI-PUT-20260120-0001",
  "location_id": "A1-R02-L1-B2"
}
```

**Expected**: ✅ Success (no "Carton Not Found" error)

---

### Test 2: Transfer In Putaway with Carton ID

**Request:**
```bash
POST /api/putaway/scan-transfer-carton
{
  "putaway_task": "TI-PUT-20260120-0001",
  "carton_id": "CTN-555444",
  "location_id": "A1-R02-L1-B2"
}
```

**Expected**: ✅ Success (carton validated in putaway lines)

---

### Test 3: ASN Putaway (Should Still Work)

**Request:**
```bash
POST /api/putaway/scan-transfer-carton
{
  "tc_id": "PAW-ASN365425473-1768828214946",
  "box_id": "PAW-ASN365425473-1768828214946",
  "location_id": "A1-R02-L1-B2"
}
```

**Expected**: ✅ Success (validated against `tabTransferCarton`)

---

## Status

✅ **Fixes Applied**

1. ✅ Added support for `putaway_task` and `carton_id` parameters
2. ✅ Detect if `tc_id` is a putaway task title (PUT- or TI-PUT-)
3. ✅ Determine putaway type (ASN vs Transfer In) from task
4. ✅ Skip `tabTransferCarton` validation for Transfer In putaway
5. ✅ Validate `carton_id` against putaway lines for Transfer In putaway
6. ✅ Maintain backward compatibility with ASN putaway

**Next Steps**:
1. Restart backend server
2. Test Transfer In putaway scan
3. Verify no "Carton Not Found" error
4. Update mobile app to send `putaway_task` for Transfer In putaway (optional)

---

## Notes

- **No database changes required** - uses existing `tabPutawayTask` and `tabPutawayLine` tables
- **No carton creation needed** - Transfer In cartons are already in putaway lines
- **Backward compatible** - ASN putaway validation remains unchanged
- **Simple solution** - validates against existing data, no additional complexity
