# Troubleshooting: Putaway Task Not Found

## Error Message
```json
{
    "ok": false,
    "error": {
        "code": "TASK_NOT_FOUND",
        "message": "Putaway task PUT-20251230-0001 not found"
    }
}
```

## Possible Causes

1. **Task was never created** - The putaway task may not have been created yet
2. **Task was deleted** - The task may have been removed from the database
3. **Incorrect task title** - The task title in the request doesn't match what's in the database
4. **Date mismatch** - The task might have been created on a different date

## Diagnostic Steps

### Step 1: Check if Task Exists
Run the SQL script `CHECK_PUTAWAY_TASK.sql` to verify:
- If the specific task exists
- Similar tasks that might match
- Recent tasks that were created

### Step 2: Verify Task Creation
Check if the task should have been created by:
1. **Checking the ASN** - If you know the ASN number, check if a task exists for it:
   ```sql
   SELECT title, status, advance_shipping_notice 
   FROM tabPutawayTask 
   WHERE advance_shipping_notice = 'ASN-12225'
   ORDER BY created_at DESC;
   ```

2. **Checking Transfer Carton** - If you scanned a transfer carton, check if a task was created:
   ```sql
   SELECT pt.title, pt.status, pt.advance_shipping_notice
   FROM tabPutawayTask pt
   INNER JOIN tabPutawayLine pl ON pt.title = pl.parent_title
   WHERE pl.carton_id = 'YOUR_CARTON_ID'
   ORDER BY pt.created_at DESC;
   ```

### Step 3: Check Task Creation Workflow
Tasks are automatically created when:
- **Scanning transfer carton** - `POST /api/putaway/scan-transfer-carton` creates a task if one doesn't exist
- **Processing PUTAWAY events** - `POST /api/events/batch` with `PUTAWAY_TO_RACK` events creates tasks
- **Creating task for remaining items** - `POST /api/putaway/create-task-for-remaining-items` creates a task

## Solutions

### Solution 1: Create the Task First
If the task doesn't exist, you need to create it first:

**Option A: Scan Transfer Carton**
```bash
POST /api/putaway/scan-transfer-carton
{
  "tc_id": "TC-1767100416319",
  "rack": "A1-R01-L1-B1",
  "bin": "B1",
  "user_id": "USER-786249"
}
```

**Option B: Create Task for Remaining Items**
```bash
POST /api/putaway/create-task-for-remaining-items
{
  "asn_no": "ASN-12225"
}
```

### Solution 2: Use Correct Task Title
1. Query the database to find the actual task title:
   ```sql
   SELECT title, status, advance_shipping_notice, created_at
   FROM tabPutawayTask
   WHERE advance_shipping_notice = 'YOUR_ASN'
   ORDER BY created_at DESC;
   ```

2. Use the correct title in your request

### Solution 3: Check Task Status
If the task exists but is already completed, you'll get a different error:
```json
{
    "ok": false,
    "error": {
        "code": "TASK_ALREADY_COMPLETED",
        "message": "Putaway task PUT-20251230-0001 is already completed. Stock has already been updated."
    }
}
```

## API Endpoints to Get Tasks

### Get All Tasks
```bash
GET /api/putaway/tasks
```

### Get Tasks by Status
```bash
GET /api/putaway/tasks?status=Open
GET /api/putaway/tasks?status=In Progress
```

### Get Tasks by ASN
```bash
GET /api/putaway/tasks?advance_shipping_notice=ASN-12225
```

## Prevention

To avoid this error in the future:

1. **Always get task title from API** - Don't hardcode task titles, get them from:
   - `GET /api/putaway/tasks` response
   - `POST /api/putaway/scan-transfer-carton` response
   - `POST /api/putaway/create-task-for-remaining-items` response

2. **Verify task exists before completing** - Check task status before calling complete:
   ```bash
   GET /api/putaway/tasks?status=Open&advance_shipping_notice=ASN-12225
   ```

3. **Use workflow correctly** - Follow the proper workflow:
   - Scan transfer carton → Task is created automatically
   - Assign locations → Task status becomes "In Progress"
   - Complete putaway → Task status becomes "Completed"

## Quick Check Query

Run this to see all recent tasks:
```sql
SELECT 
  title,
  status,
  advance_shipping_notice,
  inbound_session,
  created_at,
  updated_at
FROM tabPutawayTask
ORDER BY created_at DESC
LIMIT 20;
```

