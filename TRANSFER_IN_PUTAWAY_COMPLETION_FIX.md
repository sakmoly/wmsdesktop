# Transfer In Putaway Completion Fix

**Date**: 2026-01-20  
**Issue**: Transfer In Putaway completed, but Stock Qty, Item Location Wise Qty, Stock Ledger, Stock History/Audit not updated. Scan events also not updated properly.

---

## Problem

After completing Transfer In Putaway:
1. ❌ Stock Qty not updated
2. ❌ Item Location Wise Qty not updated
3. ❌ Stock Ledger not updated
4. ❌ Stock History/Audit not updated
5. ❌ Scan events missing `carton_id`, `item_code`, and `store` fields

**Root Causes:**

1. **`completePutaway` cannot find putaway task**: When `tc_id` is "TI-PUT-20260120-0001" (putaway task title), the function tries to find the task by looking in putaway lines for `carton_id = "TI-PUT-20260120-0001"`, which fails because the actual `carton_id` is "CTN-555444".

2. **`processPutawayCompletionEvent` cannot find putaway task**: Same issue - when `tc_id` is the putaway task title, it can't find the task.

3. **Event normalization missing Transfer In data**: For Transfer In putaway `PUTAWAY_TO_RACK` events, the normalization logic only looks up data from `SORT_TO_BOX` events (ASN putaway), not from putaway lines (Transfer In putaway).

---

## Fixes Applied

### Fix 1: `completePutaway` - Recognize Putaway Task Title

**File**: `wms-api/src/modules/putaway/putawayController.js`

**Change**: Check if `tc_id` is a putaway task title (PUT- or TI-PUT-) and use it directly:

```javascript
// CRITICAL: Check if tc_id is a putaway task title (PUT- or TI-PUT-)
// For Transfer In putaway, mobile app sends putaway task title as tc_id
const isPutawayTaskTitle = tc_id && (tc_id.startsWith('PUT-') || tc_id.startsWith('TI-PUT-'));

if (isPutawayTaskTitle) {
  // tc_id is the putaway task title - verify it exists
  const [taskCheck] = await connection.execute(
    `SELECT title FROM tabPutawayTask WHERE title = ? LIMIT 1`,
    [tc_id]
  );
  if (taskCheck.length > 0) {
    actualPutawayTask = tc_id;
    logger.info(`[Putaway] Using tc_id as putaway task title: ${tc_id}`);
  }
}
```

---

### Fix 2: `processPutawayCompletionEvent` - Recognize Putaway Task Title

**File**: `wms-api/src/modules/events/eventController.js`

**Change**: Check if `tc_id` is a putaway task title before trying to find it from putaway lines:

```javascript
// CRITICAL: Check if tc_id is a putaway task title (PUT- or TI-PUT-)
// For Transfer In putaway, mobile app sends putaway task title as tc_id
const isPutawayTaskTitle = tc_id && (tc_id.startsWith('PUT-') || tc_id.startsWith('TI-PUT-'));

if (isPutawayTaskTitle) {
  // tc_id is the putaway task title - verify it exists
  const [taskCheck] = await connection.execute(
    `SELECT title FROM tabPutawayTask WHERE title = ? LIMIT 1`,
    [tc_id]
  );
  if (taskCheck.length > 0) {
    putawayTaskTitle = tc_id;
    logger.info(`[Putaway Completion] Using tc_id as putaway task title: ${tc_id}`);
  }
}
```

---

### Fix 3: Event Normalization - Populate Transfer In Data

**File**: `wms-api/src/modules/events/eventController.js`

**Change**: For Transfer In putaway events, populate `carton_id`, `item_code`, and `store` from putaway lines instead of `SORT_TO_BOX` events:

```javascript
// CRITICAL: Check if this is Transfer In putaway (tc_id is putaway task title)
const isTransferInPutaway = normalizedTcId && (normalizedTcId.startsWith('PUT-') || normalizedTcId.startsWith('TI-PUT-'));

if (isTransferInPutaway) {
  // Transfer In putaway: Look up from putaway lines
  const [putawayLines] = await connection.execute(`
    SELECT 
      pl.item_code,
      pl.carton_id,
      pt.transfer_in,
      pt.source_type
    FROM tabPutawayLine pl
    INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title
    WHERE pt.title = ?
      AND pl.item_code IS NOT NULL
    ORDER BY pl.item_code
    LIMIT 1
  `, [normalizedTcId]);
  
  if (putawayLines.length > 0) {
    const line = putawayLines[0];
    
    // Populate missing fields
    if (!normalizedItemCode && line.item_code) {
      normalizedItemCode = line.item_code;
    }
    
    if (!normalizedCartonId && line.carton_id) {
      normalizedCartonId = line.carton_id;
    }
    
    // Get store from transfer_in or putaway task warehouse
    if (!normalizedStore) {
      if (line.transfer_in) {
        const [transferIn] = await connection.execute(
          `SELECT store FROM tabTransferIn WHERE name = ? LIMIT 1`,
          [line.transfer_in]
        );
        if (transferIn.length > 0 && transferIn[0].store) {
          normalizedStore = transferIn[0].store;
        }
      }
    }
  }
}
```

---

### Fix 4: Extract Putaway Task from `inbound_session`

**File**: `wms-api/src/modules/events/eventController.js`

**Change**: Extract putaway task from `inbound_session` field (e.g., "SESSION-ASN365425479-DE TI-PUT-20260120-0001"):

```javascript
// CRITICAL: For Transfer In putaway, extract putaway task from inbound_session
if (inbound_session && (inbound_session.includes('TI-PUT-') || inbound_session.includes('PUT-'))) {
  const taskMatch = inbound_session.match(/(TI-PUT-\d+-\d+|PUT-\d+-\d+)/);
  if (taskMatch) {
    putawayTaskForEvent = taskMatch[1];
    logger.info(`[Event] Extracted putaway task from inbound_session: ${putawayTaskForEvent}`);
  }
}
```

---

### Fix 5: Warehouse Lookup for Transfer In Putaway

**File**: `wms-api/src/modules/events/eventController.js`

**Change**: Get warehouse from `transfer_in` or putaway task for Transfer In putaway:

```javascript
// For Transfer In putaway, get warehouse from transfer_in or putaway task
if (taskInfo.length > 0) {
  const task = taskInfo[0];
  const isTransferInTask = (hasSourceType && task.source_type === 'TransferIn') || (hasTransferIn && task.transfer_in);
  
  if (isTransferInTask) {
    // Transfer In putaway: Get warehouse from transfer_in or putaway task
    if (hasWarehouse && task.warehouse) {
      warehouse = task.warehouse;
    } else if (hasTransferIn && task.transfer_in) {
      const [transferInInfo] = await connection.execute(
        `SELECT warehouse FROM tabTransferIn WHERE name = ? LIMIT 1`,
        [task.transfer_in]
      );
      if (transferInInfo.length > 0 && transferInInfo[0].warehouse) {
        warehouse = transferInInfo[0].warehouse;
      }
    }
  }
}
```

---

### Fix 6: Filter Putaway Lines by `carton_id` for Transfer In

**File**: `wms-api/src/modules/events/eventController.js`

**Change**: When `carton_id` is provided in the event, filter putaway lines by it:

```javascript
// CRITICAL: For Transfer In putaway, if carton_id is provided in event, filter lines by carton_id
let putawayLinesQuery = `SELECT item_code, qty, rack, bin, carton_id${locationIdSelect} FROM tabPutawayLine WHERE parent_title = ? AND item_code IS NOT NULL AND qty > 0`;
const putawayLinesParams = [putawayTaskTitle];

// If carton_id is provided (for Transfer In putaway), filter by it
if (carton_id) {
  putawayLinesQuery += ` AND carton_id = ?`;
  putawayLinesParams.push(carton_id);
}
```

---

## Expected Flow After Fix

### Scenario: Transfer In Putaway Completion

**1. Mobile App Sends PUTAWAY_TO_RACK Event:**
```json
{
  "event_type": "PUTAWAY_TO_RACK",
  "tc_id": "TI-PUT-20260120-0001",
  "inbound_session": "SESSION-ASN365425479-DE TI-PUT-20260120-0001",
  "location_id": "A1-R02-L1-B2",
  "qty": 1.00
}
```

**2. Event Normalization:**
- ✅ Extracts putaway task from `inbound_session`: "TI-PUT-20260120-0001"
- ✅ Recognizes `tc_id` is putaway task title (Transfer In putaway)
- ✅ Looks up `carton_id`, `item_code`, and `store` from putaway lines
- ✅ Populates missing fields: `carton_id = "CTN-555444"`, `item_code = "SKU-HAT-301-BLU-OS"`, `store = "STORE-001"`

**3. Event Inserted:**
```json
{
  "event_type": "PUTAWAY_TO_RACK",
  "tc_id": "TI-PUT-20260120-0001",
  "carton_id": "CTN-555444",
  "item_code": "SKU-HAT-301-BLU-OS",
  "store": "STORE-001",
  "location_id": "A1-R02-L1-B2",
  "qty": 1.00
}
```

**4. `processPutawayCompletionEvent` Called:**
- ✅ Recognizes `tc_id` is putaway task title
- ✅ Finds putaway task: "TI-PUT-20260120-0001"
- ✅ Gets all putaway lines for the task
- ✅ Gets warehouse from `transfer_in` or putaway task
- ✅ Updates stock ledger for each line
- ✅ Inserts transaction history records
- ✅ Marks putaway task as "Completed"

**5. Stock Updates:**
- ✅ Stock Qty updated
- ✅ Item Location Wise Qty updated
- ✅ Stock Ledger updated
- ✅ Stock History/Audit updated

---

## Status

✅ **Fixes Applied**

1. ✅ `completePutaway` recognizes putaway task title in `tc_id`
2. ✅ `processPutawayCompletionEvent` recognizes putaway task title in `tc_id`
3. ✅ Event normalization populates Transfer In data from putaway lines
4. ✅ Putaway task extracted from `inbound_session`
5. ✅ Warehouse lookup for Transfer In putaway
6. ✅ Filter putaway lines by `carton_id` for Transfer In

**Next Steps**:
1. Restart backend server
2. Test Transfer In putaway completion
3. Verify stock, ledger, and audit trail are updated
4. Verify scan events have all required fields

---

## Notes

- **Backward compatible**: ASN putaway logic remains unchanged
- **No database changes required**: Uses existing tables and columns
- **Comprehensive fix**: Addresses all three root causes
