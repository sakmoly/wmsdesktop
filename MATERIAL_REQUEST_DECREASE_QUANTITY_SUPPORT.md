# Material Request Decrease Quantity Support

## Change Summary

The backend API now **supports decreasing picked quantities** for Material Request items by accepting negative `picked_qty` values.

## Previous Behavior

- ❌ **Only allowed increases**: API only accepted positive `picked_qty` values
- ❌ **Blocked decreases**: Mobile app showed "Not Supported" error when trying to decrease quantity
- ❌ **No stock restoration**: Decreasing picked quantity did not restore stock to source bin

## New Behavior

- ✅ **Allows negative values**: API accepts negative `picked_qty` values to decrease quantity
- ✅ **Restores stock**: When decreasing, stock is added back to source bin
- ✅ **Prevents negative picked_qty**: `picked_qty` cannot go below 0
- ✅ **Handles both modes**: Supports both increasing (positive) and decreasing (negative) quantities

## Implementation Details

### Request Format

**Increase Quantity (Positive):**
```json
POST /api/material-requests/MR-123459/pick-items
{
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "picked_qty": 1.0,  // Adds 1 to existing picked_qty
      "source_bin": "A1-R02-L1-B2"
    }
  ],
  "warehouse": "WH-MAIN"
}
```

**Decrease Quantity (Negative):**
```json
POST /api/material-requests/MR-123459/pick-items
{
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "picked_qty": -18.0,  // Decreases picked_qty by 18
      "source_bin": "A1-R02-L1-B2"
    }
  ],
  "warehouse": "WH-MAIN"
}
```

### Behavior Examples

**Scenario 1: Current picked_qty = 20, Request to decrease to 2**
- Request: `picked_qty: -18` (decrease by 18)
- Result: `picked_qty: 20 → 2` ✅
- Stock: Added back to source bin ✅

**Scenario 2: Current picked_qty = 8, Request to decrease to 2**
- Request: `picked_qty: -6` (decrease by 6)
- Result: `picked_qty: 8 → 2` ✅
- Stock: Added back to source bin ✅

**Scenario 3: Current picked_qty = 2, Request to decrease by 5**
- Request: `picked_qty: -5` (decrease by 5)
- Result: `picked_qty: 2 → 0` ✅ (cannot go below 0)
- Stock: Added back to source bin ✅

### Stock Update Logic

**When Increasing (picked_qty > 0):**
- Stock is **reduced** from source bin
- `qty_change` in `tabStockTransaction` is **negative** (e.g., -1)
- Validates sufficient stock available before reducing

**When Decreasing (picked_qty < 0):**
- Stock is **added back** to source bin
- `qty_change` in `tabStockTransaction` is **positive** (e.g., +18)
- No stock validation needed (always allowed)

### Validation

1. ✅ **Negative values allowed**: `picked_qty` can be negative
2. ✅ **Zero allowed**: `picked_qty` can be 0 (no change)
3. ✅ **Minimum enforced**: `picked_qty` cannot go below 0
4. ✅ **Stock validation**: Only validates stock availability when increasing

### Status Updates

Item status is recalculated based on new `picked_qty`:
- **Pending**: `picked_qty = 0`
- **In Progress**: `picked_qty > 0 AND picked_qty < requested_qty`
- **Picked**: `picked_qty >= requested_qty`

### Stock Transaction Log

**Increasing (picked_qty = 1):**
```sql
qty_change: -1  (stock reduced)
transaction_type: 'Picking'
```

**Decreasing (picked_qty = -18):**
```sql
qty_change: +18  (stock added back)
transaction_type: 'Picking'
```

## Mobile App Integration

The mobile app can now:

1. ✅ **Decrease quantity**: Send negative `picked_qty` to decrease
2. ✅ **Calculate decrease**: `decrease_amount = current_picked_qty - new_picked_qty`
3. ✅ **Send request**: `picked_qty: -decrease_amount`

**Example:**
```javascript
// Current: 20, New: 2
const decreaseAmount = 20 - 2; // 18
const request = {
  item_code: "SKU-HAT-301-BLU-OS",
  picked_qty: -decreaseAmount, // -18
  source_bin: "A1-R02-L1-B2"
};
```

## Database Impact

- `picked_qty` can be decreased (but not below 0)
- `scan_qty` (if column exists) is updated to match `picked_qty`
- Stock is restored to source bin when decreasing
- Stock transaction log records both increases and decreases

## Error Handling

**Insufficient Stock (when increasing):**
```json
{
  "ok": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Insufficient stock for SKU-HAT-301-BLU-OS at A1-R02-L1-B2. Available: 5, Required: 10"
  }
}
```

**Note:** No error when decreasing - stock is always added back.

## Backward Compatibility

- ✅ Existing positive `picked_qty` values continue to work
- ✅ No breaking changes to API response format
- ✅ Status calculation remains the same
- ✅ Stock reduction logic unchanged for positive values

---

**Status:** ✅ **COMPLETED**  
**Date:** 2026-01-12  
**File Changed:** `wms-api/src/modules/material-request/materialRequestController.js`
