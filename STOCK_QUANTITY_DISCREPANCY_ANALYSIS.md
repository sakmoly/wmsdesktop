# Stock Quantity Discrepancy Analysis

## Issue

**Main Items Table:** Shows `Stock Qty: 299` for "SKU-HAT-301-BLU-OS"  
**Location Breakdown:** Shows only `200` (100 + 100 from 2 locations)

**Discrepancy:** 99 units missing in location breakdown

---

## Root Cause Analysis

### 1. **Main Items Table (`tabItem.stock_qty`)**

The main table shows `stock_qty` from `tabItem` table, which is calculated as:

```sql
SELECT COALESCE(SUM(qty), 0) as total_qty
FROM tabStockLedger
WHERE item_code = ? AND warehouse = ?
```

**This includes:**
- ✅ Stock with `bin_location` (e.g., "A1-R01-L3-B1")
- ✅ Stock with `bin_location IS NULL` (no location assigned)
- ✅ Stock from all locations in the warehouse
- ✅ Stock that might not match `tabLocation` table

### 2. **Location Breakdown API (`GET /api/stock/item/:item_code/warehouse/:warehouse`)**

The location breakdown API only shows locations where:

1. **Carton Stock (`tabCartonStock`):**
   - `bin_location` exists
   - `qty > 0`
   - `status = 'PUTAWAY'`
   - Can be matched to `tabLocation.location_id`

2. **Stock Ledger (`tabStockLedger`):**
   - `bin_location` exists (NOT NULL)
   - `qty > 0`
   - Can be matched to `tabLocation.location_id` (or falls back to stored `bin_location`)

**This excludes:**
- ❌ Stock with `bin_location IS NULL` (no location assigned)
- ❌ Stock with `bin_location` that can't be matched to `tabLocation`
- ❌ Stock with `status != 'PUTAWAY'` (for carton stock)

---

## Possible Causes of Discrepancy

### Cause 1: Stock with NULL bin_location (Most Likely)

**99 units might be in `tabStockLedger` with `bin_location IS NULL`**

```sql
-- Check for stock without location
SELECT SUM(qty) as total_qty
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-BLU-OS'
  AND warehouse = 'WH-MAIN'
  AND bin_location IS NULL;
```

**Solution:** Assign these items to a location or show them separately in the breakdown.

---

### Cause 2: Stock with Unmatched bin_location

**99 units might have `bin_location` that doesn't match `tabLocation` table**

The API tries to match `bin_location` to `tabLocation.location_id`, but if it fails:
- It falls back to the stored `bin_location` value
- However, if the format is completely different, it might not display correctly

**Solution:** Ensure all `bin_location` values in `tabStockLedger`/`tabCartonStock` match `tabLocation.location_id`.

---

### Cause 3: Stock in Different Status

**99 units might be in `tabCartonStock` with `status != 'PUTAWAY'`**

The API filters: `WHERE cs.status = 'PUTAWAY'`

**Solution:** Check for stock with other statuses (PICKED, SHIPPED, etc.).

---

### Cause 4: More Locations Not Visible

**The pop-up has a scrollbar, indicating more locations might exist**

The visible breakdown shows:
- Location A1-R01-L3-B1: 100
- Location A1-R02-L1-B2: 100
- **Total visible: 200**

But there might be more locations below (scrollbar visible).

**Solution:** Scroll down in the pop-up to see all locations.

---

## How to Diagnose

### Step 1: Check for NULL bin_location

```sql
-- Check stock without location
SELECT 
  SUM(qty) as total_qty_without_location,
  COUNT(*) as entries_count
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-BLU-OS'
  AND warehouse = 'WH-MAIN'
  AND bin_location IS NULL;
```

### Step 2: Check Total Stock in Stock Ledger

```sql
-- Total stock in stock ledger
SELECT 
  SUM(qty) as total_qty,
  COUNT(*) as entries_count,
  COUNT(DISTINCT bin_location) as unique_locations
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-BLU-OS'
  AND warehouse = 'WH-MAIN';
```

### Step 3: Check Total Stock in Carton Stock

```sql
-- Total stock in carton stock
SELECT 
  SUM(qty) as total_qty,
  COUNT(*) as entries_count,
  COUNT(DISTINCT bin_location) as unique_locations
FROM tabCartonStock
WHERE item_code = 'SKU-HAT-301-BLU-OS'
  AND warehouse = 'WH-MAIN'
  AND qty > 0
  AND status = 'PUTAWAY';
```

### Step 4: Check tabItem.stock_qty

```sql
-- Check what's stored in tabItem
SELECT 
  code,
  name,
  stock_qty
FROM tabItem
WHERE code = 'SKU-HAT-301-BLU-OS';
```

### Step 5: Compare with API Response

Call the API and sum all `total_qty` values:

```http
GET /api/stock/item/SKU-HAT-301-BLU-OS/warehouse/WH-MAIN
```

Sum all `total_qty` from the response and compare with `tabItem.stock_qty`.

---

## Solutions

### Solution 1: Include NULL bin_location in API Response

Modify the API to include stock without location:

```javascript
// In getStockLedgerByItem function
// Add entry for NULL bin_location
if (stockLedgerRows.some(row => !row.bin_location)) {
  const nullBinQty = stockLedgerRows
    .filter(row => !row.bin_location)
    .reduce((sum, row) => sum + parseFloat(row.qty), 0);
  
  if (nullBinQty > 0) {
    groupedResponse.push({
      item_code: item_code,
      warehouse: warehouse,
      bin_location: null, // or "UNASSIGNED"
      cartons: null,
      total_qty: nullBinQty,
      reserved_qty: 0,
      available_qty: nullBinQty,
      // ... other fields
    });
  }
}
```

### Solution 2: Show "Unassigned Location" in UI

Display stock without location separately in the breakdown:

- **Location:** "Unassigned" or "No Location"
- **Quantity:** 99
- **Action:** Allow user to assign location

### Solution 3: Fix Data Consistency

Ensure all stock has a valid `bin_location`:

```sql
-- Find items without location
SELECT 
  item_code,
  warehouse,
  SUM(qty) as total_qty
FROM tabStockLedger
WHERE bin_location IS NULL
  AND qty > 0
GROUP BY item_code, warehouse;

-- Assign to a default location or specific location
UPDATE tabStockLedger
SET bin_location = 'DEFAULT-LOCATION'
WHERE bin_location IS NULL
  AND qty > 0;
```

### Solution 4: Update API to Show All Stock

Modify the API to include:
- Stock with `bin_location IS NULL`
- Stock with unmatched `bin_location`
- Stock with different statuses (with warning)

---

## Recommended Fix

**Option 1: Quick Fix (UI Level)**
- Show "Unassigned Location" row in the breakdown
- Display quantity: 99
- Allow user to assign location

**Option 2: API Fix (Backend Level)**
- Modify `getStockLedgerByItem` to include stock with `bin_location IS NULL`
- Add a separate entry for "Unassigned Location"
- Return all stock, not just stock with valid locations

**Option 3: Data Fix (Database Level)**
- Assign all stock to valid locations
- Ensure `bin_location` matches `tabLocation.location_id`
- Update `tabItem.stock_qty` to match location breakdown

---

## Expected Behavior

**Ideal:** Location breakdown should sum to match `tabItem.stock_qty`

```
tabItem.stock_qty = 299
Location Breakdown:
  - A1-R01-L3-B1: 100
  - A1-R02-L1-B2: 100
  - Unassigned: 99
  Total: 299 ✅
```

---

**Status:** 🔍 **INVESTIGATION REQUIRED**  
**Date:** 2026-01-12
