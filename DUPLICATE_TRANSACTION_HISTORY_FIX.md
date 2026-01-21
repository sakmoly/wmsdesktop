# Duplicate Transaction History Fix

**Date**: 2026-01-21  
**Status**: ✅ **FIXED**

---

## 🔍 Problem

Transaction History was showing **duplicate records** for each putaway completion:
- One record with format: `TRX-PUT-1768993618400-...` (new format)
- One record with format: `TXN-20260121-00015` (old format)

Both records had the same:
- Item code
- Date/time
- Location
- Quantity

---

## 🔍 Root Cause

**Double Insertion** in `completePutaway` function:

1. **First Insertion** (lines 3285-3430 in `putawayController.js`):
   - `completePutaway` directly inserts into `tabTransactionHistory`
   - Uses old transaction number format: `TXN-20260121-00015`

2. **Second Insertion** (line 5432 in `putawayController.js`):
   - `completePutaway` calls `processPutawayCompletionEvent`
   - `processPutawayCompletionEvent` also inserts into `tabTransactionHistory`
   - Uses new transaction number format: `TRX-PUT-1768993618400-...`

**Result**: Two identical records with different transaction numbers!

---

## ✅ Fix Applied

**File**: `wms-api/src/modules/putaway/putawayController.js`

**Change**: Removed the duplicate `tabTransactionHistory` insertion from `completePutaway` function (lines 3285-3430).

**Reason**: `processPutawayCompletionEvent` is the centralized function that handles all putaway completion events and already inserts into `tabTransactionHistory`. Having both functions insert creates duplicates.

**Code Removed**:
```javascript
// CRITICAL: Also insert into tabTransactionHistory (Audit Trail) if table exists
try {
  const [txnHistoryTable] = await connection.execute(`...`);
  // ... 145 lines of duplicate insertion code ...
} catch (historyError) {
  // ...
}
```

**Replaced With**:
```javascript
// NOTE: tabTransactionHistory insertion is handled by processPutawayCompletionEvent
// which is called later in this function. This prevents duplicate records.
```

---

## ✅ Expected Behavior After Fix

**Before Fix:**
- Each putaway completion → **2 records** in `tabTransactionHistory`
- One with `TRX-PUT-...` format
- One with `TXN-...` format

**After Fix:**
- Each putaway completion → **1 record** in `tabTransactionHistory`
- Only with `TRX-PUT-...` format (from `processPutawayCompletionEvent`)

---

## 🧪 Testing

### Test 1: Complete a Putaway

1. Complete a putaway task via mobile app or API
2. Check `tabTransactionHistory` table:
   ```sql
   SELECT transaction_number, transaction_date, item_code, qty_change, reference_doc
   FROM tabTransactionHistory
   WHERE reference_doc = 'PUT-20260121-0001'
   ORDER BY transaction_date DESC;
   ```
3. **Expected**: Should see **only 1 record per item** (not 2)

### Test 2: Check Desktop App

1. Open Transaction History view in desktop app
2. Filter by the putaway task
3. **Expected**: Should see **no duplicates** - each item appears once

---

## 📋 Summary

- **Issue**: Duplicate transaction history records (2 per putaway completion)
- **Root Cause**: Both `completePutaway` and `processPutawayCompletionEvent` were inserting records
- **Fix**: Removed duplicate insertion from `completePutaway`
- **Result**: Single record per putaway completion (from `processPutawayCompletionEvent`)

---

## ⚠️ Note

The old duplicate records in the database will remain. To clean them up:

```sql
-- Find duplicates (same item_code, location_id, qty_change, transaction_date within 1 second)
SELECT 
  item_code,
  location_id,
  qty_change,
  DATE_FORMAT(transaction_date, '%Y-%m-%d %H:%i:%s') as tx_date,
  COUNT(*) as duplicate_count
FROM tabTransactionHistory
WHERE transaction_type = 'Putaway'
GROUP BY item_code, location_id, qty_change, DATE_FORMAT(transaction_date, '%Y-%m-%d %H:%i:%s')
HAVING duplicate_count > 1;
```

You can manually delete the old format records (`TXN-...`) if needed, but new putaway completions will no longer create duplicates.
