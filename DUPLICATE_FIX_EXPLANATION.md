# Duplicate Sessions Fix - Why 4 Lines Instead of 2

## Problem Identified

**Database has:** 2 sessions ✅  
**UI displays:** 4 sessions ❌

## Root Cause

The data was being loaded **TWICE**:

1. **Constructor** calls `LoadDataAsync()` when ViewModel is created
2. **Loaded event** calls `RefreshAsync()` → `LoadDataAsync()` when view loads

Even though `Sessions.Clear()` is called, if both loads happen quickly or concurrently, duplicates can appear.

## Fixes Applied

### 1. Prevent Concurrent Loading
- Added `_isLoading` flag to prevent multiple loads at once
- Added `_loadLock` to ensure thread-safe loading
- Removed constructor load - only Loaded event loads data now

### 2. Added DISTINCT to Query
- Added `DISTINCT` to SQL query to ensure no duplicate rows from database
- This prevents duplicates even if database somehow has duplicate rows

### 3. Multiple Layers of Duplicate Prevention
- **Database level:** `DISTINCT` in query
- **Data service level:** `HashSet` to track seen titles
- **ViewModel level:** `HashSet` to track added titles

## Code Changes

### ViewModel (`InboundSessionListViewModel.cs`)
```csharp
// Before: Constructor loaded data
public InboundSessionListViewModel()
{
    _ = LoadDataAsync(); // ❌ This caused double loading
}

// After: Only Loaded event loads data
public InboundSessionListViewModel()
{
    // Don't load in constructor - let Loaded event handle it ✅
}

// Added loading lock
private bool _isLoading = false;
private readonly object _loadLock = new object();
```

### Data Service (`InboundSessionDataService.cs`)
```sql
-- Before
SELECT {columns} FROM tabInboundSession

-- After
SELECT DISTINCT {columns} FROM tabInboundSession ✅
```

## Expected Result

After these fixes:
- ✅ **Only 2 sessions** should display (matching database)
- ✅ **No duplicates** even if loaded multiple times
- ✅ **Thread-safe** loading prevents race conditions

## Testing

1. **Restart the desktop application**
2. **Open Inbound Sessions screen**
3. **Verify:** Should show exactly 2 sessions (matching database)
4. **Check logs:** Should see "Load already in progress, skipping" if Loaded event fires while loading

## Summary

- **Problem:** Data loaded twice (constructor + Loaded event)
- **Solution:** Prevent concurrent loads + Add DISTINCT to query
- **Result:** UI will show exactly 2 sessions (matching database)

