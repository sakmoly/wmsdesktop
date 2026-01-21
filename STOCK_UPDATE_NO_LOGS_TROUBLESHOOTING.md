# Stock Update - No Logs Troubleshooting

**Date**: 2026-01-20  
**Issue**: Trigger endpoint returns success but no logs appear, stock not updating

---

## 🚨 Current Situation

- ✅ Trigger endpoint returns: `{"ok": true, "message": "Stock updates triggered..."}`
- ❌ **NO logs** from `[Putaway Stock Update]` or `[Putaway Completion]`
- ❌ Stock ledger and transaction history remain empty

---

## 🔍 Possible Causes

### Cause 1: Backend Server Not Restarted

**Most Likely**: The backend server is running old code without the new logging.

**Solution**:
```bash
# Stop the server
pm2 stop wms-api
# or Ctrl+C if running directly

# Restart the server
pm2 start wms-api
# or npm start
```

---

### Cause 2: Trigger Endpoint Not Actually Called

**Check**: Did you actually call the endpoint? Verify the request was sent.

**Solution**: 
- Check browser Network tab or Postman/Insomnia logs
- Verify the endpoint URL: `POST /api/putaway/trigger-stock-update`
- Verify authentication token is valid

---

### Cause 3: Putaway Lines Don't Have Location

**From your logs**: Putaway task `PUT-20260120-0001` was created, but **no location was scanned**.

**Check**:
```sql
SELECT 
  item_code,
  location_id,
  rack,
  bin
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260120-0001';
```

**If all `location_id`, `rack`, `bin` are NULL**:
- ❌ Location is NOT assigned
- ❌ Trigger endpoint will return `NO_LOCATION` error (but you said it returned success?)

---

## ✅ What I've Added

### Enhanced Logging

1. **Entry Point Logging**:
   ```
   [Putaway Stock Update] 🔵 ENTRY: triggerStockUpdate called with: {...}
   ```

2. **Task Query Logging**:
   ```
   [Putaway Stock Update] Task query result: {found: true, task_title: "PUT-20260120-0001", ...}
   ```

3. **Lines Query Logging**:
   ```
   [Putaway Stock Update] Putaway lines query result: {lines_count: 2, lines: [...]}
   ```

4. **Location Check Logging**:
   ```
   [Putaway Stock Update] Location check: {hasLocation: true/false, ...}
   ```

5. **processPutawayCompletionEvent Entry**:
   ```
   [Putaway Completion] 🔵 ENTRY: processPutawayCompletionEvent called with: {...}
   ```

---

## 🎯 Immediate Actions

### Step 1: Restart Backend Server

**CRITICAL**: The new logging code won't appear until server is restarted.

```bash
# If using PM2
pm2 restart wms-api

# If running directly
# Stop with Ctrl+C, then:
npm start
```

---

### Step 2: Verify Putaway Lines Have Location

**Run this query**:
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
- ✅ At least one line should have `location_id` OR `rack` OR `bin` set
- ❌ If all are NULL, location needs to be assigned first

---

### Step 3: Assign Location (If Missing)

**If putaway lines don't have location**, assign it:

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

---

### Step 4: Call Trigger Endpoint Again

**After restarting server and verifying location**:

```bash
POST /api/putaway/trigger-stock-update
{
  "putaway_task": "PUT-20260120-0001",
  "user_id": "USER-402498"
}
```

---

### Step 5: Check Backend Logs

**You should now see**:

```
[Putaway Stock Update] 🔵 ENTRY: triggerStockUpdate called with: {putaway_task: "PUT-20260120-0001", ...}
[Putaway Stock Update] Getting database connection...
[Putaway Stock Update] ✅ Got connection and imported processPutawayCompletionEvent
[Putaway Stock Update] Task query result: {found: true, ...}
[Putaway Stock Update] Putaway lines query result: {lines_count: 2, ...}
[Putaway Stock Update] Location check: {hasLocation: true, ...}
[Putaway Stock Update] Manual trigger for task PUT-20260120-0001: {...}
[Putaway Stock Update] Putaway lines details: {...}
[Putaway Stock Update] About to call processPutawayCompletionEvent with params: {...}
[Putaway Completion] 🔵 ENTRY: processPutawayCompletionEvent called with: {...}
[Putaway Completion] Processing putaway task: PUT-20260120-0001, ...
[Putaway Completion] Found 2 putaway line(s) for task PUT-20260120-0001
[Putaway Completion] Starting stock update loop for 2 line(s)...
[Putaway Completion] Processing stock update 1/2 for line: ...
[Putaway Completion] Processing stock update 2/2 for line: ...
[Putaway Completion] Stock update loop completed: processed=2, skipped=0
[Putaway Completion] ✅ Successfully completed putaway task PUT-20260120-0001
```

---

## 🔧 If Still No Logs

### Check 1: Is the Endpoint Registered?

**Verify route is registered**:
```bash
# Check wms-api/src/routes/putawayRoutes.js
# Should have:
router.post('/trigger-stock-update', authenticateToken, triggerStockUpdate);
```

---

### Check 2: Is the Function Exported?

**Verify function is exported**:
```bash
# Check wms-api/src/modules/putaway/putawayController.js
# Should have:
export const triggerStockUpdate = async (req, res) => { ... }
```

---

### Check 3: Check for Errors Before Logging

**Maybe the endpoint is failing before logging**:

- Check for syntax errors in console
- Check for import errors
- Check authentication middleware (maybe request is rejected before reaching handler)

---

## 📋 Summary

**Most Likely Issue**: Backend server not restarted with new code.

**Next Steps**:
1. ✅ **Restart backend server** (CRITICAL)
2. ✅ Verify putaway lines have location (SQL query)
3. ✅ If no location, assign it first
4. ✅ Call trigger endpoint again
5. ✅ Check logs for detailed output

**If logs still don't appear after restart**, the endpoint might not be getting called, or there's an error before the first log statement.

---

**Please restart the backend server and try again, then share the logs!**

---

**END**
