# Complete WMS System Modules List

## 📋 Printechs WMS - Complete Module Inventory

**Last Updated:** 2026-01-07  
**System Version:** Desktop Application + Backend API + Mobile App Integration

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    WMS Desktop Application                  │
│  (WPF .NET 8.0 - Windows Desktop)                          │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                    Backend API (Node.js)                    │
│  (Express.js + MySQL)                                       │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                    ERPNext Integration                      │
│  (Master Data Sync, ASN, Transfer Orders)                   │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                    Mobile App (React Native)                │
│  (Scanning, Putaway, Picking, Cycle Count)                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 MODULE 1: MASTER DATA MANAGEMENT

### 1.1 Warehouse Management
- **View:** `WarehouseListView.xaml`
- **Service:** `WarehouseDataService.cs`
- **Model:** `Warehouse.cs`
- **Features:**
  - Warehouse master data (code, name, type)
  - Warehouse hierarchy (parent/child warehouses)
  - Warehouse groups support
  - Active/inactive status

### 1.2 Location Management
- **View:** `LocationListView.xaml`
- **Service:** `LocationDataService.cs`
- **Model:** `Location.cs`
- **Features:**
  - Bin-level location master
  - Zone, Aisle, Rack, Level, Bin hierarchy
  - Location types (Storage, Picking, Staging, Dock, Damage, QA)
  - Location availability and capacity
  - Location barcode support

### 1.3 Zone Management
- **View:** `ZoneListView.xaml`
- **Model:** `Zone.cs`
- **Features:**
  - Zone master data
  - Zone-to-warehouse mapping

### 1.4 Aisle Management
- **View:** `AisleListView.xaml`
- **Model:** `Aisle.cs`
- **Features:**
  - Aisle master data
  - Aisle-to-zone mapping

### 1.5 Rack Management
- **View:** `RackListView.xaml`
- **Model:** `Rack.cs`
- **Features:**
  - Rack master data
  - Rack-to-aisle mapping

### 1.6 Item Master
- **View:** `ItemListView.xaml`
- **Service:** `ItemDataService.cs`
- **Model:** `Item.cs`
- **Features:**
  - Item master data (code, name, description)
  - Item groups and brands
  - Barcode management
  - UOM (Unit of Measure) support
  - Stock quantity tracking
  - Reserved and available quantity
  - Item location breakdown (bin-level or carton-level)

### 1.7 Item Group Management
- **View:** `ItemGroupListView.xaml`
- **Model:** `ItemGroup.cs`
- **Features:**
  - Item group master data
  - Item categorization

### 1.8 Brand Management
- **View:** `BrandListView.xaml`
- **Model:** `Brand.cs`
- **Features:**
  - Brand master data
  - Brand-to-item mapping

### 1.9 Supplier Management
- **View:** `SupplierListView.xaml`
- **Model:** `Supplier.cs`
- **Features:**
  - Supplier master data
  - Supplier information management

### 1.10 User Management
- **View:** `UserListView.xaml`
- **Service:** `UserDataService.cs`
- **Model:** `WmsUser.cs`, `WmsActiveUser.cs`
- **Features:**
  - User master data
  - User roles and permissions
  - Active user tracking
  - User authentication

### 1.11 Role Management
- **View:** `RoleListView.xaml`
- **Model:** `WmsRole.cs`, `WmsRolePermission.cs`
- **Features:**
  - Role master data
  - Permission management
  - Role-to-user assignment

---

## 📥 MODULE 2: INBOUND OPERATIONS

### 2.1 ASN (Advance Shipping Notice) Management
- **View:** `AsnListView.xaml`
- **Service:** `AsnDataService.cs`
- **Model:** `Asn.cs`
- **Features:**
  - ASN master data from ERPNext
  - ASN status tracking (Draft, Submitted, In Transit, Received)
  - Purchase order linkage
  - Supplier information
  - Expected arrival dates
  - ASN items and quantities
  - Excel import support

### 2.2 Purchase Order Management
- **View:** `PurchaseOrderListView.xaml`
- **Service:** `PurchaseOrderDataService.cs`
- **Model:** `PurchaseOrder.cs`, `PurchaseOrderItem.cs`
- **Features:**
  - Purchase order master data
  - PO items and quantities
  - Supplier linkage
  - PO status tracking

### 2.3 Inbound Session Management
- **View:** `InboundSessionListView.xaml`
- **Service:** `InboundSessionDataService.cs`, `InboundSessionApiService.cs`, `InboundSessionSyncService.cs`
- **Model:** `InboundSession.cs`, `InboundReceiveLineEditable.cs`
- **Features:**
  - Inbound receiving sessions
  - Receiving workflow (scan items, enter quantities)
  - ASN and Transfer In integration
  - Receiving status tracking
  - Real-time stock updates after receiving
  - Mobile app integration

### 2.4 Receiving Carton Management
- **Service:** `ReceivingCartonService.cs`
- **Model:** `ReceivingCarton.cs`, `CartonReceivingStatus.cs`
- **Features:**
  - Carton receiving workflow
  - Carton barcode scanning
  - Carton status tracking
  - Carton-to-ASN mapping

### 2.5 Receiving Routing
- **Service:** `ReceivingRoutingService.cs`
- **Features:**
  - Automatic routing logic for received items
  - Routing rules based on item, supplier, quantity
  - Dock and staging area assignment
  - Putaway task creation

---

## 📦 MODULE 3: PUTAWAY OPERATIONS

### 3.1 Putaway Task Management
- **View:** `PutawayTaskListView.xaml`
- **Service:** `PutawayTaskDataService.cs`
- **Model:** `PutawayTask.cs`
- **Features:**
  - Putaway task creation (from ASN or Transfer In)
  - Putaway task status (Draft, In Progress, Completed)
  - Source type tracking (ASN, TransferIn)
  - Putaway lines (item, quantity, target bin)
  - Location ID scanning support
  - Carton ID tracking
  - Bin-level and carton-level inventory support
  - Real-time stock updates after putaway
  - Mobile app integration

### 3.2 Putaway Task Detail
- **Window:** `PutawayTaskDetailWindow.xaml`
- **ViewModel:** `PutawayTaskDetailViewModel.cs`
- **Features:**
  - Detailed putaway task view
  - Putaway line management
  - Carton details panel (carton-level mode)
  - Location breakdown
  - Task completion workflow

---

## 📤 MODULE 4: OUTBOUND OPERATIONS

### 4.1 Material Request (Picking) Management
- **View:** `MaterialRequestListView.xaml`
- **Service:** `MaterialRequestDataService.cs`
- **Model:** `MaterialRequest.cs`
- **Features:**
  - Material request master data
  - Picking task creation
  - Item picking workflow
  - Bin location picking
  - Carton-level picking support
  - Picking validation (bin and carton)
  - Available cartons for picking
  - Real-time stock updates after picking
  - Mobile app integration

### 4.2 Material Request Detail
- **Window:** `MaterialRequestDetailWindow.xaml`
- **ViewModel:** `MaterialRequestDetailViewModel.cs`
- **Features:**
  - Detailed material request view
  - Item picking lines
  - Carton details panel (carton-level mode)
  - Picking completion workflow

### 4.3 Distribution Plan Management
- **View:** `DistributionPlanListView.xaml`
- **Model:** `DistributionPlan.cs`, `DistributionPlanItem.cs`
- **Features:**
  - Distribution plan master data
  - Distribution items and quantities
  - Plan-to-warehouse mapping

---

## 🔄 MODULE 5: TRANSFER OPERATIONS

### 5.1 Transfer Order Management
- **View:** `TransferOrderListView.xaml`
- **Service:** `TransferOrderDataService.cs`
- **Model:** `TransferOrder.cs`, `TransferOrderItem.cs`
- **Features:**
  - Transfer order master data (warehouse-to-warehouse)
  - Transfer order items and quantities
  - Source and target warehouse
  - Transfer order status tracking

### 5.2 Transfer In Management
- **View:** `TransferInListView.xaml`
- **Service:** `TransferInDataService.cs`
- **Model:** `TransferIn.cs`
- **Features:**
  - Transfer In master data (showroom-to-warehouse)
  - Transfer In items and quantities
  - Transfer In status (Draft, Submitted, In Transit, Received, Completed)
  - Integration with Inbound Session
  - Integration with Putaway Task (source_type = 'TransferIn')
  - Excel import support

### 5.3 Transfer Carton Management
- **View:** `TransferCartonListView.xaml`
- **Service:** `TransferCartonDataService.cs`, `TransferCartonService.cs`
- **Model:** `TransferCarton.cs`, `TransferCartonItem.cs`
- **Features:**
  - Transfer carton master data
  - Carton transfer workflow
  - Carton scanning and tracking
  - Transfer carton items
  - Carton status tracking

---

## 📊 MODULE 6: INVENTORY MANAGEMENT

### 6.1 Stock Ledger
- **View:** `StockLedgerView.xaml`
- **Service:** `StockLedgerService.cs`
- **Model:** `StockLedger.cs`
- **Features:**
  - Real-time stock tracking
  - Bin-level inventory (`tabStockLedger`)
  - Carton-level inventory (`tabCartonStock`)
  - Stock by item, warehouse, bin location
  - Reserved quantity tracking
  - Available quantity calculation
  - Stock transaction audit trail
  - Inventory mode switching (Bin Level / Carton Level)

### 6.2 Stock Transaction History
- **Service:** `StockLedgerService.cs`
- **Model:** `WmsTransactionItemDetail.cs`
- **Features:**
  - Complete stock movement history
  - Transaction types (Receiving, Putaway, Picking, Cycle Count, Adjustment)
  - Source and target bin tracking
  - Carton ID tracking (in carton-level mode)
  - Performed by user tracking
  - Quantity before/after tracking

### 6.3 Item Location Breakdown
- **Window:** `ItemLocationBreakdownWindow.xaml`
- **ViewModel:** `ItemLocationBreakdownViewModel.cs`
- **Model:** `ItemLocationStock.cs`
- **Features:**
  - Detailed inventory by location
  - Bin-level breakdown
  - Carton-level breakdown (with Carton ID column)
  - Zone, Aisle, Rack, Level, Bin details
  - Quantity by location
  - Total quantity summary

### 6.4 Bin Management (Carton-Level)
- **Service:** `CartonDataService.cs`
- **Model:** `Bin.cs`
- **Features:**
  - Bin master data (`tabBin`)
  - Bin types (STORAGE, DOCK, STAGING, PICK, DAMAGE, QA)
  - Bin-to-warehouse mapping
  - Bin location hierarchy
  - Bin barcode support

### 6.5 Carton Management (Carton-Level)
- **Service:** `CartonDataService.cs`
- **Model:** `Carton.cs`, `CartonItem.cs`, `CartonStock.cs`
- **Features:**
  - Carton master data (`tabCarton`)
  - Carton items (`tabCartonItem`)
  - Carton stock (`tabCartonStock`)
  - Carton status (RECEIVED_NOT_PUTAWAY, PUTAWAY, PICKED, SHIPPED, ADJUSTED)
  - Carton-to-bin assignment
  - Carton movement tracking
  - Carton barcode support
  - ASN and Transfer Order linkage

---

## 🔍 MODULE 7: CYCLE COUNT

### 7.1 Cycle Count Task Management
- **View:** `CycleCountTaskListView.xaml`
- **Service:** `CycleCountTaskDataService.cs`, `CycleCountApiService.cs`
- **Model:** `CycleCountTask.cs`
- **Features:**
  - Cycle count task creation
  - Count types (Full, Cycle, Spot)
  - Warehouse and zone selection
  - Count date scheduling
  - Task status (Draft, Scheduled, In Progress, Review, Completed, Cancelled)
  - Freeze stock option
  - Task assignment
  - Statistics (total items, counted items, items with discrepancy)

### 7.2 Cycle Count Task Detail
- **Window:** `CycleCountTaskDetailWindow.xaml`
- **ViewModel:** `CycleCountTaskDetailViewModel.cs`
- **Features:**
  - Detailed cycle count task view
  - Cycle count lines (item, bin, expected qty, actual qty)
  - Carton ID column (carton-level mode)
  - Discrepancy calculation
  - Counted by and counted on tracking
  - Review and approval workflow
  - Discrepancy reason tracking
  - Expected cartons panel (carton-level mode)
  - Task submission and completion

### 7.3 Cycle Count Line Management
- **Service:** `CycleCountTaskDataService.cs`
- **Model:** `CycleCountLine.cs`
- **Features:**
  - Cycle count line creation
  - Expected quantity from stock ledger/carton stock
  - Actual quantity entry
  - Discrepancy calculation (actual - expected)
  - Carton-level counting support
  - Expected cartons for bin
  - Carton validation

---

## 📋 MODULE 8: WMS TRANSACTIONS

### 8.1 WMS Transaction Management
- **View:** `WmsTransactionListView.xaml`
- **Service:** `WmsTransactionDataService.cs`, `WmsTransactionAutoCreateService.cs`
- **Model:** `WmsTransaction.cs`
- **Features:**
  - WMS transaction master data
  - Transaction types (Receiving, Putaway, Picking, Cycle Count, Adjustment)
  - Transaction status tracking
  - Reference document linkage (ASN, Transfer Order, etc.)
  - Source and target bin tracking
  - Automatic transaction creation
  - Transaction detail items

### 8.2 WMS Container Management
- **View:** `WmsContainerListView.xaml`
- **Model:** `WmsContainer.cs`, `WmsContainerItem.cs`
- **Features:**
  - Container master data
  - Container items
  - Container-to-transaction mapping

---

## 📦 MODULE 9: SORT BOX MANAGEMENT

### 9.1 Sort Box Management
- **View:** `SortBoxListView.xaml`
- **Service:** `SortBoxDataService.cs`, `SortBoxService.cs`
- **Model:** `SortBox.cs`, `SortBoxItem.cs`
- **Features:**
  - Sort box master data
  - Sort box items
  - Sorting workflow
  - Box assignment and tracking

---

## ⚙️ MODULE 10: SYSTEM ADMINISTRATION

### 10.1 Settings Management
- **View:** `SettingsView.xaml`
- **Service:** `SettingsService.cs`
- **Model:** `WmsSettings.cs`
- **Features:**
  - Database connection settings
  - API endpoint configuration
  - Sync frequency settings
  - Default picking warehouse
  - **Inventory Tracking Mode** (Bin Level / Carton Level)
  - Database creation and table setup
  - Migration management (Migration 005)
  - Test data insertion
  - Connection testing

### 10.2 Data Import
- **Service:** `DataImportService.cs`, `ExcelImportService.cs`
- **Features:**
  - Excel import for ASN
  - Excel import for Transfer In
  - Mock data import
  - Data validation
  - Import error handling

### 10.3 Migration Management
- **Service:** `MigrationService.cs`
- **Features:**
  - Migration 005: Bin + Carton Level Inventory
  - Automatic table creation
  - Column addition (carton_id to tabStockTransaction, tabCycleCountLine)
  - Test data insertion
  - Data verification

### 10.4 Error Logging
- **Service:** `ErrorLogService.cs`
- **Features:**
  - Application error logging
  - Log file management
  - Error tracking and debugging

### 10.5 Barcode Service
- **Service:** `BarcodeService.cs`
- **Features:**
  - Barcode generation
  - Barcode validation
  - Barcode scanning support

### 10.6 Print Service
- **Service:** `PrintService.cs`
- **Features:**
  - Label printing
  - Document printing
  - Print template support

---

## 🔄 MODULE 11: API INTEGRATION

### 11.1 Event API Service
- **Service:** `EventApiService.cs`
- **Features:**
  - Event posting to backend API
  - Scan event handling
  - Event synchronization

### 11.2 Inbound Session API Service
- **Service:** `InboundSessionApiService.cs`
- **Features:**
  - Inbound session API calls
  - Receiving workflow API integration
  - Real-time sync

### 11.3 Cycle Count API Service
- **Service:** `CycleCountApiService.cs`
- **Features:**
  - Cycle count API calls
  - Count submission
  - Count synchronization

---

## 📊 MODULE 12: REPORTING & ANALYTICS

### 12.1 Stock Reports
- **Features:**
  - Stock by item
  - Stock by warehouse
  - Stock by bin location
  - Stock by carton (carton-level mode)
  - Reserved stock reports
  - Available stock reports

### 12.2 Transaction Reports
- **Features:**
  - Transaction history
  - Movement reports
  - Receiving reports
  - Putaway reports
  - Picking reports
  - Cycle count reports

---

## 🎯 MODULE 13: INVENTORY TRACKING MODES

### 13.1 Bin-Level Inventory Mode
- **Default Mode**
- **Tables:** `tabStockLedger`
- **Tracking:** Item + Warehouse + Bin Location
- **Features:**
  - Traditional inventory tracking
  - No carton ID required
  - Backward compatible

### 13.2 Carton-Level Inventory Mode
- **Advanced Mode**
- **Tables:** `tabCartonStock`, `tabCarton`, `tabCartonItem`, `tabBin`
- **Tracking:** Carton ID + Item + Warehouse + Bin Location
- **Features:**
  - Individual carton tracking
  - Carton-to-bin assignment
  - Carton movement history
  - Carton-level picking
  - Carton-level cycle counting
  - Carton status tracking

---

## 📱 MODULE 14: MOBILE APP INTEGRATION

### 14.1 Mobile App Support
- **Features:**
  - Scan event handling
  - Barcode scanning
  - Putaway workflow
  - Picking workflow
  - Cycle count workflow
  - Real-time sync with desktop app
  - API integration

---

## 🗄️ DATABASE TABLES

### Master Data Tables
- `tabWarehouse` - Warehouse master
- `tabLocation` - Location master (bin-level)
- `tabZone` - Zone master
- `tabAisle` - Aisle master
- `tabRack` - Rack master
- `tabItem` - Item master
- `tabItemGroup` - Item group master
- `tabBrand` - Brand master
- `tabSupplier` - Supplier master
- `tabUser` - User master
- `tabRole` - Role master
- `tabRolePermission` - Role permissions

### Inventory Tables
- `tabStockLedger` - Bin-level inventory
- `tabStockTransaction` - Stock transaction log (with carton_id)
- `tabBin` - Bin master (carton-level)
- `tabCarton` - Carton master
- `tabCartonItem` - Carton items
- `tabCartonStock` - Carton-level inventory

### Inbound Tables
- `tabAsn` - Advance Shipping Notice
- `tabPurchaseOrder` - Purchase Order
- `tabPurchaseOrderItem` - PO Items
- `tabInboundSession` - Inbound receiving session
- `tabPutawayTask` - Putaway task
- `tabPutawayLine` - Putaway lines

### Outbound Tables
- `tabMaterialRequest` - Material request (picking)
- `tabMaterialRequestItem` - MR items
- `tabDistributionPlan` - Distribution plan
- `tabDistributionPlanItem` - DP items

### Transfer Tables
- `tabTransferOrder` - Transfer order
- `tabTransferOrderItem` - TO items
- `tabTransferIn` - Transfer In
- `tabTransferInItem` - TI items
- `tabTransferCarton` - Transfer carton
- `tabTransferCartonItem` - TC items

### Cycle Count Tables
- `tabCycleCountTask` - Cycle count task
- `tabCycleCountLine` - Cycle count lines (with carton_id)
- `tabCycleCountSettings` - Cycle count settings

### Transaction Tables
- `tabWmsTransaction` - WMS transaction
- `tabWmsTransactionDetail` - Transaction details
- `tabWmsContainer` - WMS container
- `tabWmsContainerItem` - Container items

### Other Tables
- `tabSortBox` - Sort box
- `tabSortBoxItem` - Sort box items

---

## 📈 SUMMARY STATISTICS

### Total Modules: **14 Major Modules**
### Total Views: **26 Views**
### Total Services: **35+ Services**
### Total Models: **40+ Models**
### Total Database Tables: **40+ Tables**

---

## ✅ KEY FEATURES

1. ✅ **Dual Inventory Tracking Modes** (Bin-Level / Carton-Level)
2. ✅ **Complete Inbound Workflow** (ASN → Receiving → Putaway)
3. ✅ **Complete Outbound Workflow** (Material Request → Picking)
4. ✅ **Transfer Operations** (Transfer In, Transfer Order, Transfer Carton)
5. ✅ **Cycle Count** (Full, Cycle, Spot counting)
6. ✅ **Real-Time Stock Tracking** (Bin-level and Carton-level)
7. ✅ **Mobile App Integration** (Scanning, Putaway, Picking, Cycle Count)
8. ✅ **ERPNext Integration** (Master data sync, ASN, Transfer Orders)
9. ✅ **Excel Import** (ASN, Transfer In)
10. ✅ **Location Management** (Zone, Aisle, Rack, Level, Bin hierarchy)
11. ✅ **User & Role Management** (Permissions, Authentication)
12. ✅ **Transaction Audit Trail** (Complete stock movement history)
13. ✅ **Barcode Support** (Item, Location, Carton barcodes)
14. ✅ **Print Service** (Labels, Documents)

---

**This is a comprehensive Warehouse Management System with full inbound, outbound, inventory, and administrative capabilities!**

