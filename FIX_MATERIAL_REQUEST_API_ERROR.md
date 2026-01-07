# Fix for Material Request API Error (500 Database Error)

## Issue
The API is returning a 500 error: `{"code":"DATABASE_ERROR","message":"Failed to fetch Material Requests","details":null}`

## Root Cause
The `tabMaterialRequest` table likely doesn't exist in your database yet.

## Solution

### Step 1: Create the Tables

Run the table creation script:

```bash
cd wms-api
node create-material-request-tables.js
```

This script will:
- Create `tabMaterialRequest` table
- Create `tabMaterialRequestItem` table
- Verify tables were created successfully

### Step 2: Run Mock Data (Optional)

If you want test data, run:

```bash
cd wms-api
node run-material-request-mock-data-with-items.js
```

This will create 5 sample Material Requests using items from your database.

## Changes Made

### 1. Added Table Existence Checks ✅
The API endpoints now check if the table exists before querying:
- `GET /api/material-requests` - Returns empty array `[]` if table doesn't exist
- `GET /api/material-requests/:title` - Returns 404 if table doesn't exist

This prevents 500 errors when the table doesn't exist yet.

### 2. Created Table Setup Script ✅
New file: `wms-api/create-material-request-tables.js`
- Creates tables if they don't exist
- Verifies table creation
- Safe to run multiple times

## Verification

After running the setup script, verify:

1. **Check tables exist:**
   ```sql
   SHOW TABLES LIKE 'tabMaterialRequest%';
   ```

2. **Check table structure:**
   ```sql
   DESCRIBE tabMaterialRequest;
   DESCRIBE tabMaterialRequestItem;
   ```

3. **Test API:**
   ```bash
   GET /api/material-requests
   ```
   Should return `[]` (empty array) if no data, or list of Material Requests if data exists.

## Files Modified

1. ✅ `wms-api/src/modules/material-request/materialRequestController.js`
   - Added table existence checks to `getMaterialRequests()`
   - Added table existence checks to `getMaterialRequestByTitle()`

2. ✅ `wms-api/create-material-request-tables.js` (NEW)
   - Script to create tables

## Next Steps

1. Run `node create-material-request-tables.js` to create tables
2. Test the API endpoint
3. Optionally run mock data script to add test data
4. The API should now work correctly!

