# Session Sync Troubleshooting Guide

## Common Issues and Solutions

### Issue 1: Database Schema Not Updated

**Symptom:** 
- API returns error: `Unknown column 'completed_cartons' in 'field list'`
- API returns error: `Unknown column 'inbound_session' in 'field list'`

**Solution:**
Run the database migration script:

```bash
cd "D:\Development Project\Printechs WMS\wms-api"
npm run fix-inbound-session
```

This will:
- Add `completed_cartons` column if missing
- Add `total_cartons` column if missing
- Add `completed_on` column if missing
- Fix any column name mismatches (e.g., `title` → `inbound_session`)

---

### Issue 2: Missing Required Columns

**Symptom:**
- API returns error: `Column 'dock' cannot be null`

**Solution:**
The `dock` column constraint has been updated to allow NULL. If you still get this error, run:

```sql
ALTER TABLE tabInboundSession 
  MODIFY COLUMN dock VARCHAR(50) NULL;
```

---

### Issue 3: Validation Errors

**Symptom:**
- API returns 400 error: `VALIDATION_ERROR`

**Check:**
1. Ensure `inbound_session` is provided in request
2. Ensure `asn_no` is provided in request
3. Check that status values are valid: 'Active', 'Completed', 'Cancelled', 'Draft'

**Example Valid Request:**
```json
{
  "inbound_session": "SESSION-1234567890",
  "asn_no": "ASN-0001",
  "status": "Active",
  "completed_cartons": 3,
  "total_cartons": 4
}
```

---

### Issue 4: Authentication Errors

**Symptom:**
- API returns 401 error: `AUTH_REQUIRED`

**Solution:**
Ensure you're including the authentication token in the request header:

```bash
-H "Authorization: Bearer YOUR_TOKEN"
```

---

### Issue 5: Endpoint Not Found (404)

**Symptom:**
- API returns 404: `Route not found`

**Solution:**
1. Ensure the API server is running
2. Check that routes are registered in `src/routes/index.js`
3. Restart the API server after code changes

---

### Issue 6: Update Not Working (No Error, But No Change)

**Symptom:**
- API returns 200 OK, but database doesn't update

**Possible Causes:**

1. **All fields are undefined** - If no fields are provided in the update request, nothing will be updated (by design)

2. **Column doesn't exist** - The update query will fail silently if a column doesn't exist

**Solution:**
Check the API logs for errors. The update endpoint only updates fields that are explicitly provided in the request.

**Example - Update status only:**
```json
{
  "inbound_session": "SESSION-1234567890",
  "asn_no": "ASN-0001",
  "status": "Completed"
}
```

**Example - Update progress:**
```json
{
  "inbound_session": "SESSION-1234567890",
  "asn_no": "ASN-0001",
  "completed_cartons": 5,
  "total_cartons": 10
}
```

---

## Testing Steps

### Step 1: Verify Database Schema

Run this SQL to check current schema:

```sql
DESCRIBE tabInboundSession;
```

Expected columns:
- ✅ `inbound_session` (PRIMARY KEY)
- ✅ `asn_no`
- ✅ `completed_cartons` (INT)
- ✅ `total_cartons` (INT)
- ✅ `completed_on` (TIMESTAMP NULL)
- ✅ `status`
- ✅ `started_by`
- ✅ `device_id`
- ✅ `started_at`
- ✅ `ended_at`
- ✅ `updated_at`

---

### Step 2: Test Update Endpoint

```bash
curl -X POST http://localhost:3000/api/inbound/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "inbound_session": "SESSION-TEST-001",
    "asn_no": "ASN-0001",
    "status": "Active",
    "completed_cartons": 2,
    "total_cartons": 4
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "message": "Session updated successfully"
}
```

---

### Step 3: Test Complete Endpoint

```bash
curl -X POST http://localhost:3000/api/inbound/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "inbound_session": "SESSION-TEST-001",
    "asn_no": "ASN-0001"
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "message": "Session completed successfully"
}
```

---

### Step 4: Verify Database Update

Check if the session was updated in the database:

```sql
SELECT * FROM tabInboundSession WHERE inbound_session = 'SESSION-TEST-001';
```

---

## Quick Fix Commands

### Fix Database Schema (All Issues):

```bash
cd "D:\Development Project\Printechs WMS\wms-api"
npm run fix-inbound-session
```

### Manual SQL Fixes:

```sql
-- Add missing columns
ALTER TABLE tabInboundSession 
  ADD COLUMN completed_cartons INT DEFAULT 0 AFTER status;

ALTER TABLE tabInboundSession 
  ADD COLUMN total_cartons INT DEFAULT 0 AFTER completed_cartons;

ALTER TABLE tabInboundSession 
  ADD COLUMN completed_on TIMESTAMP NULL AFTER ended_at;

-- Fix dock to allow NULL
ALTER TABLE tabInboundSession 
  MODIFY COLUMN dock VARCHAR(50) NULL;
```

---

## Debug Mode

To see detailed error logs, check the API server console output. The endpoints log all errors with full details.

Common error patterns:

1. **Database Error:**
   ```
   Unknown column 'X' in 'field list'
   ```
   → Run migration script

2. **Validation Error:**
   ```
   VALIDATION_ERROR: inbound_session is required
   ```
   → Check request body

3. **Not Found:**
   ```
   SESSION_NOT_FOUND: Session X not found
   ```
   → Session doesn't exist (for complete endpoint)

---

## Still Not Working?

If the session sync still doesn't work after trying the above:

1. **Check API Logs:**
   - Look at the API server console output
   - Check for any error messages

2. **Check Request Format:**
   - Ensure JSON is valid
   - Ensure all required fields are present

3. **Check Database Connection:**
   - Ensure API can connect to database
   - Ensure database credentials are correct

4. **Verify Endpoints Are Registered:**
   - Check `src/routes/index.js` for the routes
   - Ensure server was restarted after code changes

5. **Test with Direct Database Query:**
   ```sql
   -- Try to manually insert/update to verify schema
   INSERT INTO tabInboundSession 
   (inbound_session, asn_no, dock, status, started_by, device_id)
   VALUES ('TEST-SESSION', 'ASN-0001', '', 'Active', 'USER-001', 'DEV-001');
   ```

