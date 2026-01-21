# Putaway Quantity Overwrite Fix

**Date**: 2026-01-19  
**Issue**: ASN received 5 + 5 = 10 items, but stock shows 5 + 1 = 6 items. Putaway line quantity was being overwritten.

---

## Problem

When a `PUTAWAY_TO_RACK` event is received with `item_code` and `qty`, the `processPutawayEvent` function was overwriting the putaway line quantity with the quantity from the event, even if the line already had the correct total quantity from `SORT_TO_BOX` events.

**Root Cause:**
1. `closeBox` correctly creates putaway lines with total quantities from `SORT_TO_BOX` events (e.g., qty: 5)
2. When a `PUTAWAY_TO_RACK` event is received with `item_code` and `qty: 1` (possibly from mobile app scanning one item at a time), `processPutawayEvent` was updating the line quantity to 1
3. This overwrote the correct quantity (5) with the partial quantity from the event (1)
4. Stock updates then processed only 1 unit instead of 5 units

**Example:**
- ASN received: SKU-HAT-301-GRN-OS with qty: 5
- `closeBox` creates putaway line with qty: 5 ✅
- `PUTAWAY_TO_RACK` event received with `item_code: SKU-HAT-301-GRN-OS, qty: 1`
- `processPutawayEvent` overwrites line quantity to 1 ❌
- Stock shows: 1 (should be 5) ❌

---

## Fix Applied

**File**: `wms-api/src/modules/events/eventController.js`

### Fix 1: Preserve Quantity When Updating Existing Lines

**Change**: Modified `processPutawayEvent` to **only update location fields** when processing `PUTAWAY_TO_RACK` events with `item_code`. The quantity from the event is **ignored** and the existing line quantity is **preserved**.

**Key Changes:**
```javascript
// OLD: Updated quantity from event
let updateFields = ['qty = ?', 'updated_at = CURRENT_TIMESTAMP'];
const updateParams = [qty]; // ❌ Uses event qty (might be partial)

// NEW: Only update location, preserve quantity
let updateFields = ['updated_at = CURRENT_TIMESTAMP'];
const updateParams = []; // ✅ No quantity update
// Only add location fields (rack, bin, location_id)
```

**Rationale:**
- The quantity in a `PUTAWAY_TO_RACK` event is not reliable because:
  - It might represent a partial quantity (scanning one item at a time)
  - The correct total quantity is already stored in the putaway line from `closeBox` or from `SORT_TO_BOX` events
- The `PUTAWAY_TO_RACK` event should only provide location information, not quantity

### Fix 2: Get Quantity from SORT_TO_BOX Events When Creating New Lines

**Change**: When creating a new putaway line (if one doesn't exist), get the quantity from `SORT_TO_BOX` events instead of using the quantity from the `PUTAWAY_TO_RACK` event.

**Code:**
```javascript
// Get quantity from SORT_TO_BOX events, not from PUTAWAY_TO_RACK event
let correctQty = qty; // Fallback to event qty if SORT_TO_BOX events not found
if (box_id || cartonIdForLine) {
  const [qtyFromEvents] = await connection.execute(
    `SELECT SUM(qty) as total_qty 
     FROM tabWmsScanEvent 
     WHERE event_type = 'SORT_TO_BOX' 
       AND item_code = ? 
       AND (box_id = ? OR carton_id = ?)
       AND qty > 0`,
    [item_code, box_id || cartonIdForLine, box_id || cartonIdForLine]
  );
  if (qtyFromEvents.length > 0 && qtyFromEvents[0].total_qty) {
    correctQty = parseFloat(qtyFromEvents[0].total_qty) || qty;
  }
}
```

---

## Expected Flow After Fix

1. **ASN received**: 5 + 5 = 10 items ✅
2. **`closeBox` creates putaway lines**: 
   - SKU-HAT-301-BLU-OS: qty: 5 ✅
   - SKU-HAT-301-GRN-OS: qty: 5 ✅
3. **`PUTAWAY_TO_RACK` event received** with `item_code: SKU-HAT-301-GRN-OS, qty: 1, location_id: A1-R02-L1-B2`
4. **`processPutawayEvent` processes event**:
   - Finds existing line with qty: 5 ✅
   - **Updates only location fields** (rack, bin, location_id) ✅
   - **Preserves quantity: 5** ✅
5. **Stock updates process**: 5 units ✅
6. **Stock shows**: 5 + 5 = 10 ✅

---

## Testing

### Test 1: Quantity Preserved When Updating Location

**Scenario**: Putaway line exists with qty: 5, `PUTAWAY_TO_RACK` event received with qty: 1

**Send Event**:
```json
POST /api/events/batch
{
  "events": [{
    "event_type": "PUTAWAY_TO_RACK",
    "box_id": "PAW-ASN365425476-1768843905998",
    "item_code": "SKU-HAT-301-GRN-OS",
    "qty": 1,
    "location_id": "A1-R02-L1-B2"
  }]
}
```

**Verify**:
```sql
SELECT item_code, qty, rack, bin, location_id
FROM tabPutawayLine
WHERE carton_id = 'PAW-ASN365425476-1768843905998'
  AND item_code = 'SKU-HAT-301-GRN-OS';
```

**Expected**: 
- `qty` should still be **5** (not 1)
- `rack`, `bin`, `location_id` should be updated

**Check Logs**:
- Should see: `[Putaway Event] Updated existing line ID X with location: ... (quantity preserved: 5)`

---

### Test 2: Stock Updates Use Correct Quantity

**After PUTAWAY_TO_RACK event**, check stock:
```sql
SELECT item_code, stock_qty 
FROM tabItem 
WHERE item_code IN ('SKU-HAT-301-BLU-OS', 'SKU-HAT-301-GRN-OS');
```

**Expected**: 
- SKU-HAT-301-BLU-OS: stock_qty = 5
- SKU-HAT-301-GRN-OS: stock_qty = 5
- Total: 10

**Check Stock Ledger**:
```sql
SELECT item_code, qty_change, location_id
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-GRN-OS'
  AND location_id = 'A1-R02-L1-B2'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected**: `qty_change` should be **+5** (not +1)

---

## Status

✅ **Fixes Applied**

1. ✅ `processPutawayEvent` preserves existing line quantities when updating location
2. ✅ `processPutawayEvent` gets quantity from `SORT_TO_BOX` events when creating new lines
3. ✅ Quantity from `PUTAWAY_TO_RACK` event is ignored (only location is used)

**Next Steps**:
1. Restart backend server
2. Test with ASN that has multiple items
3. Verify putaway line quantities are preserved
4. Verify stock updates use correct quantities

---

## Related Issues

- This fix addresses the issue where "ASN received 5 + 5 = 10 items, but stock shows 5 + 1 = 6 items"
- The root cause was quantity overwrite in `processPutawayEvent` when processing `PUTAWAY_TO_RACK` events
