# Material Request Over-Picking Allowed

## Change Summary

The backend API now **allows picking quantities that exceed the requested quantity** for Material Request items.

## Previous Behavior

- ❌ **Blocked over-picking**: API returned `400 VALIDATION_ERROR` if `picked_qty > requested_qty`
- ❌ **Skipped fully picked items**: Items with `picked_qty >= requested_qty` were skipped on subsequent scans

## New Behavior

- ✅ **Allows over-picking**: API accepts any `picked_qty` value, even if it exceeds `requested_qty`
- ✅ **Continues to accept scans**: Items can be scanned multiple times, even after reaching requested quantity
- ✅ **Status still updates**: Item status becomes "Picked" when `picked_qty >= requested_qty`
- ✅ **Logs over-picking**: Informational log message when over-picking occurs (not blocking)

## Use Cases

This change supports:

1. **Over-picking scenarios**: Warehouse staff may pick more items than requested for various reasons:
   - Safety stock requirements
   - Bulk picking efficiency
   - Actual available quantity exceeds requested
   - Rounding up to full cartons/boxes

2. **Quantity corrections**: Users can continue to scan items to correct or adjust quantities

3. **Flexible operations**: Allows warehouse operations to be more flexible without strict validation

## API Behavior

### POST /api/material-requests/{title}/pick-items

**Request:**
```json
{
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "picked_qty": 1.0,  // Will be added to existing picked_qty
      "source_bin": "A1-R02-L1-B2"
    }
  ],
  "warehouse": "WH-MAIN"
}
```

**Response (Over-Picking Allowed):**
```json
{
  "ok": true,
  "message": "Items picked successfully",
  "picked_count": 1
}
```

**Example Scenarios:**

1. **Requested: 2, Scanned: 8**
   - First scan: `picked_qty: 0 → 1`
   - Second scan: `picked_qty: 1 → 2` (status: "Picked")
   - Third scan: `picked_qty: 2 → 3` ✅ (over-picking allowed)
   - ... continues to 8 ✅

2. **Requested: 2, Scanned: 80**
   - All 80 scans are accepted ✅
   - Status: "Picked" (after reaching 2)
   - Log: `ℹ️  Over-picked item SKU-HAT-301-BLU-OS: Requested 2, Picked 80 (excess: 78)`

## Status Logic

Item status is determined as follows:

- **Pending**: `picked_qty = 0`
- **In Progress**: `picked_qty > 0 AND picked_qty < requested_qty`
- **Picked**: `picked_qty >= requested_qty` (includes over-picked items)

## Logging

When over-picking occurs, the backend logs an informational message:

```
ℹ️  Over-picked item SKU-HAT-301-BLU-OS: Requested 2, Picked 8 (excess: 6)
```

This is for tracking purposes only and does not block the operation.

## Database Impact

- `picked_qty` can exceed `requested_qty` in `tabMaterialRequestItem`
- `scan_qty` (if column exists) is set equal to `picked_qty`
- Item status is set to "Picked" when `picked_qty >= requested_qty`
- All scans are logged in `tabStockTransaction` and stock is reduced accordingly

## Mobile App Considerations

The mobile app should:

1. ✅ **Display actual scanned quantity**: Show `picked_qty` even if it exceeds `requested_qty`
2. ✅ **Show negative remaining**: Calculate `remaining = requested_qty - picked_qty` (can be negative)
3. ✅ **Allow continued scanning**: Don't block scans after reaching requested quantity
4. ✅ **Update display**: Refresh quantity display after each successful scan

**Example Display:**
```
Requested: 2
Scanned: 8
Remaining: -6  (2 - 8 = -6)
```

## Backward Compatibility

- ✅ Existing Material Requests continue to work
- ✅ Items already at requested quantity can be scanned again
- ✅ No breaking changes to API response format
- ✅ Status calculation remains the same (based on `>= requested_qty`)

---

**Status:** ✅ **COMPLETED**  
**Date:** 2026-01-12  
**File Changed:** `wms-api/src/modules/material-request/materialRequestController.js`
