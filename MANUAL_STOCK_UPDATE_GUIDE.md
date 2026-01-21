# Manual Stock Update Guide

**Date**: 2026-01-20  
**Status**: ✅ **READY TO USE**

---

## 🚨 Problem

Stock updates are not happening automatically when location is scanned. This guide provides a **manual trigger** to update stock for existing putaway tasks.

---

## ✅ Solution: Manual Stock Update Endpoint

### New Endpoint: `POST /api/putaway/trigger-stock-update`

**Purpose**: Manually trigger stock updates for a putaway task that already has a location assigned.

**Use Cases**:
- Putaway task has location but stock wasn't updated
- Backfilling stock for existing putaway tasks
- Testing stock update functionality
- Recovering from failed stock updates

---

## 📋 API Usage

### Request

```bash
POST /api/putaway/trigger-stock-update
Content-Type: application/json
Authorization: Bearer <token>

{
  "putaway_task": "PUT-20260120-0001",
  "user_id": "USER-402498"
}
```

### Response (Success)

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

### Response (Error - No Location)

```json
{
  "ok": false,
  "error": {
    "code": "NO_LOCATION",
    "message": "Putaway task PUT-20260120-0001 has no location assigned. Please scan a location first."
  }
}
```

### Response (Error - Task Not Found)

```json
{
  "ok": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Putaway task PUT-20260120-0001 not found"
  }
}
```

---

## 🔍 How to Use

### Step 1: Check if Putaway Task Has Location

**Query**:
```sql
SELECT 
  pt.title as putaway_task,
  pt.status,
  COUNT(pl.id) as lines_count,
  COUNT(CASE WHEN pl.location_id IS NOT NULL THEN 1 END) as lines_with_location,
  COUNT(CASE WHEN pl.rack IS NOT NULL THEN 1 END) as lines_with_rack
FROM tabPutawayTask pt
LEFT JOIN tabPutawayLine pl ON pt.title = pl.parent_title
WHERE pt.title = 'PUT-20260120-0001'
GROUP BY pt.title, pt.status;
```

**Expected**:
- `lines_with_location` > 0 OR `lines_with_rack` > 0
- If both are 0, you need to scan a location first

---

### Step 2: Trigger Stock Update

**Using cURL**:
```bash
curl -X POST http://localhost:3000/api/putaway/trigger-stock-update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "putaway_task": "PUT-20260120-0001",
    "user_id": "USER-402498"
  }'
```

**Using Postman/Insomnia**:
- Method: `POST`
- URL: `http://localhost:3000/api/putaway/trigger-stock-update`
- Headers:
  - `Content-Type: application/json`
  - `Authorization: Bearer YOUR_TOKEN`
- Body:
  ```json
  {
    "putaway_task": "PUT-20260120-0001",
    "user_id": "USER-402498"
  }
  ```

---

### Step 3: Verify Stock Updates

**Check Stock Ledger**:
```sql
SELECT 
  item_code,
  warehouse,
  bin_location,
  qty,
  last_transaction_type,
  last_transaction_ref,
  updated_at
FROM tabStockLedger
WHERE last_transaction_ref = 'PUT-20260120-0001'
ORDER BY updated_at DESC;
```

**Expected**:
- ✅ Rows for each item at target location
- ✅ `qty` > 0
- ✅ `last_transaction_type` = "Putaway"
- ✅ `last_transaction_ref` = "PUT-20260120-0001"

---

**Check Transaction History**:
```sql
SELECT 
  transaction_type,
  warehouse,
  bin_location,
  location_id,
  carton_id,
  item_code,
  qty_change,
  transaction_date
FROM tabTransactionHistory
WHERE reference_doc = 'PUT-20260120-0001'
ORDER BY created_at DESC;
```

**Expected**:
- ✅ Rows for each item
- ✅ `bin_location` NOT NULL
- ✅ `location_id` NOT NULL
- ✅ `qty_change` > 0

---

## 🧪 Testing

### Test 1: Trigger Stock Update for Existing Task

1. **Find a putaway task with location**:
   ```sql
   SELECT title, status 
   FROM tabPutawayTask 
   WHERE status != 'Completed' 
     AND EXISTS (
       SELECT 1 FROM tabPutawayLine 
       WHERE parent_title = tabPutawayTask.title 
         AND location_id IS NOT NULL
     )
   LIMIT 1;
   ```

2. **Call the endpoint**:
   ```bash
   POST /api/putaway/trigger-stock-update
   {
     "putaway_task": "PUT-20260120-0001",
     "user_id": "USER-402498"
   }
   ```

3. **Check logs**:
   ```
   [Putaway Stock Update] Manual trigger for task PUT-20260120-0001
   [Putaway Completion] Processing putaway task: PUT-20260120-0001
   [Putaway Completion] ✅ Successfully completed putaway task PUT-20260120-0001
   [Putaway Stock Update] ✅ Stock updates completed for task PUT-20260120-0001
   ```

4. **Verify stock ledger and transaction history updated**

---

### Test 2: Error Handling - No Location

1. **Find a putaway task without location**:
   ```sql
   SELECT title 
   FROM tabPutawayTask 
   WHERE NOT EXISTS (
     SELECT 1 FROM tabPutawayLine 
     WHERE parent_title = tabPutawayTask.title 
       AND (location_id IS NOT NULL OR rack IS NOT NULL)
   )
   LIMIT 1;
   ```

2. **Call the endpoint** - Should return `NO_LOCATION` error

---

## 🚨 Important Notes

### Prerequisites

**Before using this endpoint**:
1. ✅ Putaway task must exist
2. ✅ Putaway task must have at least one line with location assigned (`location_id`, `rack`, or `bin`)
3. ✅ Backend server must be running with latest code

---

### What This Endpoint Does

1. **Validates** putaway task exists
2. **Checks** if location is assigned
3. **Gets** warehouse from putaway task or Transfer In document
4. **Triggers** `processPutawayCompletionEvent` to update:
   - `tabStockLedger` (stock quantities)
   - `tabTransactionHistory` (audit trail)
   - `tabCartonStock` (if exists)
   - `tabCarton.current_bin_id` (if exists)

---

### What This Endpoint Does NOT Do

- ❌ Does NOT assign location (use `/api/putaway/scan-transfer-carton` first)
- ❌ Does NOT create putaway task (tasks are auto-created)
- ❌ Does NOT update putaway task status (status updated separately)

---

## 🔧 Troubleshooting

### Error: "TASK_NOT_FOUND"

**Cause**: Putaway task doesn't exist

**Solution**:
1. Verify task title is correct
2. Check if task was deleted
3. Query: `SELECT title FROM tabPutawayTask WHERE title = 'PUT-20260120-0001';`

---

### Error: "NO_LOCATION"

**Cause**: Putaway task has no location assigned

**Solution**:
1. Scan location first using `/api/putaway/scan-transfer-carton`
2. Or manually update `tabPutawayLine.location_id` or `rack`/`bin`

---

### Error: "STOCK_UPDATE_ERROR"

**Cause**: Stock update process failed

**Solution**:
1. Check backend logs for detailed error
2. Verify warehouse exists
3. Verify putaway lines have valid `item_code` and `qty`
4. Check database connection

---

### Stock Still Not Updating

**Check**:
1. ✅ Backend server restarted?
2. ✅ Location assigned to putaway lines?
3. ✅ Warehouse correct?
4. ✅ Check backend logs for errors:
   ```
   [Putaway Stock Update] Failed to trigger stock update: ...
   [Putaway Completion] ❌ Error processing putaway completion event: ...
   ```

---

## 📝 Summary

**New Endpoint**: `POST /api/putaway/trigger-stock-update`

**Purpose**: Manually trigger stock updates for putaway tasks

**When to Use**:
- ✅ Putaway task has location but stock wasn't updated
- ✅ Testing stock update functionality
- ✅ Backfilling stock for existing tasks
- ✅ Recovering from failed stock updates

**Next Steps**:
1. Restart backend server
2. Test with a putaway task that has location
3. Verify stock ledger and transaction history updated
4. Use this endpoint to backfill any missing stock updates

---

**END**
