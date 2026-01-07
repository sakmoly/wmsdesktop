# Transfer Carton Not Showing in Desktop App - Fix

## Issue
Transfer Carton `TC-MR-0001-1767517900442` was created successfully via mobile app API, but it's not appearing in the desktop application's Transfer Cartons list.

## Root Cause
The desktop app's `TransferCartonDataService.GetTransferCartonsAsync()` method was using `reader.GetString()` for `AdvanceShippingNotice` and `TransferOrder` columns without checking for NULL values first.

For Material Request transfer cartons:
- `asn_no` (or `advance_shipping_notice`) is **NULL** (required to be null)
- `to_no` (or `transfer_order`) contains the Material Request number (e.g., `"MR-0001"`)

When the desktop app tried to read a NULL value using `GetString()`, it threw an exception, causing the transfer carton to be skipped or the entire query to fail silently.

## Solution Applied

**File:** `Services/TransferCartonDataService.cs`

**Changes:**
1. Added NULL checks for `AdvanceShippingNotice` (ASN column)
2. Added NULL checks for `TransferOrder` (TO column)
3. Added NULL check for `CreatedBy` (in case it's missing)

**Before:**
```csharp
AdvanceShippingNotice = reader.GetString(2),  // ❌ Throws exception if NULL
TransferOrder = reader.GetString(3),        // ❌ Throws exception if NULL
CreatedBy = reader.GetString(5),             // ❌ Throws exception if NULL
```

**After:**
```csharp
AdvanceShippingNotice = reader.IsDBNull(2) ? null : reader.GetString(2),  // ✅ Handles NULL
TransferOrder = reader.IsDBNull(3) ? null : reader.GetString(3),          // ✅ Handles NULL
CreatedBy = reader.IsDBNull(5) ? null : reader.GetString(5),             // ✅ Handles NULL
```

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

## Related Files
- `Services/TransferCartonDataService.cs` - Fixed NULL handling
- `Models/TransferCarton.cs` - Model (should already support nullable strings)

