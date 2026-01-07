# Cycle Count & Transfer In - Design & Implementation Plan

## 📋 Executive Summary

This document outlines the complete design and implementation plan for two critical WMS modules:

1. **Transfer In Module** - Receiving items from showroom to warehouse (Showroom → Warehouse)
2. **Cycle Count Module** - Physical inventory counting and discrepancy management

---

## 🔍 Current State Analysis

### Transfer In Module - Current Status

**✅ Already Implemented:**

- Database tables: `tabTransferIn`, `tabTransferInItem`
- API endpoints: `GET /api/transfer-in`, `GET /api/transfer-in/:title`, `POST /api/transfer-in`
- Desktop app models: `TransferIn.cs`, `TransferInItem.cs`
- Desktop app data service: `TransferInDataService.cs`
- Desktop app ViewModel: `TransferInListViewModel.cs`
- Desktop app View: `TransferInListView.xaml`
- Desktop app detail window: `TransferInDetailWindow.xaml`

**❌ Missing/Incomplete:**

- Integration with Inbound Session workflow
- Integration with Putaway Task (source_type = 'TransferIn')
- Mobile app receiving workflow
- Status management (Draft → Submitted → In Transit → Received → Completed)
- Stock update on receiving
- Excel import functionality

---

### Cycle Count Module - Current Status

**✅ Already Implemented:**

- Database tables: `tabCycleCountTask`, `tabCycleCountLine`, `tabCycleCountSettings`
- API endpoints: `GET /api/cycle-count`, `GET /api/cycle-count/:title`, `POST /api/cycle-count`
- Desktop app model: `CycleCountTask.cs`, `CycleCountLine.cs`
- Basic API controller structure

**❌ Missing/Incomplete:**

- Desktop app data service (`CycleCountTaskDataService.cs`)
- Desktop app ViewModels (List and Detail)
- Desktop app Views (List and Detail windows)
- Mobile app counting interface
- Discrepancy calculation and approval workflow
- Stock adjustment creation from discrepancies
- Stock freeze/unfreeze functionality
- Count completion and reporting

---

## 🎯 Module 1: Transfer In - Complete Design

### 1.1 Business Purpose

**Transfer In** handles the receipt of items from showrooms into the warehouse. Unlike ASN (supplier receiving), Transfer In items **always go directly to Putaway** (no Sorting step).

**Key Differences from ASN:**

- Source: Showroom (not Supplier)
- Destination: Warehouse
- Routing: Always Putaway (no Sorting/Transfer Order routing)
- Document: Transfer In (not ASN)

---

### 1.2 Workflow Design

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Transfer In Creation                                     │
│    - Created in Desktop App or synced from ERPNext         │
│    - Items may or may not have carton_id                    │
│    - Status: "Draft"                                        │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Submit Transfer In                                        │
│    - Status: "Submitted"                                    │
│    - Available for receiving                                │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Mobile App - Create Inbound Session                      │
│    - POST /api/inbound/update                               │
│    - transfer_in: "TI-0001" (not asn_no)                    │
│    - Status: "In Transit"                                   │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Mobile App - Receive Items                                │
│    ┌─────────────────────────────────────────┐              │
│    │ Scenario A: Items WITH Carton ID       │              │
│    │ - Scan carton ID                        │              │
│    │ - System shows items in carton           │              │
│    │ - Confirm receipt                       │              │
│    └─────────────────────────────────────────┘              │
│    ┌─────────────────────────────────────────┐              │
│    │ Scenario B: Items WITHOUT Carton ID    │              │
│    │ - Scan item barcode directly            │              │
│    │ - Enter quantity                        │              │
│    │ - Confirm receipt                       │              │
│    └─────────────────────────────────────────┘              │
│    - Update received_qty in tabTransferInItem               │
│    - Status: "Received"                                     │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Auto-Create Putaway Task                                  │
│    - source_type = 'TransferIn'                             │
│    - transfer_in = 'TI-0001'                                │
│    - Items go directly to Putaway (no Sorting)              │
│    - Putaway lines created with or without carton_id         │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Complete Putaway                                          │
│    - Stock added to warehouse locations                     │
│    - Works for both cartonized and loose items              │
│    - Status: "Completed"                                     │
└─────────────────────────────────────────────────────────────┘
```

---

### 1.3 Database Schema

**Already Exists:**

```sql
-- tabTransferIn (Parent)
- title VARCHAR(100) PRIMARY KEY
- status VARCHAR(50) DEFAULT 'Draft'
- from_showroom VARCHAR(100) NOT NULL
- to_warehouse VARCHAR(100) NOT NULL
- transfer_date DATE NOT NULL
- expected_arrival_date DATE NULL
- prepared_by VARCHAR(100) NOT NULL
- received_by VARCHAR(100) NULL
- received_on TIMESTAMP NULL
- total_qty DECIMAL(10,2) DEFAULT 0

-- tabTransferInItem (Child)
- id INT AUTO_INCREMENT PRIMARY KEY
- parent_title VARCHAR(100) NOT NULL
- item_code VARCHAR(100) NOT NULL
- qty DECIMAL(10,2) NOT NULL
- carton_id VARCHAR(100) NULL  -- ⚠️ NULLABLE: Items may not have carton_id
- received_qty DECIMAL(10,2) DEFAULT 0
```

**Important:** `carton_id` is **NULLABLE** - Transfer In items may come:

- **With Carton ID:** Items packed in cartons (scan carton to receive)
- **Without Carton ID:** Loose items (scan item barcode directly)

**Required Extensions:**

- `tabPutawayTask` already supports `source_type` and `transfer_in` columns (from previous implementation)
- `tabInboundSession` needs `transfer_in` column support (check if exists)
- `tabPutawayLine.carton_id` is already nullable (supports items without carton)

---

### 1.4 Status Flow

**Transfer In Status:**

- `Draft` → `Submitted` → `In Transit` → `Received` → `Completed`

**Status Rules:**

- `Draft`: Created but not submitted
- `Submitted`: Ready for receiving
- `In Transit`: Inbound session created, items in transit
- `Received`: All items received (received_qty = qty for all items)
- `Completed`: Putaway completed, stock updated

---

### 1.5 Integration Points

#### A. Inbound Session Integration

**Current:** Inbound Session supports ASN via `asn_no` field

**Required:** Extend to support Transfer In via `transfer_in` field

**API Endpoint:** `POST /api/inbound/update`

**Request Body:**

```json
{
  "inbound_session": "SESSION-TI0001-...",
  "transfer_in": "TI-0001", // ← Use this instead of asn_no
  "status": "Active",
  "dock": "DOCK-01",
  "user_id": "USER-001",
  "device_id": "DEVICE-001"
}
```

**Implementation:**

- Check if `transfer_in` column exists in `tabInboundSession`
- If exists, use it; if not, add via migration
- Update inbound controller to handle both `asn_no` and `transfer_in`

#### B. Putaway Task Integration

**Current:** Putaway Task supports ASN via `advance_shipping_notice` and `source_type = 'ASN'`

**Required:** Support Transfer In via `transfer_in` and `source_type = 'TransferIn'`

**Implementation:**

- Putaway Task already has `source_type` column (from previous implementation)
- Add `transfer_in` column if not exists
- Update Putaway Task creation logic:
  - If `source_type = 'ASN'`: Use `advance_shipping_notice`
  - If `source_type = 'TransferIn'`: Use `transfer_in`
- Update Putaway Task queries to handle both sources

**Auto-Creation Logic:**

```javascript
// When Transfer In is received, auto-create Putaway Task
if (source_type === "TransferIn") {
  // Create Putaway Task with source_type = 'TransferIn'
  // Items go directly to Putaway (no Sorting step)
}
```

---

### 1.6 Desktop App Implementation

#### Files to Create/Update:

**1. Services/TransferInDataService.cs** ✅ (Already exists, needs enhancement)

- Add `CreateTransferInAsync` method
- Add `UpdateTransferInStatusAsync` method
- Add `SubmitTransferInAsync` method
- Add `GetTransferInByTitleAsync` method (already exists)

**2. ViewModels/TransferInDetailViewModel.cs** ✅ (Already exists, needs enhancement)

- Add create/edit functionality
- Add submit command
- Add status management
- Add item management (add/remove items)

**3. Views/TransferInDetailWindow.xaml** ✅ (Already exists, needs enhancement)

- Add form fields for create/edit
- Add items DataGrid with add/remove
- Add submit button
- Add status display

**4. Services/PutawayTaskDataService.cs** (Update existing)

- Add method to create Putaway Task from Transfer In
- Handle `source_type = 'TransferIn'`

**5. Services/InboundSessionDataService.cs** (Update existing)

- Add support for `transfer_in` field
- Handle both ASN and Transfer In

---

### 1.7 API Implementation

#### Files to Update:

**1. wms-api/src/modules/transfer-in/transferInController.js** ✅ (Already exists)

- Enhance `createTransferIn` with validation
- Add `updateTransferInStatus` endpoint
- Add `submitTransferIn` endpoint
- Add `receiveTransferIn` endpoint

**2. wms-api/src/modules/inbound/inboundController.js** (Update existing)

- Add support for `transfer_in` parameter
- Handle Transfer In receiving workflow
  - **With Carton ID:** Receive by carton (update all items in carton)
  - **Without Carton ID:** Receive by item code (update individual item)
- Auto-create Putaway Task for Transfer In
- Handle both cartonized and loose items in Putaway Task creation

**3. wms-api/src/modules/putaway/putawayController.js** (Update existing)

- Ensure `source_type = 'TransferIn'` is supported
- Handle `transfer_in` field in queries
- Auto-create Putaway Task when Transfer In is received

**4. wms-api/src/routes/transferInRoutes.js** (Check if exists, create if not)

- Register Transfer In routes

---

### 1.8 Mobile App Integration

**Required Screens:**

1. **Transfer In List Screen** - Show available Transfer Ins for receiving
2. **Transfer In Detail Screen** - Show Transfer In items
3. **Receiving Screen** - Handle both cartonized and loose items

**Receiving Workflow - Two Scenarios:**

#### Scenario A: Items WITH Carton ID (Cartonized Items)

**Mobile App Flow:**

1. User opens Transfer In "TI-0001"
2. User scans carton ID "CTN-TI-001"
3. System displays all items in that carton from `tabTransferInItem`
4. User confirms receipt for all items in carton
5. System updates `received_qty` for all items with that `carton_id`

**API Call:**

```json
POST /api/inbound/receive-line
{
  "transfer_in": "TI-0001",
  "carton_id": "CTN-TI-001",
  "received_by": "USER-002"
}
```

#### Scenario B: Items WITHOUT Carton ID (Loose Items)

**Mobile App Flow:**

1. User opens Transfer In "TI-0001"
2. User scans item barcode directly (or selects from list)
3. System shows item details and expected quantity
4. User enters received quantity
5. System updates `received_qty` for that item (carton_id remains NULL)

**API Call:**

```json
POST /api/inbound/receive-line
{
  "transfer_in": "TI-0001",
  "item_code": "ITEM-001",
  "received_qty": 50.00,
  "carton_id": null,  // ← No carton ID
  "received_by": "USER-002"
}
```

**Alternative: Batch Receive (Multiple Items)**

```json
POST /api/inbound/receive-lines
{
  "transfer_in": "TI-0001",
  "lines": [
    {
      "item_code": "ITEM-001",
      "received_qty": 50.00,
      "carton_id": null
    },
    {
      "item_code": "ITEM-002",
      "received_qty": 30.00,
      "carton_id": null
    }
  ],
  "received_by": "USER-002"
}
```

**API Integration:**

- `GET /api/transfer-in?status=Submitted&to_warehouse=WH-MAIN` - List Transfer Ins
- `GET /api/transfer-in/:title` - Get Transfer In details
- `POST /api/inbound/update` - Create Inbound Session with `transfer_in`
- `POST /api/inbound/receive-line` - Receive single item (supports both cartonized and loose)
- `POST /api/inbound/receive-lines` - Receive multiple items (batch) - **NEW ENDPOINT NEEDED**

---

## 🎯 Module 2: Cycle Count - Complete Design

### 2.1 Business Purpose

**Cycle Count** enables physical inventory counting to verify stock accuracy and identify discrepancies. Supports three count types:

1. **Full Physical Count** - Count entire warehouse (annual/quarterly)
2. **Cycle Count** - Count specific zones/areas (regular rotation)
3. **Spot Count** - Count specific items/bins (quick verification)

---

### 2.2 Workflow Design

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Create Cycle Count Task                                  │
│    - Select count type (Full/Cycle/Spot)                   │
│    - Select warehouse/zone                                  │
│    - Set count date and schedule                            │
│    - Option: Freeze stock during count                      │
│    - Status: "Draft"                                        │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Generate Count Lines                                     │
│    - Load items from Stock Ledger                          │
│    - Create tabCycleCountLine for each item/bin            │
│    - Set expected_qty from tabStockLedger                  │
│    - Status: "Scheduled"                                    │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Start Count (Optional: Freeze Stock)                     │
│    - If freeze_stock = TRUE: Block movements in zone        │
│    - Status: "In Progress"                                  │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Mobile App - Count Items                                 │
│    - Operator scans bin/item                                │
│    - Enters actual quantity                                 │
│    - System calculates discrepancy                          │
│    - Status: "Counting" → "Counted"                        │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Review Discrepancies                                     │
│    - Show items with discrepancies                          │
│    - Check approval requirements                            │
│    - Add discrepancy reasons                                │
│    - Status: "Review"                                       │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Approve Discrepancies (if required)                       │
│    - Manager reviews large discrepancies                    │
│    - Approves or rejects                                    │
│    - Status: "Approved"                                     │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Create Stock Adjustments                                 │
│    - If discrepancy > 0: Material Receipt                  │
│    - If discrepancy < 0: Material Issue                     │
│    - Update tabStockLedger                                  │
│    - Create tabStockTransaction                             │
│    - Status: "Adjusted"                                     │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. Complete Cycle Count                                     │
│    - Unfreeze stock (if frozen)                             │
│    - Generate count report                                  │
│    - Status: "Completed"                                     │
└─────────────────────────────────────────────────────────────┘
```

---

### 2.3 Database Schema

**Already Exists:**

```sql
-- tabCycleCountTask (Parent)
- title VARCHAR(100) PRIMARY KEY
- status VARCHAR(50) DEFAULT 'Draft'
- count_type VARCHAR(50) NOT NULL -- 'Full', 'Cycle', 'Spot'
- warehouse VARCHAR(100) NOT NULL
- zone VARCHAR(100) NULL -- NULL for Full count
- count_date DATE NOT NULL
- scheduled_start_time TIME NULL
- scheduled_end_time TIME NULL
- freeze_stock BOOLEAN DEFAULT FALSE
- created_by VARCHAR(100) NOT NULL
- assigned_to VARCHAR(100) NULL
- total_items INT DEFAULT 0
- counted_items INT DEFAULT 0
- items_with_discrepancy INT DEFAULT 0

-- tabCycleCountLine (Child)
- id INT AUTO_INCREMENT PRIMARY KEY
- parent_title VARCHAR(100) NOT NULL
- item_code VARCHAR(100) NOT NULL
- bin_location VARCHAR(100) NULL
- expected_qty DECIMAL(10,2) NOT NULL -- From tabStockLedger
- actual_qty DECIMAL(10,2) NULL -- Entered by operator
- discrepancy DECIMAL(10,2) AS (COALESCE(actual_qty, 0) - expected_qty) STORED
- counted_by VARCHAR(100) NULL
- counted_on TIMESTAMP NULL
- reviewed_by VARCHAR(100) NULL
- reviewed_on TIMESTAMP NULL
- approval_required BOOLEAN DEFAULT FALSE
- approved_by VARCHAR(100) NULL
- approved_on TIMESTAMP NULL
- discrepancy_reason TEXT NULL
- status VARCHAR(50) DEFAULT 'Pending' -- Pending, Counting, Counted, Reviewed, Approved, Adjusted

-- tabCycleCountSettings (Configuration)
- warehouse VARCHAR(100) NOT NULL
- zone VARCHAR(100) NULL
- count_frequency VARCHAR(50) DEFAULT 'Monthly'
- discrepancy_threshold_percent DECIMAL(5,2) DEFAULT 5.00
- discrepancy_threshold_qty DECIMAL(10,2) DEFAULT 10.00
- auto_adjust_small_discrepancies BOOLEAN DEFAULT FALSE
- freeze_stock_during_count BOOLEAN DEFAULT TRUE
- require_approval_for_negative BOOLEAN DEFAULT TRUE
```

---

### 2.4 Status Flow

**Cycle Count Task Status:**

- `Draft` → `Scheduled` → `In Progress` → `Counting` → `Review` → `Completed`

**Cycle Count Line Status:**

- `Pending` → `Counting` → `Counted` → `Reviewed` → `Approved` → `Adjusted`

**Status Rules:**

- `Draft`: Task created, lines not generated
- `Scheduled`: Lines generated, ready to start
- `In Progress`: Count started, stock frozen (if enabled)
- `Counting`: Operators counting items
- `Review`: All items counted, reviewing discrepancies
- `Completed`: Adjustments applied, count complete

---

### 2.5 Discrepancy Management

#### Discrepancy Calculation

```
discrepancy = actual_qty - expected_qty
```

#### Approval Requirements

- **Percentage Threshold:** If `|discrepancy| / expected_qty * 100 > threshold_percent`
- **Quantity Threshold:** If `|discrepancy| > threshold_qty`
- **Negative Discrepancy:** Always requires approval if `require_approval_for_negative = TRUE`

#### Auto-Adjustment

- If `auto_adjust_small_discrepancies = TRUE` and discrepancy is below threshold:
  - Automatically approve
  - Create stock adjustment immediately

---

### 2.6 Stock Freeze Logic

**When `freeze_stock = TRUE`:**

- Block all stock movements in the count zone
- Allow only Cycle Count transactions
- Prevent:
  - Putaway to frozen zone
  - Picking from frozen zone
  - Transfers from frozen zone

**Implementation:**

- Check `freeze_stock` flag before allowing movements
- Query `tabCycleCountTask` for active counts in zone
- Validate against frozen zones in transaction processing

---

### 2.7 Desktop App Implementation

#### Files to Create:

**1. Services/CycleCountTaskDataService.cs** ❌ (NEW)

```csharp
public static class CycleCountTaskDataService
{
    // Get all Cycle Count Tasks
    public static async Task<List<CycleCountTask>> GetCycleCountTasksAsync(
        WmsSettings settings,
        string? status = null,
        string? warehouse = null,
        string? zone = null,
        string? countType = null);

    // Get Cycle Count Task by title
    public static async Task<CycleCountTask?> GetCycleCountTaskByTitleAsync(
        WmsSettings settings,
        string title);

    // Create Cycle Count Task
    public static async Task<bool> CreateCycleCountTaskAsync(
        WmsSettings settings,
        CycleCountTask task);

    // Generate count lines from Stock Ledger
    public static async Task<bool> GenerateCountLinesAsync(
        WmsSettings settings,
        string taskTitle,
        string warehouse,
        string? zone = null);

    // Update count line (actual_qty)
    public static async Task<bool> UpdateCountLineAsync(
        WmsSettings settings,
        int lineId,
        double actualQty,
        string countedBy);

    // Review discrepancies
    public static async Task<bool> ReviewDiscrepanciesAsync(
        WmsSettings settings,
        string taskTitle,
        string reviewedBy);

    // Approve discrepancies
    public static async Task<bool> ApproveDiscrepanciesAsync(
        WmsSettings settings,
        string taskTitle,
        string approvedBy);

    // Create stock adjustments
    public static async Task<bool> CreateStockAdjustmentsAsync(
        WmsSettings settings,
        string taskTitle);

    // Complete Cycle Count
    public static async Task<bool> CompleteCycleCountAsync(
        WmsSettings settings,
        string taskTitle);
}
```

**2. ViewModels/CycleCountTaskListViewModel.cs** ❌ (NEW)

```csharp
public sealed class CycleCountTaskListViewModel : BaseViewModel
{
    public ObservableCollection<CycleCountTask> CycleCountTasks { get; } = new();

    // Filter properties
    public string? SelectedStatus { get; set; }
    public string? SelectedWarehouse { get; set; }
    public string? SelectedZone { get; set; }
    public string? SelectedCountType { get; set; }

    // Commands
    public RelayCommand LoadDataCommand { get; }
    public RelayCommand OpenDetailCommand { get; }
    public RelayCommand CreateNewCommand { get; }
    public RelayCommand FilterCommand { get; }
    public RelayCommand ClearFilterCommand { get; }
}
```

**3. ViewModels/CycleCountTaskDetailViewModel.cs** ❌ (NEW)

```csharp
public sealed class CycleCountTaskDetailViewModel : BaseViewModel
{
    public CycleCountTask? CycleCountTask { get; set; }
    public ObservableCollection<CycleCountLine> Lines { get; } = new();

    // Commands
    public RelayCommand LoadDataCommand { get; }
    public RelayCommand GenerateLinesCommand { get; }
    public RelayCommand StartCountCommand { get; }
    public RelayCommand ReviewDiscrepanciesCommand { get; }
    public RelayCommand ApproveDiscrepanciesCommand { get; }
    public RelayCommand CreateAdjustmentsCommand { get; }
    public RelayCommand CompleteCountCommand { get; }
    public RelayCommand PrintReportCommand { get; }
}
```

**4. Views/CycleCountTaskListView.xaml** ❌ (NEW)

- DataGrid with Cycle Count Tasks
- Filter controls (Status, Warehouse, Zone, Count Type)
- Create New button
- Double-click to open detail

**5. Views/CycleCountTaskDetailWindow.xaml** ❌ (NEW)

- Task header information
- Lines DataGrid with:
  - Item Code
  - Bin Location
  - Expected Qty
  - Actual Qty (editable)
  - Discrepancy (calculated)
  - Status
  - Approval Required indicator
- Action buttons:
  - Generate Lines
  - Start Count
  - Review Discrepancies
  - Approve
  - Create Adjustments
  - Complete Count
  - Print Report

---

### 2.8 API Implementation

#### Files to Update/Create:

**1. wms-api/src/modules/cycle-count/cycleCountController.js** ✅ (Already exists, needs enhancement)

**Required Endpoints:**

```javascript
// GET /api/cycle-count
export const getCycleCountTasks = async (req, res) => { ... }

// GET /api/cycle-count/:title
export const getCycleCountTaskByTitle = async (req, res) => { ... }

// POST /api/cycle-count
export const createCycleCountTask = async (req, res) => { ... }

// POST /api/cycle-count/:title/generate-lines
export const generateCountLines = async (req, res) => {
  // Load items from tabStockLedger based on warehouse/zone
  // Create tabCycleCountLine for each item/bin
  // Set expected_qty from stock ledger
}

// POST /api/cycle-count/:title/start
export const startCycleCount = async (req, res) => {
  // Update status to "In Progress"
  // Freeze stock if freeze_stock = TRUE
}

// POST /api/cycle-count/:title/update-line
export const updateCountLine = async (req, res) => {
  // Update actual_qty for a line
  // Calculate discrepancy
  // Check approval requirements
  // Update status to "Counted"
}

// POST /api/cycle-count/:title/review
export const reviewDiscrepancies = async (req, res) => {
  // Show items with discrepancies
  // Update status to "Review"
}

// POST /api/cycle-count/:title/approve
export const approveDiscrepancies = async (req, res) => {
  // Approve discrepancies
  // Update approval_required = FALSE
  // Update status to "Approved"
}

// POST /api/cycle-count/:title/create-adjustments
export const createStockAdjustments = async (req, res) => {
  // For each line with discrepancy:
  //   If discrepancy > 0: Material Receipt (add stock)
  //   If discrepancy < 0: Material Issue (reduce stock)
  // Update tabStockLedger
  // Create tabStockTransaction entries
  // Update line status to "Adjusted"
}

// POST /api/cycle-count/:title/complete
export const completeCycleCount = async (req, res) => {
  // Unfreeze stock if frozen
  // Update status to "Completed"
  // Generate count report
}
```

**2. wms-api/src/routes/cycleCountRoutes.js** (Check if exists, create if not)

```javascript
import express from "express";
import {
  getCycleCountTasks,
  getCycleCountTaskByTitle,
  createCycleCountTask,
  generateCountLines,
  startCycleCount,
  updateCountLine,
  reviewDiscrepancies,
  approveDiscrepancies,
  createStockAdjustments,
  completeCycleCount,
} from "../modules/cycle-count/cycleCountController.js";

const router = express.Router();

router.get("/", getCycleCountTasks);
router.get("/:title", getCycleCountTaskByTitle);
router.post("/", createCycleCountTask);
router.post("/:title/generate-lines", generateCountLines);
router.post("/:title/start", startCycleCount);
router.post("/:title/update-line", updateCountLine);
router.post("/:title/review", reviewDiscrepancies);
router.post("/:title/approve", approveDiscrepancies);
router.post("/:title/create-adjustments", createStockAdjustments);
router.post("/:title/complete", completeCycleCount);

export default router;
```

---

### 2.9 Mobile App Integration

**Required Screens:**

**1. Cycle Count List Screen**

- Show available Cycle Count Tasks
- Filter by status, warehouse, zone
- Show progress (counted_items / total_items)

**2. Cycle Count Detail Screen**

- Show task information
- Show count lines with status
- Start count button

**3. Cycle Count Counting Screen** ⭐ (Core Feature)

- Display one item at a time
- Show:
  - Item Code
  - Bin Location
  - Expected Qty (from stock ledger)
  - Input field for Actual Qty
  - Calculated Discrepancy
- Record count and move to next item
- Mark as counted

**API Endpoints:**

- `GET /api/cycle-count?status=In Progress` - Get active counts
- `GET /api/cycle-count/:title` - Get count details
- `POST /api/cycle-count/:title/start` - Start count
- `POST /api/cycle-count/:title/update-line` - Update actual qty

---

## 🔄 Integration Requirements

### Transfer In → Putaway Integration

**Current Putaway Task Logic:**

- Supports `source_type = 'ASN'` with `advance_shipping_notice`
- Needs: `source_type = 'TransferIn'` with `transfer_in`

**Implementation:**

1. Check if `transfer_in` column exists in `tabPutawayTask`
2. If not, add via migration
3. Update Putaway Task creation:
   ```javascript
   if (source_type === "TransferIn") {
     // Use transfer_in field
     // Items go directly to Putaway (no Sorting)
   }
   ```

### Cycle Count → Stock Adjustment Integration

**Stock Adjustment Logic:**

- Discrepancy > 0: Material Receipt (add stock)
- Discrepancy < 0: Material Issue (reduce stock)

**Implementation:**

1. For each line with discrepancy:
   - Calculate adjustment qty = discrepancy
   - If positive: Add to `tabStockLedger`
   - If negative: Reduce from `tabStockLedger`
   - Create `tabStockTransaction` entry
   - Update `qty_before` and `qty_reduced` in stock ledger

---

## 📊 Implementation Phases

### Phase 1: Transfer In Completion (Priority: High)

**Week 1:**

- [ ] Enhance Transfer In API endpoints
- [ ] Add status management
- [ ] Integrate with Inbound Session
- [ ] Test receiving workflow

**Week 2:**

- [ ] Integrate with Putaway Task
- [ ] Auto-create Putaway Task on receiving
- [ ] Update desktop app UI
- [ ] Test complete workflow

**Week 3:**

- [ ] Mobile app integration
- [ ] Excel import functionality
- [ ] Testing and bug fixes

---

### Phase 2: Cycle Count Implementation (Priority: High)

**Week 1:**

- [ ] Create CycleCountTaskDataService.cs
- [ ] Create ViewModels and Views
- [ ] Basic CRUD operations
- [ ] Test desktop app UI

**Week 2:**

- [ ] Implement generate lines from Stock Ledger
- [ ] Implement count line updates
- [ ] Implement discrepancy calculation
- [ ] Test counting workflow

**Week 3:**

- [ ] Implement approval workflow
- [ ] Implement stock adjustments
- [ ] Implement stock freeze logic
- [ ] Test complete workflow

**Week 4:**

- [ ] Mobile app counting interface
- [ ] Reporting functionality
- [ ] Testing and bug fixes

---

## 🗄️ Database Migrations Required

### Migration 1: Transfer In Support in Inbound Session

```sql
-- Check if transfer_in column exists, add if not
ALTER TABLE tabInboundSession
ADD COLUMN IF NOT EXISTS transfer_in VARCHAR(100) NULL
AFTER asn_no;

-- Add index
CREATE INDEX IF NOT EXISTS idx_transfer_in
ON tabInboundSession(transfer_in);
```

### Migration 2: Transfer In Support in Putaway Task

```sql
-- Check if transfer_in column exists, add if not
ALTER TABLE tabPutawayTask
ADD COLUMN IF NOT EXISTS transfer_in VARCHAR(100) NULL
AFTER advance_shipping_notice;

-- Add index
CREATE INDEX IF NOT EXISTS idx_transfer_in
ON tabPutawayTask(transfer_in);
```

### Migration 3: Cycle Count Tables Verification

```sql
-- Verify Cycle Count tables exist (from MIGRATION_002)
-- If not, create them
-- (Tables should already exist, just verify)
```

---

## 🧪 Testing Strategy

### Transfer In Testing

**Test Scenarios:**

1. Create Transfer In in desktop app
2. Submit Transfer In
3. Create Inbound Session with Transfer In
4. Receive items via mobile app
5. Verify Putaway Task auto-created
6. Complete Putaway
7. Verify stock updated

### Cycle Count Testing

**Test Scenarios:**

1. Create Cycle Count Task
2. Generate count lines from Stock Ledger
3. Start count (with/without stock freeze)
4. Count items via mobile app
5. Review discrepancies
6. Approve discrepancies
7. Create stock adjustments
8. Verify stock ledger updated
9. Complete count
10. Verify stock unfrozen

---

## 📝 Key Design Decisions

### Decision 1: Transfer In Always Goes to Putaway

**Rationale:** Transfer In items come from showrooms and need to be stored in warehouse. No sorting/transfer order routing needed.

**Implementation:** Auto-create Putaway Task with `source_type = 'TransferIn'` when Transfer In is received.

---

### Decision 2: Cycle Count Discrepancy Approval

**Rationale:** Large discrepancies need manager approval to prevent errors.

**Implementation:**

- Check thresholds (percentage and quantity)
- Set `approval_required = TRUE` if exceeds threshold
- Require approval before creating adjustments

---

### Decision 3: Stock Freeze During Count

**Rationale:** Prevents stock movements during count to ensure accuracy.

**Implementation:**

- Check active Cycle Count Tasks in zone
- Block movements if `freeze_stock = TRUE`
- Allow only Cycle Count transactions

---

## 🚀 Next Steps

1. **Review this design document** with stakeholders
2. **Prioritize implementation** (Transfer In first, then Cycle Count)
3. **Create detailed task breakdown** for each phase
4. **Start implementation** with Phase 1 (Transfer In Completion)
5. **Test thoroughly** before moving to Phase 2

---

## 📚 Related Documentation

- `APP_SPEC.md` - Business rules and constraints
- `ARCHITECTURE.md` - Technical architecture
- `PROJECT_MAP.md` - File structure
- `COMPREHENSIVE_IMPLEMENTATION_PLAN.md` - Previous planning document
- `DETAILED_WORKFLOW_DESKTOP_AND_MOBILE.md` - Workflow documentation

---

**Document Version:** 1.0  
**Created:** 2026-01-05  
**Status:** Ready for Review
