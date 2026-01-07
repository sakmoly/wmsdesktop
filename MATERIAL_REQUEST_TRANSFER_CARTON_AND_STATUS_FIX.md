# Material Request Transfer Carton Creation & Status Fix

## Issues Identified

1. **Transfer Carton Not Created**: TC ID `TC-MR-0001-1767516827262` was generated but not created in database
2. **Status Incorrect**: Material Request header shows "Picked" when it should be "In Progress" (only 20/100 items picked)

---

## Issue 1: Transfer Carton Creation

### Problem
The mobile app is generating a Transfer Carton ID (`TC-MR-0001-1767516827262`) but not actually creating the transfer carton in the database via the API.

### Root Cause
The mobile app must explicitly call `POST /api/transfer-cartons/create` to create the transfer carton. Simply generating a TC ID is not enough.

### Solution: Mobile App Changes Required

#### Step 1: Create Transfer Carton BEFORE Packing Items

**API Endpoint:**
```
POST /api/transfer-cartons/create
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body for Material Request:**
```json
{
  "tc_id": "TC-MR-0001-1767516827262",
  "asn_no": null,
  "to_no": "MR-0001",
  "store": "STORE-001",
  "user_id": "USER-004",
  "material_request": "MR-0001"
}
```

**⚠️ IMPORTANT:**
- `asn_no` **MUST** be `null` for Material Requests
- `to_no` **MUST** be the Material Request number (e.g., `"MR-0001"`), **NOT** `null`
- `tc_id` should match the generated TC ID
- `store` should be the destination showroom/store code
- `user_id` is required

**Response:**
```json
{
  "ok": true,
  "message": "Transfer carton created successfully",
  "data": {
    "tc_id": "TC-MR-0001-1767516827262",
    "status": "Created"
  }
}
```

#### Step 2: Pack Items to Transfer Carton

After creating the transfer carton, pack items using events:

**API Endpoint:**
```
POST /api/events/batch
```

**Request Body:**
```json
{
  "events": [
    {
      "event_type": "PACK_BOX_TO_TC",
      "event_time": "2026-01-03T10:45:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-004",
      "item_code": "SKU-HAT-301-RED-OS",
      "qty": 20.00,
      "store": "STORE-001",
      "tc_id": "TC-MR-0001-1767516827262",
      "transfer_order": "MR-0001",
      "material_request": "MR-0001"
    }
  ]
}
```

#### Step 3: Seal Transfer Carton

**API Endpoint:**
```
POST /api/transfer-cartons/seal
```

**Request Body:**
```json
{
  "tc_id": "TC-MR-0001-1767516827262",
  "sealed_by": "USER-004"
}
```

### Mobile App Workflow

```
1. User picks item → Update picked_qty via events
2. User wants to pack item → Generate TC ID (e.g., TC-MR-0001-{timestamp})
3. Call POST /api/transfer-cartons/create with TC ID and MR number
4. Pack items to TC via POST /api/events/batch (event_type: PACK_BOX_TO_TC)
5. Seal TC via POST /api/transfer-cartons/seal
```

### Backend Validation Rules

The backend validates:
- ✅ `asn_no` must be `null` for Material Requests
- ✅ `to_no` must be Material Request format (`MR-XXXX`)
- ✅ `tc_id`, `store`, and `user_id` are required

---

## Issue 2: Material Request Status Incorrect

### Problem
Material Request header status shows "Picked" when only 20/100 items are picked. Status should be "In Progress".

### Root Cause
The status was incorrectly set to "Picked" even though not all items are fully picked (`picked_qty >= requested_qty`).

### Solution: Backend Fix Applied

**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**Changes:**
1. Status check now uses `picked_qty >= requested_qty` instead of just checking `status === 'Picked'`
2. Added automatic status correction when fetching Material Requests
3. Status "Picked" is only set when:
   - ✅ ALL items have `picked_qty >= requested_qty`
   - ✅ ALL transfer cartons are sealed

**Status Correction Logic:**
```javascript
// Fix status if it's "Picked" but not all items are fully picked
if (status === 'Picked' && !allItemsFullyPicked) {
  status = 'In Progress';
  // Updates database automatically
}
```

### Status Rules

| Condition | Status |
|-----------|--------|
| No items picked | "Submitted" |
| Some items picked, not all | "In Progress" |
| All items picked, but not all TCs sealed | "In Progress" |
| All items picked AND all TCs sealed | "Picked" |

### Action Required

**Restart API Server** to load the status fix:
```bash
# Stop the API server
# Start it again
npm start
```

After restart, when you fetch Material Requests, the status will automatically correct from "Picked" to "In Progress" if not all items are fully picked.

---

## Summary of Changes Required

### Mobile App Changes

1. **✅ Call Transfer Carton Create API**
   - Before packing items, call `POST /api/transfer-cartons/create`
   - Include `to_no: "MR-0001"` (Material Request number), NOT `null`
   - Include `asn_no: null`

2. **✅ Include Material Request in Events**
   - When packing items, include `transfer_order: "MR-0001"` and `material_request: "MR-0001"` in events
   - Include `tc_id` in packing events

3. **✅ Workflow Order**
   - Pick items → Create TC → Pack items → Seal TC

### Backend Changes (Already Applied)

1. **✅ Status Fix**
   - Status now checks `picked_qty >= requested_qty` for all items
   - Automatic status correction on fetch
   - Status "Picked" only when all items picked AND all TCs sealed

2. **✅ Transfer Carton Validation**
   - Validates `to_no` must be Material Request format for MR transfer cartons
   - Validates `asn_no` must be `null` for Material Requests

---

## Testing Checklist

### Transfer Carton Creation
- [ ] Mobile app calls `POST /api/transfer-cartons/create` before packing
- [ ] Request includes `to_no: "MR-0001"` (not null)
- [ ] Request includes `asn_no: null`
- [ ] Transfer carton appears in desktop app's Transfer Cartons list
- [ ] Transfer carton has correct Material Request number in `transfer_order`/`to_no` column

### Status Correction
- [ ] API server restarted after status fix
- [ ] Material Request with partial picking shows "In Progress" (not "Picked")
- [ ] Material Request with all items picked but not all TCs sealed shows "In Progress"
- [ ] Material Request with all items picked AND all TCs sealed shows "Picked"

---

## API Examples

### Create Material Request Transfer Carton

```http
POST /api/transfer-cartons/create
Authorization: Bearer {token}
Content-Type: application/json

{
  "tc_id": "TC-MR-0001-1767516827262",
  "asn_no": null,
  "to_no": "MR-0001",
  "store": "STORE-001",
  "user_id": "USER-004",
  "material_request": "MR-0001"
}
```

### Pack Item to Transfer Carton

```http
POST /api/events/batch
Authorization: Bearer {token}
Content-Type: application/json

{
  "events": [
    {
      "event_type": "PACK_BOX_TO_TC",
      "event_time": "2026-01-03T10:45:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-004",
      "item_code": "SKU-HAT-301-RED-OS",
      "qty": 20.00,
      "store": "STORE-001",
      "tc_id": "TC-MR-0001-1767516827262",
      "transfer_order": "MR-0001",
      "material_request": "MR-0001"
    }
  ]
}
```

### Seal Transfer Carton

```http
POST /api/transfer-cartons/seal
Authorization: Bearer {token}
Content-Type: application/json

{
  "tc_id": "TC-MR-0001-1767516827262",
  "sealed_by": "USER-004"
}
```

---

## Notes

1. **Transfer Carton Creation is Manual**: The mobile app must explicitly call the create API. There is no automatic creation.

2. **Status Correction is Automatic**: Once the API is restarted, status will automatically correct when fetching Material Requests.

3. **Material Request Number Required**: For Material Request transfer cartons, `to_no` must be the Material Request number (e.g., `"MR-0001"`), not `null`.

4. **ASN Must Be Null**: For Material Request transfer cartons, `asn_no` must be `null`.

