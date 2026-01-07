# Stock Ledger qty_before and qty_reduced - Confirmation

## Verification Results

✅ **Database Columns: EXISTS**
- `qty_before` column: ✅ Added successfully
- `qty_reduced` column: ✅ Added successfully

✅ **Code Changes: CORRECT**
- API code: ✅ Includes `qty_before` and `qty_reduced` in INSERT/UPDATE queries
- Desktop App code: ✅ Includes `qty_before` and `qty_reduced` in INSERT/UPDATE queries

❌ **Current Data: NULL Values**
- All recent Dispatch transactions show NULL for `qty_before` and `qty_reduced`
- This indicates the **OLD code is still running** (API server hasn't been restarted)

## Code Verification

### API Code (`wms-api/src/modules/transfer-cartons/transferCartonController.js`)

**Line 891-892:**
```javascript
const qtyBefore = currentQty;
const qtyReduced = -qty; // Negative for reduction
```

**Lines 897-912:**
```javascript
INSERT INTO tabStockLedger 
  (item_code, warehouse, bin_location, qty, reserved_qty,
   qty_before, qty_reduced,  // ✅ Fields included
   last_transaction_date, last_transaction_type, last_transaction_ref,
   updated_at, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ...)
ON DUPLICATE KEY UPDATE
  qty = ?,
  qty_before = ?,      // ✅ Fields included
  qty_reduced = ?,     // ✅ Fields included
  ...
```

### Desktop App Code (`Services/TransferCartonDataService.cs`)

**Line 387-388:**
```csharp
var qtyBefore = currentQty;
var qtyReduced = -qty; // Negative for reduction
```

**Lines 391-407:**
```csharp
INSERT INTO tabStockLedger 
  (item_code, warehouse, bin_location, qty, reserved_qty,
   qty_before, qty_reduced,  // ✅ Fields included
   last_transaction_date, last_transaction_type, last_transaction_ref,
   updated_at, created_at)
VALUES (@itemCode, @warehouse, @sourceBin, @newQty, @currentReservedQty,
        @qtyBefore, @qtyReduced, ...)
ON DUPLICATE KEY UPDATE
  qty = @newQty,
  qty_before = @qtyBefore,      // ✅ Fields included
  qty_reduced = @qtyReduced,    // ✅ Fields included
  ...
```

## Issue

The code changes are **100% correct**, but the running API server is still using the **old code** that doesn't include `qty_before` and `qty_reduced` fields.

## Solution

### If Using API Server:
1. **Stop the API server** (Ctrl+C or kill the process)
2. **Restart the API server**
   ```bash
   cd wms-api
   npm start
   # OR if using .exe:
   wms-api.exe
   ```

### If Using Desktop App:
1. **Rebuild the application** in Visual Studio
2. **Run the rebuilt application**

## Testing After Restart

After restarting/rebuilding, test by dispatching a Transfer Carton and verify:

```sql
SELECT item_code, qty, qty_before, qty_reduced, last_transaction_type
FROM tabStockLedger
WHERE last_transaction_type = 'Dispatch'
ORDER BY last_transaction_date DESC
LIMIT 5;
```

Expected result:
- `qty_before`: Should show the quantity before dispatch (e.g., `160`)
- `qty_reduced`: Should show the reduction amount as negative (e.g., `-20`)

## Summary

✅ **Database**: Columns added successfully  
✅ **Code**: Changes are correct and complete  
⚠️ **Action Required**: Restart API server OR Rebuild Desktop App  
✅ **After Restart**: New dispatches will populate `qty_before` and `qty_reduced` correctly

