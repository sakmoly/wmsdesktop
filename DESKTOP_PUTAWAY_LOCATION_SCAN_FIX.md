# Desktop Putaway Location ID Scan Fix

**Date**: 2026-01-20  
**Status**: ✅ **FIXED**

---

## 🚨 Problem

**Issue**: 
1. Putaway Location ID showing wrong value (TBD-TBD) in desktop app
2. During scanning Putaway Location ID, it's not showing in the text box
3. Location should only update after manual click on submit button

---

## ✅ Changes Applied

### 1. Added Location ID Text Box and Submit Button

**File**: `PutawayTaskDetailWindow.xaml`  
**Lines**: 88-105

**Before**: Only displayed Location ID as read-only TextBlock

**After**: Added TextBox for scanning and Submit button
```xml
<StackPanel Grid.Row="0" Grid.Column="2" Margin="8,0,0,4" Grid.RowSpan="2">
    <TextBlock Text="Location ID" FontWeight="SemiBold" Foreground="#6B7280" Margin="0,0,0,4" />
    <TextBox x:Name="LocationIdTextBox"
             Text="{Binding ScannedLocationId, UpdateSourceTrigger=PropertyChanged}"
             FontSize="14"
             Padding="8,4"
             Margin="0,0,0,4"
             KeyDown="LocationIdTextBox_KeyDown"
             GotFocus="LocationIdTextBox_GotFocus" />
    <Button Content="Update Location"
            Command="{Binding UpdateLocationCommand}"
            Padding="8,4"
            Background="#3B82F6"
            Foreground="White"
            IsEnabled="{Binding CanUpdateLocation}" />
    <TextBlock Text="{Binding PutawayTask.LocationId, StringFormat='Current: {0}'}"
               FontSize="12"
               Foreground="#6B7280"
               Margin="0,4,0,0"
               Visibility="{Binding PutawayTask.LocationId, Converter={StaticResource StringToVisibilityConverter}}" />
</StackPanel>
```

### 2. Added ViewModel Properties and Command

**File**: `ViewModels/PutawayTaskDetailViewModel.cs`  
**Lines**: 36-50, 138-185

**Added**:
- `ScannedLocationId` property (bound to TextBox)
- `CanUpdateLocation` property (enables/disables Submit button)
- `UpdateLocationCommand` (handles location update)

**Code**:
```csharp
private string? _scannedLocationId;
public string? ScannedLocationId
{
    get => _scannedLocationId;
    set
    {
        if (SetProperty(ref _scannedLocationId, value))
        {
            OnPropertyChanged(nameof(CanUpdateLocation));
        }
    }
}

public bool CanUpdateLocation => !string.IsNullOrWhiteSpace(ScannedLocationId) && 
                                 (PutawayTask.Status == "Draft" || 
                                  PutawayTask.Status == "Open" || 
                                  PutawayTask.Status == "In Progress");

[RelayCommand]
private async Task UpdateLocationAsync()
{
    // Validates, confirms with user, calls API, refreshes task
}
```

### 3. Added API Service Method

**File**: `Services/PutawayApiService.cs`  
**Lines**: 99-180

**Added**: `UpdatePutawayLocationAsync` method
```csharp
public static async Task<(bool Success, string Message)> UpdatePutawayLocationAsync(
    WmsSettings settings, 
    string putawayTask, 
    string locationId,
    string? userId = null)
{
    // Calls POST /api/putaway/scan-transfer-carton
    // with putaway_task and location_id (no box_id/tc_id)
}
```

### 4. Enhanced Backend to Update Location

**File**: `wms-api/src/modules/putaway/putawayController.js`  
**Function**: `scanTransferCarton`  
**Lines**: 4392-4480

**Added Logic**: When only `putaway_task` and `location_id` are provided (no `box_id`/`tc_id`), update all putaway lines with the location.

**Code**:
```javascript
// CRITICAL: If only putaway_task and location_id are provided (no box_id/tc_id),
// update all putaway lines with the location (desktop app workflow)
if (taskTitleToCheck && !box_id && !actualCartonId) {
  // Update ALL lines with the location
  for (const line of putawayLines) {
    await connection.execute(
      `UPDATE tabPutawayLine SET rack = ?, bin = ?, location_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [rack, bin, location_id, line.id]
    );
  }
  
  // Update task location_id
  await connection.execute(
    `UPDATE tabPutawayTask SET location_id = ?, updated_at = CURRENT_TIMESTAMP WHERE title = ?`,
    [location_id, taskTitleToCheck]
  );
  
  // Update task status to "In Progress" if "Draft" or "Open"
  // ...
  
  return res.status(200).json({
    ok: true,
    message: `Location ID '${location_id}' assigned to all items`,
    data: { putaway_task, location_id, items_count, items: [...] }
  });
}
```

### 5. Added Event Handlers

**File**: `PutawayTaskDetailWindow.xaml.cs`  
**Lines**: 54-70

**Added**:
- `LocationIdTextBox_GotFocus`: Selects all text when focused (for easy scanning)
- `LocationIdTextBox_KeyDown`: Handles Enter key (doesn't auto-submit, requires button click)

---

## 🔄 Complete Flow

### Step 1: User Opens Putaway Task Detail Window
```
- Window shows current Location ID (if any) or blank
- Location ID TextBox is empty and ready for scanning
- "Update Location" button is disabled
```

### Step 2: User Scans Location ID
```
- Barcode scanner fills TextBox with location ID (e.g., "A1-R02-L2-B2")
- TextBox shows the scanned value immediately ✅
- "Update Location" button becomes enabled ✅
- NO database update yet ✅
```

### Step 3: User Clicks "Update Location" Button
```
- Confirmation dialog appears
- User confirms
- API call: POST /api/putaway/scan-transfer-carton
  {
    "putaway_task": "PUT-20260120-0001",
    "location_id": "A1-R02-L2-B2"
  }
- Backend updates ALL putaway lines with location
- Backend updates task location_id
- Task status changes to "In Progress" (if Draft/Open)
- Desktop app refreshes task data
- Location ID now shows in task header and all lines ✅
```

---

## ✅ Key Features

1. **Text Box Shows Scanned Value Immediately**: ✅ No database update until Submit
2. **Submit Button Required**: ✅ User must explicitly click "Update Location"
3. **Updates All Lines**: ✅ All items in task get the same location
4. **Confirmation Dialog**: ✅ User confirms before updating
5. **Auto-Refresh**: ✅ Task data refreshes after successful update
6. **Status Update**: ✅ Task status changes to "In Progress" automatically

---

## 📝 Summary

✅ **Added Location ID TextBox** for scanning  
✅ **Added "Update Location" Button** (only updates on click)  
✅ **Backend updates location** when only `putaway_task` and `location_id` provided  
✅ **Updates all putaway lines** with the scanned location  
✅ **Confirmation dialog** before updating  
✅ **Auto-refresh** after successful update  

**Result**: Desktop app now supports scanning Location ID, showing it in the text box immediately, and only updating the database when the user clicks "Update Location" button! 🎉
