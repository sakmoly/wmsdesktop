# Quick Fix: Putaway Task Not Found

## Problem

```
{
  "ok": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Putaway task PUT-20251230-0001 not found.",
    "suggestions": []
  }
}
```

## Solution Options

### Option 1: Use Scan Transfer Carton (Recommended - Auto-Creates Task)

This is the **easiest solution** - it automatically creates the putaway task if it doesn't exist.

**Endpoint:**
```
POST /api/putaway/scan-transfer-carton
```

**Request Body:**
```json
{
  "tc_id": "TC-1767129300851",
  "rack": "A1-R01-L1-B1",
  "bin": "B1",
  "user_id": "USER-786249"
}
```

**What it does:**
1. ✅ Creates putaway task `PUT-20251230-0001` if it doesn't exist
2. ✅ Creates putaway lines for all items in the transfer carton
3. ✅ Assigns location (rack/bin)
4. ✅ Updates stock ledger automatically

**Response:**
```json
{
  "ok": true,
  "message": "Putaway task created and items assigned successfully",
  "data": {
    "putaway_task": "PUT-20251230-0001",
    "status": "In Progress",
    "stock_updated": true,
    "items_count": 1
  }
}
```

---

### Option 2: Create Task for Remaining Items

If you want to create a task for items that haven't been put away yet.

**Endpoint:**
```
POST /api/putaway/create-task-for-remaining-items
```

**Request Body:**
```json
{
  "asn_no": "ASN-12225"
}
```

**What it does:**
1. ✅ Creates putaway task for remaining items (not sorted to transfer orders)
2. ✅ Creates putaway lines with `rack = 'TBD'` and `bin = 'TBD'`
3. ✅ You'll need to assign locations later

---

### Option 3: Check Database and Use Existing Task

Run the SQL script to find existing tasks:

```sql
-- Find tasks for ASN-12225
SELECT title, status, created_at
FROM tabPutawayTask
WHERE advance_shipping_notice = 'ASN-12225'
ORDER BY created_at DESC;

-- Find recent tasks
SELECT title, status, advance_shipping_notice, created_at
FROM tabPutawayTask
ORDER BY created_at DESC
LIMIT 10;
```

Then use the **actual task title** from the database in your API calls.

---

### Option 4: Create Task Manually (SQL)

If you need to create the task manually:

```sql
-- Get inbound session
SET @inbound_session = (
  SELECT inbound_session 
  FROM tabInboundSession 
  WHERE asn_no = 'ASN-12225' 
  ORDER BY started_at DESC 
  LIMIT 1
);

-- Create putaway task
INSERT INTO tabPutawayTask 
  (title, status, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
VALUES 
  ('PUT-20251230-0001', 'Draft', 'ASN-12225', @inbound_session, 'SYSTEM', NOW(), NOW());
```

**Note:** After creating manually, you'll still need to:
1. Create putaway lines (or use scan-transfer-carton)
2. Assign locations (rack/bin)
3. Complete the putaway

---

## Recommended Workflow

**Step 1: Scan Transfer Carton** (Auto-creates task)
```json
POST /api/putaway/scan-transfer-carton
{
  "tc_id": "TC-1767129300851",
  "rack": "A1-R01-L1-B1",
  "bin": "B1",
  "user_id": "USER-786249"
}
```

**Step 2: Complete Putaway** (Updates stock)
```json
POST /api/putaway/complete
{
  "putaway_task": "PUT-20251230-0001",
  "performed_by": "USER-786249",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 75,
      "target_bin": "A1-R01-L1-B1-B1",
      "completed": true,
      "carton_id": "PAW-ASN12225-1767129206"
    }
  ]
}
```

---

## Why This Happens

The putaway task might not exist because:
1. ✅ Task was never created (most common)
2. ✅ Task was deleted
3. ✅ Task has a different name (check database)
4. ✅ Task was created for a different ASN

**Solution:** Use `scan-transfer-carton` - it automatically creates the task if it doesn't exist!

---

## Quick Test

Run this SQL to check what exists:

```sql
-- Check tasks
SELECT title, status, advance_shipping_notice 
FROM tabPutawayTask 
WHERE advance_shipping_notice = 'ASN-12225';

-- Check transfer cartons
SELECT tc_id, status, asn_no 
FROM tabTransferCarton 
WHERE asn_no = 'ASN-12225';
```

Then use the **actual values** from your database in the API calls.

