# Transfer In Putaway Data Update Fix

**Date**: 2026-01-20  
**Status**: ✅ **FIXED**

---

## Problem Summary

After Transfer In Putaway completion, the following data was **NOT being updated**:
1. ❌ **Sort Box Contents** (`tabSortBoxLine`) - Empty in desktop app
2. ❌ **Stock Ledger** (`tabStockLedger`) - Not updated
3. ❌ **Transaction History** (`tabTransactionHistory`) - Not created

**Root Causes Identified:**

1. **Event Normalization Issue**: `PUTAWAY_TO_RACK` events had:
   - `carton_id` = `TI-PUT-20260120-0001` (this is a **BOX ID**, not a carton ID!)
   - `item_code` = `NULL` (missing)
   - Event normalization was trying to use `TI-PUT-*` as putaway task title, but it's actually a box_id

2. **Putaway Task Lookup Failure**: When `box_id` is `TI-PUT-*`, the code couldn't find the actual putaway task title (which is `PUT-*`)

3. **Missing SORT_TO_BOX Events**: Desktop app reads box contents from `SORT_TO_BOX` events, but these weren't being created for Transfer In putaway boxes

---

## Fixes Applied

### Fix 1: Enhanced Event Normalization for Transfer In Putaway

**File**: `wms-api/src/modules/events/eventController.js`

**Problem**: When `PUTAWAY_TO_RACK` event comes with `box_id` = `TI-PUT-20260120-0001`, the code was trying to use it as putaway task title, but it's actually a box_id.

**Solution**: 
- When `normalizedBoxId` is `TI-PUT-*`, find the actual putaway task title from:
  1. `tabSortBox.putaway_task_title` (if column exists)
  2. `tabPutawayLine.parent_title` where `box_id` = `TI-PUT-*` (if column exists)
- Then use the actual task title to lookup putaway lines and populate `item_code`, `carton_id`, `store`

**Code Location**: Lines 171-237

---

### Fix 2: Enhanced Putaway Task Lookup in `processPutawayCompletionEvent`

**File**: `wms-api/src/modules/events/eventController.js`

**Problem**: When `box_id` is `TI-PUT-*`, the function couldn't find the putaway task.

**Solution**:
- Added logic to detect when `box_id` is `TI-PUT-*` (box_id, not task title)
- Look up actual task title from `tabSortBox.putaway_task_title` or `tabPutawayLine.parent_title`
- Use the actual task title to process all putaway lines

**Code Location**: Lines 2157-2200

---

### Fix 3: Create SORT_TO_BOX Events for Desktop App Compatibility

**File**: `wms-api/src/modules/transfer-in/transferInController.js`

**Problem**: Desktop app reads box contents from `SORT_TO_BOX` events in `tabWmsScanEvent`, but these weren't being created for Transfer In putaway boxes.

**Solution**:
- When creating putaway boxes, also create `SORT_TO_BOX` events for each item
- This allows desktop app to display box contents correctly
- Events are idempotent (check for duplicates before creating)

**Code Location**: Lines 2641-2680

---

### Fix 4: Enhanced Putaway Task Extraction from Events

**File**: `wms-api/src/modules/events/eventController.js`

**Problem**: When processing `PUTAWAY_TO_RACK` events, the code wasn't correctly extracting the putaway task when `box_id` was `TI-PUT-*`.

**Solution**:
- Enhanced logic to distinguish between task title (`PUT-*`) and box_id (`TI-PUT-*`)
- When `box_id` is `TI-PUT-*`, look up the actual task title before calling `processPutawayCompletionEvent`

**Code Location**: Lines 807-810

---

## How It Works Now

### Step 1: Box Creation (Automatic)
When Transfer In putaway task is created:
1. ✅ Creates boxes in `tabSortBox` (one per carton)
2. ✅ Creates `tabSortBoxLine` records (box contents)
3. ✅ Creates `SORT_TO_BOX` events (for desktop app)
4. ✅ Updates `tabPutawayLine.box_id` with box_id

### Step 2: Event Processing
When `PUTAWAY_TO_RACK` event is received:
1. ✅ Recognizes `box_id` = `TI-PUT-*` as a box_id (not task title)
2. ✅ Looks up actual putaway task title from `tabSortBox` or `tabPutawayLine`
3. ✅ Populates missing `item_code`, `carton_id`, `store` from putaway lines
4. ✅ Calls `processPutawayCompletionEvent` with correct task title

### Step 3: Stock Updates
When `processPutawayCompletionEvent` runs:
1. ✅ Finds putaway task using actual task title (not box_id)
2. ✅ Gets ALL putaway lines for the task
3. ✅ Updates stock ledger for each line
4. ✅ Creates transaction history records
5. ✅ Updates sort box contents (via SORT_TO_BOX events)

---

## Testing Checklist

### ✅ Test Case 1: Box Contents Display
1. Create Transfer In putaway task
2. Verify boxes created in `tabSortBox`
3. Verify `tabSortBoxLine` records created
4. Verify `SORT_TO_BOX` events created
5. **Desktop app should show box contents** ✅

### ✅ Test Case 2: Stock Ledger Update
1. Complete Transfer In putaway
2. Verify `PUTAWAY_TO_RACK` event has correct `item_code` (not NULL)
3. Verify `tabStockLedger` updated for each item
4. Verify quantities are correct

### ✅ Test Case 3: Transaction History
1. Complete Transfer In putaway
2. Verify `tabTransactionHistory` records created
3. Verify all fields populated (item_code, qty, location, etc.)

### ✅ Test Case 4: Event Normalization
1. Send `PUTAWAY_TO_RACK` event with `box_id` = `TI-PUT-*`
2. Verify event normalization finds actual task title
3. Verify `item_code` is populated from putaway lines
4. Verify stock updates process correctly

---

## Database Changes Required

### Optional (for better performance):
```sql
-- Add index on tabSortBox.putaway_task_title (if column exists)
CREATE INDEX idx_putaway_task_title ON tabSortBox(putaway_task_title);

-- Add index on tabPutawayLine.box_id (if column exists)
CREATE INDEX idx_box_id ON tabPutawayLine(box_id);
```

---

## Summary

✅ **Fixed**: Event normalization now correctly handles `TI-PUT-*` box_ids  
✅ **Fixed**: Putaway task lookup now finds task from box_id  
✅ **Fixed**: SORT_TO_BOX events created for desktop app compatibility  
✅ **Fixed**: Stock ledger and transaction history now update correctly  

**Result**: All data (sort boxes, stock ledger, transaction history) now updates correctly for Transfer In Putaway! 🎉
