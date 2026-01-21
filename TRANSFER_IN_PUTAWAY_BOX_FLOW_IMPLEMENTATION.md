# Transfer In Putaway Box Flow Implementation

**Date**: 2026-01-20  
**Status**: ✅ **IMPLEMENTED**

---

## Overview

Transfer In Putaway now works **exactly like ASN Putaway** - using **BOX IDs** for validation and scanning. This unifies the putaway workflow across both ASN and Transfer In.

---

## What Changed

### Before (Old Flow)
1. Transfer In items received → Putaway task created
2. Mobile app scans **carton_id** directly
3. Backend validates carton_id against putaway lines
4. ❌ **Problem**: No box validation, inconsistent with ASN flow

### After (New Flow)
1. Transfer In items received → Putaway task created
2. **Backend automatically creates BOX IDs** in `tabSortBox` (one box per carton)
3. Mobile app scans **BOX ID** (same as ASN)
4. Backend validates box_id against `tabSortBox`
5. ✅ **Result**: Unified flow, consistent validation

---

## Backend Changes

### 1. New Helper Function: `ensurePutawayBoxesForTransferIn`

**Location**: `wms-api/src/modules/transfer-in/transferInController.js`

**Purpose**: Creates boxes in `tabSortBox` for each carton in Transfer In putaway task.

**When Called**: Automatically after putaway task creation (in `createPutawayTaskFromTransferIn`)

**What It Does**:
1. Finds all distinct cartons from putaway lines
2. For each carton:
   - **Uses carton_id AS box_id** (e.g., `CTN-TI-123457-20260120-191057-639`)
   - Creates box in `tabSortBox` with:
     - `box_id`: Carton ID (same as carton_id)
     - `status`: `'Open'`
     - `advance_shipping_notice`: Transfer In title (required field)
     - `transfer_order`: Empty string (required field)
     - `store`: Warehouse code
     - `purpose`: `'PUTAWAY'`
     - `source_ref`: Transfer In title (if column exists)
     - `carton_id`: Carton ID (if column exists)
     - `putaway_task_title`: Putaway task title (if column exists)
   - Creates box lines in `tabSortBoxLine` (if table exists)
   - Updates `tabPutawayLine.box_id` with the box ID

**Idempotent**: If box already exists for carton+task, reuses it instead of creating duplicate.

---

### 2. Updated Validation: `scanTransferCarton`

**Location**: `wms-api/src/modules/putaway/putawayController.js`

**Changes**:
- **Before**: Transfer In putaway skipped `box_id` validation
- **After**: Transfer In putaway **validates `box_id`** from `tabSortBox` (same as ASN)

**Validation Logic**:
1. Checks if box exists in `tabSortBox`
2. Validates box status (must be `Open` or `Assigned`, not `Closed`/`Completed`)
3. For Transfer In: Verifies box is assigned to the putaway task (via `putaway_task_title` or `source_ref`)

---

## Mobile App Changes Required

### ⚠️ **CRITICAL**: Mobile app must be updated to scan **BOX ID** instead of carton_id for Transfer In Putaway

### Current Behavior (WRONG)
```typescript
// Transfer In Putaway - Currently scanning carton_id
const handleTransferInPutawayScan = async (scannedId: string) => {
  const requestBody = {
    tc_id: scannedId,  // ❌ WRONG: Using carton_id
    box_id: null,
    location_id: locationId,
    user_id: currentUser.id
  };
  
  await apiService.post("/api/putaway/scan-transfer-carton", requestBody);
};
```

### Required Behavior (CORRECT)
```typescript
// Transfer In Putaway - Should scan BOX ID (same as ASN)
const handleTransferInPutawayScan = async (scannedId: string) => {
  const requestBody = {
    tc_id: null,  // ✅ Not used for Transfer In putaway
    box_id: scannedId,  // ✅ CORRECT: Use box_id (carton_id, e.g., "CTN-TI-123457-20260120-191057-639")
    location_id: locationId,
    user_id: currentUser.id
  };
  
  await apiService.post("/api/putaway/scan-transfer-carton", requestBody);
};
```

---

## Mobile App Implementation Guide

### Step 1: Update Putaway List Screen

**Before**: Show putaway tasks with carton IDs  
**After**: Show putaway tasks with **BOX IDs** from `tabSortBox`

**API Call**:
```typescript
// Get putaway tasks
GET /api/putaway/tasks?source_type=TransferIn&status=Draft,In Progress

// Response includes box_id for each task
{
  "ok": true,
  "data": [
    {
      "putaway_task": "PUT-20260120-0001",
      "box_id": "TI-PUT-20260120-0001",  // ✅ Use this for scanning
      "source_type": "TransferIn",
      "status": "Draft"
    }
  ]
}
```

### Step 2: Update Scan Flow

**Unified Flow for Both ASN and Transfer In**:

```typescript
const handlePutawayScan = async (scannedId: string) => {
  // Determine putaway type from context (screen/route)
  const isAsnPutaway = currentRoute === 'ASN_PUTAWAY';
  const isTransferInPutaway = currentRoute === 'TRANSFER_IN_PUTAWAY';
  
  // For BOTH types, use box_id
  const requestBody = {
    box_id: scannedId,  // ✅ Always use box_id
    tc_id: null,  // Not needed for putaway validation
    location_id: locationId,
    user_id: currentUser.id
  };
  
  try {
    const response = await apiService.post(
      "/api/putaway/scan-transfer-carton",
      requestBody
    );
    
    if (response.data.ok && response.data.validated) {
      // Check putaway_type in response
      const putawayType = response.data.validated.putaway_type;
      
      if (putawayType === "ASN" && isTransferInPutaway) {
        Alert.alert("Warning", "Scanned ASN box in Transfer In putaway screen.");
      } else if (putawayType === "TRANSFER_IN" && isAsnPutaway) {
        Alert.alert("Warning", "Scanned Transfer In box in ASN putaway screen.");
      }
      
      // Enable Complete button
      setIsReadyForCompletion(true);
      setValidatedData(response.data.validated);
    }
  } catch (error: any) {
    if (error.response?.data?.error?.code === "BOX_NOT_FOUND") {
      Alert.alert("Error", `Box ${scannedId} not found. Please scan a valid putaway box.`);
    } else if (error.response?.data?.error?.code === "BOX_ALREADY_PROCESSED") {
      Alert.alert("Error", `Box ${scannedId} is already processed and cannot be used.`);
    } else if (error.response?.data?.error?.code === "BOX_TASK_MISMATCH") {
      Alert.alert("Error", `Box ${scannedId} is not assigned to this putaway task.`);
    }
  }
};
```

### Step 3: Update Putaway Task Display

**Show Box ID instead of Carton ID**:

```typescript
// In Putaway Task List Component
const PutawayTaskItem = ({ task }) => {
  return (
    <View>
      <Text>Putaway Task: {task.putaway_task}</Text>
      <Text>Box ID: {task.box_id || 'N/A'}</Text>  {/* ✅ Show box_id */}
      <Text>Status: {task.status}</Text>
      <Button 
        title="Scan Box" 
        onPress={() => handleScan(task.box_id)}  {/* ✅ Scan box_id */}
      />
    </View>
  );
};
```

### Step 4: Update Complete Endpoint Call

**No changes needed** - Complete endpoint already accepts `box_id`:

```typescript
const handleComplete = async () => {
  const requestBody = {
    box_id: validatedData.box_id,  // ✅ Use box_id from validation
    location_id: validatedData.location_id,
    user_id: currentUser.id
  };
  
  await apiService.post("/api/putaway/complete", requestBody);
};
```

---

## Database Schema

### Required Columns in `tabSortBox`

**Mandatory** (already exist):
- `box_id` (PRIMARY KEY)
- `status`
- `advance_shipping_notice` (NOT NULL)
- `transfer_order` (NOT NULL)
- `store` (NOT NULL)
- `purpose`
- `created_by`
- `created_on`

**Optional** (added dynamically if exist):
- `source_ref` - Transfer In title
- `carton_id` - Carton ID for the box
- `putaway_task_title` - Putaway task title

### Required Columns in `tabPutawayLine`

**Mandatory** (already exist):
- `parent_title`
- `item_code`
- `qty`
- `carton_id`

**Optional** (added dynamically if exists):
- `box_id` - Box ID linking to `tabSortBox`

---

## Testing Checklist

### ✅ Test Case 1: Single Carton Transfer In
1. Receive Transfer In with 1 carton
2. Verify putaway task created
3. Verify 1 box created in `tabSortBox` with `box_id = carton_id` (e.g., `CTN-TI-123457-20260120-191057-639`)
4. Verify `tabPutawayLine.box_id` is populated
5. Mobile app scans box_id → Validation succeeds
6. Complete putaway → Stock updated

### ✅ Test Case 2: Multiple Cartons Transfer In
1. Receive Transfer In with 3 cartons
2. Verify putaway task created
3. Verify 3 boxes created (one per carton)
4. Each box has unique `box_id`
5. Each putaway line has correct `box_id`
6. Mobile app scans each box → All validations succeed

### ✅ Test Case 3: Idempotency
1. Trigger putaway task creation twice (or retry)
2. Verify no duplicate boxes created
3. Verify existing boxes are reused

### ✅ Test Case 4: Box Validation
1. Scan valid box_id → Validation succeeds
2. Scan invalid box_id → Error: "BOX_NOT_FOUND"
3. Scan closed box → Error: "BOX_ALREADY_PROCESSED"
4. Scan box from different task → Error: "BOX_TASK_MISMATCH"

---

## Migration Notes

### No Database Migration Required

The implementation **dynamically checks** for optional columns and uses them if available. If columns don't exist, the code gracefully falls back to using required columns only.

**Optional Enhancements** (if you want to add columns):
```sql
-- Add optional columns to tabSortBox (if not exists)
ALTER TABLE tabSortBox 
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS source_ref VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS carton_id VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS putaway_task_title VARCHAR(100) NULL;

-- Add optional column to tabPutawayLine (if not exists)
ALTER TABLE tabPutawayLine 
  ADD COLUMN IF NOT EXISTS box_id VARCHAR(100) NULL;
```

---

## Summary

✅ **Backend**: Automatically creates boxes for Transfer In putaway  
✅ **Backend**: Validates boxes for Transfer In putaway (same as ASN)  
⚠️ **Mobile**: **MUST** be updated to scan **BOX ID** instead of carton_id  
✅ **Result**: Unified putaway flow for both ASN and Transfer In

---

## Next Steps

1. ✅ Backend implementation complete
2. ⚠️ **Mobile app team**: Update to scan BOX ID for Transfer In putaway
3. ⚠️ **Mobile app team**: Update putaway list to show box_id
4. ⚠️ **Testing**: Test with real Transfer In data
5. ⚠️ **Deployment**: Deploy backend first, then mobile app

---

## Questions?

If you have questions about the implementation, check:
- `wms-api/src/modules/transfer-in/transferInController.js` - Box creation function
- `wms-api/src/modules/putaway/putawayController.js` - Validation logic
- This document - Mobile app changes
