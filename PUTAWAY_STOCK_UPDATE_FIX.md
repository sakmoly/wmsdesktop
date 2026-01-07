# Putaway Stock Update Fix

## ✅ Issue Fixed

**Problem:** Stock was not being updated in the Items table when putaway tasks were completed via the mobile app. The putaway task status remained "Draft" and stock quantities stayed at 0.

**Root Cause:** The `POST /api/putaway/scan-transfer-carton` endpoint was creating/updating putaway tasks and assigning locations, but it was NOT:
1. Updating the stock ledger (`tabStockLedger`)
2. Updating `tabItem.stock_qty`
3. Marking the putaway task as "Completed"

Stock was only updated when `POST /api/putaway/complete` was explicitly called, but the mobile app was using event-based tracking and scanning locations directly.

---

## ✅ Solution Implemented

### 1. Updated `scanTransferCarton` Function

**File:** `wms-api/src/modules/putaway/putawayController.js`

**Changes:**
- When a location (rack/bin) is scanned, the function now automatically:
  1. Updates `tabStockLedger` for each item at the specified location
  2. Creates stock transaction records for audit trail
  3. Updates `tabItem.stock_qty` by summing all locations for each item
  4. Marks the putaway task status as "Completed"

**Flow:**
```
Scan Box/TC + Location
  ↓
Create/Update Putaway Task & Lines
  ↓
Update Stock Ledger (add qty to location)
  ↓
Create Stock Transaction Records
  ↓
Update tabItem.stock_qty (sum all locations)
  ↓
Mark Task as "Completed"
```

---

### 2. Updated `updatePutawayTaskLocation` Function

**File:** `wms-api/src/modules/putaway/putawayController.js`

**Changes:**
- When a location is scanned separately (after box/TC was scanned), the function now:
  1. Updates all putaway lines with the new location
  2. Updates stock ledger for each item
  3. Updates `tabItem.stock_qty`
  4. Marks the task as "Completed"

This supports the two-step workflow where:
- Step 1: Scan box/TC → Creates putaway task
- Step 2: Scan location → Updates location and completes putaway (with stock update)

---

## 📊 Stock Update Details

### Stock Ledger Update
- **Location Format:** `{rack}-{bin}` (e.g., "STAGE-01-SL-01")
- **Warehouse:** Retrieved from ASN or defaults to "Main Warehouse"
- **Quantity:** Added to existing stock at that location
- **Transaction Type:** "Putaway"
- **Reference:** Putaway task ID

### Item Stock Update
- `tabItem.stock_qty` is updated to the sum of all locations for that item:
  ```sql
  UPDATE tabItem
  SET stock_qty = (
    SELECT COALESCE(SUM(qty), 0)
    FROM tabStockLedger 
    WHERE item_code = ?
  )
  WHERE code = ?
  ```

### Stock Transaction Log
- Each putaway completion creates a transaction record in `tabStockTransaction`:
  - Transaction type: "Putaway"
  - Reference document: Putaway task ID
  - Quantity change, before/after quantities
  - Source/target bin locations

---

## 🔄 API Response Changes

### `POST /api/putaway/scan-transfer-carton`

**New Response Fields:**
```json
{
  "ok": true,
  "message": "Putaway task created and items assigned successfully",
  "data": {
    "putaway_task": "PUT-20251229-0001",
    "status": "Completed",  // ← Now shows "Completed"
    "stock_updated": true,   // ← New field
    "warehouse": "Main Warehouse",
    "stock_updates": [      // ← New field
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "location": "STAGE-01-SL-01",
        "qty_added": 50,
        "qty_before": 0,
        "qty_after": 50
      }
    ],
    ...
  }
}
```

### `POST /api/putaway/update-task-location` (via scan-transfer-carton)

**New Response Fields:**
```json
{
  "ok": true,
  "message": "Putaway task location updated successfully",
  "data": {
    "putaway_task": "PUT-20251229-0001",
    "status": "Completed",  // ← Now shows "Completed"
    "stock_updated": true, // ← New field
    "warehouse": "Main Warehouse",
    "stock_updates": [...], // ← New field
    ...
  }
}
```

---

## ✅ Testing Checklist

After deploying this fix, verify:

- [ ] **Putaway Task Status:** When location is scanned, task status changes to "Completed"
- [ ] **Stock Ledger:** Items appear in `tabStockLedger` with correct location and quantity
- [ ] **Item Stock:** `tabItem.stock_qty` is updated correctly (sum of all locations)
- [ ] **Desktop App:** Items screen shows updated stock quantities
- [ ] **Stock Transactions:** Transaction records are created in `tabStockTransaction`
- [ ] **Location Breakdown:** Item location breakdown shows correct quantities per location

---

## 📝 Summary

**Before:** 
- Putaway tasks remained "Draft" after location scan
- Stock was not updated
- Items showed 0 stock quantity

**After:**
- Putaway tasks are automatically marked "Completed" when location is scanned
- Stock ledger is updated with correct location and quantity
- `tabItem.stock_qty` reflects the sum of all locations
- Desktop app shows correct stock quantities immediately

**Impact:** 
- ✅ Stock is now automatically updated when putaway is completed via mobile app
- ✅ No need to manually call `POST /api/putaway/complete` separately
- ✅ Works with both API-based and event-based tracking workflows

