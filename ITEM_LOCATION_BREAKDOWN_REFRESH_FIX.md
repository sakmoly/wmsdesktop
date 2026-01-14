# Item Location Breakdown Refresh Fix

## Issue

**Problem:** Stock quantity not updated in Item Location Breakdown screen

**Symptoms:**
- Main Items table shows: `Stock Qty: 148` for `SKU-JACKET-201-BLK-L`
- Item Location Breakdown shows: `Qty: 150.00` at location `A1-R01-L3-B1`
- Discrepancy: Location breakdown shows old/cached data

**Root Cause:**
1. Item Location Breakdown loads data only once when window opens
2. No refresh mechanism to reload data after stock changes
3. Data might be cached from previous view

---

## Fix Applied

### 1. Added Refresh Button

**File:** `ItemLocationBreakdownWindow.xaml`

**Changes:**
- Added "Refresh" button next to "Close" button
- Button triggers data refresh when clicked

### 2. Added Refresh Functionality

**File:** `ItemLocationBreakdownWindow.xaml.cs`

**Changes:**
- Added `RefreshButton_Click` event handler
- Added `RefreshDataAsync` method to reload data
- Clears existing data before loading fresh data

### 3. Improved Data Loading

**File:** `ViewModels/ItemLocationBreakdownViewModel.cs`

**Changes:**
- `LoadLocationDataAsync` now clears existing locations before loading
- Resets `TotalQty` to 0 before loading
- Added logging for refresh operations

---

## How It Works

### Before Fix:
1. User opens Item Location Breakdown → Data loads once
2. Stock changes (e.g., picking) → Location breakdown still shows old data
3. User must close and reopen window to see updated data

### After Fix:
1. User opens Item Location Breakdown → Data loads fresh
2. Stock changes → User clicks "Refresh" button
3. Data reloads from database → Shows updated quantities

---

## Usage

### Manual Refresh:
1. Open Item Location Breakdown for an item
2. If quantities seem outdated, click "Refresh" button
3. Data will reload from `tabStockLedger` / `tabCartonStock`

### Automatic Refresh:
- Data is always loaded fresh when window opens
- No caching between window opens

---

## Technical Details

### Data Sources:
- **Bin-Level Mode:** Queries `tabStockLedger` directly
- **Carton-Level Mode:** Queries `tabCartonStock` directly

### Refresh Process:
1. Clear `Locations` collection
2. Reset `TotalQty` to 0
3. Query database for fresh data
4. Populate `Locations` collection with new data
5. Calculate and display `TotalQty`

---

## Testing

1. **Open Item Location Breakdown:**
   - Select an item in Items list
   - Click "Show Location Breakdown"
   - Verify quantities are displayed

2. **Test Refresh:**
   - Make a stock change (e.g., pick items)
   - Click "Refresh" button in location breakdown
   - Verify quantities are updated

3. **Test Fresh Load:**
   - Close location breakdown window
   - Make stock changes
   - Reopen location breakdown
   - Verify quantities are fresh (not cached)

---

## Related Issues

If quantities still don't match between main table and location breakdown:

1. **Check `tabItem.stock_qty` sync:**
   - Main Items table uses `tabItem.stock_qty`
   - Location breakdown uses `tabStockLedger` / `tabCartonStock`
   - Run stock sync: `POST /api/stock/sync-quantities`

2. **Check for NULL bin_location:**
   - Location breakdown only shows stock with `bin_location`
   - Stock with `bin_location IS NULL` won't appear
   - Check database for unassigned stock

3. **Check warehouse filter:**
   - Location breakdown filters by warehouse
   - Main table might show total across all warehouses
   - Verify warehouse parameter is correct

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-13
