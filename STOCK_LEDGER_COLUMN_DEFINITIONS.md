# Stock Ledger Column Definitions - Fixed

## Column Meanings (As Per User Requirements)

### 1. **Qty** (Transaction Qty)
- **Meaning:** The quantity involved in the transaction
- **Example:** If 100 items were picked, Qty = 100.00
- **Source:** Calculated from `qty_reduced` (absolute value) or `qty_before - qty` (remaining stock)

### 2. **Available Qty** (Qty after Deduction)
- **Meaning:** Stock quantity after deduction of this transaction
- **Example:** If stock was 198 before, and 100 were picked, Available Qty = 98.00
- **Formula:** `qty - reserved_qty` (where `qty` is remaining stock in tabStockLedger)

### 3. **Qty Before** (Stock Before Deduction)
- **Meaning:** Stock quantity before deduction of this transaction
- **Example:** If 100 items were picked from 198, Qty Before = 198.00
- **Source:** `qty_before` column in tabStockLedger

### 4. **Qty +/-** (Current Transaction Qty)
- **Meaning:** The change amount in this transaction
- **Example:** For picking, Qty +/- = -100.00 (negative for reduction)
- **Source:** `qty_reduced` column in tabStockLedger
- **Note:** Negative for picking/reduction, positive for increase/return

---

## Database Storage

### tabStockLedger Columns:

- **`qty`**: Remaining stock after transaction (e.g., 98.00)
- **`qty_before`**: Stock before transaction (e.g., 198.00)
- **`qty_reduced`**: Transaction amount (e.g., -100.00 for picking, +100.00 for increase)
- **`reserved_qty`**: Reserved quantity
- **`available_qty`**: Calculated as `qty - reserved_qty`

---

## API Response Format

```json
{
  "item_code": "SKU-HAT-301-GRN-OS",
  "warehouse": "WH-MAIN",
  "bin_location": "A1-R01-L3-B1",
  "qty": 100.00,              // Transaction Qty (100 items picked)
  "reserved_qty": 0.00,
  "available_qty": 98.00,     // Qty after Deduction (198 - 100 = 98)
  "qty_before": 198.00,       // Stock before deduction
  "qty_reduced": -100.00,     // Current transaction qty (negative for picking)
  "last_transaction_type": "Picking",
  "last_transaction_ref": "MR-123457",
  "last_transaction_date": "2026-01-13T13:51:00Z"
}
```

---

## Example: Picking Transaction

**Before Transaction:**
- Stock: 198.00 items

**Transaction:**
- Picked: 100.00 items

**After Transaction:**
- Stock: 98.00 items

**Stock Ledger Display:**
- **Qty:** 100.00 (Transaction Qty)
- **Available Qty:** 98.00 (Qty after Deduction)
- **Qty Before:** 198.00 (Stock before deduction)
- **Qty +/-:** -100.00 (Current transaction qty, negative for picking)

---

## Changes Made

### 1. Updated `pickMaterialRequestItems` Function

**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**Changes:**
- Now stores `qty_before` = current stock before transaction
- Now stores `qty_reduced` = -absoluteQty (negative for picking)
- Stores `qty` = new stock after transaction

### 2. Updated `getStockLedger` API Response

**File:** `wms-api/src/modules/stock-ledger/stockLedgerController.js`

**Changes:**
- `qty` now returns Transaction Qty (absolute value of `qty_reduced`)
- `available_qty` returns stock after deduction (remaining stock - reserved)
- `qty_before` returns stock before transaction
- `qty_reduced` returns transaction amount (negative for picking)

---

## Testing

After the fix, Stock Ledger should show:

**For Picking Transaction (MR-123457):**
- **Qty:** 100.00 (Transaction Qty - 100 items picked)
- **Available Qty:** 98.00 or 99.00 (Stock after deduction)
- **Qty Before:** 198.00 or 199.00 (Stock before picking)
- **Qty +/-:** -100.00 (Negative for picking)

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-13
