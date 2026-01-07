# Putaway qty_before Fix

## 🔍 Issue

**Problem:** The "Qty Before" column in Stock Ledger is not being updated when completing putaway tasks.

**Root Cause:** The `completePutaway` function was not including `qty_before` and `qty_reduced` columns in the `tabStockLedger` INSERT/UPDATE query.

---

## ✅ Fix Applied

### File: `wms-api/src/modules/putaway/putawayController.js`

**Before:**
```javascript
// Update or insert stock ledger
await connection.execute(
  `
  INSERT INTO tabStockLedger 
    (item_code, warehouse, bin_location, qty, reserved_qty, 
     last_transaction_date, last_transaction_type, last_transaction_ref, 
     updated_at, created_at)
  VALUES 
    (?, ?, ?, ?, ?,
     NOW(), 'Putaway', ?, 
     NOW(), NOW())
  ON DUPLICATE KEY UPDATE
    qty = ?,
    last_transaction_date = NOW(),
    last_transaction_type = 'Putaway',
    last_transaction_ref = ?,
    updated_at = NOW()
  `,
  [...]
);
```

**After:**
```javascript
// Calculate qty_before and qty_reduced for putaway (increase stock)
const qtyBefore = currentQty;
const qtyReduced = qty; // Positive for putaway (stock increase)

// Check if qty_before and qty_reduced columns exist
const [stockLedgerColumns] = await connection.execute(`
  SELECT COLUMN_NAME 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'tabStockLedger' 
  AND COLUMN_NAME IN ('qty_before', 'qty_reduced')
`);
const hasQtyBefore = stockLedgerColumns.some(col => col.COLUMN_NAME === 'qty_before');
const hasQtyReduced = stockLedgerColumns.some(col => col.COLUMN_NAME === 'qty_reduced');

// Build INSERT/UPDATE query with optional qty_before and qty_reduced
let insertFields = `item_code, warehouse, bin_location, qty, reserved_qty`;
let insertValues = `?, ?, ?, ?, ?`;
let insertParams = [itemCode, warehouse, binLocation, newQty, currentReservedQty];

let updateFields = `qty = ?`;
let updateParams = [newQty];

if (hasQtyBefore) {
  insertFields += `, qty_before`;
  insertValues += `, ?`;
  insertParams.push(qtyBefore);
  updateFields += `, qty_before = ?`;
  updateParams.push(qtyBefore);
}

if (hasQtyReduced) {
  insertFields += `, qty_reduced`;
  insertValues += `, ?`;
  insertParams.push(qtyReduced);
  updateFields += `, qty_reduced = ?`;
  updateParams.push(qtyReduced);
}

insertFields += `, last_transaction_date, last_transaction_type, last_transaction_ref, updated_at, created_at`;
insertValues += `, NOW(), 'Putaway', ?, NOW(), NOW()`;
insertParams.push(putaway_task);

updateFields += `, last_transaction_date = NOW(), last_transaction_type = 'Putaway', last_transaction_ref = ?, updated_at = NOW()`;
updateParams.push(putaway_task);

// Update or insert stock ledger
await connection.execute(
  `
  INSERT INTO tabStockLedger 
    (${insertFields})
  VALUES 
    (${insertValues})
  ON DUPLICATE KEY UPDATE
    ${updateFields}
  `,
  [...insertParams, ...updateParams]
);
```

---

## 📊 How It Works

### For Putaway (Stock Increase):

**Example:**
- Current stock: 0.00
- Putaway quantity: 2.00
- New stock: 2.00

**Values stored:**
- `qty_before`: 0.00 (quantity before putaway)
- `qty_reduced`: +2.00 (positive because stock increased)
- `qty`: 2.00 (new total quantity)

**Note:** For putaway, `qty_reduced` is **positive** because it's an increase in stock.

---

## ✅ Benefits

1. **Complete Transaction History:** Users can see what the quantity was before the putaway
2. **Audit Trail:** Easy to track stock changes
3. **Consistent with Dispatch:** Matches the pattern used for Material Request dispatch
4. **Backward Compatible:** Checks if columns exist before using them

---

## 🧪 Testing

### Test Case: Complete Putaway

**Steps:**
1. Create putaway task
2. Assign location
3. Complete putaway
4. Check Stock Ledger

**Expected Result:**
- `qty_before`: Shows quantity before putaway (e.g., 0.00)
- `qty_reduced`: Shows quantity added (e.g., +2.00)
- `qty`: Shows new total (e.g., 2.00)

---

## 📋 Summary

**Issue:** `qty_before` and `qty_reduced` not updated in putaway  
**Fix:** Added dynamic column detection and included fields in INSERT/UPDATE  
**Result:** Stock Ledger now shows `qty_before` and `qty_reduced` for putaway transactions

---

**Status:** ✅ Fixed  
**Date:** 2026-01-06  
**Requires:** API server restart

