# Putaway Lines Debug Guide

## Problem
Response shows `lines_count: 1` but lines are NOT actually created in the database.

## Enhanced Debugging Added

The code now includes comprehensive verification at multiple stages:

### 1. **Insert Verification**
- Checks `affectedRows` from INSERT result
- Logs insert ID for tracking
- Immediately queries database to verify line exists

### 2. **Error Logging**
- Full error details: code, errno, sqlState, sqlMessage
- Stack traces for debugging
- Distinguishes between real errors and duplicates

### 3. **Final Verification**
- Counts actual lines in database before commit
- Compares expected vs actual count
- Logs any mismatch

## What to Check in Backend Logs

When you close the box again, look for these log messages:

### ✅ Success Indicators:
```
[closeBox] ✅ Created line: SKU-XXX (qty: 75, carton_id: BOX-XXX) - Insert ID: 123
[closeBox] ✅ Verified line exists in database: ID 123
[closeBox] ✅ Successfully created putaway task PUT-XXX with 1 line(s)
[closeBox] 🔍 Final verification: linesCreated=1, actualLinesInDB=1
```

### ❌ Failure Indicators:
```
[closeBox] ❌ Insert reported 0 affected rows for SKU-XXX
[closeBox] ❌ CRITICAL: Line insert reported success but line not found in database!
[closeBox] ❌ ERROR inserting line for SKU-XXX: { code: 'ER_NO_REFERENCED_ROW_2', ... }
[closeBox] 🔍 Final verification: linesCreated=1, actualLinesInDB=0
```

## Possible Root Causes

### 1. **Foreign Key Constraint Failure**
The putaway task might not exist when inserting lines:
- Check: `SELECT * FROM tabPutawayTask WHERE title = 'PUT-20260101-0006'`
- Error code: `ER_NO_REFERENCED_ROW_2` or `1216`

### 2. **Transaction Rollback**
Something might be rolling back before commit:
- Check for any `ROLLBACK` in logs
- Check if error in catch block is swallowing the error

### 3. **Database Trigger or Constraint**
A trigger might be deleting lines after insert:
- Check for triggers: `SHOW TRIGGERS LIKE 'tabPutawayLine%'`
- Check for constraints that might prevent insert

### 4. **Transaction Isolation Issue**
Another transaction might be interfering:
- Unlikely but possible with concurrent requests

## Diagnostic Queries

Run these after closing a box to verify:

```sql
-- Check if task exists
SELECT * FROM tabPutawayTask WHERE title = 'PUT-20260101-0006';

-- Check if lines exist
SELECT * FROM tabPutawayLine WHERE parent_title = 'PUT-20260101-0006';

-- Check recent inserts (if you have a timestamp column)
SELECT * FROM tabPutawayLine 
WHERE parent_title = 'PUT-20260101-0006'
ORDER BY created_at DESC;

-- Check for foreign key issues
SHOW CREATE TABLE tabPutawayLine;

-- Check table structure
DESCRIBE tabPutawayLine;
```

## Next Steps

1. **Close the box again** and check backend console logs
2. **Look for the verification messages** in the logs
3. **Run the diagnostic queries** above
4. **Share the error logs** if any failures are detected

The enhanced logging should pinpoint exactly where the failure is occurring.

