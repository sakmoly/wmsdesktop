# Desktop App Stock Ledger Fix - Column Definitions

## Issue

Desktop app was showing incorrect values:
- **Qty** was showing remaining stock (98.00) instead of Transaction Qty (100.00)
- **Available Qty** calculation was incorrect
- **Qty +/-** was showing wrong values

## Fix Applied

### 1. Updated `StockLedger` Model

**File:** `Models/StockLedger.cs`

**Changes:**
- Added `RemainingStock` property to store remaining stock after transaction
- Updated `Qty` to represent Transaction Qty (calculated from `qty_reduced` or `qty_before - remainingStock`)
- Updated `AvailableQty` to use `RemainingStock - ReservedQty` (Qty after Deduction)

```csharp
public double Qty { get; init; } // Transaction Qty (calculated from qty_reduced or qty_before - remaining stock)
public double ReservedQty { get; init; }
public double RemainingStock { get; init; } // Remaining stock after transaction (from database qty column)
public double AvailableQty => RemainingStock - ReservedQty; // Qty after Deduction of this Transaction
public double? QtyBefore { get; init; } // Stock before deduction of this transaction
public double? QtyReduced { get; init; } // Current transaction qty (negative for picking, positive for increase)
```

### 2. Updated `StockLedgerService` Methods

**File:** `Services/StockLedgerService.cs`

**Updated Methods:**
- `GetAllStockLedgerAsync` - Main list view
- `GetStockByBinAsync` - Bin-level view
- `GetAllStockLedgerPagedAsync` - Paginated view

**Changes:**
- Calculate Transaction Qty from `qty_reduced` (absolute value) or `qty_before - remainingStock`
- Store `RemainingStock` from database `qty` column
- Assign calculated `transactionQty` to `Qty` property

**Calculation Logic:**
```csharp
var remainingStock = Convert.ToDouble(reader.GetDecimal(3)); // From database qty column
var qtyBefore = reader.IsDBNull(5) ? (double?)null : Convert.ToDouble(reader.GetDecimal(5));
var qtyReduced = reader.IsDBNull(6) ? (double?)null : Convert.ToDouble(reader.GetDecimal(6));

// Calculate transaction quantity
double transactionQty;
if (qtyReduced.HasValue)
{
    transactionQty = Math.Abs(qtyReduced.Value); // Transaction Qty (absolute value)
}
else if (qtyBefore.HasValue)
{
    transactionQty = Math.Abs(qtyBefore.Value - remainingStock); // Calculate from before/after
}
else
{
    transactionQty = remainingStock; // Fallback to remaining stock if no transaction data
}
```

---

## Column Definitions (As Per User Requirements)

### 1. **Qty** (Transaction Qty)
- **Meaning:** The quantity involved in the transaction
- **Example:** If 2 items were picked, Qty = 2.00
- **Source:** Calculated from `qty_reduced` (absolute value) or `qty_before - remainingStock`

### 2. **Available Qty** (Qty after Deduction)
- **Meaning:** Stock quantity after deduction of this transaction
- **Example:** If stock was 100 before, and 2 were picked, Available Qty = 98.00
- **Formula:** `RemainingStock - ReservedQty`

### 3. **Qty Before** (Stock Before Deduction)
- **Meaning:** Stock quantity before deduction of this transaction
- **Example:** If 2 items were picked from 100, Qty Before = 100.00
- **Source:** `qty_before` column in tabStockLedger

### 4. **Qty +/-** (Current Transaction Qty)
- **Meaning:** The change amount in this transaction
- **Example:** For picking, Qty +/- = -2.00 (negative for reduction)
- **Source:** `qty_reduced` column in tabStockLedger
- **Note:** Negative for picking/reduction, positive for increase/return

---

## Expected Display

### Example: User picks 2 items

**Before Transaction:**
- Stock: 100.00 items

**Transaction:**
- Picked: 2.00 items

**After Transaction:**
- Stock: 98.00 items

**Stock Ledger Display:**
- **Qty:** 2.00 (Transaction Qty)
- **Available Qty:** 98.00 (Qty after Deduction)
- **Qty Before:** 100.00 (Stock before deduction)
- **Qty +/-:** -2.00 (Current transaction qty, negative for picking)

---

## Testing

1. **Rebuild Desktop Application:**
   ```bash
   dotnet build
   ```

2. **Restart Desktop Application**

3. **Open Stock Ledger View:**
   - Navigate to Stock Ledger
   - Check the columns display correctly

4. **Expected Results:**
   - **Qty** shows Transaction Qty (e.g., 2.00, not 98.00)
   - **Available Qty** shows stock after deduction (e.g., 98.00)
   - **Qty Before** shows stock before transaction (e.g., 100.00)
   - **Qty +/-** shows transaction amount (e.g., -2.00 for picking)

---

## Backend API Also Updated

The backend API (`GET /api/stock-ledger`) has been updated with the same logic, so both desktop app and API will show consistent data.

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-13
