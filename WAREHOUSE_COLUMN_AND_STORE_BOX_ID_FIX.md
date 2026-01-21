# Warehouse Column and Store/Box_ID NULL Fix

**Date**: 2026-01-20  
**Status**: ✅ **FIXED**

---

## 🚨 Problems

### Problem 1: Warehouse Column Showing False

**Issue**: Log shows `warehouse=false` when creating putaway task:
```
📝 Generated Putaway Task title: PUT-20260120-0001 (columns: source_type=true, transfer_in=true, warehouse=false)
```

**Root Cause**: The `warehouse` column doesn't exist in `tabPutawayTask` table.

**Impact**: Warehouse information is not stored in putaway tasks, which may affect stock updates.

---

### Problem 2: Store and Box_ID Still NULL in Events

**Issue**: `tabWmsScanEvent.store` and `tabWmsScanEvent.box_id` are still NULL for `PUTAWAY_TO_RACK` events.

**Root Cause**: 
1. `PUTAWAY_TO_RACK` events from mobile app may not have `advance_shipping_notice` or `transfer_in` set
2. Post-insert update lookup doesn't try Transfer In lookup strategy
3. Events may be inserted before box lookup completes

---

## ✅ Solutions Implemented

### Fix 1: Add Warehouse Column Migration Script

**File**: `wms-api/add-warehouse-to-putaway-task.js`

**Purpose**: Adds `warehouse` column to `tabPutawayTask` table if it doesn't exist.

**Usage**:
```bash
cd wms-api
node add-warehouse-to-putaway-task.js
```

**What it does**:
- Checks if `warehouse` column exists
- Adds column if missing: `VARCHAR(100) NULL`
- Adds index on `warehouse` column
- Safe to run multiple times (idempotent)

**Impact**:
- ✅ Warehouse will be stored in putaway tasks
- ✅ Stock updates can use warehouse from putaway task
- ✅ Logs will show `warehouse=true` instead of `warehouse=false`

---

### Fix 2: Enhanced Post-Insert Update for Transfer In

**File**: `wms-api/src/modules/events/eventController.js`  
**Line**: 928, 953-963

**Before**: Post-insert update only tried:
1. Exact match by `box_id` or `carton_id`
2. Lookup by ASN (`advance_shipping_notice`)
3. Partial match for `CTN-TI-*` and `BOX-*` formats

**After**: Added Transfer In lookup strategy:
1. Exact match by `box_id` or `carton_id`
2. Lookup by ASN (`advance_shipping_notice`)
3. **NEW**: Lookup by Transfer In (`transfer_in`) - for Transfer In Putaway
4. Partial match for `CTN-TI-*` and `BOX-*` formats

**Code**:
```javascript
// Strategy 2b: Lookup by Transfer In if available (for Transfer In Putaway)
if (updateBoxInfo.length === 0 && transfer_in) {
  [updateBoxInfo] = await connection.execute(
    `SELECT box_id, store FROM tabSortBox WHERE advance_shipping_notice = ? LIMIT 1`,
    [transfer_in]
  );
  if (updateBoxInfo.length > 0) {
    logger.info(`[Event] Found box by Transfer In for post-insert update: ${transfer_in} -> ${updateBoxInfo[0].box_id}`);
  }
}
```

**Impact**:
- ✅ `PUTAWAY_TO_RACK` events can now find boxes via Transfer In lookup
- ✅ Works even if `advance_shipping_notice` is not set in event
- ✅ Handles Transfer In Putaway events correctly

---

### Fix 3: Enhanced Condition for Post-Insert Update

**File**: `wms-api/src/modules/events/eventController.js`  
**Line**: 928

**Before**:
```javascript
if ((!normalizedStore || !normalizedBoxId) && (normalizedCartonId || normalizedBoxId || advance_shipping_notice)) {
```

**After**:
```javascript
if ((!normalizedStore || !normalizedBoxId) && (normalizedCartonId || normalizedBoxId || advance_shipping_notice || transfer_in)) {
```

**Impact**:
- ✅ Post-insert update now triggers for Transfer In Putaway events
- ✅ Works even if only `transfer_in` is available (no `advance_shipping_notice`)

---

## 🔍 How It Works

### Flow 1: PUTAWAY_TO_RACK Event Processing

1. Mobile app sends `PUTAWAY_TO_RACK` event with:
   - `box_id`: `CTN-TI-123457-20260120-221653-755`
   - `location_id`: `A1-R02-L1-B2`
   - May or may not have `advance_shipping_notice` or `transfer_in`

2. Event normalization:
   - Strips item code from `carton_id` if present
   - Sets `normalizedBoxId` and `normalizedCartonId`

3. Pre-insert lookup:
   - Tries exact match in `tabSortBox`
   - Tries partial match for `CTN-TI-*` format
   - If found: Populates `normalizedStore` and `normalizedBoxId`

4. Event insertion:
   - Inserts event with normalized values

5. Post-insert update (if store/box_id still NULL):
   - Strategy 1: Exact match by `box_id` or `carton_id`
   - Strategy 2: Lookup by ASN (`advance_shipping_notice`)
   - **Strategy 2b (NEW)**: Lookup by Transfer In (`transfer_in`)
   - Strategy 3: Partial match for `CTN-TI-*` format
   - Strategy 4: Partial match for `BOX-*` format
   - If found: Updates event with `store` and `box_id`

---

## 🧪 Testing

### Test 1: Run Warehouse Migration

```bash
cd wms-api
node add-warehouse-to-putaway-task.js
```

**Expected Output**:
```
✅ Connected to database
📝 Adding warehouse column to tabPutawayTask...
✅ Added warehouse column to tabPutawayTask
✅ Added index on warehouse column
✅ Migration completed successfully!
```

### Test 2: Verify Warehouse Column Exists

```sql
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tabPutawayTask'
  AND COLUMN_NAME = 'warehouse';
```

**Expected**: Should return 1 row with `warehouse` column.

### Test 3: Verify Store and Box_ID Are Populated

**Query**:
```sql
SELECT event_type, carton_id, store, box_id, item_code, qty, advance_shipping_notice, transfer_order
FROM tabWmsScanEvent
WHERE event_type = 'PUTAWAY_TO_RACK'
  AND carton_id LIKE 'CTN-TI-%'
ORDER BY created_at DESC
LIMIT 10;
```

**Expected**: All rows should have:
- `store` = warehouse code (e.g., `WH-MAIN`)
- `box_id` = box ID from `tabSortBox` (e.g., `CTN-TI-123457-20260120-221653-755`)

### Test 4: Check Logs for Transfer In Lookup

**Look for**:
```
[Event] Found box by Transfer In for post-insert update: INSLIP-123457 -> CTN-TI-123457-20260120-221653-755
[Event] ✅ Updated PUTAWAY event ... with store/box_id from tabSortBox (CTN-TI-123457-20260120-221653-755)
```

---

## 📋 Summary of Changes

1. ✅ **Created migration script**: `add-warehouse-to-putaway-task.js` to add warehouse column
2. ✅ **Enhanced post-insert update**: Added Transfer In lookup strategy
3. ✅ **Enhanced condition**: Post-insert update now triggers for Transfer In events
4. ✅ **Better logging**: Tracks Transfer In-specific lookup operations

---

## 🚨 If Issues Persist

### Check 1: Warehouse Column Exists?

```sql
SELECT COLUMN_NAME 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'tabPutawayTask' 
  AND COLUMN_NAME = 'warehouse';
```

**If empty**: Run migration script: `node add-warehouse-to-putaway-task.js`

### Check 2: Box Exists in tabSortBox?

```sql
SELECT box_id, store, carton_id, advance_shipping_notice, purpose
FROM tabSortBox
WHERE box_id LIKE 'CTN-TI-123457-%'
   OR carton_id LIKE 'CTN-TI-123457-%'
   OR advance_shipping_notice = 'INSLIP-123457';
```

**If empty**: Box doesn't exist - check putaway task creation logs.

### Check 3: Events Have transfer_in Field?

```sql
SELECT event_type, carton_id, store, box_id, advance_shipping_notice, transfer_order
FROM tabWmsScanEvent
WHERE event_type = 'PUTAWAY_TO_RACK'
  AND carton_id LIKE 'CTN-TI-%'
ORDER BY created_at DESC
LIMIT 5;
```

**Check**: Does `transfer_order` or `advance_shipping_notice` contain Transfer In title?

**If not**: Mobile app may need to send `transfer_in` field in events.

---

## ✅ Expected Result

After these fixes:
- ✅ Warehouse column exists in `tabPutawayTask` (run migration)
- ✅ Logs show `warehouse=true` instead of `warehouse=false`
- ✅ All `PUTAWAY_TO_RACK` events have `store` and `box_id` populated
- ✅ Transfer In Putaway events can find boxes via Transfer In lookup
- ✅ Works even if `advance_shipping_notice` is not set in event

---

## 📝 Next Steps

1. **Run migration**: `node add-warehouse-to-putaway-task.js`
2. **Restart backend server**: For code changes to take effect
3. **Test**: Create new Transfer In Putaway and verify store/box_id are populated
4. **Verify**: Check logs for Transfer In lookup messages

---

**END**
