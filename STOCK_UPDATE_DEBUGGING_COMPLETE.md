# Stock Update Debugging - Complete Guide

**Date**: 2026-01-20  
**Issue**: API returns success but stock not showing

---

## 🚨 Current Situation

- ✅ Trigger endpoint returns: `{"ok": true, "message": "Stock updates triggered..."}`
- ❌ Stock ledger still empty
- ❌ Transaction history still empty
- ❌ Item Location Breakdown still empty

---

## ✅ What I've Added

### Enhanced Logging

I've added **detailed logging** at critical points:

1. **Stock Ledger INSERT/UPDATE**:
   ```
   [Putaway Completion] 🔵 EXECUTING STOCK LEDGER INSERT/UPDATE for item=..., location=..., qty=...
   [Putaway Completion] ✅ Stock ledger updated: {affectedRows: ..., insertId: ...}
   ```

2. **Transaction History INSERT**:
   ```
   [Putaway Completion] 🔵 EXECUTING TRANSACTION HISTORY INSERT for item=..., location=..., qty_change=...
   [Putaway Completion] ✅ Transaction history inserted: {affectedRows: ..., insertId: ...}
   ```

3. **Entry Point Logging**:
   ```
   [Putaway Stock Update] 🔵 ENTRY: triggerStockUpdate called with: ...
   [Putaway Completion] 🔵 ENTRY: processPutawayCompletionEvent called with: ...
   ```

---

## 🔍 Next Steps

### Step 1: Check Backend Logs

**After calling trigger endpoint**, check logs for:

**Expected Logs** (if working):
```
[Putaway Stock Update] 🔵 ENTRY: triggerStockUpdate called with: {putaway_task: "PUT-20260120-0001", ...}
[Putaway Stock Update] Putaway lines query result: {lines_count: 2, ...}
[Putaway Stock Update] Location check: {hasLocation: true, ...}
[Putaway Completion] 🔵 ENTRY: processPutawayCompletionEvent called with: {...}
[Putaway Completion] Processing putaway task: PUT-20260120-0001, location_id: A1-R02-L1-B2
[Putaway Completion] Found 2 putaway line(s) for task PUT-20260120-0001
[Putaway Completion] Starting stock update loop for 2 line(s)...
[Putaway Completion] Processing stock update 1/2 for line: item=SKU-HAT-301-BLU-OS, toLocation=A1-R02-L1-B2
[Putaway Completion] 🔵 EXECUTING STOCK LEDGER INSERT/UPDATE for item=SKU-HAT-301-BLU-OS, location=A1-R02-L1-B2, qty=2
[Putaway Completion] ✅ Stock ledger updated: {affectedRows: 1, insertId: ...}
[Putaway Completion] 🔵 EXECUTING TRANSACTION HISTORY INSERT for item=SKU-HAT-301-BLU-OS, location=A1-R02-L1-B2, qty_change=2
[Putaway Completion] ✅ Transaction history inserted: {affectedRows: 1, insertId: ...}
[Putaway Completion] Stock update loop completed: processed=2, skipped=0
[Putaway Completion] ✅ Successfully completed putaway task PUT-20260120-0001
```

**If you DON'T see these logs**:
- ❌ `processPutawayCompletionEvent` is not being called
- ❌ OR it's returning early (idempotency check, no location, etc.)

---

### Step 2: Run Diagnostic SQL

**Run `VERIFY_STOCK_UPDATE_QUERIES.sql`** to check:

1. **Stock Ledger Entries**: Should have 2 rows for `PUT-20260120-0001`
2. **Transaction History**: Should have 2 rows for `PUT-20260120-0001`
3. **Stock at Location**: Should have stock at `A1-R02-L1-B2`
4. **Putaway Lines Location**: Should have `location_id` set

---

### Step 3: Check for Early Returns

**Look for these logs** (indicating early return):

```
[Putaway Completion] Task PUT-20260120-0001 is already Completed - skipping stock update
[Putaway Completion] Stock already moved for task PUT-20260120-0001
[Putaway Completion] ⚠️ Skipping line: location="NULL"
[Putaway Completion] Stock update loop completed: processed=0, skipped=2
```

**If you see these**:
- ❌ Task is already completed → Reset status
- ❌ Stock already moved → Check if it actually exists
- ❌ All lines skipped → Location not assigned

---

### Step 4: Verify Location Assignment

**Check if putaway lines have location**:
```sql
SELECT 
  item_code,
  location_id,
  rack,
  bin
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260120-0001';
```

**If `location_id` is NULL**:
- ❌ Location not assigned
- ❌ Need to scan location first using `/api/putaway/scan-transfer-carton`

---

### Step 5: Check Transaction Commit

**Look for this log**:
```
[Putaway Completion] ✅ Successfully completed putaway task PUT-20260120-0001
```

**If you see this but stock is still empty**:
- ❌ Transaction might have rolled back
- ❌ Check for errors after this log
- ❌ Check database connection issues

---

## 🔧 Common Issues

### Issue 1: All Lines Skipped

**Symptoms**:
- Logs show: `processed=0, skipped=2`
- Logs show: `⚠️ Skipping line: location="NULL"`

**Cause**: Putaway lines don't have `location_id`

**Fix**: Assign location first:
```bash
POST /api/putaway/scan-transfer-carton
{
  "box_id": "CTN-TI-123457-20260120-001335-578",
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-402498"
}
```

---

### Issue 2: Task Already Completed

**Symptoms**:
- Logs show: `Task is already Completed - skipping stock update`

**Cause**: Task status is 'Completed', idempotency check prevents updates

**Fix**:
```sql
UPDATE tabPutawayTask 
SET status = 'In Progress' 
WHERE title = 'PUT-20260120-0001';
```

Then retry trigger endpoint.

---

### Issue 3: Stock Already Moved

**Symptoms**:
- Logs show: `Stock already moved for task PUT-20260120-0001`

**Cause**: Stock transactions already exist

**Fix**: Check if stock actually exists:
```sql
SELECT * FROM tabStockLedger 
WHERE last_transaction_ref = 'PUT-20260120-0001';
```

If stock exists, the issue is elsewhere (maybe UI not refreshing).

---

### Issue 4: Transaction Rolled Back

**Symptoms**:
- Logs show INSERT statements executing
- But stock ledger is empty

**Cause**: Transaction rolled back due to error

**Fix**: Check for errors after INSERT logs. Look for:
```
[Putaway Completion] ❌ Error processing putaway completion event: ...
```

---

## 📋 Action Plan

1. ✅ **Restart backend server** (if not already done)
2. ✅ **Call trigger endpoint** again
3. ✅ **Check backend logs** for detailed output
4. ✅ **Run diagnostic SQL** (`VERIFY_STOCK_UPDATE_QUERIES.sql`)
5. ✅ **Share logs and SQL results** so I can identify the exact issue

---

## 🎯 What to Share

**Please share**:
1. ✅ **Backend logs** after calling trigger endpoint (look for `[Putaway Stock Update]` and `[Putaway Completion]` messages)
2. ✅ **Output from diagnostic SQL** (all 6 queries from `VERIFY_STOCK_UPDATE_QUERIES.sql`)
3. ✅ **Response from trigger endpoint** (the JSON you showed)

**This will help me identify exactly where the process is failing.**

---

**END**
