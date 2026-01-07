# Stock Ledger qty_before and qty_reduced Implementation

## Overview

Added `qty_before` and `qty_reduced` columns to `tabStockLedger` table to track the last transaction details directly in the ledger for quick access.

## Database Changes

### Migration Script
- File: `wms-api/add-qty-before-reduced-to-stock-ledger.js`
- Adds two columns:
  - `qty_before DECIMAL(10,2) NULL` - Quantity before last transaction
  - `qty_reduced DECIMAL(10,2) NULL` - Quantity changed in last transaction (negative = reduction, positive = increase)

### Column Details
- **qty_before**: Stores the quantity before the transaction
- **qty_reduced**: Signed value
  - Negative for reductions (e.g., `-20` for dispatch)
  - Positive for increases (e.g., `+30` for receive)

## Code Changes

### 1. API Dispatch (Material Request)
- **File**: `wms-api/src/modules/transfer-cartons/transferCartonController.js`
- **Function**: `dispatchTransferCarton`
- **Changes**: 
  - Calculate `qtyBefore = currentQty`
  - Calculate `qtyReduced = -qty` (negative for reduction)
  - Include in INSERT/UPDATE query

### 2. Desktop App Dispatch (Material Request)
- **File**: `Services/TransferCartonDataService.cs`
- **Method**: `DispatchTransferCartonAsync`
- **Changes**: 
  - Calculate `qtyBefore = currentQty`
  - Calculate `qtyReduced = -qty` (negative for reduction)
  - Include in INSERT/UPDATE query

## Example Data

### Before Dispatch
```
item_code: SKU-HAT-301-BLU-OS
warehouse: WAREHOUSE-001
bin_location: A1-R01-L2-B1
qty: 160
qty_before: NULL (or previous value: 180)
qty_reduced: NULL (or previous change: -20)
```

### After Dispatch (Reduce 20)
```
item_code: SKU-HAT-301-BLU-OS
warehouse: WAREHOUSE-001
bin_location: A1-R01-L2-B1
qty: 140 (160 - 20)
qty_before: 160
qty_reduced: -20 (negative for reduction)
```

### After Receive (Add 30)
```
item_code: SKU-HAT-301-BLU-OS
warehouse: WAREHOUSE-001
bin_location: A1-R01-L2-B1
qty: 170 (140 + 30)
qty_before: 140
qty_reduced: +30 (positive for increase)
```

## Implementation Status

✅ **Completed:**
- Migration script created
- API dispatch logic updated
- Desktop app dispatch logic updated

⏳ **Pending (Future Enhancements):**
- Update other transaction types (Putaway, Receive, etc.)
- Update UI/Reports to display new fields
- Add validation (optional): `qty_before + qty_reduced = qty`

## SQL Query Examples

### Get Stock Ledger with Last Transaction Details
```sql
SELECT 
  item_code,
  warehouse,
  bin_location,
  qty as current_qty,
  qty_before,
  qty_reduced,
  last_transaction_type,
  last_transaction_date
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-BLU-OS'
  AND warehouse = 'WAREHOUSE-001';
```

### Calculate Change
```sql
SELECT 
  item_code,
  qty as current_qty,
  qty_before,
  qty_reduced,
  (qty_before + qty_reduced) as calculated_qty,
  CASE 
    WHEN (qty_before + qty_reduced) = qty THEN 'OK'
    ELSE 'MISMATCH'
  END as validation
FROM tabStockLedger
WHERE qty_before IS NOT NULL AND qty_reduced IS NOT NULL;
```

## Notes

1. **NULL Values**: Existing records will have NULL values (acceptable)
2. **Backward Compatibility**: Columns are nullable, so existing code continues to work
3. **Data Integrity**: `qty_before + qty_reduced = qty` should always be true (can add validation if needed)
4. **Performance**: Minimal impact (just two more columns to update)
5. **Future**: Consider updating other transaction types (Putaway, Receive, etc.) for consistency

## Next Steps (Optional)

1. Update Putaway transaction logic
2. Update Receive/Inbound transaction logic
3. Update UI to display `qty_before` and `qty_reduced`
4. Add validation to ensure data integrity
5. Update reports to include new fields

