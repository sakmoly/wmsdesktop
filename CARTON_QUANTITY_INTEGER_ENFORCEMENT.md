# Carton Quantity Integer Enforcement - Implementation Guide

## Overview
This document provides all code changes required to enforce integer-only carton quantities throughout the WMS system.

## ✅ Changes Applied

### 1. Normalization Service (NEW)
**File:** `Services/CartonQuantityNormalizer.cs` ✅ CREATED
- Provides `NormalizeQuantity()` method using ROUND HALF UP (MidpointRounding.AwayFromZero)
- Provides validation methods to reject fractional quantities
- Ready to use throughout the application

### 2. UI Display Format
**File:** `ItemLocationBreakdownWindow.xaml` ✅ UPDATED
- Changed `AvailableQty` format from `N2` (2 decimals) to `N0` (no decimals)
- Changed `TotalQty`, `ReservedQty`, `BlockedQty` formats from `N2` to `N0`

### 3. ViewModel Normalization
**File:** `ViewModels/ItemLocationBreakdownViewModel.cs` ✅ UPDATED
- Added normalization of carton quantities using `CartonQuantityNormalizer.NormalizeQuantity()`
- Ensures all carton quantities are rounded to whole numbers before display

### 4. Backend API Rounding
**File:** `wms-api/src/modules/stock-ledger/stockLedgerController.js` ✅ UPDATED
- Updated carton quantity rounding to use `Math.round()` (whole numbers) instead of 2 decimal places
- Applied rounding to all carton quantities in API responses
- Updated total_qty, reserved_qty, blocked_qty, available_qty to be integers

## 📋 Remaining Changes Required

### 5. Model Validation (RECOMMENDED)
**Files:** `Models/CartonItem.cs`, `Models/CartonStock.cs`

**Option A: Keep `double` but add validation property**
```csharp
// In CartonItem.cs and CartonStock.cs
public double Qty { get; init; }

// Add validation property
public int NormalizedQty => CartonQuantityNormalizer.NormalizeQuantity(Qty);
```

**Option B: Change to `int` (BREAKING CHANGE)**
```csharp
// In CartonItem.cs
public int Qty { get; init; }

// In CartonStock.cs
public int Qty { get; init; }
```

### 6. Database Save/Update Validation
**Files:** All services that INSERT/UPDATE carton quantities

**Add validation before database operations:**
```csharp
// Example in any service that saves carton quantities
CartonQuantityNormalizer.ValidateWholeNumber(cartonItem.Qty, "Carton Quantity");
```

**Key files to update:**
- `Services/CartonDataService.cs`
- `Services/StockCartonUpdateService.cs`
- `Services/TransferCartonService.cs`
- Any service that writes to `tabCartonStock` or `tabCartonItem`

### 7. SQL Query Adjustments (Backend)
**Files:** All backend controllers that query carton quantities

**Add ROUND() in SELECT queries:**
```sql
-- Example: When selecting carton quantities
SELECT 
  carton_id,
  item_code,
  ROUND(qty, 0) as qty,  -- Round to whole number
  ...
FROM tabCartonStock
```

**Key files to update:**
- `wms-api/src/modules/putaway/putawayController.js` - Line ~3219, ~3249, ~3261
- `wms-api/src/modules/relocation/relocationController.js` - Lines ~1533, ~1633, ~1841, ~2777, ~2825, ~2861, ~3736, ~3751, ~4531, ~4572, ~4607
- `wms-api/src/modules/events/eventController.js` - Lines ~1437, ~3353
- Any other files that SELECT carton quantities

### 8. Database INSERT/UPDATE Rounding (Backend)
**Files:** All backend controllers that INSERT/UPDATE carton quantities

**Round quantities before inserting/updating:**
```javascript
// Example: Before INSERT/UPDATE
const normalizedQty = Math.round(qty); // Round to whole number

await connection.execute(
  `INSERT INTO tabCartonStock (carton_id, item_code, qty, ...) VALUES (?, ?, ?, ...)`,
  [cartonId, itemCode, normalizedQty, ...]
);
```

**Key locations:**
- `wms-api/src/modules/putaway/putawayController.js` - Lines ~3227, ~3257
- `wms-api/src/modules/relocation/relocationController.js` - All INSERT/UPDATE statements
- `wms-api/src/modules/events/eventController.js` - Lines ~1438, ~1451

### 9. Total Calculation Updates
**Files:** All places that calculate totals from carton quantities

**Ensure totals use normalized integers:**
```csharp
// Example in ViewModels
TotalQty = Locations.Sum(loc => CartonQuantityNormalizer.NormalizeQuantity(loc.AvailableQty));
```

**Already updated:**
- ✅ `ViewModels/ItemLocationBreakdownViewModel.cs` - Line 261 (uses normalized values)

## 🔍 Testing Checklist

1. ✅ **Display**: Verify carton quantities show as whole numbers (no decimals) in UI
2. ⏳ **Validation**: Test that saving fractional quantities throws validation error
3. ⏳ **Normalization**: Test that existing decimal quantities are rounded correctly
4. ⏳ **Totals**: Verify totals are calculated from normalized integers
5. ⏳ **API**: Verify API returns integer carton quantities
6. ⏳ **Database**: Verify database stores only whole numbers

## 📝 Implementation Priority

### High Priority (Core Functionality)
1. ✅ UI Display Format (DONE)
2. ✅ ViewModel Normalization (DONE)
3. ✅ Backend API Rounding (DONE)
4. ⏳ Database INSERT/UPDATE Rounding (REQUIRED)
5. ⏳ SQL Query Rounding (REQUIRED)

### Medium Priority (Data Integrity)
6. ⏳ Model Validation (RECOMMENDED)
7. ⏳ Service Validation (RECOMMENDED)

### Low Priority (Future Enhancement)
8. ⏳ Change Models to `int` type (BREAKING CHANGE - requires migration)

## 🚀 Quick Start

1. **Use the normalization service:**
```csharp
using Wms.Desktop.Services;

// Normalize a quantity
int normalizedQty = CartonQuantityNormalizer.NormalizeQuantity(1.55); // Returns 2

// Validate before save
CartonQuantityNormalizer.ValidateWholeNumber(qty, "Carton Quantity");
```

2. **Update database operations:**
```javascript
// In backend JavaScript
const normalizedQty = Math.round(qty);
```

3. **Update SQL queries:**
```sql
SELECT ROUND(qty, 0) as qty FROM tabCartonStock
```

## 📌 Notes

- **ROUND HALF UP**: 0.5 → 1, -0.5 → -1 (MidpointRounding.AwayFromZero)
- **Display**: All carton quantities should show as `N0` format (no decimals)
- **Storage**: Database can store decimals, but should be rounded on INSERT/UPDATE
- **Validation**: Reject fractional quantities on save/update operations
- **Totals**: Always calculate from normalized integers, not raw decimals
