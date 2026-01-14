# Stock Quantity Discrepancy - Root Cause & Fix

## Issue Summary

**Main Items Table:** `Stock Qty: 299`  
**Location Breakdown:** Only shows `200` (100 + 100 from 2 visible locations)  
**Missing:** 99 units

---

## Root Cause

The API `GET /api/stock/item/:item_code/warehouse/:warehouse` **does include** stock with `bin_location IS NULL`, but there are several possible reasons for the discrepancy:

### 1. **Stock with NULL bin_location (Most Likely)**

The API includes stock with `bin_location IS NULL`, but:
- It might be displayed at the bottom of the list (sorted last)
- The pop-up might not be scrolled to show it
- The UI might be filtering it out

**Check:** Scroll down in the "Item Location Breakdown" pop-up to see if there's a row with `bin_location: null` or "Unassigned".

### 2. **Stock in tabStockLedger but not in tabCartonStock**

The API prioritizes `tabCartonStock` over `tabStockLedger`. If:
- Stock exists in `tabStockLedger` with a `bin_location`
- But `tabCartonStock` also has stock at the same `bin_location`
- The API uses `tabCartonStock` data and skips the `tabStockLedger` entry

However, if quantities don't match, there could be a discrepancy.

### 3. **Stock with Unmatched bin_location**

Stock with `bin_location` that can't be matched to `tabLocation.location_id` is still included (falls back to stored `bin_location`), but might not display correctly in the UI.

---

## How to Verify

### Step 1: Check Database Directly

```sql
-- Check total stock in stock ledger
SELECT 
  SUM(qty) as total_qty,
  COUNT(*) as entries_count,
  SUM(CASE WHEN bin_location IS NULL THEN qty ELSE 0 END) as qty_without_location,
  SUM(CASE WHEN bin_location IS NOT NULL THEN qty ELSE 0 END) as qty_with_location
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-BLU-OS'
  AND warehouse = 'WH-MAIN';

-- Check total stock in carton stock
SELECT 
  SUM(qty) as total_qty,
  COUNT(*) as entries_count
FROM tabCartonStock
WHERE item_code = 'SKU-HAT-301-BLU-OS'
  AND warehouse = 'WH-MAIN'
  AND qty > 0
  AND status = 'PUTAWAY';
```

### Step 2: Call API and Sum All Quantities

```http
GET /api/stock/item/SKU-HAT-301-BLU-OS/warehouse/WH-MAIN
```

Sum all `total_qty` values from the response. It should equal 299.

### Step 3: Check for NULL bin_location in Response

Look for entries with `bin_location: null` in the API response. These represent stock without assigned locations.

---

## Expected API Response

The API should return something like:

```json
[
  {
    "item_code": "SKU-HAT-301-BLU-OS",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R01-L3-B1",
    "total_qty": 100,
    ...
  },
  {
    "item_code": "SKU-HAT-301-BLU-OS",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R02-L1-B2",
    "total_qty": 100,
    ...
  },
  {
    "item_code": "SKU-HAT-301-BLU-OS",
    "warehouse": "WH-MAIN",
    "bin_location": null,  // ← This might be the missing 99 units
    "total_qty": 99,
    ...
  }
]
```

**Total:** 100 + 100 + 99 = 299 ✅

---

## Possible Issues

### Issue 1: UI Filtering Out NULL Locations

The desktop app UI might be filtering out entries with `bin_location: null`.

**Solution:** Check the UI code that displays the location breakdown. Ensure it shows entries with `bin_location: null` or displays them as "Unassigned Location".

### Issue 2: More Locations Not Visible

The pop-up has a scrollbar, indicating more rows exist. The missing 99 units might be in a location below the visible area.

**Solution:** Scroll down in the pop-up to see all locations.

### Issue 3: Stock in Different Warehouse

The `tabItem.stock_qty` might include stock from multiple warehouses, while the location breakdown is filtered to a specific warehouse.

**Solution:** Verify the warehouse filter is correct.

---

## Recommended Actions

1. **Scroll down in the pop-up** to see if there are more locations (including one with `bin_location: null`)

2. **Check the API response directly** using Postman or browser:
   ```http
   GET /api/stock/item/SKU-HAT-301-BLU-OS/warehouse/WH-MAIN
   Authorization: Bearer <token>
   ```
   Sum all `total_qty` values. If it equals 299, the API is correct and the issue is in the UI.

3. **Check database** for stock with NULL bin_location:
   ```sql
   SELECT bin_location, qty
   FROM tabStockLedger
   WHERE item_code = 'SKU-HAT-301-BLU-OS'
     AND warehouse = 'WH-MAIN'
   ORDER BY bin_location IS NULL, bin_location;
   ```

4. **Update UI** to display entries with `bin_location: null` as "Unassigned Location" or "No Location Assigned"

---

## API Behavior

The API **does include** stock with `bin_location IS NULL`. The response will have:
- Entries with valid `bin_location` (sorted first)
- Entry with `bin_location: null` (sorted last) - this represents unassigned stock

If the API response sums to 299 but the UI only shows 200, the issue is in the **UI filtering/display logic**, not the API.

---

**Status:** 🔍 **VERIFICATION REQUIRED**  
**Date:** 2026-01-12
