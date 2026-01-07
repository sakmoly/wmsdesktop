# Dispatch Stock Reduction Troubleshooting

## Status

✅ **Code Changes: CORRECT**
- API: Uses `bin` directly (line 801 in `transferCartonController.js`)
- Desktop App: Uses `bin` directly (line 275 in `TransferCartonDataService.cs`)

✅ **Database Test: WORKING**
- Direct database test shows stock reduction works correctly
- Stock transactions are created
- Stock ledger is updated

## Issue

User reports: "still stock not reduced and stock ledger"

## Root Cause Analysis

The code changes are correct, but the application needs to be restarted/rebuilt for changes to take effect.

## Solution

### If Using API Server:

1. **Stop the API server** (if running)
   ```bash
   # Find and kill the node process running the API
   # Or use Ctrl+C if running in terminal
   ```

2. **Restart the API server**
   ```bash
   cd wms-api
   npm start
   # OR if using the .exe:
   wms-api.exe
   ```

3. **Verify the API is running with new code**
   - Check server logs for any errors
   - Test dispatch endpoint

### If Using Desktop App:

1. **Rebuild the Desktop Application**
   - Open the solution in Visual Studio
   - Build → Rebuild Solution
   - Run the application

2. **Verify the build includes the changes**
   - Check that `TransferCartonDataService.cs` uses `bin` directly (line 275)
   - Test dispatch from the desktop app

## Verification Steps

After restarting/rebuilding, verify stock reduction:

1. **Find a sealed Transfer Carton**
   - Status should be "Sealed"
   - Not yet dispatched

2. **Dispatch the Transfer Carton**
   - Via API: `POST /api/transfer-cartons/dispatch`
   - Via Desktop App: Click "Dispatch" button

3. **Check Stock Transactions**
   ```sql
   SELECT * FROM tabStockTransaction
   WHERE reference_doc = 'TC-XXX-XXX'
     AND transaction_type = 'Dispatch'
   ORDER BY transaction_date DESC;
   ```
   - Should see transactions with negative `qty_change`
   - `qty_before` should be greater than `qty_after`

4. **Check Stock Ledger**
   ```sql
   SELECT * FROM tabStockLedger
   WHERE item_code = 'XXX'
     AND warehouse = 'XXX'
     AND bin_location = 'XXX';
   ```
   - Stock quantity should be reduced

5. **Check Item Stock Quantity**
   ```sql
   SELECT code, stock_qty FROM tabItem
   WHERE code = 'XXX';
   ```
   - `stock_qty` should reflect the reduction

## Technical Details

### Code Change

**Before (WRONG):**
```javascript
sourceBinExpr = "CONCAT_WS('-', rack, bin)";  // Creates duplicate: "A1-R01-L2-B1-A1-R01-L2-B1"
```

**After (CORRECT):**
```javascript
sourceBinExpr = "bin";  // Uses bin directly: "A1-R01-L2-B1"
```

### Why This Matters

In `tabWmsScanEvent`, the `rack` and `bin` columns contain the **same value** (the full location, e.g., "A1-R01-L2-B1"). 

When using `CONCAT_WS('-', rack, bin)`, it creates a duplicated value:
- `CONCAT_WS('-', "A1-R01-L2-B1", "A1-R01-L2-B1")` = `"A1-R01-L2-B1-A1-R01-L2-B1"` ❌

This duplicated value doesn't match any bin locations in `tabStockLedger`, so stock reduction fails.

Using `bin` directly matches the stock ledger bin locations correctly.

## Files Modified

1. `wms-api/src/modules/transfer-cartons/transferCartonController.js`
   - Line 801: Changed to use `bin` directly

2. `Services/TransferCartonDataService.cs`
   - Line 275: Changed to use `bin` directly

## Next Steps

1. ✅ Code changes applied
2. ⚠️ **REQUIRED**: Restart API server OR Rebuild Desktop App
3. ✅ Test dispatch again
4. ✅ Verify stock reduction

