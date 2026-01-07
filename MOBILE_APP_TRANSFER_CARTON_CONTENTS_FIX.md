# Mobile App Transfer Carton Contents Fix

## Issue

**Mobile App Warning:**
> "No items scanned or boxes packed. Please scan items or pack boxes before sealing."

**Desktop App:**
> Items are correctly showing in transfer carton (5 items, 5 unique SKUs, 10 total pieces)

**Root Cause:**
The mobile app uses `GET /api/transfer-cartons/:tc_id` to check if items exist before allowing sealing. However, this API endpoint was only querying by `tc_id`, and since the mobile app is not sending `tc_id` in packing events, it returns 0 items.

The desktop app works because it uses `Services/TransferCartonService.cs` which has fallback logic for Material Request transfer cartons (queries by Material Request number with time window).

## Solution

Added the same Material Request fallback logic to `getTransferCartonById` API endpoint that we previously added to the desktop app.

**File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

**Changes:**
1. ✅ If no items found with `tc_id`, check if transfer carton is a Material Request
2. ✅ For Material Request transfer cartons, query by `transfer_order` (MR number) with time window
3. ✅ Time window: 6 hours before TC creation to 2 hours after sealing (or current time if not sealed)
4. ✅ Includes events with `tc_id IS NULL` (handles mobile app not sending `tc_id`)
5. ✅ Dynamically checks for `material_request` column existence

## Implementation Details

### Fallback Logic Flow:

1. **Primary Query:** Query by `tc_id`
   ```sql
   WHERE tc_id = ? 
     AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
   ```

2. **If No Items Found & Material Request:**
   - Detect Material Request: Check if `to_no` matches pattern `MR-\d+`
   - Query by Material Request number:
     ```sql
     WHERE (transfer_order = ? OR material_request = ?)
       AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
       AND (tc_id IS NULL OR tc_id = ?)
       AND event_time >= ? AND event_time <= ?
     ```
   - Time window: TC creation - 6 hours to TC seal + 2 hours (or current time)

3. **Group and Return:**
   - Group by `item_code` and `box_id`
   - Sum quantities
   - Return items with quantities, source carton, packed by, packed on

## API Endpoint

**GET** `/api/transfer-cartons/:tc_id`

**Response (with items):**
```json
{
  "ok": true,
  "data": {
    "tc_id": "TC-MR-2001-1767526435449",
    "status": "Created",
    "to_no": "MR-2001",
    "store": "STORE-002",
    "contents": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "source_carton": null,
        "qty": 2,
        "packed_by": "USER-150526",
        "packed_on": "2026-01-04T11:33:00.000Z"
      },
      ...
    ]
  }
}
```

## Expected Behavior After Fix

1. **Mobile App:**
   - ✅ Calls `GET /api/transfer-cartons/:tc_id`
   - ✅ API uses fallback logic to find items by Material Request number
   - ✅ Items are returned even if `tc_id` not in events
   - ✅ Mobile app sees items and allows sealing

2. **Desktop App:**
   - ✅ Already working (uses `TransferCartonService.cs` with fallback)
   - ✅ No changes needed

## Testing

1. **Create Transfer Carton** (Mobile App)
2. **Pack Items** (Mobile App - events without `tc_id`)
3. **Check Transfer Carton Contents** (Mobile App - should now show items)
4. **Seal Transfer Carton** (Mobile App - should now allow sealing)

## Notes

1. **This is still a workaround** - The mobile app should include `tc_id` in packing events for reliable operation
2. **Fallback uses time window** - Events must be within 6 hours before TC creation to 2 hours after sealing
3. **Material Request detection** - Only applies to transfer cartons where `to_no` matches `MR-\d+` pattern

## Next Steps

1. **Restart API Server** to load the fix
2. **Test:** Mobile app should now show items in transfer carton
3. **Test:** Mobile app should allow sealing when items exist
4. **Future:** Mobile app should include `tc_id` in packing events (recommended)

