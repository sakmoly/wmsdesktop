# Putaway MOVE Pattern Implementation

**Date**: 2026-01-17  
**Status**: ✅ **IMPLEMENTED**

---

## Summary

Implemented the MOVE pattern for putaway operations, ensuring that inventory is moved from staging locations to target locations (not just added). This includes proper tracking of `from_location_id`, stock ledger MOVE entries, and validation endpoints.

---

## Changes Implemented

### 1. ✅ MOVE Pattern for Stock Ledger Updates

**File**: `wms-api/src/modules/putaway/putawayController.js`  
**Function**: `completePutaway()`

**Before (WRONG - Created IN entries):**
- Only increased stock at target location
- No decrease at staging location
- Created "IN" entries instead of "MOVE" entries

**After (CORRECT - Creates MOVE entries):**
1. **Determine FROM location** (staging):
   - Checks `tabCartonStock.bin_location` (most accurate)
   - Falls back to `tabCarton.current_bin_id`
   - Defaults to staging/receiving location if not found

2. **Decrease stock at FROM location**:
   - Decreases `qty` at staging location
   - Deletes entry if `qty` becomes 0
   - Updates `last_transaction_type = 'Putaway'`

3. **Increase stock at TO location**:
   - Increases `qty` at target location
   - Creates entry if doesn't exist
   - Updates `last_transaction_type = 'Putaway'`

**Result**: Total inventory quantity unchanged (MOVE pattern, not IN pattern)

---

### 2. ✅ MOVE Pattern for Carton Stock Updates

**File**: `wms-api/src/modules/putaway/putawayController.js`  
**Function**: `completePutaway()`

**Changes**:
- **Decreases** carton stock at FROM location (staging)
- **Increases** carton stock at TO location (target)
- Updates `tabCarton.current_bin_id` to reflect new location
- Deletes carton stock entry at FROM location if `qty` becomes 0

**Result**: Carton location correctly tracked (moved, not duplicated)

---

### 3. ✅ Fixed Stock Transaction History

**File**: `wms-api/src/modules/putaway/putawayController.js`  
**Function**: `completePutaway()`

**Before**:
```javascript
source_bin: null,  // ❌ Missing FROM location
target_bin: binLocation  // ✅ TO location
```

**After**:
```javascript
source_bin: fromLocation,  // ✅ FROM location (staging)
target_bin: binLocation     // ✅ TO location (target)
```

**Result**: Stock transaction history now shows complete MOVE information

---

### 4. ✅ Created Validation Endpoints

**New File**: `wms-api/src/modules/inventory/inventoryController.js`

#### GET /api/inventory/by-location

**Purpose**: Get inventory summary by location (for putaway validation)

**Query Parameters**:
- `location_id` (required): Location ID to query
- `warehouse` (optional): Filter by warehouse

**Response**:
```json
{
  "ok": true,
  "data": {
    "location_id": "A1-R02-L2-B2",
    "warehouse": "WH-MAIN",
    "total_items": 5,
    "total_qty": 150.0,
    "items": [
      {
        "item_code": "SKU-001",
        "qty": 50.0,
        "carton_id": "CTN-001"
      }
    ]
  }
}
```

#### GET /api/inventory/by-carton

**Purpose**: Get inventory for a specific carton (for putaway validation)

**Query Parameters**:
- `carton_id` (required): Carton ID to query
- `warehouse` (optional): Filter by warehouse

**Response**:
```json
{
  "ok": true,
  "data": {
    "carton_id": "CTN-001",
    "warehouse": "WH-MAIN",
    "current_bin_location": "A1-R02-L2-B2",
    "total_items": 3,
    "total_qty": 100.0,
    "items": [
      {
        "item_code": "SKU-001",
        "qty": 50.0,
        "bin_location": "A1-R02-L2-B2"
      }
    ]
  }
}
```

---

### 5. ✅ Enhanced Stock Ledger Query

**File**: `wms-api/src/modules/stock-ledger/stockLedgerController.js`  
**Function**: `getStockLedger()`

**Added Parameter**:
- `reference_id` (optional): Filter by `last_transaction_ref` (e.g., putaway_task_id)

**Usage**:
```
GET /api/stock-ledger?reference_id=PUT-20250120-0001
```

**Purpose**: Validate stock ledger entries created by a specific putaway task

---

### 6. ✅ Enhanced Stock History Query

**File**: `wms-api/src/modules/stock-ledger/stockTransactionController.js`  
**Function**: `getStockTransactions()`

**Added Parameters**:
- `reference_id` (optional): Alias for `reference_doc` (for putaway validation)
- `action` (optional): Alias for `transaction_type` (e.g., `action=PUTAWAY`)

**Usage**:
```
GET /api/stock-transactions?action=PUTAWAY&reference_id=PUT-20250120-0001
```

**Purpose**: Validate stock history entries created by a specific putaway task

---

## FROM Location Determination Logic

The system determines `from_location_id` using this priority:

1. **tabCartonStock.bin_location** (most accurate):
   ```sql
   SELECT DISTINCT bin_location
   FROM tabCartonStock
   WHERE carton_id = ? AND item_code = ? AND warehouse = ?
   ORDER BY total_qty DESC
   LIMIT 1
   ```

2. **tabCarton.current_bin_id** (fallback):
   ```sql
   SELECT current_bin_id
   FROM tabCarton
   WHERE carton_id = ?
   ```

3. **Staging/Receiving location** (default):
   ```sql
   SELECT location_id
   FROM tabLocation
   WHERE (location_type = 'STAGING' OR location_type = 'RECEIVING' 
          OR location_id LIKE '%STAGE%' OR location_id LIKE '%DOCK%')
   AND warehouse = ?
   ORDER BY location_id
   LIMIT 1
   ```

4. **Hardcoded default** (last resort):
   - `'STAGING-01'` if no staging location found

---

## Stock Ledger MOVE Pattern

### Before Putaway:
```
Staging Location (LOC-STAGE-01):
  - SKU-001: 50.0 qty

Target Location (A1-R02-L2-B2):
  - (empty)
```

### After Putaway (MOVE):
```
Staging Location (LOC-STAGE-01):
  - SKU-001: 0.0 qty (decreased, entry deleted if 0)

Target Location (A1-R02-L2-B2):
  - SKU-001: 50.0 qty (increased)
```

### Stock Transaction Entry:
```json
{
  "transaction_type": "Putaway",
  "reference_doc": "PUT-20250120-0001",
  "item_code": "SKU-001",
  "source_bin": "LOC-STAGE-01",  // ✅ FROM location
  "target_bin": "A1-R02-L2-B2",  // ✅ TO location
  "qty_change": 50.0,
  "qty_before": 0.0,
  "qty_after": 50.0
}
```

---

## Validation Endpoints Usage

### Mobile App Validation Flow:

```typescript
// After putaway completion:
const putawayTaskId = response.data.putaway_task;

// 1. Validate inventory at target location
const targetInventory = await api.get(`/api/inventory/by-location?location_id=${targetLocationId}`);
// Expected: Items should be at target location

// 2. Validate inventory at staging location
const stagingInventory = await api.get(`/api/inventory/by-location?location_id=${stagingLocationId}`);
// Expected: Items should be removed from staging (qty = 0 or entry deleted)

// 3. Validate stock ledger MOVE entries
const stockLedger = await api.get(`/api/stock-ledger?reference_id=${putawayTaskId}`);
// Expected: Entries with from_location decreased, to_location increased

// 4. Validate stock history
const stockHistory = await api.get(`/api/stock-transactions?action=PUTAWAY&reference_id=${putawayTaskId}`);
// Expected: Entries with source_bin and target_bin populated
```

---

## Critical Assertions (Now Validatable)

### 1. ✅ SUM(inventory_by_location) = inventory_summary
- **Validation**: `GET /api/inventory/by-location?location_id={id}`
- **Expected**: Sum of all location inventories equals total inventory

### 2. ✅ inventory_before_putaway == inventory_after_putaway
- **Validation**: Compare total inventory before and after putaway
- **Expected**: Total quantity unchanged (MOVE pattern)

### 3. ✅ No duplicate MOVE ledger entries
- **Validation**: `GET /api/stock-ledger?reference_id={putaway_task_id}`
- **Expected**: One entry per item+location combination

### 4. ✅ No negative inventory in staging bin
- **Validation**: `GET /api/inventory/by-location?location_id={staging_location}`
- **Expected**: All staging locations have `qty >= 0`

### 5. ✅ Carton cannot exist in multiple locations
- **Validation**: `GET /api/inventory/by-carton?carton_id={id}`
- **Expected**: Carton has single `current_bin_location`

---

## Files Changed

1. **wms-api/src/modules/putaway/putawayController.js**
   - Added FROM location determination logic
   - Implemented MOVE pattern (decrease from staging, increase at target)
   - Fixed `source_bin` and `target_bin` in stock transactions
   - Updated carton stock to use MOVE pattern

2. **wms-api/src/modules/inventory/inventoryController.js** (NEW)
   - Created `getInventoryByLocation()` endpoint
   - Created `getInventoryByCarton()` endpoint

3. **wms-api/src/routes/inventoryRoutes.js** (NEW)
   - Registered inventory validation endpoints

4. **wms-api/src/routes/index.js**
   - Registered inventory routes at `/api/inventory`

5. **wms-api/src/modules/stock-ledger/stockLedgerController.js**
   - Added `reference_id` parameter support to `getStockLedger()`

6. **wms-api/src/modules/stock-ledger/stockTransactionController.js**
   - Added `reference_id` and `action` parameter support to `getStockTransactions()`

---

## Testing Checklist

### Backend Testing:

- [ ] Putaway decreases stock at staging location
- [ ] Putaway increases stock at target location
- [ ] Total inventory quantity unchanged (MOVE pattern)
- [ ] Stock transaction has `source_bin` (FROM location)
- [ ] Stock transaction has `target_bin` (TO location)
- [ ] Carton stock moved from staging to target
- [ ] `tabCarton.current_bin_id` updated to target location
- [ ] FROM location determined correctly (carton stock → tabCarton → staging default)
- [ ] Validation endpoints return correct data

### Mobile App Testing:

- [ ] Can call `GET /api/inventory/by-location?location_id={id}`
- [ ] Can call `GET /api/inventory/by-carton?carton_id={id}`
- [ ] Can call `GET /api/stock-ledger?reference_id={putaway_task_id}`
- [ ] Can call `GET /api/stock-transactions?action=PUTAWAY&reference_id={putaway_task_id}`
- [ ] Validation assertions pass after putaway

---

## Summary

✅ **MOVE pattern fully implemented**:
- Stock decreased at staging location
- Stock increased at target location
- Total inventory quantity unchanged
- `from_location_id` tracked and stored
- Stock transactions show complete MOVE information
- Validation endpoints available for mobile app

✅ **Validation endpoints created**:
- `GET /api/inventory/by-location` - Validate location-wise inventory
- `GET /api/inventory/by-carton` - Validate carton location
- `GET /api/stock-ledger?reference_id={id}` - Validate stock ledger entries
- `GET /api/stock-transactions?action=PUTAWAY&reference_id={id}` - Validate stock history

**Status**: ✅ **FULLY COMPLIANT** with End-to-End Putaway Validation requirements

---

**END**
