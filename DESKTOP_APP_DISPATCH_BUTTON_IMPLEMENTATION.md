# Desktop App Dispatch Button Implementation

## Summary

Added Dispatch button functionality to the Transfer Carton Detail window in the desktop application.

## Changes Made

### 1. Services/TransferCartonDataService.cs

Added two new methods:

- **`DispatchTransferCartonAsync`**: Dispatches a transfer carton by updating its status to "Dispatched"
  - Validates that the transfer carton exists and is in "Sealed" status
  - Updates status to "Dispatched" and sets `dispatched_by` and `dispatched_on`
  - Uses database transactions for data integrity
  
- **`GetTransferCartonByIdAsync`**: Gets a single transfer carton by ID (helper method)

### 2. ViewModels/TransferCartonDetailViewModel.cs

- **Added `CanDispatch` property**: Returns `true` when `TransferCarton.Status == "Sealed"`
- **Added `DispatchTransferCartonCommand`**: RelayCommand that handles the dispatch action
  - Shows confirmation dialog before dispatch
  - Calls `TransferCartonDataService.DispatchTransferCartonAsync`
  - Shows success/error messages
  - Updates `CanDispatch` property after dispatch

### 3. TransferCartonDetailWindow.xaml

- **Added Dispatch Button**: 
  - Content: "Dispatch"
  - Background: Orange (#F59E0B)
  - Command: `{Binding DispatchTransferCartonCommand}`
  - IsEnabled: `{Binding CanDispatch}` (only enabled when status is "Sealed")
  - Positioned between "Print Out Slip" and "Close" buttons

## Usage

1. Open a Transfer Carton Detail window
2. If the transfer carton status is "Sealed", the Dispatch button will be enabled
3. Click the Dispatch button
4. Confirm the dispatch action in the dialog
5. The transfer carton status will be updated to "Dispatched" in the database

## Important Notes

### Stock Reduction

**The desktop app dispatch method only updates the status.** Stock reduction for Material Request transfer cartons should be handled by:

1. **API Endpoint** (Recommended): `POST /api/transfer-cartons/dispatch`
   - The API endpoint handles full dispatch logic including stock reduction
   - Mobile app uses this endpoint
   - Desktop app can also use this endpoint if HTTP client is added

2. **Desktop App Enhancement** (Future):
   - To implement full stock reduction in the desktop app, the `DispatchTransferCartonAsync` method needs to be enhanced to:
     - Get items from the transfer carton (from `tabWmsScanEvent`)
     - Get source bins for each item
     - Reduce stock from `tabStockLedger`
     - Create `tabStockTransaction` entries
     - Update `tabItem.stock_qty`

### Transfer Carton Status

Since the `TransferCarton` model uses `init`-only properties, the status cannot be updated in the UI after dispatch. The status will be updated when:
- The detail window is closed and reopened
- The parent Transfer Carton List view is refreshed

The `CanDispatch` property is updated after dispatch to disable the button, even though the `TransferCarton.Status` property itself cannot be updated.

## Workflow

1. **Pick Items** → Items are picked from locations
2. **Pack to Transfer Carton** → Items are packed into transfer carton
3. **Seal Transfer Carton** → Transfer carton is sealed (no more items can be added)
4. **Dispatch Transfer Carton** → ⭐ **Status updated to "Dispatched"** ⭐
5. **Stock Reduction** → Should be handled by API endpoint `POST /api/transfer-cartons/dispatch`

## API Integration (Future Enhancement)

To fully integrate with the API for stock reduction, consider:

1. Add HTTP client support to desktop app
2. Call `POST /api/transfer-cartons/dispatch` instead of direct database update
3. This ensures stock reduction logic is centralized in the API

## Testing

1. Open a Transfer Carton with status "Sealed"
2. Verify the Dispatch button is enabled
3. Click Dispatch button
4. Confirm in the dialog
5. Verify success message
6. Close and reopen the detail window
7. Verify status is now "Dispatched"
8. Verify `dispatched_on` is set in database

## Mobile App

The mobile app can use the same API endpoint: `POST /api/transfer-cartons/dispatch`

Both desktop and mobile apps now support dispatching transfer cartons.

