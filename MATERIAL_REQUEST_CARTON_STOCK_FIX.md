# Material Request Carton Stock Reduction Fix

## Issue

**Problem:** When picking items for Material Request, stock is reduced at item level (`tabItem.stock_qty`) but NOT at Location ID (bin level) and Carton level.

**Symptoms:**
- Item Location Breakdown shows old quantities (e.g., 142.00)
- Main Items table shows reduced stock (e.g., 142)
- Stock not reduced in `tabCartonStock` table
- Stock not reduced at bin level in `tabStockLedger`

---

## Root Cause

**In Bin-Level Mode:**
- The code only updated `tabCartonStock` if `carton_id` existed in the stock ledger (`stockLedgerCartonId`)
- It did NOT use `carton_id` from the request body
- If stock ledger didn't have `carton_id`, `tabCartonStock` was never updated

**The Problem:**
```javascript
// OLD CODE - Only used carton_id from stock ledger
if (stockLedgerCartonId) {  // ← Only updates if carton_id exists in stock ledger
  // Update tabCartonStock
}
```

**Mobile App Was Sending:**
```json
{
  "items": [{
    "item_code": "SKU-JACKET-201-BLK-L",
    "picked_qty": 2,
    "source_bin": "A1-R01-L3-B1",
    "carton_id": "CTN-555444"  // ← This was being ignored!
  }]
}
```

---

## Fix Applied

### Updated `pickMaterialRequestItems` Function

**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**Changes:**
1. ✅ Use `carton_id` from request if provided, otherwise use from stock ledger
2. ✅ Update `tabStockLedger` with `carton_id` from request (if provided)
3. ✅ Update `tabCartonStock` using `carton_id` from request (if provided)
4. ✅ Use `INSERT ... ON DUPLICATE KEY UPDATE` for `tabCartonStock` to handle both insert and update

**New Code:**
```javascript
// Use carton_id from request if provided, otherwise use from stock ledger
const finalCartonId = carton_id || stockLedgerCartonId || null;

// Include carton_id in stock ledger update if provided
if (hasStockLedgerCartonIdColumn && finalCartonId) {
  insertFields += `, carton_id`;
  insertValues += `, ?`;
  insertParams.push(finalCartonId);
  updateFields += `, carton_id = ?`;
  updateParams.push(finalCartonId);
}

// Update stock ledger at bin level
await connection.execute(`
  INSERT INTO tabStockLedger 
    (${insertFields})
  VALUES (${insertValues})
  ON DUPLICATE KEY UPDATE
    ${updateFields}
`, [...insertParams, ...updateParams]);

// Update tabCartonStock if carton_id is provided
if (finalCartonId) {
  // Update or insert carton stock
  await connection.execute(`
    INSERT INTO tabCartonStock 
      (carton_id, item_code, bin_location, warehouse, qty, status, updated_at)
    VALUES (?, ?, ?, ?, ?, 'PUTAWAY', NOW())
    ON DUPLICATE KEY UPDATE
      qty = ?,
      updated_at = NOW(),
      status = 'PUTAWAY'
  `, [finalCartonId, item_code, source_bin, targetWarehouse, newCartonQty, newCartonQty]);
}
```

---

## Mobile App Requirements

### ✅ Mobile App MUST Send:

**When Picking Items:**
```json
{
  "items": [
    {
      "item_code": "SKU-JACKET-201-BLK-L",
      "picked_qty": 2.00,
      "source_bin": "A1-R01-L3-B1",  // ← REQUIRED: Bin location
      "carton_id": "CTN-555444"       // ← REQUIRED: Carton ID (if carton-level inventory)
    }
  ],
  "user_id": "USER-150526",
  "warehouse": "WH-MAIN"
}
```

**Critical Fields:**
- ✅ `source_bin` - **REQUIRED**: Bin location (location_id) where item is picked from
- ✅ `carton_id` - **REQUIRED** (if carton-level inventory): Carton ID containing the item
- ✅ `item_code` - Item code
- ✅ `picked_qty` - Quantity to pick

---

## What Gets Updated

### 1. **tabStockLedger** (Bin-Level Stock)
- ✅ Updated at `bin_location = source_bin`
- ✅ `qty` reduced by `picked_qty`
- ✅ `carton_id` set if provided in request
- ✅ `qty_before` and `qty_reduced` updated

### 2. **tabCartonStock** (Carton-Level Stock)
- ✅ Updated for `carton_id` from request
- ✅ `qty` reduced by `picked_qty`
- ✅ `bin_location` set to `source_bin`
- ✅ `status` set to 'PUTAWAY'

### 3. **tabItem** (Item-Level Stock)
- ✅ `stock_qty` updated (sum of all bins)

### 4. **tabStockTransaction** (Transaction History)
- ✅ New transaction log entry created
- ✅ Records `qty_before`, `qty_after`, `qty_change`

---

## Verification

### Check Stock Reduction in Database

**1. Check tabStockLedger (Bin Level):**
```sql
SELECT 
  item_code,
  warehouse,
  bin_location,
  carton_id,
  qty,
  qty_before,
  qty_reduced,
  last_transaction_type,
  last_transaction_ref
FROM tabStockLedger
WHERE item_code = 'SKU-JACKET-201-BLK-L'
  AND warehouse = 'WH-MAIN'
  AND bin_location = 'A1-R01-L3-B1';
```

**Expected:**
- `qty` should be reduced (e.g., 144.00 → 142.00)
- `qty_reduced` should be negative (e.g., -2.00)
- `carton_id` should be set (e.g., 'CTN-555444')
- `last_transaction_type` should be 'Picking'

**2. Check tabCartonStock (Carton Level):**
```sql
SELECT 
  carton_id,
  item_code,
  bin_location,
  warehouse,
  qty,
  status
FROM tabCartonStock
WHERE carton_id = 'CTN-555444'
  AND item_code = 'SKU-JACKET-201-BLK-L'
  AND bin_location = 'A1-R01-L3-B1';
```

**Expected:**
- `qty` should be reduced (e.g., 144.00 → 142.00)
- `status` should be 'PUTAWAY'
- `bin_location` should match `source_bin`

**3. Check Item Location Breakdown:**
- Open Item Location Breakdown for the item
- Click "Refresh" button
- Bin `A1-R01-L3-B1` should show reduced quantity (e.g., 142.00)
- Carton `CTN-555444` should show reduced quantity

---

## API Endpoint

### **POST /api/material-requests/:title/pick-items**

**URL:** `POST http://YOUR_API_BASE_URL/api/material-requests/MR-123460/pick-items`

**Request:**
```json
{
  "items": [
    {
      "item_code": "SKU-JACKET-201-BLK-L",
      "picked_qty": 2.00,
      "source_bin": "A1-R01-L3-B1",
      "carton_id": "CTN-555444"
    }
  ],
  "user_id": "USER-150526",
  "warehouse": "WH-MAIN"
}
```

**What It Does:**
1. ✅ Updates `tabMaterialRequestItem.picked_qty`
2. ✅ **Reduces stock from `tabStockLedger` at bin level** (`bin_location = source_bin`)
3. ✅ **Reduces stock from `tabCartonStock`** (`carton_id` from request)
4. ✅ Updates `tabItem.stock_qty` (aggregated total)
5. ✅ Creates transaction log in `tabStockTransaction`

---

## Mobile App Implementation

### Step-by-Step:

1. **User scans item barcode** → Get `item_code`
2. **User scans bin location barcode** → Get `source_bin` (location_id)
3. **User scans carton barcode** → Get `carton_id` (if carton-level inventory)
4. **User enters quantity** → Get `picked_qty`
5. **Call API:**
   ```javascript
   await fetch(`${API_BASE_URL}/api/material-requests/${materialRequest}/pick-items`, {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${token}`,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       items: [{
         item_code: itemCode,
         picked_qty: pickedQty,
         source_bin: sourceBin,      // ← REQUIRED
         carton_id: cartonId          // ← REQUIRED (if carton-level)
       }],
       user_id: userId,
       warehouse: warehouse
     })
   });
   ```

---

## Summary

### ✅ Fixed:
- ✅ `tabCartonStock` now updates using `carton_id` from request
- ✅ `tabStockLedger` now includes `carton_id` from request
- ✅ Stock reduction happens at both bin level and carton level

### ✅ Mobile App Must Send:
- ✅ `source_bin` - Bin location (location_id)
- ✅ `carton_id` - Carton ID (if carton-level inventory)

### ✅ Result:
- ✅ Item Location Breakdown will show updated quantities
- ✅ Both bin-level and carton-level stock are reduced
- ✅ Transaction history is maintained

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-13
