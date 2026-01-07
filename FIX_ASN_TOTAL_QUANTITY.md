# Fix: ASN Total Shipped Quantity Showing Wrong Value

## Problem
The "Total Shipped Qty" displayed in the ASN list was showing incorrect values (e.g., showing 100 instead of 1600). The issue was that the application was reading the `total_shipped_qty` field directly from the `tabAdvanceShippingNotice` table, which can become stale when items are added, updated, or deleted.

## Root Cause
The `total_shipped_qty` field in the ASN header table (`tabAdvanceShippingNotice`) is a stored value that may not be automatically updated when item details change. This is similar to the transfer carton quantity issue we fixed earlier.

## Solution
Calculate the total shipped quantity **dynamically** from the item details table (`tabAsnItemDetails`) using SQL `SUM()` aggregation, instead of reading the stored value from the header table.

## Changes Made

### 1. Desktop Application (`Services/AsnDataService.cs`)

**Before:**
```sql
SELECT a.title, a.status, ..., a.total_shipped_qty, ...
FROM tabAdvanceShippingNotice a
LEFT JOIN tabAsnItemDetails d ON a.title = d.parent_title AND d.carton_id IS NOT NULL
GROUP BY ..., a.total_shipped_qty, ...
```

**After:**
```sql
SELECT a.title, a.status, ..., 
       COALESCE(SUM(d.shipped_qty), 0) as total_shipped_qty,  -- ✅ Calculated dynamically
       ...
FROM tabAdvanceShippingNotice a
LEFT JOIN tabAsnItemDetails d ON a.title = d.parent_title
GROUP BY ...  -- Removed a.total_shipped_qty from GROUP BY
```

**Key Changes:**
- Removed `a.total_shipped_qty` from SELECT and GROUP BY
- Added `COALESCE(SUM(d.shipped_qty), 0) as total_shipped_qty` to calculate from item details
- Removed `AND d.carton_id IS NOT NULL` filter from JOIN (to include all items, not just those with cartons)
- Updated carton count to use `COUNT(DISTINCT CASE WHEN d.carton_id IS NOT NULL THEN d.carton_id END)` to exclude NULL cartons

### 2. API Backend (`wms-api/src/modules/master/masterController.js`)

**Updated `getAllAsns` function:**
- Changed from reading `a.total_shipped_qty` to calculating `COALESCE(SUM(d.shipped_qty), 0)`
- Removed `AND d.carton_id IS NOT NULL` filter from JOIN
- Updated carton count calculation

**Updated `getAsnByNumber` function:**
- Changed from reading `total_shipped_qty` from header to calculating it with a JOIN and SUM
- Added GROUP BY clause to support the aggregation

## Benefits
1. **Always Accurate**: Total is calculated from actual item data, not a potentially stale stored value
2. **Automatic Updates**: No need to manually sync the header field when items change
3. **Consistent**: Both desktop app and API now use the same calculation logic
4. **Real-time**: Reflects current state of item details immediately

## Testing
After this fix:
- ASN list should show correct total shipped quantities
- Total should match the sum of all item `shipped_qty` values
- Carton count should still work correctly (only counting items with cartons)

## Example
For ASN-12225 with items:
- AT-301-BLU-OS: 100.00
- AT-301-GRN-OS: 500.00
- AT-301-RED-OS: 500.00
- AT-301-RED-OS: 500.00

**Before:** Total Shipped Qty = 100 (incorrect, from stale database field)  
**After:** Total Shipped Qty = 1600 (correct, calculated from item details)

## Related Files
- `Services/AsnDataService.cs` - Desktop app ASN data service
- `wms-api/src/modules/master/masterController.js` - API ASN endpoints
- `ViewModels/AsnDetailViewModel.cs` - Already calculates total from details (no change needed)

## Notes
- The `SyncAsnTotalShippedQtyAsync` function still exists for manual syncing if needed, but it's no longer required for display
- The database field `total_shipped_qty` in `tabAdvanceShippingNotice` can still be updated for reporting/audit purposes, but the UI now uses the calculated value

