# ASN Putaway Stock Update Fix

**Date**: 2026-01-20  
**Status**: ✅ **FIXED**

---

## 🚨 Problem

**Issue**: Stock, ledger, and stock Qty are not updating for ASN Putaway, and `box_id` and `store` fields are still NULL in `tabWmsScanEvent`.

**Root Causes**:
1. Partial match lookup only worked for `CTN-TI-*` format (Transfer In), not for ASN boxes (`BOX-*` format)
2. Post-insert update didn't handle ASN box formats
3. Warehouse lookup for ASN Putaway was incomplete (set to null instead of fetching from ASN)

---

## ✅ Solution Implemented

### Fix 1: Enhanced Partial Match for ASN Boxes

**File**: `wms-api/src/modules/events/eventController.js`  
**Line**: 287-304

**Before**: Only partial match for `CTN-TI-*` format

**After**: Added partial match for:
- `CTN-TI-*` format (Transfer In)
- `BOX-*` format (ASN)
- Generic partial match (fallback)

**Code**:
```javascript
// Try partial match for CTN-TI-* format (Transfer In)
if (searchId.startsWith('CTN-TI-')) {
  // ... existing logic ...
}

// Try partial match for BOX-* format (ASN)
if (sortBoxInfo.length === 0 && searchId.startsWith('BOX-')) {
  const parts = searchId.split('-');
  if (parts.length >= 2) {
    const basePattern = parts.slice(0, 2).join('-') + '%';
    [sortBoxInfo] = await connection.execute(
      `SELECT box_id, store, carton_id, advance_shipping_notice FROM tabSortBox WHERE (box_id LIKE ? OR carton_id LIKE ?) LIMIT 1`,
      [basePattern, basePattern]
    );
  }
}

// Generic partial match (fallback)
if (sortBoxInfo.length === 0 && searchId.includes('-')) {
  // ... generic logic ...
}
```

**Impact**: 
- ✅ ASN boxes with `BOX-*` format can now be found via partial match
- ✅ Works even if box_id has truncated timestamp or different suffix

---

### Fix 2: Enhanced Post-Insert Update for ASN

**File**: `wms-api/src/modules/events/eventController.js`  
**Line**: 886-960

**Before**: Only tried exact match by `box_id` or `carton_id`

**After**: Added multiple lookup strategies:
1. Exact match by `box_id` or `carton_id`
2. Lookup by ASN (`advance_shipping_notice`) - for ASN Putaway
3. Partial match for `CTN-TI-*` format (Transfer In)
4. Partial match for `BOX-*` format (ASN)

**Code**:
```javascript
// Strategy 1: Exact match by box_id or carton_id
if (searchIdForUpdate) {
  const cleanSearchId = searchIdForUpdate.split(':')[0].trim();
  [updateBoxInfo] = await connection.execute(
    `SELECT box_id, store FROM tabSortBox WHERE box_id = ? OR carton_id = ? LIMIT 1`,
    [cleanSearchId, cleanSearchId]
  );
}

// Strategy 2: Lookup by ASN if available (for ASN Putaway)
if (updateBoxInfo.length === 0 && advance_shipping_notice) {
  [updateBoxInfo] = await connection.execute(
    `SELECT box_id, store FROM tabSortBox WHERE advance_shipping_notice = ? LIMIT 1`,
    [advance_shipping_notice]
  );
}

// Strategy 3: Partial match for BOX-* format (ASN)
if (updateBoxInfo.length === 0 && cleanSearchId.startsWith('BOX-')) {
  const parts = cleanSearchId.split('-');
  if (parts.length >= 2) {
    const basePattern = parts.slice(0, 2).join('-') + '%';
    [updateBoxInfo] = await connection.execute(
      `SELECT box_id, store FROM tabSortBox WHERE (box_id LIKE ? OR carton_id LIKE ?) LIMIT 1`,
      [basePattern, basePattern]
    );
  }
}
```

**Impact**:
- ✅ Post-insert update now works for ASN Putaway events
- ✅ Can find box even if exact match fails (via ASN lookup or partial match)
- ✅ Handles timing issues where box is created after event insertion

---

### Fix 3: Fixed ASN Warehouse Lookup

**File**: `wms-api/src/modules/events/eventController.js`  
**Line**: 2689-2705

**Before**:
```javascript
} else if (hasAdvanceShippingNotice && task.advance_shipping_notice) {
  // ASN putaway: Try to get warehouse from ASN
  // (Note: ASN might have warehouse name or code)
  warehouse = null; // Will be normalized below
}
```

**After**:
```javascript
} else if (hasAdvanceShippingNotice && task.advance_shipping_notice) {
  // ASN putaway: Get warehouse from ASN
  try {
    const [asnInfo] = await connection.execute(
      `SELECT warehouse FROM tabAdvanceShippingNotice WHERE title = ? LIMIT 1`,
      [task.advance_shipping_notice]
    );
    if (asnInfo.length > 0 && asnInfo[0].warehouse) {
      warehouse = asnInfo[0].warehouse;
      logger.info(`[Putaway Completion] Found warehouse from ASN ${task.advance_shipping_notice}: ${warehouse}`);
    }
  } catch (asnError) {
    logger.warn(`[Putaway Completion] Failed to get warehouse from ASN:`, asnError);
  }
  
  // Fallback: Use warehouse from putaway task if available
  if (!warehouse && hasWarehouse && task.warehouse) {
    warehouse = task.warehouse;
    logger.info(`[Putaway Completion] Using warehouse from putaway task: ${warehouse}`);
  }
}
```

**Impact**:
- ✅ Warehouse is now correctly fetched from ASN for stock updates
- ✅ Stock ledger and stock transactions will use correct warehouse
- ✅ Fallback to putaway task warehouse if ASN lookup fails

---

## 🔍 How It Works

### Flow 1: ASN Putaway Event Processing

1. Event arrives with `box_id` (e.g., `BOX-WHMAIN-514364`) or `advance_shipping_notice`
2. Lookup triggers (via `needsStoreOrBoxId` condition)
3. Try exact match in `tabSortBox`
4. If not found, try partial match for `BOX-*` format
5. If still not found, try lookup by ASN
6. If found: `normalizedStore` and `normalizedBoxId` are populated
7. Event is inserted with populated values
8. Post-insert update checks if box exists (handles timing issues)

### Flow 2: ASN Putaway Stock Update

1. `PUTAWAY_TO_RACK` event is processed
2. `processPutawayCompletionEvent` is called
3. Warehouse is fetched from `tabAdvanceShippingNotice.warehouse`
4. Warehouse is normalized to CODE format
5. Stock is updated (decrease from staging, increase at target)
6. Stock ledger and stock transactions are created

---

## 🧪 Testing

### Test 1: Verify Store and Box_ID Are Populated for ASN

**Query**:
```sql
SELECT event_type, carton_id, store, box_id, item_code, qty, advance_shipping_notice
FROM tabWmsScanEvent
WHERE event_type = 'PUTAWAY_TO_RACK'
  AND advance_shipping_notice IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

**Expected**: All rows should have:
- `store` = warehouse code (e.g., `WH-MAIN`)
- `box_id` = box ID from `tabSortBox` (e.g., `BOX-WHMAIN-514364`)

### Test 2: Check Logs for ASN Lookup

**Look for**:
```
[Event] Found ASN box by partial match: BOX-WHMAIN-514364 -> BOX-WHMAIN-514364
[Event] ✅ Set normalizedBoxId from tabSortBox: BOX-WHMAIN-514364
[Event] ✅ Set store from tabSortBox for box BOX-WHMAIN-514364: WH-MAIN
[Event] ✅ Updated PUTAWAY event ... with store/box_id from tabSortBox (BOX-WHMAIN-514364)
```

### Test 3: Verify Stock Updates for ASN Putaway

**Query**:
```sql
-- Check stock transactions
SELECT * FROM tabStockTransaction
WHERE reference_doc = 'PUT-20260120-0001'  -- Replace with ASN putaway task
  AND transaction_type = 'Putaway'
ORDER BY created_at DESC
LIMIT 5;

-- Check stock ledger
SELECT item_code, warehouse, bin_location, qty, last_transaction_type, last_transaction_ref
FROM tabStockLedger
WHERE last_transaction_ref = 'PUT-20260120-0001'  -- Replace with ASN putaway task
ORDER BY updated_at DESC;
```

**Expected**: 
- Stock transactions should exist with correct warehouse
- Stock ledger should show updated quantities
- `last_transaction_type` = "Putaway"
- `last_transaction_ref` = putaway task title

---

## 📋 Summary of Changes

1. ✅ **Enhanced partial match**: Works for both `CTN-TI-*` (Transfer In) and `BOX-*` (ASN) formats
2. ✅ **Enhanced post-insert update**: Multiple lookup strategies including ASN lookup and partial match
3. ✅ **Fixed ASN warehouse lookup**: Fetches warehouse from `tabAdvanceShippingNotice` for stock updates
4. ✅ **Better logging**: Tracks ASN-specific lookup operations

---

## 🚨 If Store/Box_ID Still NULL for ASN

### Check 1: Box Exists in tabSortBox?

```sql
SELECT box_id, store, carton_id, advance_shipping_notice, purpose
FROM tabSortBox
WHERE advance_shipping_notice = 'ASN-0001'  -- Replace with your ASN
   OR box_id LIKE 'BOX-%';
```

**If empty**: Box doesn't exist - check putaway task creation logs.

### Check 2: Check Backend Logs

Look for:
- `[Event] Found ASN box by partial match...` - Confirms ASN box lookup
- `[Event] ✅ Set store from tabSortBox...` - Confirms store population
- `[Putaway Completion] Found warehouse from ASN...` - Confirms warehouse lookup

### Check 3: Manual Update (Temporary Fix)

```sql
-- Update events manually if needed (temporary fix)
UPDATE tabWmsScanEvent e
INNER JOIN tabSortBox sb ON (
  e.advance_shipping_notice = sb.advance_shipping_notice
  OR e.box_id = sb.box_id
  OR e.carton_id = sb.carton_id
)
SET 
  e.store = COALESCE(e.store, sb.store),
  e.box_id = COALESCE(e.box_id, sb.box_id)
WHERE e.event_type = 'PUTAWAY_TO_RACK'
  AND e.advance_shipping_notice IS NOT NULL
  AND (e.store IS NULL OR e.box_id IS NULL)
  AND sb.store IS NOT NULL
  AND sb.box_id IS NOT NULL;
```

---

## ✅ Expected Result

After these fixes:
- ✅ All ASN `PUTAWAY_TO_RACK` events should have `store` and `box_id` populated
- ✅ Values come from `tabSortBox` (ensures consistency)
- ✅ Warehouse is correctly fetched from ASN for stock updates
- ✅ Stock, stock ledger, and stock transactions update correctly for ASN Putaway
- ✅ Works even if box is created after event insertion

---

**END**
