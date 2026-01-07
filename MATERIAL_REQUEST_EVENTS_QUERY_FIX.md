# Material Request Events Query Fix

## Issue
The SQL query was failing because it referenced columns that don't exist in `tabWmsScanEvent`:
- ❌ `source_bin` - **DOES NOT EXIST**
- ✅ `rack` and `bin` - **EXIST** (can be used instead)

## Correct Query

The `tabWmsScanEvent` table has these columns:
- `event_type`
- `transfer_order`
- `item_code`
- `qty`
- `event_time`
- `rack`
- `bin`
- `location_id` (if added)

**BUT NO `source_bin` column!**

### ✅ Fixed Query

```sql
SELECT 
  event_type,
  transfer_order,
  item_code,
  qty,
  rack,
  bin,
  event_time
FROM tabWmsScanEvent
WHERE transfer_order = 'MR-0001'
  OR transfer_order LIKE 'MR-%'
ORDER BY event_time DESC
```

Or, if you want to combine rack and bin:

```sql
SELECT 
  event_type,
  transfer_order,
  item_code,
  qty,
  CONCAT(COALESCE(rack, ''), '-', COALESCE(bin, '')) as source_location,
  event_time
FROM tabWmsScanEvent
WHERE transfer_order = 'MR-0001'
  OR transfer_order LIKE 'MR-%'
ORDER BY event_time DESC
```

## Test Results

Run the test script:
```bash
node wms-api/test-material-request-events-fixed.js
```

This will:
1. ✅ Check table structure
2. ✅ Run queries using correct column names
3. ✅ Show all Material Request events
4. ✅ Show Material Request items with picked_qty

## Key Finding

From the test results:
- **No events found with `transfer_order LIKE 'MR-%'`** - This means events are either:
  1. Not being sent with `transfer_order` field
  2. `transfer_order` is NULL
  3. Events are using a different format

## Next Steps

1. Check if events are being saved at all (Query 4 - recent events)
2. Verify the event format being sent from mobile app
3. Ensure events include `transfer_order = 'MR-0001'` field
4. Check API logs to see if events are being processed

