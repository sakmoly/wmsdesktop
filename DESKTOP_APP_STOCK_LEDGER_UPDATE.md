# Desktop App Stock Ledger Update - qty_before and qty_reduced

## Changes Made

### 1. Model Update (`Models/StockLedger.cs`)
Added two new nullable properties to the `StockLedger` class:
```csharp
public double? QtyBefore { get; init; }
public double? QtyReduced { get; init; }
```

### 2. Data Service Update (`Services/StockLedgerService.cs`)
Updated two methods to fetch the new fields:

**`GetAllStockLedgerAsync`:**
- Added `qty_before, qty_reduced` to SELECT query
- Updated reader mapping to include new fields (positions 5 and 6)

**`GetStockByBinAsync`:**
- Added `qty_before, qty_reduced` to SELECT query
- Updated reader mapping to include new fields (positions 5 and 6)

### 3. View Update (`Views/StockLedgerView.xaml`)
Added two new DataGrid columns after "Available Qty":
```xml
<DataGridTextColumn Header="Qty Before"
                    Binding="{Binding QtyBefore, StringFormat=N2}"
                    Width="100" />
<DataGridTextColumn Header="Qty Reduced"
                    Binding="{Binding QtyReduced, StringFormat=N2}"
                    Width="100" />
```

## Column Order in DataGrid

1. Item Code
2. Warehouse
3. Bin Location
4. Quantity
5. Reserved Qty
6. Available Qty
7. **Qty Before** (NEW)
8. **Qty Reduced** (NEW)
9. Last Transaction Type
10. Last Transaction Ref
11. Last Transaction Date
12. Updated At

## Expected Behavior

### Existing Records
- Will show NULL (empty) for `qty_before` and `qty_reduced`
- This is expected - these records were created before the feature was added

### New Dispatches
- After API server restart and new dispatches:
  - `qty_before`: Will show the quantity before the transaction (e.g., `160.00`)
  - `qty_reduced`: Will show the change amount, negative for reductions (e.g., `-20.00`)

## Next Steps

1. **Rebuild the Desktop Application**
   - Open solution in Visual Studio
   - Build → Rebuild Solution
   - Run the application

2. **Verify the Changes**
   - Navigate to Stock Ledger view
   - Check that "Qty Before" and "Qty Reduced" columns appear
   - Existing records will show NULL (expected)
   - After API server restart and new dispatch, fields will be populated

## Notes

- Columns are nullable (`double?`) to handle existing records
- Format: `N2` (2 decimal places) for both columns
- `qty_reduced` will be negative for reductions, positive for increases
- Database columns already exist (migration completed)

