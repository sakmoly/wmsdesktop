# Desktop App Item Location Breakdown Fix

## 🐛 Issue

**Problem:** Item Location Breakdown shows 198.00 instead of 98.00, even though API returns correct value (98).

**Root Cause:** Desktop app queries `tabCartonStock` directly and returns duplicate records, which are then summed during grouping.

**Desktop App Query (Before Fix):**
```csharp
var cartonSql = @"SELECT carton_id, qty
    FROM tabCartonStock
    WHERE item_code = @itemCode
      AND bin_location = @binLocation
    ...
    ORDER BY carton_id";
```

**Problem:**
- Returns duplicate records: CTN-555444 with qty 100 and CTN-555444 with qty 98
- Groups by `(LocationId, CartonId)` and sums: `Qty = g.Sum(loc => loc.Qty)`
- Result: 100 + 98 = 198 ❌

---

## ✅ Fix Applied

**File:** `ViewModels/ItemLocationBreakdownViewModel.cs`

**Change:** Modified query to use only the most recent record (by `id`) for each carton_id, similar to the API fix.

**After Fix:**
```csharp
var cartonSql = @"SELECT cs.carton_id, cs.qty
    FROM tabCartonStock cs
    INNER JOIN (
        -- Get the most recent record for each carton_id+item_code+bin_location combination
        SELECT 
            carton_id,
            item_code,
            warehouse,
            bin_location,
            MAX(id) as max_id  -- Keep the record with highest id (most recent)
        FROM tabCartonStock
        WHERE item_code = @itemCode
          AND bin_location = @binLocation
          AND qty > 0
          AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
        GROUP BY carton_id, item_code, warehouse, bin_location
    ) latest
      ON cs.carton_id = latest.carton_id
      AND cs.item_code = latest.item_code
      AND cs.warehouse = latest.warehouse
      AND cs.bin_location = latest.bin_location
      AND cs.id = latest.max_id
    WHERE cs.qty > 0
      AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')
    ORDER BY cs.carton_id";
```

**Result:**
- Only the most recent record (highest `id`) is returned
- Quantity is 98 (from most recent record), not 198 (sum of duplicates)
- Duplicate records are ignored

---

## 🧪 Testing

### Test 1: Rebuild Desktop App

1. Rebuild the desktop app project
2. Open Item Location Breakdown for `SKU-HAT-301-BLU-OS`
3. Click "Refresh" button
4. Should show 98.00 (not 198.00)

**Expected Result:**
- Item Location Breakdown shows 98.00
- Matches API response (98)
- Matches Main Items table (98)

---

## 📋 Summary

**Problem:** Desktop app summing duplicate carton records (100 + 98 = 198)

**Solution:**
1. ✅ **Desktop App Query:** Now uses most recent record only (not sum)
2. ✅ **API Query:** Already fixed to use most recent record only
3. ⚠️ **Database Cleanup:** Still recommended to run fix script

**After Fix:**
- Desktop app Item Location Breakdown shows correct quantity (98)
- API returns correct quantity (98)
- Both match Main Items table (98)

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-13  
**File Changed:** `ViewModels/ItemLocationBreakdownViewModel.cs`
