# Item Location Breakdown - Carton Separation Fix

## 🐛 Issue

The Item Location Breakdown was showing only one row per item+bin_location combination, aggregating quantities from all cartons at that location. When multiple cartons exist at the same bin location (e.g., CTN-3339 and CTN-3340), they should be displayed as separate rows with their own quantities.

**Example:**
- Item: SKU-JACKET-201-BLK-L
- Location: A1-R01-L1-B1
- Carton CTN-3339: Qty = 2 (from cycle count)
- Carton CTN-3340: Qty = 35 (from cycle count)

**Before Fix:**
- Shows only one row: CTN-3339, Qty = 35 (aggregated or wrong carton)

**After Fix:**
- Shows two separate rows:
  - Row 1: CTN-3339, Qty = 2
  - Row 2: CTN-3340, Qty = 35

## 🔍 Root Cause

In bin-level inventory mode, the `ItemLocationBreakdownViewModel` was:
1. ✅ Querying `tabStockLedger` (which aggregates quantities by item+bin_location)
2. ❌ Querying `tabCartonStock` with `LIMIT 1` (only getting first carton)
3. ❌ Creating only one `locationDetails` entry per stock ledger entry
4. ❌ Not separating cartons - showing only one carton per bin location

## ✅ Fix Applied

### Updated Bin-Level Carton Handling

**File:** `ViewModels/ItemLocationBreakdownViewModel.cs`

**Changes:**
- Changed from querying `tabCartonStock` with `LIMIT 1` to querying ALL cartons
- Changed from `SELECT DISTINCT carton_id` to `SELECT carton_id, qty` to get carton quantities
- Create a separate `locationDetails` entry for EACH carton found
- Skip adding stock ledger entry if cartons are found (show cartons instead)

**Before:**
```csharp
// Get first carton_id at this bin location for this item
// If multiple cartons exist, show the first one found
var cartonSql = @"
    SELECT DISTINCT carton_id
    FROM tabCartonStock
    WHERE item_code = @itemCode
      AND bin_location = @binLocation
      AND qty > 0
      AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
    ORDER BY carton_id
    LIMIT 1";

// ... query and get first carton ...

// Add one location detail entry per stock ledger entry (one-to-one mapping)
locationDetails.Add((actualLocationId, zone, aisle, rack, level, bin, cartonIdForLocation, entry.Qty));
```

**After:**
```csharp
// Get ALL cartons at this bin location for this item
// Each carton should be displayed separately with its own quantity
var cartonSql = @"
    SELECT carton_id, qty
    FROM tabCartonStock
    WHERE item_code = @itemCode
      AND bin_location = @binLocation
      AND qty > 0
      AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
    ORDER BY carton_id";

// ... query and collect ALL cartons ...

if (cartonsFound.Count > 0)
{
    // Create a separate location detail entry for each carton
    foreach (var (cartonId, cartonQty) in cartonsFound)
    {
        locationDetails.Add((actualLocationId, zone, aisle, rack, level, bin, cartonId, cartonQty));
        ErrorLogService.LogInfo($"ItemLocationBreakdownViewModel: Added carton '{cartonId}' with qty {cartonQty} for item {entry.ItemCode} at bin {entry.BinLocation}");
    }
    // Skip adding the stock ledger entry since we're showing cartons separately
    continue;
}

// If no cartons found in tabCartonStock, use stock ledger entry
// Use carton_id from stock ledger if available, otherwise show bin-level stock without carton
var cartonIdFromStockLedger = entry.CartonId;
locationDetails.Add((actualLocationId, zone, aisle, rack, level, bin, cartonIdFromStockLedger, entry.Qty));
```

## 🧪 Testing

To verify the fix:

1. **Create cycle count tasks with different cartons:**
   - Item: SKU-JACKET-201-BLK-L
   - Location: A1-R01-L1-B1
   - Carton CTN-3339: Qty = 2
   - Carton CTN-3340: Qty = 35

2. **Check tabCartonStock:**
   ```sql
   SELECT carton_id, item_code, bin_location, qty
   FROM tabCartonStock
   WHERE item_code = 'SKU-JACKET-201-BLK-L'
     AND bin_location = 'A1-R01-L1-B1'
   ORDER BY carton_id;
   ```

3. **Open Item Location Breakdown for SKU-JACKET-201-BLK-L:**
   - Should show two separate rows:
     - Row 1: Location: A1-R01-L1-B1, Carton ID: CTN-3339, Qty: 2.00
     - Row 2: Location: A1-R01-L1-B1, Carton ID: CTN-3340, Qty: 35.00

## 📋 Data Flow

**Before Fix:**
```
Stock Ledger Entry (item+bin_location, qty=37)
  ↓
Query tabCartonStock: SELECT DISTINCT carton_id LIMIT 1
  ↓
Get first carton: CTN-3339
  ↓
Create ONE locationDetails entry: (location, CTN-3339, qty=37)
  ↓
Display: One row with CTN-3339, Qty: 35 (wrong!)
```

**After Fix:**
```
Stock Ledger Entry (item+bin_location, qty=37)
  ↓
Query tabCartonStock: SELECT carton_id, qty (ALL cartons)
  ↓
Get ALL cartons:
  - CTN-3339: qty=2
  - CTN-3340: qty=35
  ↓
Create MULTIPLE locationDetails entries:
  - (location, CTN-3339, qty=2)
  - (location, CTN-3340, qty=35)
  ↓
Display: Two separate rows:
  - Row 1: CTN-3339, Qty: 2.00 ✅
  - Row 2: CTN-3340, Qty: 35.00 ✅
```

## 🎯 Expected Behavior

After this fix:
1. ✅ Each carton at a bin location is displayed as a separate row
2. ✅ Each carton shows its own quantity (from `tabCartonStock`)
3. ✅ Cartons are ordered by carton_id
4. ✅ If no cartons found in `tabCartonStock`, show stock ledger entry (bin-level stock without carton)
5. ✅ Total quantity = sum of all carton quantities at that location

## ⚠️ Notes

- The fix only applies to bin-level inventory mode
- Carton-level mode already handles multiple cartons correctly (each carton is a separate entry)
- If `tabCartonStock` doesn't exist, it falls back to showing stock ledger entries (bin-level stock)
- If no cartons found in `tabCartonStock`, it shows the stock ledger entry with stock ledger quantity
- Cartons are ordered by `carton_id` for consistent display

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-11  
**Files Modified:** `ViewModels/ItemLocationBreakdownViewModel.cs`
