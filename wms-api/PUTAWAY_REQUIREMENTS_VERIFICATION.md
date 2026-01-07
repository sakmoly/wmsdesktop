# Putaway Task Generation and Management - Requirements Verification

## Overview

Verifying if backend endpoints meet the requirements for putaway task generation and management.

---

## 1. ✅ `/api/boxes/close` - Create Putaway Task

### Status: **IMPLEMENTED** ✅

**Location:** `wms-api/src/modules/boxes/boxController.js` (function: `closeBox`)

### Requirements Check:

- ✅ **Closes box** (updates status to "Closed")
- ✅ **Checks warehouse_type = 'Warehouse'** (uses ONLY `tabWarehouse.warehouse_type = 'Warehouse'`)
- ✅ **Creates putaway task automatically** for warehouse boxes
- ✅ **Gets items from tabWmsScanEvent** (event_type = 'SORT_TO_BOX')
- ✅ **Creates putaway task lines** in `tabPutawayLine`
- ✅ **Returns putaway_task in response**

### Response Format:
✅ Matches requirements:
```json
{
  "ok": true,
  "box_id": "BOX-WHMAIN-306647",
  "status": "Closed",
  "putaway_task": "PUT-20260101-0001",
  "message": "Box closed successfully. Putaway task created."
}
```

### Notes:
- ✅ Uses `advance_shipping_notice` column (not `asn_no`)
- ✅ Uses `warehouse_type = 'Warehouse'` (no hardcoded values)
- ✅ Gets items from `tabWmsScanEvent` (not `tabScannedItems`)
- ✅ Creates task with `source_type = 'Box'` and `box_id`

**Action Required:** ✅ **NONE** - Fully implemented

---

## 2. ⚠️ `GET /api/putaway/tasks` - List Putaway Tasks

### Status: **IMPLEMENTED BUT NEEDS RESPONSE FORMAT UPDATE** ⚠️

**Location:** `wms-api/src/modules/putaway/putawayController.js` (function: `getTasks`)

### Requirements Check:

- ✅ **Returns putaway tasks from backend**
- ✅ **Includes items from tabPutawayLine**
- ✅ **Supports filtering** by status, source_type, advance_shipping_notice
- ⚠️ **Response format doesn't match requirements**

### Current Response Format:
```json
[
  {
    "title": "PUT-20260101-0001",
    "status": "Open",
    "source_type": "Box",
    "advance_shipping_notice": "ASN-12225",
    "created_by": "USER-786249",
    "created_at": "2026-01-01T10:00:00Z",
    "items": [...]
  }
]
```

### Required Response Format:
```json
{
  "ok": true,
  "data": [
    {
      "putaway_task": "PUT-20260101-0001",
      "box_id": "BOX-WHMAIN-306647",
      "tc_id": null,
      "asn_no": "ASN-12225",
      "rack": null,
      "bin": null,
      "status": "Open",
      "source_type": "Box",
      "created_on": "2026-01-01T10:00:00Z",
      "created_by": "USER-786249",
      "lines_count": 2,
      "items": [...]
    }
  ]
}
```

### Missing Fields:
- ❌ Response not wrapped in `{ok: true, data: [...]}`
- ❌ `title` should be `putaway_task`
- ❌ `advance_shipping_notice` should be `asn_no`
- ❌ Missing `box_id` field
- ❌ Missing `tc_id` field
- ❌ Missing `rack` field
- ❌ Missing `bin` field
- ❌ `created_at` should be `created_on`
- ❌ Missing `lines_count` field

**Action Required:** ⚠️ **UPDATE RESPONSE FORMAT** - Need to modify `getTasks` function

---

## 3. ✅ `/api/putaway/scan-transfer-carton` - Update Location

### Status: **IMPLEMENTED** ✅

**Location:** `wms-api/src/modules/putaway/putawayController.js` (function: `scanTransferCarton`)

### Requirements Check:

- ✅ **Accepts putaway_task parameter**
- ✅ **Accepts box_id parameter**
- ✅ **Updates putaway task with location** (rack, bin)
- ✅ **Updates putaway task status to "In Progress"**
- ✅ **Updates putaway task lines with location**
- ✅ **Finds putaway task by box_id** if putaway_task not provided

### Notes:
- ✅ When `box_id` provided, finds putaway task by `box_id`
- ✅ Updates `tabPutawayTask.rack` and `tabPutawayTask.bin`
- ✅ Updates `tabPutawayLine.rack` and `tabPutawayLine.bin` for all lines
- ✅ Updates status to "In Progress"

**Action Required:** ✅ **NONE** - Fully implemented

---

## 4. ✅ `/api/putaway/complete` - Complete Putaway and Update Stock

### Status: **IMPLEMENTED** ✅

**Location:** `wms-api/src/modules/putaway/putawayController.js` (function: `completePutaway`)

### Requirements Check:

- ✅ **Updates putaway task status to "Completed"**
- ✅ **Updates stock at location** (adds items to `tabStockLedger`)
- ✅ **Returns stock update details** (qty_before, qty_after)

### Response Format:
✅ Matches requirements:
```json
{
  "ok": true,
  "message": "Putaway completed successfully",
  "data": {
    "putaway_task": "PUT-20260101-0001",
    "status": "Completed",
    "stock_updated": true,
    "warehouse": "Main Warehouse",
    "items_updated": 2,
    "stock_updates": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "location": "A1-R01-L1-B1-B1",
        "qty_added": 75.0,
        "qty_before": 100.0,
        "qty_after": 175.0
      }
    ]
  }
}
```

**Action Required:** ✅ **NONE** - Fully implemented

---

## Summary

| Endpoint | Status | Action Required |
|----------|--------|-----------------|
| `/api/boxes/close` | ✅ Complete | None |
| `GET /api/putaway/tasks` | ⚠️ Needs Update | Update response format |
| `/api/putaway/scan-transfer-carton` | ✅ Complete | None |
| `/api/putaway/complete` | ✅ Complete | None |

---

## Required Changes

### Only 1 Endpoint Needs Update: `GET /api/putaway/tasks`

**File:** `wms-api/src/modules/putaway/putawayController.js`  
**Function:** `getTasks` (lines 48-181)

**Changes Needed:**
1. Wrap response in `{ok: true, data: [...]}`
2. Map field names:
   - `title` → `putaway_task`
   - `advance_shipping_notice` → `asn_no`
   - `created_at` → `created_on`
3. Add missing fields:
   - `box_id` (from `tabPutawayTask.box_id`)
   - `tc_id` (from `tabPutawayTask.tc_id`)
   - `rack` (from `tabPutawayTask.rack`)
   - `bin` (from `tabPutawayTask.bin`)
   - `lines_count` (count of items)

