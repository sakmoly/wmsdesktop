# Fix Stock Update - Immediate Actions

**Date**: 2026-01-20  
**Issue**: Stock still showing 0, Item Location Breakdown empty

---

## 🚨 Critical Issue

**Problem**: 
- ✅ Trigger endpoint returns success
- ❌ **NO logs** from trigger endpoint or processpathwayCompletionEvent
- ❌ Stock ledger empty
- ❌ Transaction history empty
- ❌ Item Location Breakdown empty

**This means**: Either the endpoint isn't being called, OR it's failing silently before logging.

---

## ✅ Immediate Actions

### Action 1: Run Diagnostic SQL

**Run this query to check database state**:

```sql
-- See DIAGNOSE_STOCK_UPDATE_ISSUE.sql for full diagnostic
-- Quick check:
SELECT 
  pl.item_code,
  pl.qty,
  pl.location_id,
  CASE 
    WHEN pl.location_id IS NOT NULL THEN '✅ Has location'
    ELSE '❌ NO LOCATION'
  END as status
FROM tabPutawayLine pl
WHERE pl.parent_title = 'PUT-20260120-0001';
```

**Expected Result**:
- ✅ If `location_id` is NOT NULL → Location is assigned, proceed to Action 2
- ❌ If `location_id` IS NULL → **Location is missing**, proceed to Action 3

---

### Action 2: Check Backend Logs

**After restarting backend server**, call trigger endpoint and check logs for:

```
[Putaway Stock Update] 🔵 ENTRY: triggerStockUpdate called with: ...
```

**If you DON'T see this log**:
- ❌ Endpoint is not being called
- ❌ Check if request is actually being sent
- ❌ Check authentication token

**If you DO see this log but nothing after**:
- ❌ Endpoint is failing before reaching processPutawayCompletionEvent
- ❌ Check for errors in logs

---

### Action 3: Assign Location to Putaway Lines

**If putaway lines don't have location_id**, assign it:

**Option A: Via API** (Recommended):
```bash
POST /api/putaway/scan-transfer-carton
{
  "box_id": "CTN-TI-123457-20260120-001335-578",
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-402498"
}
```

**Option B: Direct SQL** (For testing):
```sql
UPDATE tabPutawayLine
SET location_id = 'A1-R02-L1-B2',
    updated_at = NOW()
WHERE parent_title = 'PUT-20260120-0001'
  AND location_id IS NULL;
```

**Then verify**:
```sql
SELECT location_id FROM tabPutawayLine 
WHERE parent_title = 'PUT-20260120-0001' 
LIMIT 1;
-- Should return: A1-R02-L1-B2
```

---

### Action 4: Call Trigger Endpoint Again

**After assigning location**:

```bash
POST /api/putaway/trigger-stock-update
{
  "putaway_task": "PUT-20260120-0001",
  "user_id": "USER-402498"
}
```

**Check logs for**:
```
[Putaway Stock Update] 🔵 ENTRY: triggerStockUpdate called
[Putaway Stock Update] Putaway lines query result: {lines_count: 2, ...}
[Putaway Stock Update] Location check: {hasLocation: true, ...}
[Putaway Completion] 🔵 ENTRY: processPutawayCompletionEvent called
[Putaway Completion] Processing stock update 1/2 for line: ...
[Putaway Completion] Stock update loop completed: processed=2, skipped=0
```

---

### Action 5: Verify Stock Updates

**After calling trigger endpoint**, check:

**Stock Ledger**:
```sql
SELECT 
  item_code,
  bin_location,
  qty,
  last_transaction_ref
FROM tabStockLedger
WHERE last_transaction_ref = 'PUT-20260120-0001';
```

**Expected**: Should have 2 rows (one for each item) with `qty > 0`

**Transaction History**:
```sql
SELECT 
  item_code,
  bin_location,
  qty_change,
  reference_doc
FROM tabTransactionHistory
WHERE reference_doc = 'PUT-20260120-0001';
```

**Expected**: Should have 2 rows with `qty_change > 0`

---

### Action 6: Update tabItem.stock_qty (If Needed)

**If stock ledger has data but tabItem.stock_qty is still 0**:

```sql
UPDATE tabItem
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabStockLedger
  WHERE item_code = tabItem.code
),
updated_at = NOW()
WHERE code IN ('SKU-HAT-301-BLU-OS', 'SKU-HAT-301-GRN-OS');
```

**Then refresh the desktop app** to see updated stock.

---

## 🔍 Most Likely Issue

**Based on your logs**: Putaway task was created, but **NO location was scanned**.

**From your terminal logs**:
- ✅ Putaway task `PUT-20260120-0001` was created
- ✅ Items were received
- ❌ **NO location scan happened** (no logs from `/api/putaway/scan-transfer-carton`)

**This means**: Putaway lines probably don't have `location_id` set, so:
1. Trigger endpoint returns `NO_LOCATION` error (but you said it returned success?)
2. OR trigger endpoint finds location from somewhere else (unlikely)
3. OR processPutawayCompletionEvent skips all lines because they have no location

---

## 📋 Step-by-Step Fix

1. **Run diagnostic SQL** to check if putaway lines have location
2. **If NO location**: Assign location using `/api/putaway/scan-transfer-carton`
3. **Restart backend server** (if not already done)
4. **Call trigger endpoint** again
5. **Check backend logs** for detailed output
6. **Verify stock ledger** has data
7. **Update tabItem.stock_qty** if needed
8. **Refresh desktop app**

---

## 🚨 If Still Not Working

**Share**:
1. ✅ Output from diagnostic SQL (all 7 queries)
2. ✅ Backend logs after calling trigger endpoint
3. ✅ Response from trigger endpoint

**This will help identify the exact issue.**

---

**END**
