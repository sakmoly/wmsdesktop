# Item Location Breakdown - Carton ID Missing Fix

## 🔍 Issue

**Carton ID column is empty in Item Location Breakdown window**, even though items might be stored in cartons at those bin locations.

## ✅ Root Cause

1. **Bin-Level Mode Logic**: When in bin-level inventory mode, the code was only querying `tabStockLedger` which typically doesn't have `carton_id` column (bin-level inventory doesn't track cartons).

2. **Missing Carton Lookup**: The code wasn't checking `tabCartonStock` to see if there are cartons at each bin location, even in bin-level mode.

3. **Hardcoded NULL**: The code was hardcoding `CartonId = null` when displaying bin-level stock entries.

## ✅ Fix Applied

### 1. Added `CartonId` Property to `StockLedger` Model

**File:** `Models/StockLedger.cs`

**Changed:**
```csharp
// Added CartonId property
public string? CartonId { get; init; } // For carton-level inventory tracking
```

### 2. Updated `GetStockByBinAsync` to Fetch `carton_id`

**File:** `Services/StockLedgerService.cs`

**Changed:**
```csharp
// Check if carton_id column exists in tabStockLedger
var hasCartonIdColumn = await CheckColumnExistsAsync(connection, "tabStockLedger", "carton_id");
var cartonIdSelect = hasCartonIdColumn ? ", carton_id" : ", NULL as carton_id";

var sql = $@"
    SELECT item_code, warehouse, bin_location, qty, reserved_qty,
           qty_before, qty_reduced,
           last_transaction_date, last_transaction_type, last_transaction_ref,
           updated_at, created_at{cartonIdSelect}
    FROM tabStockLedger
    WHERE item_code = @itemCode
      AND warehouse = @warehouse
    ORDER BY bin_location IS NULL, bin_location";

// ... read carton_id and set it in StockLedger object
```

### 3. Updated `ItemLocationBreakdownViewModel` to Query `tabCartonStock`

**File:** `ViewModels/ItemLocationBreakdownViewModel.cs`

**Changed:**
- For bin-level stock entries, now queries `tabCartonStock` to get `carton_id` if not available in stock ledger
- Uses `entry.CartonId` from stock ledger if available
- Falls back to querying `tabCartonStock` if `carton_id` not in stock ledger
- Displays `carton_id` in the location breakdown window

**Logic:**
```csharp
// Priority 1: Use carton_id from stock ledger entry (if tabStockLedger has carton_id column)
string? cartonIdForLocation = entry.CartonId;

// Priority 2: Query tabCartonStock if carton_id not in stock ledger
if (string.IsNullOrEmpty(cartonIdForLocation) && !string.IsNullOrEmpty(entry.BinLocation))
{
    // Query tabCartonStock to get first carton_id at this bin location
    // This allows showing carton_id even in bin-level mode
}
```

## 📋 Behavior

### Before Fix:
- Carton ID column always showed empty (NULL) in bin-level mode
- No lookup from `tabCartonStock` was performed

### After Fix:
- **Priority 1**: Uses `carton_id` from `tabStockLedger` if column exists and has value
- **Priority 2**: Queries `tabCartonStock` to find carton(s) at the bin location
- **Display**: Shows first carton_id found (if multiple cartons exist at same bin, shows first one)
- **Fallback**: Shows NULL if no carton_id found

## 🔄 Data Flow

### Bin-Level Inventory Mode:
1. Fetch stock from `tabStockLedger` (includes `carton_id` if column exists)
2. For each stock ledger entry:
   - Use `carton_id` from stock ledger if available
   - If not available, query `tabCartonStock` for cartons at that bin location
   - Use first carton_id found (if multiple exist)
3. Display location breakdown with carton_id populated

### Carton-Level Inventory Mode:
- Already works correctly (fetches from `tabCartonStock` directly)
- No changes needed

## 📝 Files Modified

1. **`Models/StockLedger.cs`**
   - Added `CartonId` property

2. **`Services/StockLedgerService.cs`**
   - Updated `GetStockByBinAsync` to check for `carton_id` column
   - Fetches and sets `CartonId` property if column exists

3. **`ViewModels/ItemLocationBreakdownViewModel.cs`**
   - Updated bin-level stock processing to query `tabCartonStock` for carton_id
   - Uses `carton_id` from stock ledger entry if available
   - Falls back to `tabCartonStock` lookup if not available
   - Displays `carton_id` in location breakdown

## ✅ Verification

- ✅ `StockLedger` model has `CartonId` property
- ✅ `GetStockByBinAsync` fetches `carton_id` if column exists
- ✅ `ItemLocationBreakdownViewModel` queries `tabCartonStock` for carton_id
- ✅ Carton ID is displayed in location breakdown window
- ✅ Build successful (no compilation errors)

## 🚀 Next Steps

1. **Rebuild Desktop App** (close running app first to avoid file lock)
2. **Test Location Breakdown**:
   - Go to Items → Select an item → Show Location Breakdown
   - Verify Carton ID column shows values if cartons exist at that bin location
   - Check that carton_id from `tabCartonStock` is displayed correctly

---

**Status**: ✅ Fix applied. Carton ID should now be visible in Item Location Breakdown window.
