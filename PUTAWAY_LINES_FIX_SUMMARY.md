# Putaway Lines Creation Fix

## Problem
When closing a warehouse box, the putaway task was created but **without line items** (items).

## Root Cause
The code queries `tabWmsScanEvent` for `SORT_TO_BOX` events to create putaway lines. If events are not synced to the database yet, no items are found and lines are not created.

## Solution Applied

### 1. **Enhanced Error Handling**
- If no items are found, the transaction is **rolled back** and an error is returned
- Prevents creating putaway task without items
- Clear error message tells user to sync events first

### 2. **Better Diagnostics**
- Added detailed logging to see what events exist for the box
- Logs raw events for debugging
- Shows exactly why items weren't found

### 3. **Response Improvements**
- Response now includes `lines_count` field
- Message shows how many lines were created
- Better visibility into what happened

## Important: Event Sync Requirement

**Events MUST be synced BEFORE closing the box:**

1. Mobile app creates `SORT_TO_BOX` events locally
2. Mobile app syncs events to backend via `POST /api/events/batch`
3. Events are inserted into `tabWmsScanEvent` table
4. **THEN** user closes the box
5. Backend queries `tabWmsScanEvent` for items
6. Backend creates putaway task WITH lines

## Error Response (If Events Not Synced)

```json
{
  "ok": false,
  "error": {
    "code": "NO_ITEMS_FOUND",
    "message": "Cannot create putaway task: No items found in box BOX-WHMAIN-383712",
    "details": "Events must be synced to tabWmsScanEvent before closing box. Please sync SORT_TO_BOX events first."
  }
}
```

## Success Response (With Lines)

```json
{
  "ok": true,
  "box_id": "BOX-WHMAIN-383712",
  "status": "Closed",
  "putaway_task": "PUT-20260101-0004",
  "lines_count": 2,
  "message": "Box closed successfully. Putaway task created with 2 line(s)."
}
```

## Testing Steps

1. **Ensure events are synced:**
   ```sql
   SELECT * FROM tabWmsScanEvent 
   WHERE box_id = 'BOX-WHMAIN-383712' 
   AND event_type = 'SORT_TO_BOX';
   ```

2. **Close box:**
   ```
   POST /api/boxes/close
   Body: { "box_id": "BOX-WHMAIN-383712", "closed_by": "USER-786249" }
   ```

3. **Verify putaway task has lines:**
   ```sql
   SELECT pl.* 
   FROM tabPutawayLine pl
   JOIN tabPutawayTask pt ON pl.parent_title = pt.title
   WHERE pt.box_id = 'BOX-WHMAIN-383712';
   ```

## Backend Logs

Check console logs for:
- `🔍 Debug: Events for box` - Shows what events exist
- `✅ Found X items in box` - Shows items found
- `✅ Created line: ...` - Shows each line created
- `✅ Successfully created putaway task ... with X line(s)` - Confirmation

## If Still No Lines

1. **Check if events are synced:**
   - Query `tabWmsScanEvent` table
   - Look for `SORT_TO_BOX` events with correct `box_id`

2. **Check event format:**
   - `event_type` must be exactly `'SORT_TO_BOX'`
   - `box_id` must match (case-insensitive)
   - `item_code` must not be NULL or empty
   - `qty` must be > 0

3. **Check backend logs:**
   - Look for `⚠️ No items found` warning
   - Look for diagnostic query results

