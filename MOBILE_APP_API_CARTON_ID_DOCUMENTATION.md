# Mobile App API - Carton ID Support Documentation

## 📋 Overview

This document provides complete API endpoint documentation for mobile app development with **carton_id** support for:
- **Putaway** operations
- **Picking/Takeaway** (Material Request) operations
- **Cycle Count** operations
- **Stock Transaction** queries

---

## 🔑 Key Points

1. **Carton ID is OPTIONAL** in requests (for backward compatibility with bin-level mode)
2. **Carton ID is REQUIRED** when system is in carton-level inventory mode
3. **Carton ID is always included** in responses when available
4. **System automatically detects** carton-level mode by checking if carton tables exist

---

## 📦 PUTAWAY API ENDPOINTS

### 1. POST /api/putaway/complete

**Purpose:** Complete putaway task and update stock

**Request:**
```json
{
  "putaway_task": "PUT-20250120-0001",
  "performed_by": "USER-002",
  "location_id": "A1-R01-L1-B1",  // Optional: Header-level location (applies to all items)
  "items": [
    {
      "item_code": "SKU-001",
      "qty": 50.00,
      "carton_id": "CARTON-001",  // ✅ NEW: Required in carton-level mode
      "source_bin": "DOCK-01",
      "target_bin": "A1-R01-L1-B1",  // location_id format
      "location_id": "A1-R01-L1-B1",  // Optional: Item-level location (overrides header)
      "completed": true
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Putaway completed successfully",
  "data": {
    "putaway_task": "PUT-20250120-0001",
    "items_processed": 1,
    "stock_updates": [
      {
        "item_code": "SKU-001",
        "carton_id": "CARTON-001",
        "target_bin": "A1-R01-L1-B1",
        "qty_added": 50.0,
        "qty_before": 0.0,
        "qty_after": 50.0
      }
    ]
  }
}
```

**Notes:**
- ✅ Already supports `carton_id` in putaway lines
- ✅ Updates `tabCartonStock` when `carton_id` provided
- ✅ Creates/updates carton records in `tabCarton` and `tabCartonItem`
- ✅ Includes `carton_id` in stock transaction log

---

### 2. POST /api/putaway/assign-rack

**Purpose:** Assign rack/bin location to putaway items

**Request:**
```json
{
  "putaway_task": "PUT-20250120-0001",
  "carton_id": "CARTON-001",  // ✅ Already supported
  "item_code": "SKU-001",
  "rack": "RACK-A",
  "bin": "BIN-01",
  "qty": 50.00,
  "user_id": "USER-001"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Rack assigned successfully"
}
```

**Notes:**
- ✅ Already supports `carton_id` (no changes needed)

---

### 3. GET /api/putaway/tasks

**Purpose:** Get list of putaway tasks

**Query Parameters:**
- `status` (optional): Filter by status
- `advance_shipping_notice` (optional): Filter by ASN
- `source_type` (optional): Filter by source type (ASN, TransferIn)

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "title": "PUT-20250120-0001",
      "status": "In Progress",
      "lines": [
        {
          "item_code": "SKU-001",
          "carton_id": "CARTON-001",  // ✅ Already included
          "qty": 50.00,
          "rack": "RACK-A",
          "bin": "BIN-01"
        }
      ]
    }
  ]
}
```

**Notes:**
- ✅ Already includes `carton_id` in lines (no changes needed)

---

## 📤 PICKING/TAKEAWAY API ENDPOINTS

### 1. POST /api/material-requests/:title/pick-items

**Purpose:** Pick items from Material Request and reduce stock

**Request:**
```json
{
  "items": [
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "picked_qty": 20.00,
      "source_bin": "A1-R01-L1-B1",
      "carton_id": "CARTON-001"  // ✅ NEW: Required in carton-level mode
    }
  ],
  "warehouse": "WH-MAIN"  // Optional
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Material Request items picked successfully",
  "data": {
    "material_request": "MR-0001",
    "status": "In Progress",
    "total_picked_qty": 20.0,
    "items_picked": 1,
    "carton_stock_updated": true,  // ✅ NEW: Indicates carton stock was updated
    "stock_updates": [
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "carton_id": "CARTON-001",  // ✅ NEW
        "source_bin": "A1-R01-L1-B1",
        "qty_reduced": 20.0,
        "qty_before": 50.0,
        "qty_after": 30.0,
        "carton_stock_updated": true  // ✅ NEW
      }
    ]
  }
}
```

**Error Responses:**

**400 - Carton Not Found:**
```json
{
  "ok": false,
  "error": {
    "code": "CARTON_NOT_FOUND",
    "message": "Carton CARTON-001 not found"
  }
}
```

**400 - Carton Bin Mismatch:**
```json
{
  "ok": false,
  "error": {
    "code": "CARTON_BIN_MISMATCH",
    "message": "Carton CARTON-001 is not in bin A1-R01-L1-B1. Current bin: A2-R02-L2-B2"
  }
}
```

**400 - Insufficient Carton Stock:**
```json
{
  "ok": false,
  "error": {
    "code": "INSUFFICIENT_CARTON_STOCK",
    "message": "Insufficient stock in carton CARTON-001 for SKU-HAT-301-GRN-OS. Available: 10.0, Required: 20.0"
  }
}
```

**Notes:**
- ✅ **NEW:** Accepts `carton_id` in request items
- ✅ **NEW:** Validates carton exists and is in correct bin
- ✅ **NEW:** Updates `tabCartonStock` when `carton_id` provided
- ✅ **NEW:** Updates carton status to "PICKED" when fully picked
- ✅ **NEW:** Includes `carton_id` in stock transaction log

---

### 2. GET /api/material-requests/:title

**Purpose:** Get Material Request details

**Response:**
```json
{
  "ok": true,
  "data": {
    "title": "MR-0001",
    "status": "Submitted",
    "items": [
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "requested_qty": 20.00,
        "picked_qty": 0.00,
        "status": "Pending"
        // Note: carton_id not available at MR level, only during picking
      }
    ]
  }
}
```

**Notes:**
- Carton ID is not stored at Material Request level
- Carton ID is only provided during picking operation

---

## 🔍 CYCLE COUNT API ENDPOINTS

### 1. POST /api/cycle-count/:title/count

**Purpose:** Submit cycle count lines with actual quantities

**Request:**
```json
{
  "counted_by": "USER-001",
  "lines": [
    {
      "line_id": "LINE-1",  // Optional: Database ID or "LINE-{id}"
      "item_code": "SKU-001",
      "bin_location": "A1-R01-L1-B1",
      "carton_id": "CARTON-001",  // ✅ NEW: Required in carton-level mode
      "expected_qty": 50.00,
      "actual_qty": 48.00,
      "counted_qty": 48.00,  // Alias for actual_qty
      "discrepancy_reason": "Damaged items found"
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Count lines updated successfully",
  "data": {
    "task": "CC-0001",
    "lines_updated": 1,
    "total_items": 10,
    "counted_items": 1,
    "items_with_discrepancy": 1,
    "lines": [
      {
        "line_id": "LINE-1",
        "item_code": "SKU-001",
        "carton_id": "CARTON-001",  // ✅ NEW
        "bin_location": "A1-R01-L1-B1",
        "expected_qty": 50.00,
        "actual_qty": 48.00,
        "discrepancy": -2.00,
        "status": "Counted"
      }
    ]
  }
}
```

**Notes:**
- ✅ **NEW:** Accepts `carton_id` in request lines
- ✅ **NEW:** Stores `carton_id` in `tabCycleCountLine`
- ✅ **NEW:** Validates carton exists in bin (carton-level mode)
- ✅ **NEW:** Includes `carton_id` in response

---

### 2. GET /api/cycle-count/:title

**Purpose:** Get Cycle Count Task details with lines

**Response:**
```json
{
  "ok": true,
  "data": {
    "title": "CC-0001",
    "status": "In Progress",
    "count_type": "Directed",
    "warehouse": "WH-MAIN",
    "items": [
      {
        "line_id": "LINE-1",
        "item_code": "SKU-001",
        "carton_id": "CARTON-001",  // ✅ NEW
        "bin_location": "A1-R01-L1-B1",
        "expected_qty": 50.00,
        "actual_qty": null,
        "counted_qty": null,
        "variance_qty": null,
        "discrepancy": null,
        "status": "Pending"
      }
    ]
  }
}
```

**Notes:**
- ✅ **NEW:** Includes `carton_id` in cycle count line responses

---

### 3. GET /api/cycle-count

**Purpose:** Get list of Cycle Count Tasks

**Query Parameters:**
- `status` (optional): Filter by status (comma-separated)
- `warehouse` (optional): Filter by warehouse
- `zone` (optional): Filter by zone
- `count_type` (optional): Filter by count type

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "title": "CC-0001",
      "status": "In Progress",
      "count_type": "Directed",
      "warehouse": "WH-MAIN",
      "total_items": 10,
      "counted_items": 5,
      "items_with_discrepancy": 1,
      "items": []  // Lines not included in list view
    }
  ]
}
```

**Notes:**
- Lines are not included in list view (call detail endpoint for lines)

---

## 📊 STOCK TRANSACTION API ENDPOINTS

### 1. GET /api/stock-transactions

**Purpose:** Get stock transaction history (audit trail)

**Query Parameters:**
- `warehouse` (optional): Filter by warehouse
- `item_code` (optional): Filter by item code
- `transaction_type` (optional): Filter by type (Putaway, Picking, CycleCount, etc.)
- `reference_doc` (optional): Filter by reference document
- `from_date` (optional): Filter from date (YYYY-MM-DD)
- `to_date` (optional): Filter to date (YYYY-MM-DD)
- `limit` (optional): Limit results (default: 1000)

**Response:**
```json
[
  {
    "id": 1,
    "transaction_date": "2025-12-27T10:30:00.000Z",
    "transaction_type": "Putaway",
    "reference_doc_type": "Putaway Task",
    "reference_doc": "PUT-20250120-0001",
    "item_code": "SKU-001",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R01-L1-B1",
    "carton_id": "CARTON-001",  // ✅ NEW
    "qty_change": 50.00,
    "qty_before": 0.00,
    "qty_after": 50.00,
    "source_bin": "DOCK-01",
    "target_bin": "A1-R01-L1-B1",
    "performed_by": "USER-001",
    "notes": null,
    "created_at": "2025-12-27T10:30:00.000Z"
  }
]
```

**Notes:**
- ✅ **NEW:** Includes `carton_id` in all transaction responses
- ✅ `carton_id` is `null` for bin-level transactions

---

## 🎯 IMPLEMENTATION CHECKLIST FOR MOBILE APP

### Putaway Operations
- [ ] Include `carton_id` in putaway complete request items
- [ ] Handle `carton_id` in putaway task list responses
- [ ] Display carton information in putaway UI

### Picking Operations
- [ ] Include `carton_id` in pick items request
- [ ] Validate carton exists and is in correct bin before picking
- [ ] Handle carton validation errors (CARTON_NOT_FOUND, CARTON_BIN_MISMATCH)
- [ ] Display carton information in picking UI
- [ ] Show `carton_stock_updated` flag in response

### Cycle Count Operations
- [ ] Include `carton_id` in count lines request
- [ ] Display `carton_id` in cycle count line responses
- [ ] Support carton-level counting workflow

### Stock Transaction Queries
- [ ] Display `carton_id` in transaction history
- [ ] Filter transactions by `carton_id` (if needed)

---

## 🔄 BACKWARD COMPATIBILITY

All endpoints maintain backward compatibility:

1. **Carton ID is OPTIONAL** in requests
   - If not provided, system uses bin-level inventory
   - If provided, system uses carton-level inventory

2. **Carton ID is always included** in responses when available
   - Mobile app can safely ignore if not using carton-level mode

3. **System automatically detects** carton-level mode
   - No need to check settings
   - System validates carton tables exist before using carton operations

---

## 📝 ERROR HANDLING

### Common Errors

**CARTON_NOT_FOUND (400)**
- Carton ID provided but carton doesn't exist
- **Action:** Verify carton ID or create carton first

**CARTON_BIN_MISMATCH (400)**
- Carton is not in the specified bin
- **Action:** Verify carton location or move carton to correct bin

**INSUFFICIENT_CARTON_STOCK (400)**
- Not enough stock in carton for picking
- **Action:** Check carton stock or use different carton

**INSUFFICIENT_STOCK (400)**
- Not enough stock in bin (bin-level mode)
- **Action:** Check bin stock or use different bin

---

## 🚀 TESTING

### Test Scenarios

1. **Putaway with Carton ID**
   - Create putaway task
   - Complete putaway with `carton_id`
   - Verify carton stock updated

2. **Picking with Carton ID**
   - Pick items with `carton_id`
   - Verify carton validation
   - Verify carton stock reduced

3. **Cycle Count with Carton ID**
   - Submit count with `carton_id`
   - Verify carton ID stored in line
   - Verify carton ID in response

4. **Stock Transaction with Carton ID**
   - Query transactions
   - Verify `carton_id` included in response

---

## 📞 SUPPORT

For questions or issues:
1. Check error messages for specific error codes
2. Verify carton tables exist (carton-level mode)
3. Verify carton exists and is in correct bin
4. Check API response for `carton_stock_updated` flag

---

**Last Updated:** 2026-01-07  
**API Version:** 1.0  
**Status:** ✅ Production Ready

