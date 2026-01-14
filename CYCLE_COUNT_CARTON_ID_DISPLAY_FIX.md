# Cycle Count Carton ID Display Fix

## 🐛 Issue
Cycle count items updated via API with `location_id` and `carton_id` were not showing in the desktop application.

## ✅ Solution

### 1. Updated Data Service (`CycleCountTaskDataService.cs`)

**Problem:** SQL query was trying to read `carton_id` column without checking if it exists first.

**Fix:**
- Added `CheckColumnExistsAsync` helper method to check if `carton_id` column exists
- Modified SQL query to conditionally include `carton_id`:
  - If column exists: `SELECT ..., carton_id, ...`
  - If column doesn't exist: `SELECT ..., NULL as carton_id, ...`
- This ensures the query works even if the column hasn't been added yet

**Code Changes:**
```csharp
// Check if carton_id column exists
var cartonIdColumnExists = await CheckColumnExistsAsync(connection, "tabCycleCountLine", "carton_id");

var linesSql = cartonIdColumnExists
    ? $@"SELECT parent_title, item_code, bin_location, carton_id, expected_qty, actual_qty, ..."
    : $@"SELECT parent_title, item_code, bin_location, NULL as carton_id, expected_qty, actual_qty, ...";
```

### 2. Updated ViewModel (`CycleCountTaskDetailViewModel.cs`)

**Problem:** `RefreshTaskAsync` was private and not triggering UI updates properly.

**Fix:**
- Made `RefreshTaskAsync` public so it can be called from the window
- Added `OnPropertyChanged(nameof(CycleCountTask))` to notify UI of data changes
- Added `RefreshCommand` (RelayCommand) for manual refresh button

**Code Changes:**
```csharp
public async Task RefreshTaskAsync()  // Changed from private to public
{
    // ... existing code ...
    CycleCountTask = updatedTask;
    OnPropertyChanged(nameof(CycleCountTask));  // Added to notify UI
    // ... rest of property notifications ...
}

[RelayCommand]
private async Task RefreshAsync()
{
    await RefreshTaskAsync();
}
```

### 3. Updated Window (`CycleCountTaskDetailWindow.xaml` and `.xaml.cs`)

**Problem:** Window wasn't refreshing data when opened or after API updates.

**Fix:**
- Added automatic refresh when window loads
- Added "Refresh" button to manually refresh data
- Updated `ViewModel_TaskUpdated` to properly refresh data

**Code Changes:**
```csharp
// In constructor
Loaded += async (s, e) => await _viewModel.RefreshTaskAsync();

// In XAML - Added Refresh button
<Button Content="Refresh"
        Command="{Binding RefreshCommand}"
        ... />
```

## 📋 How It Works Now

1. **Window Opens:**
   - Automatically calls `RefreshTaskAsync()` to load fresh data from database
   - Ensures `carton_id` is loaded if it exists in the database

2. **Data Display:**
   - Carton ID column is visible when `IsCartonLevelMode = true`
   - Column visibility is controlled by `BooleanToVisibilityConverter`
   - Data is bound to `CycleCountLine.CartonId` property

3. **Manual Refresh:**
   - User can click "Refresh" button to reload data from database
   - Useful after API updates to see latest `carton_id` values

4. **After API Updates:**
   - `TaskUpdated` event triggers automatic refresh
   - Data is reloaded from database with latest `carton_id` values

## 🔍 Verification Steps

1. **Check Settings:**
   - Go to Settings → Inventory Tracking Mode
   - Ensure it's set to "Carton Level"
   - This enables `IsCartonLevelMode = true`

2. **Open Cycle Count Task:**
   - Double-click a cycle count task in the list
   - Window should automatically refresh and load data

3. **Check Carton ID Column:**
   - Carton ID column should be visible in the grid
   - Should show `carton_id` values from database

4. **After API Update:**
   - Update cycle count via API with `carton_id`
   - Click "Refresh" button in desktop app
   - Carton ID should appear in the grid

## 🛠️ Troubleshooting

### Issue: Carton ID column not visible

**Solution:**
1. Check Settings → Inventory Tracking Mode = "Carton Level"
2. Close and reopen the Cycle Count Task Detail window
3. Click "Refresh" button

### Issue: Carton ID shows as empty/null

**Solution:**
1. Verify `carton_id` exists in database: `SELECT carton_id FROM tabCycleCountLine WHERE parent_title = 'CC-...'`
2. Verify migration 005 was run (adds `carton_id` column to `tabCycleCountLine`)
3. Click "Refresh" button to reload data

### Issue: Data not updating after API call

**Solution:**
1. Click "Refresh" button manually
2. Close and reopen the window
3. Check database directly to verify data was saved

## 📝 Notes

- The Carton ID column is **only visible** when `InventoryTrackingMode = "CartonLevel"`
- The column visibility is controlled by `IsCartonLevelMode` property
- Data is automatically refreshed when window opens
- Manual refresh is available via "Refresh" button

---

**Last Updated:** 2026-01-07  
**Status:** ✅ Fixed

