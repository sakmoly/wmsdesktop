# Mobile App - Material Request API Endpoints

## Overview

This document provides all the API endpoints required for the mobile app to implement the new Material Request workflow.

---

## Workflow Steps

1. **Start Picking** → Status: "Submitted" → "In Progress"
2. **Pick Items** → Multiple users can pick simultaneously
3. **Complete Picking** → Status: "In Progress" → "Picked" (only if all items fully picked)
4. **Create Transfer Carton** → Creates TC and returns TC ID
5. **Seal Transfer Carton** → Seals the TC

---

## Required Endpoints

### 1. **Start Picking Button**

**Endpoint:** `POST /api/material-requests/:title/update-status`

**Purpose:** Change status from "Submitted" to "In Progress"

**Request:**

```http
POST /api/material-requests/MR-123459/update-status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "In Progress"
}
```

**Response:**

```json
{
  "ok": true,
  "message": "Material Request status updated successfully",
  "data": {
    "title": "MR-123459",
    "status": "In Progress"
  }
}
```

**Error Response (if Material Request not found):**

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Material Request MR-123459 not found"
  }
}
```

---

### 2. **Check Picking Status (for "Complete Picking" button)**

**Endpoint:** `GET /api/material-requests/:title/picking-status`

**Purpose:** Check if all items are fully picked (to show "Complete Picking" button)

**Request:**

```http
GET /api/material-requests/MR-123459/picking-status
Authorization: Bearer <token>
```

**Response (All items picked):**

```json
{
  "ok": true,
  "data": {
    "title": "MR-123459",
    "total_items": 5,
    "fully_picked_items": 5,
    "all_items_fully_picked": true,
    "pending_items": []
  }
}
```

**Response (Some items not picked):**

```json
{
  "ok": true,
  "data": {
    "title": "MR-123459",
    "total_items": 5,
    "fully_picked_items": 3,
    "all_items_fully_picked": false,
    "pending_items": [
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "requested_qty": 20,
        "picked_qty": 15,
        "remaining_qty": 5
      },
      {
        "item_code": "SKU-SHOE-501-BLK-42",
        "requested_qty": 10,
        "picked_qty": 0,
        "remaining_qty": 10
      }
    ]
  }
}
```

**Mobile App Logic:**

- If `all_items_fully_picked === true` → Show "Complete Picking" button (ENABLED)
- If `all_items_fully_picked === false` → Show "Resume Picking" or "Continue Picking" button (ENABLED) → Navigate to picking screen

---

### 3. **Complete Picking Button**

**Endpoint:** `POST /api/material-requests/:title/update-status`

**Purpose:** Change status from "In Progress" to "Picked" (only if all items fully picked)

**Request:**

```http
POST /api/material-requests/MR-123459/update-status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "Picked"
}
```

**Success Response:**

```json
{
  "ok": true,
  "message": "Material Request status updated successfully",
  "data": {
    "title": "MR-123459",
    "status": "Picked"
  }
}
```

**Error Response (if items not fully picked):**

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Cannot set status to \"Picked\". Not all items are fully picked.",
    "details": {
      "pending_items": [
        {
          "item_code": "SKU-HAT-301-GRN-OS",
          "requested_qty": 20,
          "picked_qty": 15,
          "remaining_qty": 5
        }
      ]
    }
  }
}
```

**Mobile App Logic:**

- Only call this endpoint if `all_items_fully_picked === true` (from picking-status endpoint)
- If error occurs, show error message and keep status as "In Progress"

---

### 4. **Pick Items (Multiple Users)**

**Endpoint:** `POST /api/material-requests/:title/pick-items`

**Purpose:** Pick items for Material Request (supports multiple users picking simultaneously)

**Request:**

```http
POST /api/material-requests/MR-123459/pick-items
Authorization: Bearer <token>
Content-Type: application/json

{
  "items": [
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "picked_qty": 5,
      "source_bin": "A1-R01-L1-B1"
    },
    {
      "item_code": "SKU-SHOE-501-BLK-42",
      "picked_qty": 3,
      "source_bin": "A1-R02-L1-B2"
    }
  ],
  "warehouse": "WH-MAIN"
}
```

**Response:**

```json
{
  "ok": true,
  "message": "Material Request items picked successfully",
  "data": {
    "material_request": "MR-123459",
    "status": "In Progress",
    "total_picked_qty": 8,
    "items_picked": 2,
    "carton_stock_updated": true,
    "stock_updates": [
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "qty_picked": 5,
        "carton_stock_updated": true
      },
      {
        "item_code": "SKU-SHOE-501-BLK-42",
        "qty_picked": 3,
        "carton_stock_updated": true
      }
    ]
  }
}
```

**Key Features:**

- ✅ **Incremental Updates:** `picked_qty` is added to existing value (safe for concurrent picking)
- ✅ **Multiple Users:** Multiple users can pick simultaneously without conflicts
- ✅ **Over-picking Allowed:** Can pick more than requested quantity
- ✅ **Decreasing Quantity:** Can use negative `picked_qty` to decrease quantity

**Mobile App Logic:**

- Call this endpoint whenever user scans an item
- Can be called multiple times for the same item (incremental)
- Status remains "In Progress" (no automatic status change)

---

### 5. **Get Material Request Details**

**Endpoint:** `GET /api/material-requests/:title`

**Purpose:** Get Material Request details including items and current status

**Request:**

```http
GET /api/material-requests/MR-123459
Authorization: Bearer <token>
```

**Response:**

```json
{
  "title": "MR-123459",
  "status": "In Progress",
  "from_warehouse": "WH-MAIN",
  "to_showroom": "SH-001",
  "request_date": "2026-01-12",
  "required_date": "2026-01-15",
  "requested_by": "USER-001",
  "total_requested_qty": 50,
  "total_picked_qty": 35,
  "items": [
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "requested_qty": 20,
      "picked_qty": 20,
      "pending_qty": 0,
      "status": "Picked"
    },
    {
      "item_code": "SKU-SHOE-501-BLK-42",
      "requested_qty": 10,
      "picked_qty": 5,
      "pending_qty": 5,
      "status": "Pending"
    }
  ],
  "created_at": "2026-01-12T10:00:00.000Z",
  "updated_at": "2026-01-12T14:30:00.000Z"
}
```

**Mobile App Logic:**

- Use `status` field to determine which button to show:
  - `"Submitted"` → Show "Start Picking" button (ENABLED)
  - `"In Progress"` → Show "Resume Picking" or "Continue Picking" button (ENABLED - navigates to picking screen)
  - `"Picked"` → Show "Create Transfer Carton" button (ENABLED)

---

### 6. **Create Transfer Carton**

**Endpoint:** `POST /api/transfer-cartons/create`

**Purpose:** Create a Transfer Carton for the Material Request

**Request:**

```http
POST /api/transfer-cartons/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "tc_id": "TC-MR-123459-1768157787512",
  "to_no": "MR-123459",
  "store": "SH-001",
  "user_id": "USER-001",
  "material_request": "MR-123459"
}
```

**Response:**

```json
{
  "ok": true,
  "message": "Transfer carton created successfully",
  "data": {
    "tc_id": "TC-MR-123459-1768157787512",
    "status": "Created"
  }
}
```

**Mobile App Logic:**

- Generate `tc_id` using format: `TC-{MR_TITLE}-{timestamp}`
- Set `to_no` to Material Request title (e.g., "MR-123459")
- Set `material_request` to Material Request title
- Display `tc_id` on screen after creation
- Rename button to "Seal Transfer Carton"

---

### 7. **Seal Transfer Carton**

**Endpoint:** `POST /api/transfer-cartons/seal`

**Purpose:** Seal the Transfer Carton

**Request:**

```http
POST /api/transfer-cartons/seal
Authorization: Bearer <token>
Content-Type: application/json

{
  "tc_id": "TC-MR-123459-1768157787512",
  "sealed_by": "USER-001"
}
```

**Response:**

```json
{
  "ok": true,
  "message": "Transfer carton sealed successfully"
}
```

**Error Response (if TC not found):**

```json
{
  "ok": false,
  "error": {
    "code": "TRANSFER_CARTON_NOT_FOUND",
    "message": "Transfer carton TC-MR-123459-1768157787512 not found"
  }
}
```

**Mobile App Logic:**

- Call this endpoint when user clicks "Seal Transfer Carton" button
- After successful seal, disable the button or show "Sealed" status

---

## Button States & Logic

### Button Flow:

```
┌─────────────────────┐
│   Status: Draft     │
│   Button: Submit    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Status: Submitted   │
│ Button: Start Picking│
└──────────┬──────────┘
           │
           ▼ (Click "Start Picking")
┌─────────────────────┐
│ Status: In Progress │
│ Button: "Resume Picking"│
│   or "Continue Picking"│
│   (ENABLED - Navigate to picking screen)│
└──────────┬──────────┘
           │
           │ (Click button → Navigate to picking screen)
           │ (Pick items)
           │ (Check picking-status)
           │
           ▼ (If all_items_fully_picked === true)
┌─────────────────────┐
│ Status: In Progress │
│ Button: Complete Picking│
│   (ENABLED)│
└──────────┬──────────┘
           │
           ▼ (Click "Complete Picking")
┌─────────────────────┐
│ Status: Picked      │
│ Button: Create Transfer Carton│
└──────────┬──────────┘
           │
           ▼ (Click "Create Transfer Carton")
┌─────────────────────┐
│ Status: Picked      │
│ TC Created: TC-...  │
│ Button: Seal Transfer Carton│
└──────────┬──────────┘
           │
           ▼ (Click "Seal Transfer Carton")
┌─────────────────────┐
│ Status: Picked      │
│ TC Status: Sealed   │
│ Button: Disabled    │
└─────────────────────┘
```

---

## Mobile App Implementation Guide

### 1. **Button Display Logic**

```javascript
// Pseudo-code for button display
function getButtonText(materialRequest) {
  switch (materialRequest.status) {
    case "Submitted":
      return "Start Picking";
    case "In Progress":
      // Check if all items are fully picked
      if (allItemsFullyPicked) {
        return "Complete Picking"; // Button enabled - completes picking
      } else {
        return "Resume Picking"; // or 'Continue Picking' - Button enabled - navigates to picking screen
      }
    case "Picked":
      if (transferCarton && transferCarton.status === "Created") {
        return "Seal Transfer Carton";
      } else if (!transferCarton) {
        return "Create Transfer Carton";
      } else {
        return "Sealed"; // Disabled
      }
    default:
      return "";
  }
}
```

### 2. **Start Picking Flow**

```javascript
async function handleStartPicking(mrTitle) {
  try {
    const response = await fetch(
      `/api/material-requests/${mrTitle}/update-status`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "In Progress" }),
      }
    );

    const data = await response.json();
    if (data.ok) {
      // Update local state
      setMaterialRequestStatus("In Progress");
      // Change button text and keep it enabled (navigates to picking screen)
      setButtonText("Resume Picking"); // or 'Continue Picking'
      setButtonEnabled(true); // IMPORTANT: Keep enabled to allow navigation to picking screen
    }
  } catch (error) {
    console.error("Failed to start picking:", error);
  }
}
```

### 3. **Check Picking Status Flow**

```javascript
async function checkPickingStatus(mrTitle) {
  try {
    const response = await fetch(
      `/api/material-requests/${mrTitle}/picking-status`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();
    if (data.ok) {
      if (data.data.all_items_fully_picked) {
        // Show "Complete Picking" button
        setButtonText("Complete Picking");
        setButtonEnabled(true);
      } else {
        // Show "Resume Picking" button (ENABLED - navigates to picking screen)
        setButtonText("Resume Picking"); // or 'Continue Picking'
        setButtonEnabled(true); // IMPORTANT: Button must be enabled to navigate to picking screen
        // Show progress: data.data.fully_picked_items / data.data.total_items
        // Button action: Navigate to picking screen (not disabled!)
      }
    }
  } catch (error) {
    console.error("Failed to check picking status:", error);
  }
}
```

### 4. **Complete Picking Flow**

```javascript
async function handleCompletePicking(mrTitle) {
  try {
    // First check if all items are fully picked
    const statusResponse = await fetch(
      `/api/material-requests/${mrTitle}/picking-status`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const statusData = await statusResponse.json();
    if (!statusData.ok || !statusData.data.all_items_fully_picked) {
      alert("Cannot complete picking. Not all items are fully picked.");
      return;
    }

    // Update status to "Picked"
    const response = await fetch(
      `/api/material-requests/${mrTitle}/update-status`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "Picked" }),
      }
    );

    const data = await response.json();
    if (data.ok) {
      setMaterialRequestStatus("Picked");
      setButtonText("Create Transfer Carton");
    } else {
      alert(data.error.message);
    }
  } catch (error) {
    console.error("Failed to complete picking:", error);
  }
}
```

### 5. **Create Transfer Carton Flow**

```javascript
async function handleCreateTransferCarton(mrTitle, store, userId) {
  try {
    const tcId = `TC-${mrTitle}-${Date.now()}`;

    // Step 1: Create Transfer Carton
    const response = await fetch("/api/transfer-cartons/create", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tc_id: tcId,
        asn_no: null, // Must be null for Material Requests
        to_no: mrTitle,
        store: store,
        user_id: userId,
        material_request: mrTitle,
      }),
    });

    const data = await response.json();
    if (data.ok) {
      // Store TC ID for packing events
      const createdTcId = data.data.tc_id;
      setTransferCartonId(createdTcId);

      // Step 2: Pack all picked items to Transfer Carton (CRITICAL!)
      // Get all items that were picked for this Material Request
      const mrResponse = await fetch(`/api/material-request/${mrTitle}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const mrData = await mrResponse.json();

      if (mrData.ok && mrData.data.items) {
        // Filter items that have been picked (picked_qty > 0)
        const pickedItems = mrData.data.items.filter(
          (item) => parseFloat(item.picked_qty || 0) > 0
        );

        if (pickedItems.length > 0) {
          // Create packing events for each picked item
          const packingEvents = pickedItems.map((item) => ({
            offline_uuid: `pack-${Date.now()}-${Math.random()
              .toString(36)
              .substring(7)}`,
            event_type: "PACK_ITEM_TO_TC",
            event_time: new Date().toISOString(),
            device_id: deviceId,
            user_id: userId,
            item_code: item.item_code,
            qty: parseFloat(item.picked_qty),
            carton_id: item.carton_id || null, // From picking
            source_bin: item.source_bin || null, // From picking
            tc_id: createdTcId, // ✅ CRITICAL - Link item to Transfer Carton
            material_request: mrTitle,
            store: store,
          }));

          // Send packing events to backend
          const packResponse = await fetch("/api/events/batch", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ events: packingEvents }),
          });

          const packData = await packResponse.json();
          if (packData.ok) {
            console.log(
              `✅ Packed ${packData.processed} items to Transfer Carton ${createdTcId}`
            );
          } else {
            console.error(
              "⚠️ Failed to pack items to Transfer Carton:",
              packData
            );
          }
        }
      }

      // Rename button
      setButtonText("Seal Transfer Carton");
    }
  } catch (error) {
    console.error("Failed to create transfer carton:", error);
  }
}
```

**⚠️ CRITICAL:** After creating the Transfer Carton, you **MUST** send `PACK_ITEM_TO_TC` events with `tc_id` to link items to the Transfer Carton. Without these events, the Transfer Carton will appear empty in the desktop app.

### 6. **Seal Transfer Carton Flow**

```javascript
async function handleSealTransferCarton(tcId, userId) {
  try {
    const response = await fetch("/api/transfer-cartons/seal", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tc_id: tcId,
        sealed_by: userId,
      }),
    });

    const data = await response.json();
    if (data.ok) {
      // Disable button or show "Sealed" status
      setButtonText("Sealed");
      setButtonEnabled(false);
    }
  } catch (error) {
    console.error("Failed to seal transfer carton:", error);
  }
}
```

---

## Multiple Users Picking

### Key Points:

1. ✅ **Safe Concurrent Picking:** The `pick-items` endpoint uses incremental updates (`picked_qty = picked_qty + new_qty`), so multiple users can pick simultaneously without conflicts.

2. ✅ **Real-time Updates:** Mobile app should periodically refresh Material Request details to see updates from other users.

3. ✅ **Status Management:** Only one user should be able to change status (e.g., "Start Picking", "Complete Picking"). Consider using a lock or checking current status before updating.

4. ✅ **Progress Tracking:** Use the `picking-status` endpoint to show real-time progress to all users.

---

## Error Handling

### Common Errors:

1. **VALIDATION_ERROR:** Status change validation failed (e.g., trying to set "Picked" when items not fully picked)
2. **NOT_FOUND:** Material Request or Transfer Carton not found
3. **DATABASE_ERROR:** Server-side database error
4. **INVALID_STATUS_TRANSITION:** Invalid status change (e.g., "Picked" → "In Progress" when all items picked)

### Error Response Format:

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      // Additional error details (only in development mode)
    }
  }
}
```

---

## Testing Checklist

- [ ] Start Picking button changes status to "In Progress"
- [ ] Pick items endpoint works with incremental updates
- [ ] Multiple users can pick items simultaneously
- [ ] Picking status endpoint returns correct data
- [ ] Complete Picking button only works when all items fully picked
- [ ] Create Transfer Carton returns TC ID
- [ ] Seal Transfer Carton updates TC status
- [ ] Button text changes correctly based on status
- [ ] Error handling works for all error cases

---

**Status:** ✅ **READY FOR MOBILE APP IMPLEMENTATION**  
**Date:** 2026-01-12
