# Dispatched By Column Fix

## Issue

The API endpoint `POST /api/transfer-cartons/dispatch` was failing with:
```
ERROR: DATABASE_ERROR - Failed to dispatch transfer carton
```

## Root Cause

The `tabTransferCarton` table was missing the `dispatched_by` column. The API code was trying to update this column:
```sql
UPDATE tabTransferCarton 
SET status = 'Dispatched',
    dispatched_by = ?,  -- ❌ This column didn't exist!
    dispatched_on = NOW(),
    updated_on = NOW()
WHERE tc_id = ?
```

## Solution

Added the `dispatched_by` column to the `tabTransferCarton` table using a migration script.

### Migration Script

**File:** `wms-api/add-dispatched-by-column.js`

The script:
1. Checks if the `dispatched_by` column already exists
2. Adds the column if it doesn't exist: `VARCHAR(100) NULL` after `sealed_on`
3. Verifies the column was added successfully

### Column Definition

```sql
ALTER TABLE tabTransferCarton
ADD COLUMN dispatched_by VARCHAR(100) NULL AFTER sealed_on;
```

This follows the same pattern as:
- `created_by VARCHAR(100) NOT NULL`
- `sealed_by VARCHAR(100) NULL`
- `dispatched_by VARCHAR(100) NULL` ✅ (newly added)

## Verification

Run the check script to verify:
```bash
node check-tc-columns.js
```

Expected output:
```
dispatched_by column exists: true
```

## Status

✅ **Fixed** - The `dispatched_by` column has been added to the database.

The dispatch API endpoint should now work correctly.

