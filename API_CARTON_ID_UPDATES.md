# API Endpoints - Carton ID Tracking Updates

## 📋 Overview

This document outlines all API endpoint updates required to support carton_id tracking for:
1. **Putaway** operations
2. **Picking/Takeaway** (Material Request) operations  
3. **Cycle Count** operations
4. **Stock Transaction** GET responses

---

## 🔧 Helper Functions Needed

### 1. Check if Carton Tables Exist
```javascript
async function checkCartonTablesExist(connection) {
  const [tables] = await connection.execute(`
    SELECT COUNT(*) as count
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME IN ('tabCarton', 'tabCartonItem', 'tabCartonStock', 'tabBin')
  `);
  return tables[0].count === 4;
}
```

### 2. Update Carton Stock (for carton-level mode)
```javascript
async function updateCartonStock(connection, cartonId, itemCode, warehouse, binLocation, qtyChange) {
  // Check if carton exists, create if not
  // Update tabCartonStock
  // Update tabCarton.current_bin_id if moving bins
}
```

---

## 📦 PUTAWAY API UPDATES

### 1. POST /api/putaway/complete

**Current Status:** ✅ Already has carton_id support in putaway lines

**Required Updates:**
- ✅ Accept `carton_id` in request items (already supported)
- ⚠️ **UPDATE:** When carton_id is provided, update `tabCartonStock` instead of/in addition to `tabStockLedger`
- ⚠️ **UPDATE:** Create/update carton records in `tabCarton` and `tabCartonItem` tables
- ⚠️ **UPDATE:** Include `carton_id` in stock transaction log

**Request Body (Updated):**
```json
{
  "putaway_task": "PUT-20250120-0001",
  "performed_by": "USER-002",
  "items": [
    {
      "item_code": "SKU-001",
      "qty": 50.00,
      "carton_id": "CARTON-001",  // ✅ NEW: Required in carton-level mode
      "source_bin": "DOCK-01",
      "target_bin": "A1-R01-L1-B1",  // location_id format
      "completed": true
    }
  ]
}
```

**Response (Updated):**
```json
{
  "ok": true,
  "message": "Putaway completed successfully",
  "data": {
    "putaway_task": "PUT-20250120-0001",
    "items_processed": 1,
    "carton_stock_updated": true,  // ✅ NEW
    "stock_updates": [...]
  }
}
```

### 2. POST /api/putaway/assign-rack

**Current Status:** ✅ Already accepts carton_id

**Required Updates:**
- ✅ Already supports carton_id (no changes needed)

### 3. POST /api/putaway/scan-transfer-carton

**Current Status:** ✅ Already handles carton_id

**Required Updates:**
- ✅ Already supports carton_id (no changes needed)

### 4. GET /api/putaway/tasks

**Current Status:** ✅ Already returns carton_id in lines

**Required Updates:**
- ✅ Already includes carton_id (no changes needed)

---

## 📤 PICKING/TAKEAWAY API UPDATES

### 1. POST /api/material-requests/:title/pick-items

**Current Status:** ❌ Does NOT support carton_id

**Required Updates:**
- ⚠️ **ADD:** Accept `carton_id` in request items
- ⚠️ **ADD:** Validate carton exists and is in correct bin (carton-level mode)
- ⚠️ **ADD:** Update `tabCartonStock` when carton_id provided
- ⚠️ **ADD:** Update carton status to "PICKED"
- ⚠️ **ADD:** Include `carton_id` in stock transaction log

**Request Body (Updated):**
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
  "warehouse": "WH-MAIN"
}
```

**Response (Updated):**
```json
{
  "ok": true,
  "message": "Items picked successfully",
  "data": {
    "material_request": "MR-0001",
    "items_picked": 1,
    "carton_stock_updated": true,  // ✅ NEW
    "stock_updates": [
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "carton_id": "CARTON-001",  // ✅ NEW
        "source_bin": "A1-R01-L1-B1",
        "qty_reduced": 20.0,
        "qty_before": 50.0,
        "qty_after": 30.0
      }
    ]
  }
}
```

### 2. GET /api/material-requests/:title

**Current Status:** ❌ Does NOT return carton_id

**Required Updates:**
- ⚠️ **ADD:** Include `carton_id` in item responses (if available from putaway/carton stock)

---

## 🔍 CYCLE COUNT API UPDATES

### 1. POST /api/cycle-count/:title/count (updateCountLines)

**Current Status:** ❌ Does NOT support carton_id

**Required Updates:**
- ⚠️ **ADD:** Accept `carton_id` in request lines
- ⚠️ **ADD:** Store `carton_id` in `tabCycleCountLine`
- ⚠️ **ADD:** Validate carton exists in bin (carton-level mode)
- ⚠️ **ADD:** Include `carton_id` in response

**Request Body (Updated):**
```json
{
  "counted_by": "USER-001",
  "lines": [
    {
      "line_id": "LINE-1",
      "item_code": "SKU-001",
      "bin_location": "A1-R01-L1-B1",
      "carton_id": "CARTON-001",  // ✅ NEW: Required in carton-level mode
      "expected_qty": 50.00,
      "actual_qty": 48.00,
      "counted_qty": 48.00
    }
  ]
}
```

**Response (Updated):**
```json
{
  "ok": true,
  "message": "Count lines updated successfully",
  "data": {
    "task": "CC-0001",
    "lines_updated": 1,
    "lines": [
      {
        "line_id": "LINE-1",
        "item_code": "SKU-001",
        "carton_id": "CARTON-001",  // ✅ NEW
        "bin_location": "A1-R01-L1-B1",
        "expected_qty": 50.00,
        "actual_qty": 48.00,
        "discrepancy": -2.00
      }
    ]
  }
}
```

### 2. GET /api/cycle-count/:title

**Current Status:** ❌ Does NOT return carton_id

**Required Updates:**
- ⚠️ **ADD:** Include `carton_id` in cycle count line responses

**Response (Updated):**
```json
{
  "title": "CC-0001",
  "status": "In Progress",
  "items": [
    {
      "line_id": "LINE-1",
      "item_code": "SKU-001",
      "carton_id": "CARTON-001",  // ✅ NEW
      "bin_location": "A1-R01-L1-B1",
      "expected_qty": 50.00,
      "actual_qty": null
    }
  ]
}
```

---

## 📊 STOCK TRANSACTION API UPDATES

### 1. GET /api/stock-transactions

**Current Status:** ❌ Does NOT return carton_id

**Required Updates:**
- ⚠️ **ADD:** Include `carton_id` in SELECT query
- ⚠️ **ADD:** Include `carton_id` in response

**Response (Updated):**
```json
[
  {
    "id": 1,
    "transaction_date": "2025-12-27T10:30:00.000Z",
    "transaction_type": "Putaway",
    "item_code": "ITEM-001",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R01-L1-B1",
    "carton_id": "CARTON-001",  // ✅ NEW
    "qty_change": 50.00,
    "qty_before": 0.00,
    "qty_after": 50.00,
    "source_bin": "DOCK-01",
    "target_bin": "A1-R01-L1-B1"
  }
]
```

---

## 🎯 IMPLEMENTATION PRIORITY

1. **HIGH PRIORITY:**
   - ✅ Putaway Complete - Update carton stock
   - ✅ Material Request Pick Items - Add carton_id support
   - ✅ Cycle Count Update Lines - Add carton_id support

2. **MEDIUM PRIORITY:**
   - ✅ Stock Transaction GET - Include carton_id
   - ✅ Cycle Count GET - Include carton_id
   - ✅ Material Request GET - Include carton_id

3. **LOW PRIORITY:**
   - Helper functions for carton operations
   - Carton validation functions

---

## 📝 NOTES

- **Carton ID is OPTIONAL** in requests (for backward compatibility)
- **Carton ID is REQUIRED** when system is in carton-level mode
- **Check carton tables exist** before using carton-level operations
- **Fallback to bin-level** if carton tables don't exist
- **Always include carton_id in responses** when available

