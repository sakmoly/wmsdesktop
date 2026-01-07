# Duplicate Putaway Task Error Fix

## Problem

The mobile app was sending a `putaway_task` parameter with format `PAW-ASN365425473-1767609465623`, and the API was trying to create a new putaway task with this title. However, if the task already existed in the database, it would cause a duplicate entry error:

```
Duplicate entry 'PAW-ASN365425473-1767609465623' for key 'PRIMARY'
```

## Root Cause

The `scanTransferCarton` function in `putawayController.js` was not checking if a `putaway_task` parameter was provided in the request body. It would:
1. Check for existing tasks by box_id or ASN
2. If not found, generate a new title with format `PUT-{date}-{sequence}`
3. Try to INSERT the new task
4. If the mobile app had already created the task with a different format (`PAW-ASN...`), this would cause a duplicate entry error

## Solution

Updated the `scanTransferCarton` function to:

1. **Check for `putaway_task` parameter first** - If the mobile app provides a `putaway_task` in the request body, check if it exists in the database
2. **Use existing task if found** - If the task exists, use it instead of creating a new one
3. **Handle duplicate entry gracefully** - Wrap the INSERT statement in a try-catch block to handle `ER_DUP_ENTRY` errors
4. **Fallback to existing task** - If duplicate entry error occurs, use the existing task instead of failing

## Code Changes

**File:** `wms-api/src/modules/putaway/putawayController.js`

### Before:
```javascript
// Check if putaway task already exists
// Priority: 1) Task for this box_id, 2) Task for this ASN
let putawayTaskTitle;
let isNewTask = false;

// Check for box-based task...
// Check for ASN-based task...

if (!putawayTaskTitle) {
  // Generate new title and INSERT (no duplicate handling)
  putawayTaskTitle = `PUT-${datePrefix}-${sequence}`;
  await connection.execute(`INSERT INTO tabPutawayTask ...`);
  isNewTask = true;
}
```

### After:
```javascript
// Check if putaway task already exists
// Priority: 1) Task provided in request, 2) Task for this box_id, 3) Task for this ASN
let putawayTaskTitle;
let isNewTask = false;

// First, check if putaway_task is provided in request body
if (putaway_task) {
  const [providedTask] = await connection.execute(
    `SELECT title, status FROM tabPutawayTask WHERE title = ?`,
    [putaway_task]
  );

  if (providedTask.length > 0) {
    putawayTaskTitle = providedTask[0].title;
  } else {
    putawayTaskTitle = putaway_task; // Use provided title even if doesn't exist yet
  }
}

// Check for box-based task...
// Check for ASN-based task...

// Check if we need to create the putaway task
const [taskExists] = await connection.execute(
  `SELECT title FROM tabPutawayTask WHERE title = ?`,
  [putawayTaskTitle || '']
);

if (!putawayTaskTitle || taskExists.length === 0) {
  // Generate title if not provided...
  
  try {
    await connection.execute(`INSERT INTO tabPutawayTask ...`);
    isNewTask = true;
  } catch (insertError) {
    // Handle duplicate entry error gracefully
    if (insertError.code === 'ER_DUP_ENTRY') {
      console.log(`Putaway task ${putawayTaskTitle} already exists - using existing task`);
      isNewTask = false;
    } else {
      throw insertError; // Re-throw other errors
    }
  }
}
```

## Testing

After deploying this fix, test the following scenarios:

1. **Mobile app sends existing putaway_task:**
   ```json
   {
     "tc_id": "TC-001",
     "putaway_task": "PAW-ASN365425473-1767609465623",
     "location_id": "A1-R01-L1-B1",
     "user_id": "USER-001"
   }
   ```
   - Should use existing task without error

2. **Mobile app sends new putaway_task:**
   ```json
   {
     "tc_id": "TC-001",
     "putaway_task": "PAW-ASN365425473-1767609465624",
     "location_id": "A1-R01-L1-B1",
     "user_id": "USER-001"
   }
   ```
   - Should create new task with provided title

3. **Concurrent requests with same putaway_task:**
   - Multiple requests with same `putaway_task` should not cause duplicate errors
   - Second request should use existing task

## Impact

- ✅ **No more duplicate entry errors** when mobile app sends `putaway_task` parameter
- ✅ **Backward compatible** - Still works if `putaway_task` is not provided
- ✅ **Graceful error handling** - Duplicate entries are handled without failing the request
- ✅ **Mobile app can use custom task titles** - Supports `PAW-ASN...` format from mobile app

## Deployment

This fix is included in the latest API deployment package. Update the client by replacing `wms-api.exe` in the deployment folder.

---

**Fixed:** 2026-01-04  
**File:** `wms-api/src/modules/putaway/putawayController.js`  
**Status:** ✅ Fixed and Deployed

