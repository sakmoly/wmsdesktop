# Item Location Breakdown Duplicate Fix

## Issue Identified

**Problem:** The Item Location Breakdown was showing incorrect totals (348 vs 338 in main table).

**Root Cause:** 
The ViewModel was creating **one row per carton** at each bin location, but each row was showing the **bin's total available_qty** instead of the carton's individual quantity. This caused overcounting when multiple cartons existed at the same bin.

**Example:**
- Bin A1-R01-L3-B1 has 2 cartons with total available_qty = 98
- ViewModel created 2 rows, each showing 98
- Sum would be 196 instead of 98

## Fix Applied

**Solution:** Show **ONE row per bin location** (not per carton).

**Changes:**
1. Modified ViewModel to create only one entry per bin location
2. If multiple cartons exist, show the first carton ID (for reference)
3. The `available_qty` shown is the **bin's total available_qty** (not per carton)
4. This ensures the sum matches the main table

**Code Change:**
```csharp
// Before: Created one row per carton (WRONG)
foreach (var carton in binData.Cartons)
{
    locationDetails.Add((
        ...,
        carton.CartonId,
        binData.AvailableQty  // Same value repeated for each carton!
    ));
}

// After: Create one row per bin (CORRECT)
string? cartonIdDisplay = null;
if (binData.Cartons != null && binData.Cartons.Count > 0)
{
    cartonIdDisplay = binData.Cartons[0].CartonId; // Show first carton
}
locationDetails.Add((
    ...,
    cartonIdDisplay,
    binData.AvailableQty  // Bin's total (shown once)
));
```

## Result

- Each bin location appears **once** in the breakdown
- The `available_qty` shown is the **bin's total** (correct)
- The sum of all rows matches the main table's available_qty
- Carton ID is shown for reference (first carton if multiple exist)

## Testing

1. Verify that the breakdown sum matches the main table's available_qty
2. Verify that each bin location appears only once
3. Verify that carton IDs are displayed correctly
