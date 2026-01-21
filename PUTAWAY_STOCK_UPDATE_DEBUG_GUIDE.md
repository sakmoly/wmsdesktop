# Putaway Stock Update Debug Guide

**Date**: 2026-01-20  
**Status**: 🔍 **DEBUGGING REQUIRED**

---

## 🚨 Problem

**Issue**: Stock and ledger audit are not updating after putaway completion.

**Possible Causes**:
1. Putaway task already marked as "Completed" (idempotency check)
2. Stock already moved (idempotency check)
3. Missing location_id in putaway lines
4. Transaction rollback due to error
5. Event not being processed correctly

---

## 🔍 Debugging Steps

### Step 1: Check Putaway Task Status

**Query**:
```sql
SELECT title, status, location_id, source_type, transfer_in, advance_shipping_notice
FROM tabPutawayTask
WHERE title = 'PUT-20260120-0001';  -- Replace with your putaway task
```

**Expected**: Status should be "In Progress" or "Pending" (not "Completed")

**If Status = "Completed"**: Stock updates are skipped due to idempotency check.

---

### Step 2: Check Putaway Lines Have Location

**Query**:
```sql
SELECT parent_title, item_code, qty, rack, bin, location_id, carton_id
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260120-0001';  -- Replace with your putaway task
```

**Expected**: All lines should have `location_id` (not NULL, not "TBD")

**If location_id is NULL or "TBD"**: Stock updates are skipped (line 2687-2690 in eventController.js)

---

### Step 3: Check Stock Transaction History

**Query**:
```sql
SELECT * FROM tabStockTransaction
WHERE reference_doc = 'PUT-20260120-0001'  -- Replace with your putaway task
ORDER BY created_at DESC
LIMIT 10;
```

**Expected**: Should see "PUTAWAY" transactions with `from_location_id` and `to_location_id`

**If No Transactions**: Stock updates were not executed.

---

### Step 4: Check Stock Ledger

**Query**:
```sql
-- Check stock at target location (should have increased)
SELECT item_code, warehouse, bin_location, qty, last_transaction_type, last_transaction_ref
FROM tabStockLedger
WHERE bin_location = 'A1-R02-L1-B2'  -- Replace with your location
  AND item_code = 'SKU-HAT-301-BLU-OS'  -- Replace with your item
ORDER BY updated_at DESC;

-- Check stock at staging location (should have decreased)
SELECT item_code, warehouse, bin_location, qty, last_transaction_type, last_transaction_ref
FROM tabStockLedger
WHERE bin_location LIKE '%STAGE%' OR bin_location LIKE '%DOCK%'
  AND item_code = 'SKU-HAT-301-BLU-OS'
ORDER BY updated_at DESC;
```

**Expected**: 
- Target location should have increased qty
- Staging location should have decreased qty
- `last_transaction_type` should be "Putaway"
- `last_transaction_ref` should be the putaway task title

---

### Step 5: Check Event Processing

**Query**:
```sql
SELECT event_type, putaway_task, location_id, item_code, qty, processed, error_message
FROM tabWmsScanEvent
WHERE event_type = 'PUTAWAY_TO_RACK'
  AND (putaway_task = 'PUT-20260120-0001' OR box_id = 'CTN-TI-123457-20260120-210842-726')
ORDER BY created_at DESC
LIMIT 10;
```

**Expected**: Events should exist and be processed

**Check Logs**: Look for:
- `[Putaway Completion] Processing putaway task: ...`
- `[Putaway Completion] ✅ Successfully completed putaway task ...`
- `[Putaway Event] ❌ Error processing putaway completion event ...`

---

## 🔧 Common Issues and Fixes

### Issue 1: Task Already Completed

**Symptom**: Task status is "Completed" before stock updates

**Fix**: 
- Check if `completePutaway` API was called directly (should update stock)
- If using events, ensure events are sent BEFORE task is marked as completed
- Check idempotency logic - it should allow re-processing if stock wasn't updated

### Issue 2: Missing Location in Putaway Lines

**Symptom**: `location_id` is NULL or "TBD" in `tabPutawayLine`

**Fix**:
- Ensure location is assigned before completing putaway
- Use `POST /api/putaway/scan-transfer-carton` with `putaway_task` and `location_id` to update all lines
- Check that location_id is being saved correctly

### Issue 3: Event Not Processed

**Symptom**: No stock transactions created

**Fix**:
- Check if `PUTAWAY_TO_RACK` events are being sent correctly
- Verify `putaway_task` is included in event
- Check event processing logs for errors
- Ensure event batch processing is running

### Issue 4: Transaction Rollback

**Symptom**: Errors in logs, no stock updates

**Fix**:
- Check error logs for specific error messages
- Verify warehouse is correctly determined
- Check if FROM location (staging) has stock to move
- Verify all required columns exist in database

---

## 🧪 Test Stock Update Manually

### Test 1: Check Current Stock

```sql
-- Before putaway
SELECT item_code, warehouse, bin_location, qty
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-BLU-OS'
ORDER BY bin_location;
```

### Test 2: Complete Putaway via API

```bash
curl -X POST http://localhost:3000/api/putaway/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "putaway_task": "PUT-20260120-0001",
    "performed_by": "USER-402498"
  }'
```

### Test 3: Check Stock After

```sql
-- After putaway
SELECT item_code, warehouse, bin_location, qty, last_transaction_type, last_transaction_ref
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-BLU-OS'
ORDER BY bin_location;
```

**Expected Changes**:
- Staging location: qty decreased
- Target location (A1-R02-L1-B2): qty increased
- `last_transaction_type` = "Putaway"
- `last_transaction_ref` = "PUT-20260120-0001"

---

## 📋 Checklist

- [ ] Putaway task status is NOT "Completed" before stock update
- [ ] All putaway lines have valid `location_id` (not NULL, not "TBD")
- [ ] `PUTAWAY_TO_RACK` events are being sent with correct `putaway_task`
- [ ] Events are being processed (check `tabWmsScanEvent.processed`)
- [ ] No errors in event processing logs
- [ ] Warehouse is correctly determined (check logs)
- [ ] FROM location (staging) has stock to move
- [ ] Transaction is committing (check logs for "Successfully completed")
- [ ] Stock ledger shows updated qty at target location
- [ ] Stock transaction history shows PUTAWAY entries

---

## 🔍 Log Analysis

### Success Logs (Stock Updated):
```
[Putaway Completion] Processing putaway task: PUT-20260120-0001
[Putaway Completion] Found 2 putaway line(s) for task PUT-20260120-0001
[Putaway Completion] Processing stock update for line: item=SKU-HAT-301-BLU-OS, qty=2, fromLocation=STAGING-01, toLocation=A1-R02-L1-B2
[Putaway Completion] ✅ Successfully completed putaway task PUT-20260120-0001 - stock updated, task marked as Completed
```

### Error Logs (Stock NOT Updated):
```
[Putaway Event] ❌ Error processing putaway completion event for task PUT-20260120-0001: ...
[Putaway Completion] Skipping line: item=SKU-HAT-301-BLU-OS, qty=2, location="TBD"
[Putaway Completion] Task already completed - skipping stock update
```

---

## 🛠️ Quick Fixes

### Fix 1: Reset Putaway Task Status

```sql
-- Reset task to "In Progress" to allow stock updates
UPDATE tabPutawayTask
SET status = 'In Progress'
WHERE title = 'PUT-20260120-0001';
```

### Fix 2: Update Location in Putaway Lines

```sql
-- Update location for all lines
UPDATE tabPutawayLine
SET location_id = 'A1-R02-L1-B2',
    rack = 'A1-R02-L1',
    bin = 'B2'
WHERE parent_title = 'PUT-20260120-0001'
  AND (location_id IS NULL OR location_id = 'TBD');
```

### Fix 3: Manually Trigger Stock Update

```bash
# Call completePutaway API directly
curl -X POST http://localhost:3000/api/putaway/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "putaway_task": "PUT-20260120-0001",
    "performed_by": "USER-402498"
  }'
```

---

## 📝 Next Steps

1. **Run the SQL queries above** to identify the issue
2. **Check the backend logs** for error messages
3. **Verify putaway lines have location_id** before completing
4. **Test with direct API call** (`POST /api/putaway/complete`) instead of events
5. **Check if mobile app is sending events correctly** with `putaway_task` field

---

**END**
