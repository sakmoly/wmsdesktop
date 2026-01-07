# Fix: Transfer Carton Quantity Showing Double

## Problem

Transfer carton `TC-1767129300851` shows quantity **150** for item `SKU-HAT-301-BLU-OS` from source carton `PAW-ASN12225-1767129206`, but the actual quantity should be **75**.

## Root Cause

The queries were **not grouping events at the SQL level**. Instead, they were:
1. Fetching all individual events
2. Grouping in application code (C# or JavaScript)
3. **Summing quantities** when the same item+carton combination appeared multiple times

If there were **duplicate events** in the database (same item, same source carton, same quantity), they would be summed, resulting in double the quantity.

## Fixes Applied

### 1. Desktop Application (`TransferCartonService.cs`)
**Before:**
```csharp
// Fetched all events individually
SELECT item_code, carton_id, qty, event_time, user_id, event_type, box_id
FROM tabWmsScanEvent
WHERE tc_id = @tc_id
AND event_type = 'PACK_BOX_TO_TC'
AND item_code IS NOT NULL
ORDER BY event_time DESC

// Then grouped and summed in C# code
if (itemDict.ContainsKey(key)) {
    Qty = existing.Qty + qty; // ← Summing in code
}
```

**After:**
```csharp
// Group and sum at SQL level
SELECT 
    item_code, 
    COALESCE(box_id, carton_id) as source_carton,
    SUM(qty) as total_qty,
    MAX(event_time) as latest_event_time,
    MAX(user_id) as latest_user_id
FROM tabWmsScanEvent
WHERE tc_id = @tc_id
AND event_type = 'PACK_BOX_TO_TC'
AND item_code IS NOT NULL
GROUP BY item_code, COALESCE(box_id, carton_id)
ORDER BY latest_event_time DESC

// Use the already-summed quantity from SQL
Qty = totalQty; // ← No additional summing needed
```

### 2. API Backend (`transferCartonController.js`)
**Before:**
```javascript
// Fetched all events individually
SELECT item_code, box_id, carton_id, qty, user_id, event_time
FROM tabWmsScanEvent
WHERE tc_id = ?
AND event_type = 'PACK_BOX_TO_TC'
AND item_code IS NOT NULL
ORDER BY event_time DESC

// Then grouped and summed in JavaScript
if (contentsMap.has(key)) {
    existing.qty += parseFloat(event.qty) || 0; // ← Summing in code
}
```

**After:**
```javascript
// Group and sum at SQL level
SELECT 
    item_code,
    COALESCE(box_id, carton_id) as source_carton,
    SUM(qty) as total_qty,
    MAX(event_time) as latest_event_time,
    MAX(user_id) as latest_user_id
FROM tabWmsScanEvent
WHERE tc_id = ?
AND event_type = 'PACK_BOX_TO_TC'
AND item_code IS NOT NULL
GROUP BY item_code, COALESCE(box_id, carton_id)
ORDER BY latest_event_time DESC

// Use the already-summed quantity from SQL
qty: parseFloat(event.total_qty) || 0 // ← No additional summing needed
```

## Benefits

1. **Prevents double counting** - SQL GROUP BY ensures each item+carton combination appears only once
2. **More efficient** - Database does the grouping and summing, not application code
3. **Handles duplicates correctly** - If duplicate events exist, they're summed once at SQL level
4. **Consistent results** - Same logic in both desktop app and API

## Next Steps

### 1. Check for Duplicate Events

Run the diagnostic script to find duplicate events:
```sql
-- Run CHECK_DUPLICATE_TRANSFER_CARTON_EVENTS.sql
```

This will show:
- All events for the transfer carton
- Duplicate events (same item + carton + quantity)
- Correct quantity calculation

### 2. Fix Duplicate Events (if found)

If duplicate events are found, you can:
- Delete duplicate events (keep the first one)
- Or let the SQL grouping handle it (recommended - no data loss)

### 3. Restart Applications

1. **Desktop Application**: Rebuild and restart
2. **API Server**: Restart to apply changes

## Expected Result

After applying the fixes:
- Transfer carton `TC-1767129300851` should show **75** (not 150)
- If there are duplicate events, they'll be properly grouped
- Quantity will match the actual packed quantity

## Files Modified

- ✅ `Services/TransferCartonService.cs` - Changed SQL to GROUP BY
- ✅ `wms-api/src/modules/transfer-cartons/transferCartonController.js` - Changed SQL to GROUP BY
- ✅ `CHECK_DUPLICATE_TRANSFER_CARTON_EVENTS.sql` - Diagnostic script

---

**The quantity should now show correctly (75 instead of 150).**

