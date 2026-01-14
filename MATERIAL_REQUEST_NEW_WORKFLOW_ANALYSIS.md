# Material Request New Workflow - Backend Analysis & Required Changes

## New Workflow Requirements

### Workflow Steps:
1. **Start Picking Button** → Updates status to "In Progress"
2. **Button renamed to "In Picking" or "Picking Progress"** (when status is "In Progress")
3. **After complete picking** → Button renamed to "Complete Picking"
4. **Click Complete Picking** → Backend status changes to "Picked" (only if all items fully picked)
5. **If status is "Picked"** → Button renamed to "Create Transfer Carton"
6. **Click Create Transfer Carton** → Create TC (show TC ID)
7. **Rename button to "Seal Transfer Carton"**
8. **Click Seal Transfer Carton** → Update backend to seal TC

### Multiple Users Picking:
- Need to ensure concurrent picking is safe
- Multiple users can pick items simultaneously
- Need to track which user picked which items

---

## Current Backend Implementation Analysis

### ✅ Existing Endpoints:

1. **`POST /api/material-requests/:title/update-status`**
   - ✅ Can update status to "In Progress" or "Picked"
   - ✅ Already exists and works

2. **`POST /api/material-requests/:title/pick-items`**
   - ✅ Handles picking items
   - ⚠️ **ISSUE:** Automatically changes status from "Submitted" to "In Progress" (line 1291-1292)
   - ⚠️ **ISSUE:** Automatically changes status to "Picked" when all items picked (line 1331-1339)

3. **`POST /api/transfer-cartons/create`**
   - ✅ Creates transfer carton
   - ✅ Returns TC ID

4. **`POST /api/transfer-cartons/seal`**
   - ✅ Seals transfer carton
   - ✅ Updates Material Request status if needed

5. **`GET /api/material-requests/:title`**
   - ✅ Returns Material Request details
   - ⚠️ **ISSUE:** Auto-corrects status if "Submitted" but items are picked (line 411-412)

---

## Required Backend Changes

### 🔴 CRITICAL CHANGES:

### 1. **Remove Auto-Status Change in `pickMaterialRequestItems`**

**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**Current Behavior (Lines 1291-1339):**
- Automatically changes "Submitted" → "In Progress" when picking starts
- Automatically changes to "Picked" when all items are picked

**Required Change:**
- **Remove** automatic status change from "Submitted" to "In Progress"
- **Remove** automatic status change to "Picked"
- **Keep** status as-is (only manual updates via `update-status` endpoint)

**Code to Modify:**
```javascript
// REMOVE or COMMENT OUT these sections:
// Lines 1290-1300: Auto-change to "In Progress"
// Lines 1330-1352: Auto-change to "Picked"
```

---

### 2. **Remove Auto-Status Correction in `getMaterialRequestByTitle`**

**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**Current Behavior (Lines 411-412):**
- Auto-corrects status if "Submitted" but items are picked

**Required Change:**
- **Remove** auto-correction logic
- **Keep** status as stored in database (only manual updates)

**Code to Modify:**
```javascript
// REMOVE or COMMENT OUT:
// Lines 411-419: Auto-correction from "Submitted" to "In Progress"
```

---

### 3. **Remove Auto-Status Correction in `getMaterialRequests`**

**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**Current Behavior (Lines 192-193):**
- Auto-corrects status if "Submitted" but items are picked

**Required Change:**
- **Remove** auto-correction logic

**Code to Modify:**
```javascript
// REMOVE or COMMENT OUT:
// Lines 192-200: Auto-correction from "Submitted" to "In Progress"
```

---

### 4. **Add Validation to `updateMaterialRequestStatus` for "Picked" Status**

**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**Current Behavior:**
- Allows setting status to "Picked" without validation

**Required Change:**
- **Add validation:** Only allow status change to "Picked" if ALL items are fully picked
- Return error if trying to set "Picked" but items are not fully picked

**New Code to Add:**
```javascript
// After line 630, before line 632:
// If status is "Picked", validate that all items are fully picked
if (status === 'Picked') {
  const [itemRows] = await connection.execute(
    `SELECT 
      item_code,
      requested_qty,
      COALESCE(picked_qty, 0) as picked_qty
    FROM tabMaterialRequestItem
    WHERE parent_title = ?`,
    [title]
  );
  
  const allItemsFullyPicked = itemRows.every(item => 
    item.picked_qty >= item.requested_qty
  );
  
  if (!allItemsFullyPicked) {
    const pendingItems = itemRows.filter(item => 
      item.picked_qty < item.requested_qty
    );
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Cannot set status to "Picked". Not all items are fully picked.',
        details: {
          pending_items: pendingItems.map(item => ({
            item_code: item.item_code,
            requested_qty: item.requested_qty,
            picked_qty: item.picked_qty,
            remaining_qty: item.requested_qty - item.picked_qty
          }))
        }
      }
    });
  }
}
```

---

### 5. **Add Validation to `updateMaterialRequestStatus` for "In Progress" Status**

**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**Current Behavior:**
- Allows setting status to "In Progress" without validation

**Required Change:**
- **Add validation:** Only allow status change to "In Progress" from "Submitted" or "Draft"
- Prevent changing from "Picked" back to "In Progress" (unless items are unpicked)

**New Code to Add:**
```javascript
// After line 630, before status validation:
// Get current status
const [currentStatusRows] = await connection.execute(
  'SELECT status FROM tabMaterialRequest WHERE title = ?',
  [title]
);

if (currentStatusRows.length > 0) {
  const currentStatus = currentStatusRows[0].status;
  
  // Prevent invalid status transitions
  if (status === 'In Progress' && currentStatus === 'Picked') {
    // Check if items are still fully picked
    const [itemRows] = await connection.execute(
      `SELECT 
        item_code,
        requested_qty,
        COALESCE(picked_qty, 0) as picked_qty
      FROM tabMaterialRequestItem
      WHERE parent_title = ?`,
      [title]
    );
    
    const allItemsFullyPicked = itemRows.every(item => 
      item.picked_qty >= item.requested_qty
    );
    
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
}
```

---

### 6. **Ensure Multiple Users Can Pick Safely**

**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**Current Behavior:**
- Uses `picked_qty = picked_qty + pickedQty` (incremental)
- Should be safe for concurrent picking

**Required Change:**
- **Verify** that `pickMaterialRequestItems` uses incremental updates (already does)
- **Add** user tracking if needed (optional, for audit trail)
- **Ensure** database transactions are properly handled

**Current Code (Already Safe):**
```javascript
// Line ~1100-1200: Already uses incremental updates
UPDATE tabMaterialRequestItem 
SET picked_qty = picked_qty + ?, 
    scan_qty = picked_qty + ?
WHERE parent_title = ? AND item_code = ?
```

**Status:** ✅ **Already safe for concurrent picking**

---

### 7. **Add Endpoint to Check if Picking is Complete**

**New Endpoint:** `GET /api/material-requests/:title/picking-status`

**Purpose:** Check if all items are fully picked (for mobile app to show "Complete Picking" button)

**Implementation:**
```javascript
export const getPickingStatus = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    
    const [itemRows] = await connection.execute(
      `SELECT 
        item_code,
        requested_qty,
        COALESCE(picked_qty, 0) as picked_qty,
        (requested_qty - COALESCE(picked_qty, 0)) as remaining_qty
      FROM tabMaterialRequestItem
      WHERE parent_title = ?
      ORDER BY item_code`,
      [title]
    );
    
    const totalItems = itemRows.length;
    const fullyPickedItems = itemRows.filter(item => 
      item.picked_qty >= item.requested_qty
    ).length;
    const allItemsFullyPicked = fullyPickedItems === totalItems && totalItems > 0;
    
    const pendingItems = itemRows.filter(item => 
      item.picked_qty < item.requested_qty
    );
    
    res.json({
      ok: true,
      data: {
        title: title,
        total_items: totalItems,
        fully_picked_items: fullyPickedItems,
        all_items_fully_picked: allItemsFullyPicked,
        pending_items: pendingItems.map(item => ({
          item_code: item.item_code,
          requested_qty: item.requested_qty,
          picked_qty: item.picked_qty,
          remaining_qty: item.remaining_qty
        }))
      }
    });
  } catch (error) {
    console.error('Failed to get picking status:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to get picking status',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};
```

**Route:** Add to `wms-api/src/routes/materialRequestRoutes.js`:
```javascript
router.get('/:title/picking-status', authenticateToken, getPickingStatus);
```

---

## Summary of Changes

### ✅ No Changes Needed:
1. ✅ `POST /api/transfer-cartons/create` - Already works
2. ✅ `POST /api/transfer-cartons/seal` - Already works
3. ✅ `POST /api/material-requests/:title/pick-items` - Already safe for concurrent picking

### 🔴 Changes Required:

1. **Remove auto-status change in `pickMaterialRequestItems`**
   - Remove lines 1291-1300 (auto "In Progress")
   - Remove lines 1330-1352 (auto "Picked")

2. **Remove auto-status correction in `getMaterialRequestByTitle`**
   - Remove lines 411-419

3. **Remove auto-status correction in `getMaterialRequests`**
   - Remove lines 192-200

4. **Add validation to `updateMaterialRequestStatus`**
   - Validate "Picked" status (all items must be fully picked)
   - Validate "In Progress" status (prevent invalid transitions)

5. **Add new endpoint `GET /api/material-requests/:title/picking-status`**
   - Check if picking is complete
   - Return pending items

---

## New Workflow Flow

```
┌─────────────┐
│   Draft     │
└──────┬──────┘
       │
       │ User clicks "Submit"
       ▼
┌─────────────┐
│  Submitted  │
└──────┬──────┘
       │
       │ User clicks "Start Picking"
       │ (POST /api/material-requests/:title/update-status)
       │ { "status": "In Progress" }
       ▼
┌─────────────┐
│ In Progress │ ← Button: "In Picking" or "Picking Progress"
└──────┬──────┘
       │
       │ Users pick items (multiple users can pick)
       │ (POST /api/material-requests/:title/pick-items)
       │
       │ Check if all items picked
       │ (GET /api/material-requests/:title/picking-status)
       │
       │ If all items picked → Button: "Complete Picking"
       │
       │ User clicks "Complete Picking"
       │ (POST /api/material-requests/:title/update-status)
       │ { "status": "Picked" }
       │ (Validates all items are fully picked)
       ▼
┌─────────────┐
│   Picked    │ ← Button: "Create Transfer Carton"
└──────┬──────┘
       │
       │ User clicks "Create Transfer Carton"
       │ (POST /api/transfer-cartons/create)
       │ Returns: { "tc_id": "TC-..." }
       │
       │ Button renamed to "Seal Transfer Carton"
       │
       │ User clicks "Seal Transfer Carton"
       │ (POST /api/transfer-cartons/seal)
       │ { "tc_id": "TC-...", "sealed_by": "USER-001" }
       ▼
┌─────────────┐
│   Sealed    │ (Transfer Carton status)
└─────────────┘
```

---

## Multiple Users Picking

### Current Implementation:
- ✅ Uses incremental updates: `picked_qty = picked_qty + pickedQty`
- ✅ Database transactions ensure data consistency
- ✅ Multiple users can pick simultaneously without conflicts

### No Additional Changes Needed:
- The current implementation already supports concurrent picking safely

---

## Testing Checklist

After implementing changes, test:

1. ✅ Status change from "Submitted" to "In Progress" (manual)
2. ✅ Status does NOT auto-change when picking starts
3. ✅ Status change from "In Progress" to "Picked" (manual, only if all items picked)
4. ✅ Error when trying to set "Picked" if items not fully picked
5. ✅ Multiple users can pick items simultaneously
6. ✅ Create Transfer Carton when status is "Picked"
7. ✅ Seal Transfer Carton after creation
8. ✅ Picking status endpoint returns correct data

---

**Status:** 📋 **ANALYSIS COMPLETE - READY FOR IMPLEMENTATION**  
**Date:** 2026-01-12
