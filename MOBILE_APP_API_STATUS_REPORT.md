# Mobile App API Status Report

## Summary

This document provides a comprehensive status of all APIs required by the mobile app for Material Request Packing workflow.

---

## ✅ Required APIs - Status

### 1. POST /api/transfer-cartons/create
**Status:** ✅ **EXISTS**

**Endpoint:** `POST /api/transfer-cartons/create`

**Accepts `material_request` field:** ✅ **YES**

**Request Body (Material Request):**
```json
{
  "tc_id": "TC-MR-123460-1768157787512",
  "asn_no": null,                    // ✅ Must be null for Material Requests
  "to_no": "MR-123460",              // ✅ Material Request number
  "store": "STORE-002",
  "user_id": "USER-150526",
  "material_request": "MR-123460"     // ✅ Optional, but accepted
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Transfer carton created successfully",
  "data": {
    "tc_id": "TC-MR-123460-1768157787512",
    "status": "Created"
  }
}
```

**Notes:**
- ✅ Accepts both `to_no` (mobile) and `transfer_order` (desktop) formats
- ✅ Accepts `material_request` field (optional, for reference)
- ✅ Validates that `asn_no` is `null` for Material Requests
- ✅ Validates that `to_no` matches Material Request format (`MR-XXXX`)

---

### 2. GET /api/master/bin-master/{bin_code}
**Status:** ✅ **EXISTS**

**Endpoint:** `GET /api/master/bin-master/:bin_code`

**Purpose:** Validate bin location and get location details

**Request:**
```
GET /api/master/bin-master/A1-R02-L1-B2
Authorization: Bearer {token}
```

**Response:**
```json
{
  "location_id": "A1-R02-L1-B2",
  "bin_code": "A1-R02-L1-B2",
  "warehouse": "WH-MAIN",
  "zone": "A1",
  "aisle": null,
  "parent_rack": "Rack 02",
  "rack": "Rack 02",
  "level": "L1",
  "bin_id": "B2",
  "location_type": "STORAGE",
  "is_available": true,
  "capacity_volume_weight": null,
  "created_at": "2026-01-01T00:00:00.000Z",
  "updated_at": "2026-01-01T00:00:00.000Z"
}
```

**Error Response (404):**
```json
{
  "code": "NOT_FOUND",
  "message": "Bin \"A1-R02-L1-B2\" not found in system"
}
```

**Notes:**
- ✅ Returns full location details from `tabLocation` table
- ✅ Validates location exists before allowing operations
- ✅ Returns `is_available` status

---

### 3. GET /api/stock/item/{item_code}/warehouse/{warehouse}
**Status:** ✅ **EXISTS** (Recently Fixed)

**Endpoint:** `GET /api/stock/item/:item_code/warehouse/:warehouse`

**Alias:** `GET /api/stock-ledger/:item_code/:warehouse`

**Purpose:** Get item stock locations with carton breakdown

**Request:**
```
GET /api/stock/item/SKU-HAT-301-GRN-OS/warehouse/WH-MAIN
Authorization: Bearer {token}
```

**Response (Grouped Format - Default):**
```json
[
  {
    "item_code": "SKU-HAT-301-GRN-OS",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R02-L1-B2",  // ✅ Full location ID (recently fixed)
    "cartons": [
      {
        "carton_id": "CTN-A1-R02-L1-B2-20260111-162835-760",
        "qty": 10.00
      }
    ],
    "total_qty": 10.00,
    "reserved_qty": 0.00,
    "available_qty": 10.00
  }
]
```

**Response (Flat Format):**
```
GET /api/stock/item/SKU-HAT-301-GRN-OS/warehouse/WH-MAIN?format=flat
```

**Notes:**
- ✅ Returns full location ID format (e.g., "A1-R02-L1-B2") - **Recently Fixed**
- ✅ Parses incomplete formats (e.g., "Rack 02-B2") and matches to full location ID
- ✅ Returns carton breakdown for carton-level inventory
- ✅ Supports both grouped and flat response formats

---

### 4. GET /api/material-requests/{mr_title}
**Status:** ✅ **EXISTS**

**Endpoint:** `GET /api/material-requests/:title`

**Request:**
```
GET /api/material-requests/MR-123460
Authorization: Bearer {token}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "title": "MR-123460",
    "status": "In Progress",
    "from_warehouse": "WH-MAIN",
    "to_showroom": "STORE-002",
    "requested_date": "2026-01-11T00:00:00.000Z",
    "required_date": "2026-01-15T00:00:00.000Z",
    "requested_by": "USER-001",
    "total_requested_qty": 4.00,
    "total_picked_qty": 2.00,
    "created_at": "2026-01-11T00:00:00.000Z",
    "updated_at": "2026-01-11T00:00:00.000Z",
    "items": [
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "item_name": "Baseball Cap Green One Size",
        "requested_qty": 2.00,
        "picked_qty": 2.00,
        "uom": "EA"
      }
    ]
  }
}
```

**Notes:**
- ✅ Returns Material Request header and items
- ✅ Includes `picked_qty` for each item
- ✅ Includes status and warehouse information

---

### 5. POST /api/events/batch
**Status:** ✅ **EXISTS**

**Endpoint:** `POST /api/events/batch`

**Purpose:** Sync packing events from mobile app

**Request Body:**
```json
{
  "events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
      "event_type": "PACK_ITEM_TO_TC",
      "event_time": "2026-01-11T21:56:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-150526",
      "item_code": "SKU-HAT-301-GRN-OS",
      "qty": 2.00,
      "carton_id": "CTN-A1-R02-L1-B2-20260111-162835-760",  // ✅ REQUIRED for carton-level
      "tc_id": "TC-MR-123460-1768157787512",                // ✅ REQUIRED
      "transfer_order": "MR-123460",
      "store": "STORE-002"
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "processed": 1,
  "failed": 0,
  "inserted_count": 1
}
```

**Validation:**
- ✅ **Carton ID Required**: For carton-level inventory, `carton_id` is required
- ✅ **TC ID Required**: `tc_id` must be included to link to transfer carton
- ✅ **Sealed Carton Rejection**: Sealed/Dispatched cartons reject new packing events

**Error Response:**
```json
{
  "ok": true,
  "processed": 0,
  "failed": 1,
  "failed_events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
      "error": "Carton ID is required when packing items in carton-level inventory mode. Item: SKU-HAT-301-GRN-OS"
    }
  ]
}
```

**Notes:**
- ✅ Processes `PACK_ITEM_TO_TC` and `PACK_BOX_TO_TC` events
- ✅ Validates carton exists in `tabCartonStock` if `carton_id` provided
- ✅ Validates transfer carton status (rejects if Sealed/Dispatched)
- ✅ Uses `offline_uuid` for idempotency (prevents duplicates)

---

### 6. GET /api/transfer-cartons?material_request={mr_title}&store={store}
**Status:** ✅ **EXISTS** (Enhanced)

**Endpoint:** `GET /api/transfer-cartons`

**Query Parameters:**
- ✅ `?asn=ASN-0001` - Filter by ASN
- ✅ `?store=STORE-001` - Filter by store
- ✅ `?material_request=MR-123460` - **NOW SUPPORTED** - Filter by Material Request number
- ✅ `?to_no=MR-123460` - Filter by Transfer Order number (or Material Request)

**Request:**
```
GET /api/transfer-cartons?material_request=MR-123460&store=STORE-002
Authorization: Bearer {token}
```

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "tc_id": "TC-MR-123460-1768157787512",
      "status": "Created",
      "asn_no": null,
      "to_no": "MR-123460",
      "store": "STORE-002",
      "created_by": "USER-150526",
      "created_on": "2026-01-11T18:56:27.000Z",
      "sealed_by": null,
      "sealed_on": null,
      "dispatched_on": null
    }
  ],
  "count": 1
}
```

**Notes:**
- ✅ `material_request` is an alias for `to_no` (both work the same way)
- ✅ Returns all transfer cartons matching the Material Request and store
- ✅ Useful for checking if transfer cartons already exist before creating new ones

---

## ❌ Optional APIs - Status

### 7. POST /api/material-requests/{mr_title}/update-location
**Status:** ❌ **DOES NOT EXIST**

**Alternative:** ✅ **Include `bin_location` in packing events**

**Current Solution:**
The `bin_location` can be included in `PACK_ITEM_TO_TC` events via the `source_bin` or `location_id` field:

```json
{
  "event_type": "PACK_ITEM_TO_TC",
  "item_code": "SKU-HAT-301-GRN-OS",
  "qty": 2.00,
  "carton_id": "CTN-A1-R02-L1-B2-...",
  "tc_id": "TC-MR-123460-1768157787512",
  "source_bin": "A1-R02-L1-B2",      // ✅ Can include bin location
  "location_id": "A1-R02-L1-B2",     // ✅ Alternative field
  "transfer_order": "MR-123460"
}
```

**Recommendation:** ✅ **Use packing events** - No separate endpoint needed

---

### 8. POST /api/material-requests/{mr_title}/update-carton
**Status:** ❌ **DOES NOT EXIST**

**Alternative:** ✅ **Include `carton_id` in packing events** (Already Implemented)

**Current Solution:**
The `carton_id` is **already included** in `PACK_ITEM_TO_TC` events:

```json
{
  "event_type": "PACK_ITEM_TO_TC",
  "item_code": "SKU-HAT-301-GRN-OS",
  "qty": 2.00,
  "carton_id": "CTN-A1-R02-L1-B2-20260111-162835-760",  // ✅ Already included
  "tc_id": "TC-MR-123460-1768157787512",
  "transfer_order": "MR-123460"
}
```

**Recommendation:** ✅ **Use packing events** - No separate endpoint needed

---

## 📋 API Endpoint Summary

| API Endpoint | Status | Notes |
|-------------|--------|-------|
| `POST /api/transfer-cartons/create` | ✅ EXISTS | Accepts `material_request` field |
| `GET /api/master/bin-master/:bin_code` | ✅ EXISTS | Validates bin locations |
| `GET /api/stock/item/:item_code/warehouse/:warehouse` | ✅ EXISTS | Returns full location IDs (fixed) |
| `GET /api/material-requests/:title` | ✅ EXISTS | Returns MR details with items |
| `POST /api/events/batch` | ✅ EXISTS | Processes packing events with validation |
| `GET /api/transfer-cartons?material_request={mr}` | ✅ EXISTS | Enhanced to support `material_request` parameter |
| `POST /api/material-requests/:title/update-location` | ❌ NOT NEEDED | Use `source_bin` in events |
| `POST /api/material-requests/:title/update-carton` | ❌ NOT NEEDED | Use `carton_id` in events |

---

## ✅ Enhancements Completed

### 1. Added `material_request` Query Parameter to `GET /api/transfer-cartons`

**Status:** ✅ **COMPLETED**

**File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

**Change Applied:**
```javascript
export const getTransferCartons = async (req, res) => {
  const { asn, store, material_request, to_no } = req.query;  // ✅ Added material_request
  
  // Use material_request if provided, otherwise use to_no
  const transferOrderFilter = material_request || to_no;
  
  if (transferOrderFilter) {
    whereConditions.push(`${toColumn} = ?`);
    queryParams.push(transferOrderFilter);
  }
}
```

**Result:** ✅ Mobile app can now use `?material_request=MR-XXXX` directly

---

## ✅ Backend Processing Confirmation

### Does backend process PACK_ITEM_TO_TC events with carton_id and bin_location?

**Answer:** ✅ **YES**

**File:** `wms-api/src/modules/events/eventController.js`

**Processing:**
1. ✅ **Accepts `carton_id`**: Extracted from event and stored in `tabWmsScanEvent`
2. ✅ **Accepts `source_bin` or `location_id`**: Extracted and used for validation
3. ✅ **Validates carton_id**: For carton-level inventory, validates carton exists in `tabCartonStock`
4. ✅ **Validates bin_location**: If provided, validates carton is in correct bin
5. ✅ **Stores in database**: All fields are stored in `tabWmsScanEvent` table

**Event Fields Processed:**
- ✅ `carton_id` - Source carton ID (required for carton-level)
- ✅ `tc_id` - Transfer Carton ID (required)
- ✅ `source_bin` - Bin location (optional, for validation)
- ✅ `location_id` - Alternative bin location field (optional)
- ✅ `item_code` - Item code (required)
- ✅ `qty` - Quantity (required)
- ✅ `transfer_order` - Material Request number (optional)

---

## 📝 Mobile App Implementation Guide

### Complete Workflow

#### Step 1: Create Transfer Carton
```javascript
POST /api/transfer-cartons/create
{
  "tc_id": "TC-MR-123460-1768157787512",
  "asn_no": null,
  "to_no": "MR-123460",
  "store": "STORE-002",
  "user_id": "USER-150526",
  "material_request": "MR-123460"  // Optional
}
```

#### Step 2: Validate Bin Location (Optional)
```javascript
GET /api/master/bin-master/A1-R02-L1-B2
// Returns location details or 404 if not found
```

#### Step 3: Get Item Stock Locations
```javascript
GET /api/stock/item/SKU-HAT-301-GRN-OS/warehouse/WH-MAIN
// Returns locations with carton breakdown
```

#### Step 4: Pack Items (Send Events)
```javascript
POST /api/events/batch
{
  "events": [
    {
      "offline_uuid": "uuid-here",
      "event_type": "PACK_ITEM_TO_TC",
      "event_time": "2026-01-11T21:56:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-150526",
      "item_code": "SKU-HAT-301-GRN-OS",
      "qty": 2.00,
      "carton_id": "CTN-A1-R02-L1-B2-...",  // ✅ REQUIRED
      "tc_id": "TC-MR-123460-1768157787512", // ✅ REQUIRED
      "source_bin": "A1-R02-L1-B2",         // Optional
      "transfer_order": "MR-123460"
    }
  ]
}
```

#### Step 5: Check Existing Transfer Cartons
```javascript
GET /api/transfer-cartons?material_request=MR-123460&store=STORE-002
// Returns all transfer cartons for this Material Request
// Alternative: GET /api/transfer-cartons?to_no=MR-123460&store=STORE-002
```

---

## 🎯 Recommendations

### For Mobile App Team:

1. ✅ **Use existing APIs** - All required APIs exist and are ready
2. ✅ **Use `material_request` parameter** - `GET /api/transfer-cartons?material_request=MR-XXXX` is now supported
3. ✅ **Include all required fields** - `tc_id` and `carton_id` are mandatory in packing events
4. ✅ **Handle validation errors** - Backend will reject events with missing/invalid data

### For Backend Team:

1. ✅ **Enhancement Completed**: Added `material_request` query parameter to `GET /api/transfer-cartons`

---

## ✅ Summary

**All Required APIs Exist:**
- ✅ POST /api/transfer-cartons/create (accepts material_request)
- ✅ GET /api/master/bin-master/:bin_code
- ✅ GET /api/stock/item/:item_code/warehouse/:warehouse (fixed for full location IDs)
- ✅ GET /api/material-requests/:title
- ✅ POST /api/events/batch (validates carton_id and tc_id)

**Optional APIs Not Needed:**
- ❌ update-location endpoint - Use `source_bin` in events
- ❌ update-carton endpoint - Use `carton_id` in events (already implemented)

**Enhancements Completed:**
- ✅ Added `material_request` query parameter to `GET /api/transfer-cartons`

---

**Status:** ✅ **READY FOR MOBILE APP IMPLEMENTATION**  
**Date:** 2026-01-11  
**Next Steps:** Mobile app can proceed with implementation using existing APIs
