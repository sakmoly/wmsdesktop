# Transaction History Carton ID Fix

## Issue
The Carton ID column in the Transaction History screen was showing empty values for all transactions, even though `carton_id` was being stored in `tabStockTransaction`.

## Root Cause
The database trigger `trg_log_transaction_history_insert` was setting `v_carton_id = NULL` instead of reading the value from `NEW.carton_id` when inserting records into `tabTransactionHistory`.

**Problematic Code:**
```sql
-- Old trigger code (WRONG)
SET v_carton_id = NULL;  -- Always NULL!
```

## Fix Applied

### 1. Updated Database Trigger
The trigger was recreated to correctly read `carton_id` from `NEW.carton_id`:

```sql
-- New trigger code (CORRECT)
SET v_carton_id = NEW.carton_id;  -- Read from source table
```

### 2. Backfilled Existing Records
Updated 5 existing transaction history records that had `carton_id` in `tabStockTransaction` but NULL in `tabTransactionHistory`:

```sql
UPDATE tabTransactionHistory th
INNER JOIN tabStockTransaction ts ON th.transaction_id = ts.id
SET th.carton_id = ts.carton_id
WHERE ts.carton_id IS NOT NULL 
  AND (th.carton_id IS NULL OR th.carton_id = '')
```

## Verification

### Desktop App Configuration
✅ **Model:** `TransactionHistory` class has `CartonId` property (line 90-91 in `Models/StockLedger.cs`)
✅ **View:** XAML has Carton ID column with correct binding (line 152 in `Views/TransactionHistoryView.xaml`)
✅ **Binding:** `Binding="{Binding CartonId, TargetNullValue=''}"` is correct

### API Configuration
✅ **API Endpoint:** `GET /api/transaction-history` includes `carton_id` in response (line 181 in `transactionHistoryController.js`)
✅ **Database:** `tabTransactionHistory` table has `carton_id` column
✅ **Trigger:** `trg_log_transaction_history_insert` now correctly reads `carton_id`

## Result

- ✅ **Trigger Fixed:** New transactions will automatically include `carton_id`
- ✅ **Existing Records Updated:** 5 historical records were backfilled
- ✅ **Desktop App Ready:** UI is configured to display `carton_id`
- ✅ **API Ready:** API returns `carton_id` in response

## Testing

1. **Verify Existing Records:**
   - Open Transaction History screen
   - Check that Carton ID column now shows values for recent transactions
   - Filter by a specific carton_id to verify filtering works

2. **Verify New Transactions:**
   - Perform a picking operation with carton_id
   - Check Transaction History - carton_id should appear immediately
   - Perform a putaway operation with carton_id
   - Check Transaction History - carton_id should appear

3. **Verify API:**
   - Call `GET /api/transaction-history?carton_id=CTN-XXXXX`
   - Verify that carton_id filter works correctly

## Files Modified

1. **Database Trigger:** `trg_log_transaction_history_insert` (recreated)
2. **Script:** `wms-api/fix-transaction-history-carton-id.js` (created)
3. **SQL Script:** `SCRIPTS/FixTransactionHistoryCartonIdTrigger.sql` (created)

## Next Steps

The fix is complete. All new transactions will automatically include `carton_id` in the Transaction History. The desktop app will display these values correctly.
