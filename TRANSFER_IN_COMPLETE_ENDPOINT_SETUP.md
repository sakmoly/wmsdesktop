# Transfer In Complete Endpoint Setup Guide

## Issues Found

### Issue 1: Route Not Found (404)
**Error**: `Route POST /api/transfer-in/INSLIP-123463/complete-receiving not found`

**Cause**: Backend server hasn't been restarted after adding the new route.

**Fix**: Restart the backend server.

### Issue 2: Completion Fields Don't Exist (400)
**Error**: `Completion fields (completed_at, completed_by, is_completed) do not exist in tabTransferIn. Please run migration first.`

**Cause**: Migration script hasn't been run yet.

**Fix**: Run the migration script to add the completion fields.

## Setup Steps

### Step 1: Run Migration Script

```bash
cd wms-api
node add-completion-fields-to-transfer-in.js
```

**Expected Output**:
```
============================================================
Adding completion fields to tabTransferIn
============================================================

✅ Connected to database

📝 Adding completion fields to tabTransferIn...
✅ Added 3 field(s)

✅ Migration completed successfully!

🔌 Database connection closed
```

**If fields already exist**:
```
⚠️  All completion fields already exist in tabTransferIn
   Skipping field addition...
```

### Step 2: Restart Backend Server

**If using PM2**:
```bash
pm2 restart wms-api
```

**If using npm start**:
```bash
# Stop the server (Ctrl+C)
# Then start again
npm start
```

**If using nodemon**:
```bash
# nodemon should auto-restart, but if not:
# Stop the server (Ctrl+C)
# Then start again
npm run dev
```

### Step 3: Verify Endpoint is Available

Test the endpoint:

```bash
curl -X POST http://localhost:3000/api/transfer-in/INSLIP-123463/complete-receiving \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"completed_by": "USER-001"}'
```

**Expected Response** (if fields exist):
```json
{
  "ok": true,
  "message": "Transfer In INSLIP-123463 marked as completed",
  "data": {
    "transfer_in": "INSLIP-123463",
    "status": "Received",
    "completed_at": "2026-01-15T17:30:00.000Z",
    "completed_by": "USER-001",
    "is_completed": 1
  }
}
```

**If migration not run**:
```json
{
  "ok": false,
  "error": {
    "code": "SCHEMA_ERROR",
    "message": "Completion fields (completed_at, completed_by, is_completed) do not exist in tabTransferIn. Please run migration first."
  }
}
```

## Troubleshooting

### Problem: Route Still Returns 404

**Possible Causes**:
1. Backend server not restarted
2. Route not registered correctly
3. Server running old code

**Fix**:
1. Check if server is running: `pm2 list` or check process
2. Restart server: `pm2 restart wms-api`
3. Check server logs for errors: `pm2 logs wms-api`
4. Verify route registration in `wms-api/src/routes/transferInRoutes.js`

### Problem: Migration Script Fails

**Possible Causes**:
1. Database connection error
2. Table doesn't exist
3. Permission issues

**Fix**:
1. Check database connection in `.env` file
2. Verify `tabTransferIn` table exists: `SHOW TABLES LIKE 'tabTransferIn';`
3. Check database user permissions
4. Run migration manually if needed:

```sql
ALTER TABLE tabTransferIn
ADD COLUMN completed_at DATETIME NULL,
ADD COLUMN completed_by VARCHAR(255) NULL,
ADD COLUMN is_completed TINYINT DEFAULT 0;
```

### Problem: Endpoint Returns 400 After Migration

**Possible Causes**:
1. Migration didn't complete successfully
2. Column names don't match
3. Database connection issue during check

**Fix**:
1. Verify columns exist:
```sql
SELECT COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tabTransferIn'
  AND COLUMN_NAME IN ('completed_at', 'completed_by', 'is_completed');
```

2. If columns don't exist, run migration again
3. Check backend logs for connection errors

## Verification Checklist

After completing setup:

- [ ] Migration script ran successfully
- [ ] Backend server restarted
- [ ] Endpoint `POST /api/transfer-in/:title/complete-receiving` returns 200 (not 404)
- [ ] Completion fields exist in database
- [ ] Can complete a Transfer In via API
- [ ] Status changes to "Received" after completion
- [ ] `completed_at` is set after completion
- [ ] `completed_by` is set after completion
- [ ] `is_completed` is set to 1 after completion

## Quick Commands

```bash
# 1. Run migration
cd wms-api && node add-completion-fields-to-transfer-in.js

# 2. Restart server (choose one)
pm2 restart wms-api
# OR
npm start

# 3. Test endpoint
curl -X POST http://localhost:3000/api/transfer-in/INSLIP-123463/complete-receiving \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"completed_by": "USER-001"}'
```

## Summary

**Two Steps Required**:
1. ✅ Run migration: `node add-completion-fields-to-transfer-in.js`
2. ✅ Restart backend: `pm2 restart wms-api`

After these steps, the endpoint should work correctly.
