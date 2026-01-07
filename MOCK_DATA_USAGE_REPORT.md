# Mock Data Usage Report

## Summary
This report identifies all modules in the WMS Desktop application that are still using mock data as fallback when the database is unavailable or errors occur.

---

## ✅ Modules WITHOUT Mock Data Fallback (Database Only)

### 1. **Purchase Order** ✅
- **File**: `ViewModels/PurchaseOrderListViewModel.cs`
- **Status**: ✅ **NO MOCK DATA FALLBACK**
- **Behavior**: Shows empty list if database unavailable
- **Note**: Only uses `InsertMockPurchaseOrdersAsync()` for initial seed data (one-time setup)

---

## ⚠️ Modules WITH Mock Data Fallback

### 2. **ASN (Advance Shipping Notice)**
- **File**: `ViewModels/AsnListViewModel.cs`
- **Mock Data Source**: `MockDataService.GetAsns()`
- **Lines**: 27, 44
- **Usage**: Fallback when database unavailable or on error

### 3. **Transfer Order**
- **File**: `ViewModels/TransferOrderListViewModel.cs`
- **Mock Data Source**: `MockDataService.GetTransferOrders()`
- **Lines**: 26, 43
- **Usage**: Fallback when database unavailable or on error

### 4. **Warehouse**
- **File**: `ViewModels/WarehouseListViewModel.cs`
- **Mock Data Source**: `LoadMockWarehouses()` + `MockDataService.GetWarehouses()`
- **Lines**: 27, 41, 45-60
- **Usage**: Fallback when database unavailable or on error

### 5. **Item**
- **File**: `ViewModels/ItemListViewModel.cs`
- **Mock Data Source**: `LoadMockItems()` + `MockDataService.GetItems()`
- **Lines**: 27, 41, 45-97
- **Usage**: Fallback when database unavailable or on error

### 6. **Location**
- **File**: `ViewModels/LocationListViewModel.cs`
- **Mock Data Source**: `LoadMockLocations()`
- **Lines**: 26, 40, 44+
- **Usage**: Fallback when database unavailable or on error

### 7. **Sort Box**
- **File**: `ViewModels/SortBoxListViewModel.cs`
- **Mock Data Source**: `MockDataService.GetSortBoxes()`
- **Lines**: 74, 96
- **Usage**: Fallback when database unavailable or on error

### 8. **Transfer Carton**
- **File**: `ViewModels/TransferCartonListViewModel.cs`
- **Mock Data Source**: `MockDataService.GetTransferCartons()`
- **Lines**: 37, 59
- **Usage**: Fallback when database unavailable or on error

### 9. **Putaway Task**
- **File**: `ViewModels/PutawayTaskListViewModel.cs`
- **Mock Data Source**: `MockDataService.GetPutawayTasks()`
- **Lines**: 26, 43
- **Usage**: Fallback when database unavailable or on error

### 10. **Inbound Session Detail** (Partial)
- **File**: `ViewModels/InboundSessionDetailViewModel.cs`
- **Mock Data Source**: `MockDataService.GetAsnByTitle()`, `MockDataService.GetTransferOrderByTitle()`, `MockDataService.GetTransferOrderByAsn()`
- **Lines**: 137, 138, 169, 170, 304, 306, 307, 320, 322, 323
- **Usage**: Fallback for ASN and Transfer Order lookups in detail view

### 11. **Sort Box Detail** (Partial)
- **File**: `ViewModels/SortBoxDetailViewModel.cs`
- **Mock Data Source**: `MockDataService.GetAsnByTitle()`, `MockDataService.GetTransferOrderByTitle()`
- **Lines**: 137, 138, 169, 170
- **Usage**: Fallback for ASN and Transfer Order lookups in detail view

---

## 📋 Other Mock Data Usage (Not in ViewModels)

### 12. **Data Import Service**
- **File**: `Services/DataImportService.cs`
- **Purpose**: Manual import of mock data via Settings UI
- **Method**: `ImportMockDataAsync()`
- **Usage**: User-initiated import from Settings screen
- **Note**: This is intentional - allows users to seed database with test data

### 13. **Purchase Order Data Service** (Initial Seed Only)
- **File**: `Services/PurchaseOrderDataService.cs`
- **Method**: `InsertMockPurchaseOrdersAsync()`
- **Usage**: One-time initial seed data (only if database is empty)
- **Note**: ✅ This is acceptable - only runs once for setup

---

## 📊 Summary Statistics

- **Total Modules**: 13
- **No Mock Data Fallback**: 1 (Purchase Order)
- **With Mock Data Fallback**: 9 ViewModels + 2 Detail ViewModels
- **Intentional Mock Data**: 2 (Data Import Service, Initial Seed)

---

## 🔧 Recommendation

If you want to remove ALL mock data fallbacks (like Purchase Order), you would need to update:

1. **ASN List ViewModel** - Remove `MockDataService.GetAsns()` fallback
2. **Transfer Order List ViewModel** - Remove `MockDataService.GetTransferOrders()` fallback
3. **Warehouse List ViewModel** - Remove `LoadMockWarehouses()` fallback
4. **Item List ViewModel** - Remove `LoadMockItems()` fallback
5. **Location List ViewModel** - Remove `LoadMockLocations()` fallback
6. **Sort Box List ViewModel** - Remove `MockDataService.GetSortBoxes()` fallback
7. **Transfer Carton List ViewModel** - Remove `MockDataService.GetTransferCartons()` fallback
8. **Putaway Task List ViewModel** - Remove `MockDataService.GetPutawayTasks()` fallback
9. **Inbound Session Detail ViewModel** - Remove ASN/TO lookup fallbacks
10. **Sort Box Detail ViewModel** - Remove ASN/TO lookup fallbacks

---

## 📝 Notes

- The `MockDataService` class contains all mock data definitions
- Mock data is used for:
  1. **Fallback** when database is unavailable (most common)
  2. **Error recovery** when database operations fail
  3. **Initial seed data** (Purchase Order only - one-time setup)
  4. **Manual import** via Settings UI (intentional feature)
  5. **Detail view lookups** (ASN/TO references in detail screens)

---

**Generated**: 2025-01-28
**Last Updated**: After Purchase Order mock data removal

