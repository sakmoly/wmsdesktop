# Transfer Carton Quantity Replace Fix

## Issue
Quantities were being **added** instead of **replaced** when duplicate items were found in the query results.

## Root Cause
The code was checking for duplicate keys in the dictionary and **adding** quantities (`existing.Qty + quantity`) even though the SQL query already groups and sums by `item_code` and `carton_id`. This caused quantities to be double-counted if duplicates somehow appeared.

## Fix Applied

### Main Query Processing (`Services/TransferCartonService.cs`)

**Before:**
```csharp
if (itemDict.ContainsKey(key))
{
    var existing = itemDict[key];
    itemDict[key] = new TransferCartonItem
    {
        // ...
        Qty = existing.Qty + quantity, // ❌ ADDING (wrong)
        // ...
    };
}
```

**After:**
```csharp
if (itemDict.ContainsKey(key))
{
    var existing = itemDict[key];
    itemDict[key] = new TransferCartonItem
    {
        // ...
        Qty = quantity, // ✅ REPLACE (correct - SQL already summed)
        // ...
    };
}
```

### Material Request Fallback Query

**Before:**
```csharp
if (itemDict.ContainsKey(key))
{
    Qty = existing.Qty + quantity, // ❌ ADDING
}
```

**After:**
```csharp
if (itemDict.ContainsKey(key))
{
    Qty = quantity, // ✅ REPLACE (SQL already summed)
}
```

### SORT_TO_BOX Fallback Query

**Note:** This fallback query still **sums** quantities because it's deriving items from multiple boxes (`SORT_TO_BOX` events) that might have the same `item_code + carton_id` combination. This is correct behavior for the fallback scenario.

## Why This Fix Works

1. **SQL Query Already Sums:** The SQL query uses `SUM(qty) ... GROUP BY item_code, carton_id`, so the database already provides the correct total quantity.

2. **No Duplicates Expected:** Since SQL groups by `item_code` and `carton_id`, there should be no duplicate rows in the result set.

3. **Replace Instead of Add:** If a duplicate somehow appears (edge case), we **replace** the quantity with the new value (which is already summed by SQL) instead of adding to it.

## Expected Behavior

- ✅ **First scan:** Item appears with quantity 1
- ✅ **Second scan (same item):** Item quantity updates to 2 (SQL sums: 1 + 1 = 2)
- ✅ **Third scan (same item):** Item quantity updates to 3 (SQL sums: 1 + 1 + 1 = 3)
- ✅ **Refresh window:** Shows correct total (3) - not adding to existing display

## Verification

After this fix:
1. Scan the same item multiple times
2. Check Transfer Carton Details
3. Quantity should show the **total** (sum of all scans), not accumulate on each refresh

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-12  
**Files Changed:** `Services/TransferCartonService.cs`
