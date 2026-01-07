# Transfer Carton Dispatch - Stock Reduction Implementation

## Requirement

**User Request:**
> "Stock not deducted for the Stock Created. I prefer after Sealed CTN need another status dispatch, once change to dispatch create Stock ledger and reduce the stock"

**Workflow:**
- Created → Sealed → **Dispatched** → Stock Reduction happens here ✅

## Implementation

### Updated `dispatchTransferCarton` Function

**File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

**Changes:**
1. ✅ Added transaction support (beginTransaction, commit, rollback)
2. ✅ Validates that transfer carton is "Sealed" before allowing dispatch
3. ✅ Checks if transfer carton is a Material Request
4. ✅ For Material Request transfer cartons:
   - Gets items from transfer carton (from `tabWmsScanEvent`)
   - Gets source bins for each item
   - Reduces stock from source bins in `tabStockLedger`
   - Creates stock transaction log entries
   - Updates `tabItem.stock_qty`

### Stock Reduction Logic

**For Material Request Transfer Cartons:**

1. **Get Items from Transfer Carton:**
   - Queries `tabWmsScanEvent` for `PACK_BOX_TO_TC` and `PACK_ITEM_TO_TC` events
   - Uses `tc_id` if available, otherwise uses `transfer_order` (MR number) with time window
   - Groups by `item_code` and `source_bin` to handle items from different bins

2. **Get Source Bins:**
   - Priority: `source_bin` > `location_id` > `rack` + `bin` > `rack` > `bin`
   - If not found in packing events, looks in earlier picking events

3. **Reduce Stock:**
   - Gets current stock from `tabStockLedger` for `item_code` + `warehouse` + `bin_location`
   - Validates sufficient stock available
   - Decreases stock: `newQty = currentQty - qty`
   - Updates `tabStockLedger` with transaction type `'Dispatch'`
   - Creates `tabStockTransaction` log entry

4. **Update Aggregate Stock:**
   - Updates `tabItem.stock_qty` (sum of all bins)

## API Endpoint

**POST** `/api/transfer-cartons/dispatch`

**Request Body:**
```json
{
  "tc_id": "TC-MR-0001-1767524449896",
  "dispatched_by": "USER-150526"
}
```

**Response (Success):**
```json
{
  "ok": true,
  "message": "Transfer carton dispatched successfully"
}
```

**Response (Error - Not Sealed):**
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Transfer carton must be Sealed before dispatch. Current status: Created"
  }
}
```

## Validation

- ✅ Transfer carton must exist
- ✅ Transfer carton must be "Sealed" status (cannot dispatch "Created" or "Dispatched" cartons)
- ✅ Stock is only reduced for Material Request transfer cartons
- ✅ Validates sufficient stock before reducing

## Database Updates

### `tabStockLedger`
- **Transaction Type:** `'Dispatch'`
- **Reference:** Transfer Carton ID (`tc_id`)
- **Qty:** Decreased from source bin

### `tabStockTransaction`
- **Transaction Type:** `'Dispatch'`
- **Reference Doc Type:** `'Transfer Carton'`
- **Reference Doc:** Transfer Carton ID (`tc_id`)
- **Qty Change:** Negative (decrease)

### `tabItem`
- **stock_qty:** Updated (sum of all bins)

### `tabTransferCarton`
- **status:** Updated to `'Dispatched'`
- **dispatched_by:** Set to user ID (if provided)
- **dispatched_on:** Set to current timestamp

## Notes

1. **Stock Reduction Timing:**
   - Stock is now reduced **ONLY** when transfer carton is dispatched
   - Stock is **NOT** reduced when items are picked or when carton is sealed

2. **Source Bin Detection:**
   - Uses events to determine source bins
   - Falls back to earlier picking events if source bin not found in packing events
   - Time window: 6 hours before TC creation to current time

3. **Multiple Bins:**
   - Handles cases where same item comes from different source bins
   - Stock is reduced from each source bin separately

## Testing

1. **Create Transfer Carton** → Status: "Created"
2. **Pack Items** → Status: "Created" (stock not reduced)
3. **Seal Transfer Carton** → Status: "Sealed" (stock not reduced)
4. **Dispatch Transfer Carton** → Status: "Dispatched" (stock reduced here) ✅

## Next Steps

1. **Test:** Dispatch a sealed Material Request transfer carton
2. **Verify:** Check `tabStockLedger` - stock should be reduced
3. **Verify:** Check `tabStockTransaction` - dispatch transaction should be created
4. **Verify:** Check Stock Ledger screen - stock quantities should be updated

