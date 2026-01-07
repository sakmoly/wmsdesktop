# Stock Ledger Analysis: Adding qty_before and qty_reduced Fields

## Current State

### tabStockLedger Table Structure
The `tabStockLedger` table currently stores:
- `item_code` - Item identifier
- `warehouse` - Warehouse identifier
- `bin_location` - Bin location
- `qty` - **Current quantity** (updated on each transaction)
- `reserved_qty` - Reserved quantity
- `last_transaction_date` - Date of last transaction
- `last_transaction_type` - Type of last transaction (e.g., 'Dispatch', 'Receive')
- `last_transaction_ref` - Reference document (e.g., TC ID, ASN number)
- `updated_at`, `created_at` - Timestamps

### tabStockTransaction Table Structure
The `tabStockTransaction` table (transaction log) already stores:
- `qty_before` - Quantity before transaction
- `qty_after` - Quantity after transaction
- `qty_change` - Change in quantity (positive for increase, negative for decrease)

## User Request

The user wants to add to `tabStockLedger`:
1. **`qty_before`** - Previous quantity (before the transaction)
2. **`qty_reduced`** - Transaction quantity (amount reduced/increased)

## Analysis

### Option 1: Add Historical Fields to tabStockLedger (Recommended Approach)

**Pros:**
- Quick access to last transaction details without querying `tabStockTransaction`
- Useful for reporting and auditing
- Maintains transaction history at the ledger level

**Cons:**
- Adds redundant data (already in `tabStockTransaction`)
- Requires updating these fields on every transaction
- `tabStockLedger` becomes less normalized

**Implementation:**
```sql
ALTER TABLE tabStockLedger
ADD COLUMN qty_before DECIMAL(18,2) NULL COMMENT 'Quantity before last transaction',
ADD COLUMN qty_reduced DECIMAL(18,2) NULL COMMENT 'Quantity changed in last transaction (negative = reduction, positive = increase)';
```

**Usage in Code:**
```javascript
// On dispatch (reduce stock):
const qtyBefore = currentQty;
const qtyReduced = -qty; // Negative for reduction
const newQty = currentQty - qty;

await connection.execute(`
  INSERT INTO tabStockLedger 
  (item_code, warehouse, bin_location, qty, reserved_qty,
   qty_before, qty_reduced,  -- NEW FIELDS
   last_transaction_date, last_transaction_type, last_transaction_ref,
   updated_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 'Dispatch', ?, NOW(), NOW())
  ON DUPLICATE KEY UPDATE
    qty = ?,
    qty_before = ?,  -- NEW FIELD
    qty_reduced = ?,  -- NEW FIELD
    last_transaction_date = NOW(),
    last_transaction_type = 'Dispatch',
    last_transaction_ref = ?,
    updated_at = NOW()
`, [
  itemCode, warehouse, sourceBin, newQty, currentReservedQty,
  qtyBefore, qtyReduced,  -- NEW FIELDS
  tcId, newQty, qtyBefore, qtyReduced, tcId
]);
```

### Option 2: Use Existing tabStockTransaction Table (Alternative Approach)

**Pros:**
- No schema changes needed
- Already contains this information
- Better normalized design
- Full transaction history available

**Cons:**
- Requires JOIN query to get last transaction details
- Slightly more complex queries

**Usage:**
```sql
SELECT 
  sl.item_code,
  sl.warehouse,
  sl.bin_location,
  sl.qty as current_qty,
  st.qty_before,
  st.qty_change as qty_reduced,
  st.transaction_date
FROM tabStockLedger sl
LEFT JOIN tabStockTransaction st ON 
  st.item_code = sl.item_code 
  AND st.warehouse = sl.warehouse 
  AND st.bin_location = sl.bin_location
  AND st.transaction_date = (
    SELECT MAX(transaction_date) 
    FROM tabStockTransaction 
    WHERE item_code = sl.item_code 
      AND warehouse = sl.warehouse 
      AND bin_location = sl.bin_location
  )
WHERE sl.item_code = ? AND sl.warehouse = ? AND sl.bin_location = ?;
```

## Recommendation

**Recommended: Option 1** - Add `qty_before` and `qty_reduced` to `tabStockLedger`

**Reasoning:**
1. **Performance**: Quick access without JOIN queries
2. **Simplicity**: Direct access to last transaction details
3. **Reporting**: Easier to generate reports showing current stock with last transaction details
4. **User Requirement**: User specifically requested these fields in the stock ledger

**Note on Field Name:**
- User said `qty_reduced`, but this should actually be `qty_change` to handle both increases and decreases
- For reductions: negative value (e.g., -20)
- For increases: positive value (e.g., +20)
- Or we can use `qty_reduced` and `qty_increased` as separate fields (less common)
- **Recommendation**: Use `qty_change` (matches `tabStockTransaction` convention) or `qty_reduced` if user prefers (but make it signed to handle both cases)

## Implementation Plan

### Step 1: Database Migration
- Add `qty_before` and `qty_reduced` columns to `tabStockLedger`
- Make them NULL initially (existing records will have NULL)
- Set them on new transactions

### Step 2: Update Dispatch Logic (Material Request)
- Files to modify:
  1. `wms-api/src/modules/transfer-cartons/transferCartonController.js` (API)
  2. `Services/TransferCartonDataService.cs` (Desktop App)
- Update INSERT/UPDATE queries to include new fields

### Step 3: Update Other Transaction Types
- Receive/Inbound transactions
- Putaway transactions
- Any other stock movement transactions

### Step 4: Update Queries/Reports
- Update any queries that display stock ledger information
- Update reports to show `qty_before` and `qty_reduced`

## Considerations

1. **Backward Compatibility**: Existing records will have NULL values (acceptable)
2. **Transaction Types**: Need to handle both reductions (Dispatch) and increases (Receive)
3. **Field Naming**: Confirm with user if `qty_reduced` should handle both increases/decreases (signed value) or if separate fields needed
4. **Performance**: Minimal impact (just two more columns to update)
5. **Data Integrity**: Ensure `qty_before + qty_reduced = qty` (can add constraint or validation)

## Questions for User

1. Should `qty_reduced` handle both increases and decreases (signed value: -20 for reduction, +20 for increase)?
   - OR should we have separate fields: `qty_reduced` and `qty_increased`?
   - OR use `qty_change` (matches `tabStockTransaction`)?

2. Should these fields be mandatory (NOT NULL) or optional (NULL allowed)?
   - Recommendation: NULL allowed (for existing records and initial creation)

3. Should we validate that `qty_before + qty_reduced = qty`?
   - Recommendation: Application-level validation (not database constraint)

4. Should we populate these fields for existing records?
   - Recommendation: Leave NULL (only populate for new transactions)

## Example Data

### Before Transaction:
```
item_code: SKU-HAT-301-BLU-OS
warehouse: WAREHOUSE-001
bin_location: A1-R01-L2-B1
qty: 160
qty_before: NULL (or previous value)
qty_reduced: NULL (or previous change)
```

### After Dispatch (Reduce 20):
```
item_code: SKU-HAT-301-BLU-OS
warehouse: WAREHOUSE-001
bin_location: A1-R01-L2-B1
qty: 140 (160 - 20)
qty_before: 160
qty_reduced: -20 (negative for reduction)
```

### After Receive (Add 30):
```
item_code: SKU-HAT-301-BLU-OS
warehouse: WAREHOUSE-001
bin_location: A1-R01-L2-B1
qty: 170 (140 + 30)
qty_before: 140
qty_reduced: +30 (positive for increase)
```

## Next Steps

1. **Confirm with user**: Field naming and approach
2. **Create migration script**: Add columns to `tabStockLedger`
3. **Update dispatch logic**: Material Request dispatch
4. **Update other transaction types**: Receive, Putaway, etc.
5. **Test**: Verify data is stored correctly
6. **Update UI/Reports**: Display new fields if needed

