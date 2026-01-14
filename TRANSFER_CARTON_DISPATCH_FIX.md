# Transfer Carton Dispatch Fix

## 🐛 Problem

When dispatching a Transfer Carton, the backend was throwing an error:
```
itemCodes is not defined
```

### Root Cause

The `itemCodes` variable was only defined inside a disabled Material Request block:
```javascript
if (false && isMaterialRequest) {
  // ... code that defines itemCodes ...
  const itemCodes = [...new Set(cartonItemsByBin.map(item => item.item_code).filter(Boolean))];
}
```

But `postStock()` was being called outside that block:
```javascript
// Post stock updates (rebuild summaries from ledger)
if (itemCodes && itemCodes.length > 0) {  // ❌ itemCodes is not defined here!
  const postingResult = await postStock('TC_DISPATCH', tc_id, {
    itemCodes,
    warehouse: warehouse,
    // ...
  });
}
```

## ✅ Solution

### Changes Applied

1. **Query `tabWmsScanEvent` to get item codes** (before the Material Request block):
   ```javascript
   // Get item codes from packing events for this Transfer Carton
   const [eventItems] = await connection.execute(
     `
     SELECT DISTINCT item_code
     FROM tabWmsScanEvent
     WHERE tc_id = ?
       AND event_type IN ('PACK_ITEM_TO_TC', 'PACK_BOX_TO_TC')
       AND item_code IS NOT NULL
       AND item_code != ''
     `,
     [tc_id]
   );
   
   const itemCodes = eventItems.map(row => row.item_code).filter(Boolean);
   ```

2. **Get warehouse from events or transfer carton**:
   ```javascript
   let warehouse = null;
   if (itemCodes.length > 0) {
     // Try to get warehouse from events
     const [warehouseRows] = await connection.execute(
       `
       SELECT DISTINCT warehouse
       FROM tabWmsScanEvent
       WHERE tc_id = ?
         AND warehouse IS NOT NULL
         AND warehouse != ''
       LIMIT 1
       `,
       [tc_id]
     );
     
     if (warehouseRows.length > 0) {
       warehouse = warehouseRows[0].warehouse;
     } else {
       // Fallback: get warehouse from transfer carton store
       warehouse = tcRows[0].store;
     }
   }
   ```

3. **Use `itemCodes` and `warehouse` in `postStock()` call**:
   ```javascript
   // Post stock updates (rebuild summaries from ledger)
   if (itemCodes && itemCodes.length > 0) {
     const postingResult = await postStock('TC_DISPATCH', tc_id, {
       itemCodes,
       warehouse: warehouse,
       postedBy: dispatched_by || null,
       connection
     });
   }
   ```

## 📊 How It Works

### Flow Diagram

```
Mobile App sends dispatch request
  ↓
POST /api/transfer-cartons/dispatch
  {
    "tc_id": "TC-MR-1401263-1768385348746",
    "dispatched_by": "USER-150526"
  }
  ↓
Backend receives request
  ↓
1. Query tabWmsScanEvent for item codes
   SELECT DISTINCT item_code
   FROM tabWmsScanEvent
   WHERE tc_id = ? AND event_type IN ('PACK_ITEM_TO_TC', 'PACK_BOX_TO_TC')
  ↓
2. Extract item codes from results
  ↓
3. Get warehouse from events or transfer carton
  ↓
4. Update transfer carton status to "Dispatched"
  ↓
5. Call postStock() with itemCodes and warehouse
  ↓
✅ Stock posted successfully
```

## 🧪 Testing

### Test Case 1: Material Request Transfer Carton
```bash
POST /api/transfer-cartons/dispatch
{
  "tc_id": "TC-MR-1401263-1768385348746",
  "dispatched_by": "USER-150526"
}
```

**Expected:**
- ✅ Query finds item codes from packing events
- ✅ `itemCodes` is defined
- ✅ `warehouse` is defined
- ✅ `postStock()` is called successfully
- ✅ Stock posting completes without errors

### Test Case 2: Regular Transfer Order
```bash
POST /api/transfer-cartons/dispatch
{
  "tc_id": "TC-TO-001-001",
  "dispatched_by": "USER-150526"
}
```

**Expected:**
- ✅ Query finds item codes from packing events
- ✅ Works for both Material Request and regular Transfer Orders

## ✅ Result

- ✅ **`itemCodes` is now properly defined** before use
- ✅ **Stock posting works** for all Transfer Cartons
- ✅ **Works for both Material Request and regular Transfer Orders**
- ✅ **No more "itemCodes is not defined" errors**

## 📝 Notes

1. **Packing Events Required:**
   - The mobile app must send `PACK_ITEM_TO_TC` or `PACK_BOX_TO_TC` events with `tc_id`
   - These events link items to the Transfer Carton
   - Without these events, no item codes will be found

2. **Warehouse Detection:**
   - First tries to get warehouse from events
   - Falls back to transfer carton's `store` field if not found in events

3. **Stock Posting:**
   - Only runs if `itemCodes.length > 0`
   - Uses the centralized `postStock()` service
   - Rebuilds item and bin stock summaries

## 🔍 Verification

### Check if events exist:
```sql
SELECT DISTINCT item_code, event_type, tc_id
FROM tabWmsScanEvent
WHERE tc_id = 'TC-MR-1401263-1768385348746'
  AND event_type IN ('PACK_ITEM_TO_TC', 'PACK_BOX_TO_TC');
```

### Check stock posting log:
```sql
SELECT *
FROM tabStockPostingLog
WHERE transaction_type = 'TC_DISPATCH'
  AND transaction_id LIKE 'TC-MR-1401263%'
ORDER BY posted_at DESC
LIMIT 5;
```
