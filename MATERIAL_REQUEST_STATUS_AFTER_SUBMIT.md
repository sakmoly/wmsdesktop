# Material Request Status After Submission

## Current Status Flow

### 1. **Immediately After Submission**
When `POST /api/material-requests/:title/update-status` is called with `status: "Submitted"`:

```javascript
// Line 674: Direct status update
await connection.execute(updateQuery, params);
// Status is set to "Submitted" in database
```

**Result:** Status = **"Submitted"** ✅

---

### 2. **After Submission (No Items Picked Yet)**
When Material Request is fetched via `GET /api/material-requests/:title`:

```javascript
// Lines 411-412: Auto-status change logic
} else if (someItemsPicked && status === 'Submitted') {
  status = 'In Progress';
  // Only changes if items are picked
}
```

**If no items picked (`picked_qty = 0` for all items):**
- Status remains **"Submitted"** ✅
- No automatic change occurs

**Result:** Status = **"Submitted"** (preserved)

---

### 3. **After Submission (When Items Start Being Picked)**
When `POST /api/material-requests/:title/pick-items` is called:

```javascript
// Lines 1291-1292: Auto-status change when picking starts
else if (materialRequest.status === 'Submitted' && newTotalPicked > 0) {
  newStatus = 'In Progress';
  await connection.execute(`
    UPDATE tabMaterialRequest
    SET status = ?,
        updated_at = NOW()
    WHERE title = ?
  `, [newStatus, title]);
}
```

**If items are picked (`picked_qty > 0`):**
- Status automatically changes from **"Submitted"** → **"In Progress"** ✅
- This happens automatically when first item is picked

**Result:** Status = **"In Progress"** (automatic transition)

---

### 4. **When Fetching Material Request (Auto-Correction)**
When fetching via `GET /api/material-requests/:title` or `GET /api/material-requests`:

```javascript
// Lines 411-412: Auto-correction if status is "Submitted" but items are picked
} else if (someItemsPicked && status === 'Submitted') {
  status = 'In Progress';
  await connection.execute(`
    UPDATE tabMaterialRequest
    SET status = ?,
        updated_at = NOW()
    WHERE title = ?
  `, [status, title]);
  console.log(`✅ Material Request ${title} status updated to "In Progress" (picking started)`);
}
```

**If status is "Submitted" but items have been picked:**
- Status is automatically corrected to **"In Progress"** ✅
- This ensures data consistency

**Result:** Status = **"In Progress"** (auto-corrected)

---

## Status Transition Summary

```
┌─────────────┐
│   Draft     │
└──────┬──────┘
       │
       │ User clicks "Submit"
       ▼
┌─────────────┐
│  Submitted  │ ← Status after submission (if no items picked)
└──────┬──────┘
       │
       │ First item is picked
       ▼
┌─────────────┐
│ In Progress │ ← Status when picking starts
└──────┬──────┘
       │
       │ All items picked + All TCs sealed
       ▼
┌─────────────┐
│   Picked    │
└─────────────┘
```

---

## Answer to Your Question

### **What is the current status of Material Request after submitted?**

**Immediately after submission:**
- Status = **"Submitted"** ✅

**After submission (if no items picked):**
- Status = **"Submitted"** ✅ (remains unchanged)

**After submission (if items are picked):**
- Status = **"In Progress"** ✅ (automatically changed)

**When fetching Material Request:**
- If status is "Submitted" but items are picked → Auto-corrected to **"In Progress"** ✅

---

## Key Points

1. ✅ **Status is set to "Submitted"** when `updateMaterialRequestStatus` is called
2. ✅ **Status remains "Submitted"** until picking starts (no items picked)
3. ✅ **Status automatically changes to "In Progress"** when first item is picked
4. ✅ **Auto-correction logic** ensures status consistency when fetching Material Request

---

## Code References

- **Status Update:** `wms-api/src/modules/material-request/materialRequestController.js` (Line 586-698)
- **Auto-Status Change on Pick:** Line 1291-1292
- **Auto-Status Change on GET:** Line 411-412
- **Status Validation:** Line 605 (valid statuses include "Submitted")

---

**Status:** ✅ **Current implementation is correct**  
**Date:** 2026-01-12
