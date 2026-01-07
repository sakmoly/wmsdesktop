# Desktop Application Status Field Update

## Summary

Updated the desktop application (C# WPF) to support the `status` field in Material Request items.

## Changes Made

### 1. Model Update (`Models/MaterialRequest.cs`)
- ✅ Added `Status` property to `MaterialRequestItem` class
- ✅ Default value: "Pending"
- ✅ Status values: "Pending", "In Progress", "Picked"

### 2. Data Service Update (`Services/MaterialRequestDataService.cs`)
- ✅ Updated SQL SELECT query to include `status` field
- ✅ Updated `MaterialRequestItem` object creation to include status
- ✅ Handles NULL status values (defaults to "Pending")

### 3. UI Update (`MaterialRequestDetailWindow.xaml`)
- ✅ Added "Status" column to Material Request items DataGrid
- ✅ Displays item-level status in the detail window

## Code Changes

### MaterialRequestItem Model
```csharp
public sealed class MaterialRequestItem
{
    public string ItemCode { get; init; } = string.Empty;
    public double RequestedQty { get; init; }
    public double PickedQty { get; init; }
    public double PendingQty => RequestedQty - PickedQty;
    public string Status { get; init; } = "Pending"; // ✅ NEW PROPERTY
}
```

### MaterialRequestDataService SQL Query
```csharp
// ✅ Updated to include status
var itemsSql = @"SELECT parent_title, item_code, requested_qty, picked_qty, status
                 FROM tabMaterialRequestItem
                 WHERE parent_title IN ({placeholders})
                 ORDER BY parent_title, item_code";
```

### MaterialRequestItem Creation
```csharp
itemsDict[parentTitle].Add(new MaterialRequestItem
{
    ItemCode = itemsReader.GetString(1),
    RequestedQty = Convert.ToDouble(itemsReader.GetDecimal(2)),
    PickedQty = Convert.ToDouble(itemsReader.GetDecimal(3)),
    Status = itemsReader.IsDBNull(4) ? "Pending" : itemsReader.GetString(4) // ✅ NEW
});
```

## Build Required

**YES, a build is required** for the desktop application because:
1. Model class was modified (added `Status` property)
2. Data service code was updated
3. XAML view was updated

## Next Steps

1. **Run Migration Script** (if not already done):
   ```bash
   cd wms-api
   node add-status-column-to-material-request-item.js
   ```

2. **Build Desktop Application**:
   - Build the C# project in Visual Studio
   - Or use: `dotnet build` (if using .NET CLI)

3. **Restart API Server** (if not already done):
   ```bash
   pm2 restart wms-api
   ```

4. **Run Desktop Application**:
   - The status column should now appear in Material Request detail window
   - Status values should be displayed for each item

## Status Values Displayed

- **Pending**: Item not picked yet (`picked_qty = 0`)
- **In Progress**: Item partially picked (`0 < picked_qty < requested_qty`)
- **Picked**: Item fully picked (`picked_qty >= requested_qty`)

## Files Modified

1. ✅ `Models/MaterialRequest.cs` - Added Status property
2. ✅ `Services/MaterialRequestDataService.cs` - Updated SQL query and object creation
3. ✅ `MaterialRequestDetailWindow.xaml` - Added Status column to DataGrid

