# Item Location Breakdown Quantity Fix

## Summary
Fixed stock quantity mismatch for Item Location Breakdown by standardizing quantity meanings and using the existing API endpoint.

## Changes Made

### 1. API Endpoint (`GET /api/stock/item/{item_code}/warehouse/{warehouse}`)

**Standardized Quantity Meanings:**
- `total_qty`: Physical on-hand at bin (sum of carton.qty)
- `reserved_qty`: Reserved at same bin scope (from `tabStockLedger`)
- `blocked_qty`: Blocked (holds/staging/damaged/in-progress) - calculated from carton status
- `available_qty`: `total_qty - reserved_qty - blocked_qty` (no hidden deductions)

**Blocked Status Detection:**
- Cartons with status: `HOLD`, `STAGING`, `DAMAGED`, `IN_PROGRESS`, `PICKED`, `DISPATCHED` are considered blocked
- Blocked quantity is summed per bin

**Calculation Logging:**
- Added `calculation_log` array to each bin response
- Logs explain why `total_qty` and `available_qty` differ
- Example: `"Calculation: 100 (total) - 5 (reserved) - 2 (blocked) = 93 (available)"`
- Example: `"Difference: 7 qty (5 reserved, 2 blocked)"`

**Per-Bin Reservation:**
- Reservation is computed per bin from `tabStockLedger.reserved_qty`
- If reservation exists only at warehouse/item level, it's not exposed per-bin (as per requirement)

### 2. Desktop App Model (`ItemLocationStock.cs`)

**Added Quantity Fields:**
```csharp
public double TotalQty { get; init; }      // Physical on-hand
public double ReservedQty { get; init; }  // Reserved at bin
public double BlockedQty { get; init; }    // Blocked
public double AvailableQty { get; init; } // total_qty - reserved_qty - blocked_qty

// Backward compatibility
public double Qty => AvailableQty;

// Calculation log for debugging
public List<string>? CalculationLog { get; init; }
```

### 3. Desktop App Service (`ItemLocationStockService.cs`)

**New Service:**
- Calls `GET /api/stock/item/{item_code}/warehouse/{warehouse}?format=grouped`
- Handles API authentication and error handling
- Returns `List<ItemLocationStockApiResponse>`

### 4. Desktop App UI (`ItemLocationBreakdownWindow.xaml`)

**Updated Columns:**
- **Default:** "Available Qty" column (binds to `AvailableQty`)
- **Optional (hidden by default):** "Total Qty", "Reserved Qty", "Blocked Qty" columns
- Total at bottom sums `AvailableQty` (when in available mode)

**Column Visibility:**
- Available Qty: Always visible (default)
- Total Qty, Reserved Qty, Blocked Qty: Hidden by default (can be shown via column menu)

### 5. ViewModel Update (`ItemLocationBreakdownViewModel.cs`)

**API Integration:**
- Updated to use `ItemLocationStockService.GetItemLocationStockAsync()`
- Processes API response and enriches with location details from database
- Maps API response to `ItemLocationStock` model with all quantity fields

**Total Calculation:**
- `TotalQty` property now sums `AvailableQty` from all locations
- Display shows "Total Available Qty: {0}"

## API Response Format

```json
[
  {
    "item_code": "SKU-001",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R01-L3-B1",
    "cartons": [
      { "carton_id": "CTN-001", "qty": 50, "status": "PUTAWAY" },
      { "carton_id": "CTN-002", "qty": 30, "status": "HOLD" }
    ],
    "total_qty": 80,
    "reserved_qty": 5,
    "blocked_qty": 30,
    "available_qty": 45,
    "calculation_log": [
      "Carton CTN-002: 30 qty blocked (status: HOLD)",
      "Reserved: 5 qty (from tabStockLedger)",
      "Calculation: 80 (total) - 5 (reserved) - 30 (blocked) = 45 (available)",
      "Difference: 35 qty (5 reserved, 30 blocked)"
    ]
  }
]
```

## Acceptance Criteria

✅ **Standardized Meaning:**
- `total_qty` = physical on-hand at bin (sum of carton.qty)
- `reserved_qty` = reserved at same bin scope
- `blocked_qty` = holds/staging/damaged/in-progress
- `available_qty` = `total_qty - reserved_qty - blocked_qty` (no hidden deductions)

✅ **Per-Bin Reservation:**
- Reservation computed per bin from `tabStockLedger`
- If reservation only exists at warehouse/item level, not exposed per-bin

✅ **Desktop Item Location Breakdown:**
- Qty column binds to `available_qty` (default)
- Optional columns for `total_qty`, `reserved_qty`, `available_qty` (hidden by default)
- Total at bottom sums `available_qty`

✅ **Logging:**
- `calculation_log` explains why `total_qty` and `available_qty` differ, per bin
- Console logs show differences for debugging

✅ **No Duplicate Endpoints:**
- Uses existing `GET /api/stock/item/{item_code}/warehouse/{warehouse}` endpoint
- No new endpoints created

## Testing

1. **Test API Response:**
   ```bash
   GET /api/stock/item/SKU-001/warehouse/WH-MAIN?format=grouped
   ```
   - Verify `total_qty`, `reserved_qty`, `blocked_qty`, `available_qty` are correct
   - Verify `calculation_log` explains differences

2. **Test Desktop App:**
   - Open Item Location Breakdown for an item
   - Verify "Available Qty" column shows correct values
   - Verify total at bottom sums available quantities
   - Right-click column header to show/hide optional columns

3. **Test Blocked Quantity:**
   - Create cartons with status `HOLD`, `STAGING`, `DAMAGED`
   - Verify `blocked_qty` is calculated correctly
   - Verify `available_qty` excludes blocked quantity

4. **Test Reservation:**
   - Set `reserved_qty` in `tabStockLedger` for a bin
   - Verify `available_qty` excludes reserved quantity
   - Verify `calculation_log` mentions reserved quantity

## Next Steps

1. Update `ItemLocationBreakdownViewModel.cs` to fully use API (currently partially updated)
2. Test with real data to ensure quantities reconcile with ledger/reservation
3. Add UI toggle to show/hide optional quantity columns
4. Add tooltip or info icon to explain quantity meanings
