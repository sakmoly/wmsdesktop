# Transfer IN Putaway Carton ID Fix

## Issue
Transfer IN Putaway was not updating Carton ID in `tabStockLedger` and `tabCartonStock` when completing putaway tasks.

## Root Cause
When receiving Transfer In items by `carton_id`, the code was updating `received_qty` in `tabTransferInItem` but **not ensuring that `carton_id` was set** if it was missing. This caused:

1. `tabTransferInItem.carton_id` to be NULL for some items
2. Putaway lines to be created with NULL `carton_id` (even though the receive operation used `carton_id`)
3. `completePutaway` to extract NULL `carton_id` from putaway lines
4. Stock ledger and carton stock to be updated without `carton_id`

## Fix Applied

### 1. Updated Transfer In Receive Logic

**File:** `wms-api/src/modules/transfer-in/transferInController.js`

**Changes:**
- When receiving by `carton_id`, the code now **ensures `carton_id` is set** in `tabTransferInItem`
- Updated the UPDATE query to set `carton_id` if it was NULL
- Added logging to track when `carton_id` is being set

**Key Code Change:**
```javascript
// Before: Only updated received_qty
UPDATE tabTransferInItem
SET received_qty = ?,
    updated_at = NOW()
WHERE parent_title = ? AND item_code = ? AND carton_id = ?

// After: Also ensures carton_id is set
UPDATE tabTransferInItem
SET received_qty = ?,
    carton_id = ?,  // ✅ Ensure carton_id is set
    updated_at = NOW()
WHERE parent_title = ?
  AND item_code = ?
  AND (carton_id = ? OR carton_id IS NULL)  // ✅ Update even if NULL
```

### 2. Enhanced Logging

**Added logging to:**
- Track when `carton_id` is set during receive operation
- Show which items have `carton_id` when creating putaway tasks
- Warn about items without `carton_id` in putaway task creation

## Flow After Fix

1. **Receive Transfer In by Carton ID:**
   - Mobile app sends: `POST /api/transfer-in/{title}/receive` with `carton_id`
   - Backend updates `tabTransferInItem`:
     - Sets `received_qty = qty`
     - **Ensures `carton_id` is set** ✅

2. **Create Putaway Task:**
   - When all items are received, `createPutawayTaskFromTransferIn` is called
   - Queries `tabTransferInItem` for items with `received_qty > 0`
   - **Gets `carton_id` from `tabTransferInItem`** ✅
   - Creates putaway lines with `carton_id` populated ✅

3. **Complete Putaway:**
   - `completePutaway` extracts `carton_id` from putaway lines
   - Updates `tabStockLedger` with `carton_id` (if column exists)
   - Updates `tabCartonStock` with `carton_id` ✅

## Testing

1. **Test Receive by Carton ID:**
   - Receive Transfer In items using `carton_id`
   - Verify `tabTransferInItem.carton_id` is set
   - Check logs for: `✅ Set carton_id=XXX for item YYY`

2. **Test Putaway Task Creation:**
   - Verify putaway task is created with `carton_id` in lines
   - Check logs for: `Items with carton_id: X`
   - Verify no warnings about missing `carton_id`

3. **Test Putaway Completion:**
   - Complete putaway task
   - Verify `tabStockLedger.carton_id` is set (if column exists)
   - Verify `tabCartonStock` has entries with correct `carton_id`
   - Check Item Location Breakdown shows carton IDs

## Files Modified

1. `wms-api/src/modules/transfer-in/transferInController.js`
   - Updated `receiveTransferInLine` to ensure `carton_id` is set
   - Added logging in `createPutawayTaskFromTransferIn`

## Related Issues

- This fix ensures `carton_id` flows from Transfer In receive → Putaway Task → Stock Ledger/Carton Stock
- The `completePutaway` function already handles `carton_id` correctly (no changes needed there)
- This is similar to the ASN Putaway fix, but for Transfer In workflow

## Next Steps

1. ✅ Code fix applied
2. ⏳ Test with real Transfer In data
3. ⏳ Verify carton IDs appear in Item Location Breakdown
4. ⏳ Monitor logs for any warnings about missing `carton_id`
