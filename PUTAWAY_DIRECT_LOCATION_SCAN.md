# Putaway Direct Location Scan - Simplified Workflow

## 🎯 Overview

When a user double-taps on a Putaway Task, they should be able to **directly scan the location** without needing to scan items or cartons again. The putaway task already contains all the items, so the workflow should be simplified.

---

## ✅ Current API Support

The API **already supports** this simplified workflow! When you call the endpoint with only `putaway_task` and `location_id` (no `tc_id` or `box_id`), it automatically assigns the location to **all items** in that putaway task.

---

## 📡 API Endpoint

### POST /api/putaway/scan-transfer-carton

**Simplified Request (Direct Location Assignment):**

```json
{
  "putaway_task": "PUT-20260106-0005",
  "location_id": "A1-R01-L1-B1",
  "user_id": "USER-001"
}
```

**Or using rack+bin (backward compatibility):**

```json
{
  "putaway_task": "PUT-20260106-0005",
  "rack": "A1-R01-L1",
  "bin": "B1",
  "user_id": "USER-001"
}
```

**What Happens:**
1. ✅ Finds the putaway task
2. ✅ Gets all items from `tabPutawayLine` for that task
3. ✅ Updates **all lines** with the scanned location
4. ✅ Updates task status to "In Progress"
5. ✅ Returns success with all updated items

**Response:**
```json
{
  "ok": true,
  "message": "Putaway task updated and items assigned successfully",
  "data": {
    "putaway_task": "PUT-20260106-0005",
    "status": "In Progress",
    "stock_updated": false,
    "rack": "A1-R01-L1",
    "bin": "B1",
    "location_id": "A1-R01-L1-B1",
    "items_count": 3,
    "items": [
      {
        "item_code": "SKU-JACKET-201-BLK-L",
        "carton_id": null,
        "qty": 2.00,
        "rack": "A1-R01-L1",
        "bin": "B1",
        "location_id": "A1-R01-L1-B1"
      },
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "carton_id": null,
        "qty": 5.00,
        "rack": "A1-R01-L1",
        "bin": "B1",
        "location_id": "A1-R01-L1-B1"
      }
    ]
  }
}
```

---

## 📱 Mobile App Workflow

### Current Flow (❌ Too Many Steps):
1. User double-taps Putaway Task
2. **System asks to scan item/carton** ❌
3. User scans item/carton
4. System asks to scan location
5. User scans location
6. Location assigned

### Simplified Flow (✅ Recommended):
1. User double-taps Putaway Task
2. **System shows task details with items** ✅
3. **System asks to scan location directly** ✅
4. User scans location barcode
5. **All items in task get the location assigned** ✅
6. User can complete putaway

---

## 🔧 Mobile App Implementation

### Step 1: When User Double-Taps Putaway Task

**Show Task Details Screen:**
- Display putaway task title
- List all items in the task (from `GET /api/putaway/tasks` response)
- Show current location (if any) or "TBD"
- **Show "Scan Location" button** (not "Scan Item")

### Step 2: User Scans Location

**Call API:**
```javascript
// When location barcode is scanned
const response = await fetch('/api/putaway/scan-transfer-carton', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    putaway_task: selectedTask.title,  // From double-tap
    location_id: scannedLocationId,     // From barcode scanner
    user_id: currentUserId
  })
});
```

### Step 3: Show Success

**Display:**
- ✅ "Location assigned to all items"
- Show updated items with location
- Show "Complete Putaway" button

### Step 4: Complete Putaway

**Call API:**
```javascript
const response = await fetch('/api/putaway/complete', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    putaway_task: selectedTask.title,
    performed_by: currentUserId
  })
});
```

---

## 🎨 UI/UX Recommendations

### Screen 1: Putaway Task List
- Show list of tasks (already implemented)
- User double-taps a task

### Screen 2: Putaway Task Details (NEW)
**Layout:**
```
┌─────────────────────────────────┐
│  Putaway Task: PUT-20260106-0005│
│  Transfer In: INSLIP-123466     │
│                                  │
│  Items in this task:            │
│  • SKU-JACKET-201-BLK-L (2.00)  │
│  • SKU-HAT-301-BLU-OS (5.00)    │
│                                  │
│  Current Location: TBD           │
│                                  │
│  [Scan Location] ← Button       │
│                                  │
│  [Complete Putaway]              │
└─────────────────────────────────┘
```

**When "Scan Location" is tapped:**
- Enable barcode scanner
- Wait for location barcode scan
- Call API with `putaway_task` + `location_id`
- Show success message
- Update UI to show assigned location

---

## 🔄 Alternative: Single-Step Flow

**Even Simpler:** Skip the details screen entirely!

1. User double-taps Putaway Task
2. **Immediately enable location scanner** (no intermediate screen)
3. User scans location barcode
4. API call happens automatically
5. Show success message
6. Return to task list (or show "Complete Putaway" button)

---

## ✅ Benefits

1. **Faster Workflow:** One scan instead of two (item + location)
2. **Less Error-Prone:** No need to match items to locations manually
3. **Better UX:** Simpler, more intuitive flow
4. **Bulk Assignment:** All items in task get location at once

---

## 📝 API Behavior

### When `putaway_task` is provided without `tc_id` or `box_id`:

**Code Logic:**
```javascript
// In scanTransferCarton function
if (putaway_task && !tc_id && !box_id) {
  // Direct location assignment to all items in task
  return await updatePutawayTaskLocation(
    req, res, putaway_task, location_id, user_id
  );
}
```

**What `updatePutawayTaskLocation` does:**
1. Verifies putaway task exists
2. Gets all lines from `tabPutawayLine` for that task
3. Updates **all lines** with the scanned location
4. Updates task status to "In Progress"
5. Returns success with all updated items

---

## 🧪 Testing

### Test Case 1: Direct Location Assignment

**Steps:**
1. Create a putaway task with multiple items
2. Call API with only `putaway_task` and `location_id`
3. Verify all items get the location assigned

**Expected:**
- All items in `tabPutawayLine` have `rack`, `bin`, and `location_id` updated
- Task status changes to "In Progress"
- Response shows all updated items

### Test Case 2: Complete Putaway

**Steps:**
1. Assign location to putaway task (from Test Case 1)
2. Call `POST /api/putaway/complete`
3. Verify stock ledger is updated

**Expected:**
- Stock ledger shows items at the assigned location
- Task status changes to "Completed"

---

## 📋 Summary

**API:** ✅ Already supports direct location assignment  
**Mobile App:** 🔄 Needs to be updated to use simplified workflow

**Key Change:**
- Instead of: Scan Item → Scan Location
- Use: Double-tap Task → Scan Location (assigns to all items)

---

**Status:** ✅ API Ready  
**Date:** 2026-01-06  
**Requires:** Mobile app UI update

