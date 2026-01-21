# Stock Update Debugging Steps

**Date**: 2026-01-20  
**Status**: 🔍 **DEBUGGING IN PROGRESS**

---

## 🚨 Current Issue

**Problem**: Manual trigger endpoint returns success, but stock ledger and transaction history remain empty.

**Endpoint Response**:
```json
{
  "ok": true,
  "message": "Stock updates triggered for putaway task PUT-20260120-0001",
  "data": {
    "putaway_task": "PUT-20260120-0001",
    "warehouse": "WH-MAIN",
    "location_id": "A1-R02-L1-B2",
    "items_updated": 2
  }
}
```

**But**:
- ❌ Stock Ledger: Empty (0 quantities)
- ❌ Transaction History: Empty
- ❌ Item Location Breakdown: Empty

---

## 🔍 Debugging Steps

### Step 1: Check Backend Logs

**Look for these log messages**:

1. **Entry Point**:
   ```
   [Putaway Stock Update] Manual trigger for task PUT-20260120-0001
   ```

2. **Putaway Lines Details**:
   ```
   [Putaway Stock Update] Putaway lines details: { lines: [...] }
   ```

3. **Processing Start**:
   ```
   [Putaway Completion] Processing putaway task: PUT-20260120-0001
   [Putaway Completion] Found 2 putaway line(s) for task PUT-20260120-0001
   [Putaway Completion] Putaway lines details: { lines: [...] }
   ```

4. **Stock Update Loop**:
   ```
   [Putaway Completion] Starting stock update loop for 2 line(s)
   [Putaway Completion] Processing stock update 1/2 for line: item=SKU-HAT-301-BLU-OS, ...
   ```

5. **Completion**:
   ```
   [Putaway Completion] Stock update loop completed: processed=2, skipped=0
   [Putaway Completion] ✅ Successfully completed putaway task PUT-20260120-0001
   ```

---

### Step 2: Check for Skipped Lines

**Look for warnings**:
```
[Putaway Completion] ⚠️ Skipping line: item=..., location="NULL", ...
```

**If you see this**, it means:
- Putaway lines don't have `location_id` set
- Event doesn't have `location_id` either
- Lines are being skipped

**Solution**: Ensure location is assigned to putaway lines first.

---

### Step 3: Check for Idempotency Blocks

**Look for these messages**:
```
[Putaway Completion] Task PUT-20260120-0001 is already Completed - skipping stock update
[Putaway Completion] Stock already moved for task PUT-20260120-0001
```

**If you see this**, the task was already processed.

---

### Step 4: Check Putaway Lines Location

**Query**:
```sql
SELECT 
  pl.item_code,
  pl.qty,
  pl.location_id,
  pl.rack,
  pl.bin,
  pl.carton_id
FROM tabPutawayLine pl
WHERE pl.parent_title = 'PUT-20260120-0001';
```

**Expected**:
- ✅ At least one line should have `location_id` OR `rack` set
- ❌ If all are NULL, location needs to be assigned first

---

### Step 5: Check Putaway Task Status

**Query**:
```sql
SELECT title, status, location_id
FROM tabPutawayTask
WHERE title = 'PUT-20260120-0001';
```

**Expected**:
- ✅ `status` should NOT be 'Completed' (or idempotency check will skip)
- ✅ `location_id` might be set (if column exists)

---

### Step 6: Verify Location Assignment

**If putaway lines don't have location**, assign it first:

**Option A: Via API** (Recommended):
```bash
POST /api/putaway/scan-transfer-carton
{
  "box_id": "CTN-TI-123457-20260120-233347-116",
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-402498"
}
```

**Option B: Direct SQL** (For testing):
```sql
UPDATE tabPutawayLine
SET location_id = 'A1-R02-L1-B2',
    updated_at = NOW()
WHERE parent_title = 'PUT-20260120-0001';
```

---

## 🚨 Common Issues

### Issue 1: All Lines Skipped (No Location)

**Symptoms**:
- Logs show: `⚠️ Skipping line: location="NULL"`
- `processed=0, skipped=2`

**Cause**: Putaway lines don't have `location_id` assigned

**Fix**: Assign location first using `/api/putaway/scan-transfer-carton`

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

Then retry the trigger endpoint.

---

### Issue 3: Stock Already Moved

**Symptoms**:
- Logs show: `Stock already moved for task PUT-20260120-0001`

**Cause**: Stock transactions already exist with carton_id and location

**Fix**: Check if stock actually exists:
```sql
SELECT * FROM tabStockLedger 
WHERE last_transaction_ref = 'PUT-20260120-0001';
```

If stock exists, the issue is elsewhere (maybe UI not refreshing).

---

### Issue 4: Location Not Passed to Event

**Symptoms**:
- Endpoint returns success
- But `processPutawayCompletionEvent` doesn't receive `location_id`

**Check**: Look for log:
```
[Putaway Completion] Processing putaway task: PUT-20260120-0001, location_id: NULL
```

**Fix**: Ensure `location_id` is passed correctly in the trigger endpoint

---

## 🔧 Immediate Actions

### Action 1: Check Backend Logs

**After calling the trigger endpoint**, check logs for:
1. ✅ Did `processPutawayCompletionEvent` get called?
2. ✅ How many lines were processed vs skipped?
3. ✅ Any errors?

---

### Action 2: Verify Location in Database

**Run this query**:
```sql
SELECT 
  pt.title,
  pt.status,
  COUNT(pl.id) as lines_count,
  COUNT(CASE WHEN pl.location_id IS NOT NULL THEN 1 END) as with_location_id,
  COUNT(CASE WHEN pl.rack IS NOT NULL THEN 1 END) as with_rack
FROM tabPutawayTask pt
LEFT JOIN tabPutawayLine pl ON pt.title = pl.parent_title
WHERE pt.title = 'PUT-20260120-0001'
GROUP BY pt.title, pt.status;
```

**If `with_location_id = 0` and `with_rack = 0`**:
- Location is NOT assigned to putaway lines
- You need to scan location first

---

### Action 3: Assign Location and Retry

**If location is missing**:

1. **Scan location**:
   ```bash
   POST /api/putaway/scan-transfer-carton
   {
     "box_id": "CTN-TI-123457-20260120-233347-116",
     "location_id": "A1-R02-L1-B2",
     "user_id": "USER-402498"
   }
   ```

2. **Verify location assigned**:
   ```sql
   SELECT location_id FROM tabPutawayLine 
   WHERE parent_title = 'PUT-20260120-0001' 
   LIMIT 1;
   ```

3. **Retry trigger endpoint**

---

## 📋 Enhanced Logging Added

I've added detailed logging to help debug:

1. **Entry logging**: Logs all parameters when trigger endpoint is called
2. **Line details**: Logs all putaway line details (location, rack, bin, etc.)
3. **Processing count**: Logs how many lines were processed vs skipped
4. **Summary logging**: Logs final counts of stock ledger and transaction history entries
5. **Error details**: Enhanced error logging with full context

---

## 🎯 Next Steps

1. **Restart backend server** (if not already done)

2. **Call trigger endpoint again**:
   ```bash
   POST /api/putaway/trigger-stock-update
   {
     "putaway_task": "PUT-20260120-0001",
     "user_id": "USER-402498"
   }
   ```

3. **Check backend logs** for:
   - `[Putaway Stock Update]` messages
   - `[Putaway Completion]` messages
   - Any warnings about skipped lines
   - Final summary with counts

4. **Share the logs** so I can see what's happening

---

## 🔍 What to Look For in Logs

**Good Signs** ✅:
```
[Putaway Completion] Processing stock update 1/2 for line: item=SKU-HAT-301-BLU-OS, toLocation=A1-R02-L1-B2
[Putaway Completion] Processing stock update 2/2 for line: item=SKU-HAT-301-GRN-OS, toLocation=A1-R02-L1-B2
[Putaway Completion] Stock update loop completed: processed=2, skipped=0
[Putaway Completion] ✅ Successfully completed putaway task PUT-20260120-0001
  stock_ledger_entries: 2
  transaction_history_entries: 2
```

**Bad Signs** ❌:
```
[Putaway Completion] ⚠️ Skipping line: location="NULL"
[Putaway Completion] Stock update loop completed: processed=0, skipped=2
[Putaway Completion] ⚠️ No lines were processed! All 2 line(s) were skipped.
```

---

**Please share the backend logs after calling the trigger endpoint again, and I'll help identify the exact issue!**

---

**END**
