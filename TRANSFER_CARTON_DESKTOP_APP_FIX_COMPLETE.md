# Transfer Carton Not Showing in Desktop App - Complete Fix

## Issue
Transfer Carton `TC-MR-0001-1767517900442` was created successfully via mobile app API, but it's not appearing in the desktop application's Transfer Cartons list.

## Root Cause
The desktop app's `TransferCartonDataService.GetTransferCartonsAsync()` method was using `reader.GetString()` for `AdvanceShippingNotice` and `TransferOrder` columns without checking for NULL values first.

For Material Request transfer cartons:
- `asn_no` (or `advance_shipping_notice`) is **NULL** (required to be null)
- `to_no` (or `transfer_order`) contains the Material Request number (e.g., `"MR-0001"`)

When the desktop app tried to read a NULL value using `GetString()`, it threw an exception, causing the transfer carton to be skipped or the entire query to fail silently.

## Solution Applied

### 1. Fixed Data Service (`Services/TransferCartonDataService.cs`)

**Added NULL checks for nullable columns:**
```csharp
AdvanceShippingNotice = reader.IsDBNull(2) ? null : reader.GetString(2), // Handle NULL for Material Request transfer cartons
TransferOrder = reader.IsDBNull(3) ? null : reader.GetString(3),          // Handle NULL for Material Request transfer cartons
CreatedBy = reader.IsDBNull(5) ? null : reader.GetString(5),            // Handle NULL in case it's missing
```

### 2. Updated Model (`Models/TransferCarton.cs`)

**Made nullable fields nullable:**
```csharp
public string? AdvanceShippingNotice { get; init; } // Nullable for Material Request transfer cartons
public string? TransferOrder { get; init; }          // Nullable for Material Request transfer cartons
public string? CreatedBy { get; init; }              // Nullable in case it's missing
```

### 3. Updated Print Service (`Services/PrintService.cs`)

**Added null checks before displaying ASN and TO in print labels:**
- Only shows ASN if it's not null (Material Request transfer cartons have null ASN)
- Only shows TO if it's not null (though Material Request transfer cartons should have TO = MR number)

## Testing

### Steps to Verify Fix:
1. **Rebuild Desktop Application**
   ```bash
   # In Visual Studio or via command line
   dotnet build
   ```

2. **Restart Desktop Application**

3. **Verify Transfer Carton Appears:**
   - Open Desktop App → Transfer Cartons
   - Look for `TC-MR-0001-1767517900442`
   - Check that:
     - **Transfer Carton ID:** `TC-MR-0001-1767517900442`
     - **Status:** `Created`
     - **ASN:** (empty/null) ✅
     - **Transfer Order:** `MR-0001` ✅
     - **Store:** `STORE-001` (or destination store)

### Expected Result
Material Request transfer cartons should now appear in the desktop app's Transfer Cartons list with:
- ✅ ASN column showing empty/null
- ✅ Transfer Order column showing Material Request number (e.g., `MR-0001`)
- ✅ All other fields populated correctly
- ✅ No exceptions when loading transfer cartons

## Files Modified

1. ✅ `Services/TransferCartonDataService.cs` - Added NULL checks
2. ✅ `Models/TransferCarton.cs` - Made fields nullable
3. ✅ `Services/PrintService.cs` - Added null checks for printing

## Additional Notes

### Material Request Transfer Carton Characteristics:
- `asn_no` / `advance_shipping_notice`: **NULL** (required)
- `to_no` / `transfer_order`: Material Request number (e.g., `"MR-0001"`)
- `tc_id`: Format `TC-MR-{MR_NUMBER}-{timestamp}`
- `status`: `Created` (initially), then `Sealed` when sealed

### Why This Happened:
The desktop app was originally designed for regular Transfer Orders, where:
- ASN is typically not NULL
- Transfer Order is always present

Material Request transfer cartons have different requirements:
- ASN **must** be NULL
- Transfer Order contains Material Request number (not a regular TO)

The fix ensures the desktop app can handle both types of transfer cartons correctly.

## Next Steps

1. **Rebuild and restart desktop application**
2. **Verify transfer carton appears in list**
3. **Test printing labels** - should handle null ASN gracefully
4. **Test viewing transfer carton details** - should display correctly

