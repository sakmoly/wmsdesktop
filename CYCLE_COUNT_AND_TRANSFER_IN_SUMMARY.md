# Cycle Count & Transfer In - Implementation Summary

## 📊 Current Status Overview

### Transfer In Module

| Component                | Status      | Notes                                       |
| ------------------------ | ----------- | ------------------------------------------- |
| Database Tables          | ✅ Complete | `tabTransferIn`, `tabTransferInItem` exist  |
| API Endpoints (Basic)    | ✅ Complete | GET, POST endpoints exist                   |
| API Integration          | ⚠️ Partial  | Needs Inbound Session & Putaway integration |
| Desktop App Models       | ✅ Complete | `TransferIn.cs` exists                      |
| Desktop App Data Service | ✅ Complete | `TransferInDataService.cs` exists           |
| Desktop App ViewModels   | ✅ Complete | List ViewModel exists                       |
| Desktop App Views        | ✅ Complete | List and Detail views exist                 |
| Mobile App Integration   | ❌ Missing  | Needs receiving workflow                    |
| Excel Import             | ❌ Missing  | Not implemented                             |

**Completion:** ~70% - Core structure exists, needs integration and mobile app support

---

### Cycle Count Module

| Component                | Status      | Notes                                                                   |
| ------------------------ | ----------- | ----------------------------------------------------------------------- |
| Database Tables          | ✅ Complete | `tabCycleCountTask`, `tabCycleCountLine`, `tabCycleCountSettings` exist |
| API Endpoints (Basic)    | ✅ Complete | GET, POST endpoints exist                                               |
| API Endpoints (Advanced) | ❌ Missing  | Generate lines, start count, update line, approve, adjust, complete     |
| Desktop App Models       | ✅ Complete | `CycleCountTask.cs` exists                                              |
| Desktop App Data Service | ❌ Missing  | `CycleCountTaskDataService.cs` not created                              |
| Desktop App ViewModels   | ❌ Missing  | List and Detail ViewModels not created                                  |
| Desktop App Views        | ❌ Missing  | List and Detail views not created                                       |
| Mobile App Integration   | ❌ Missing  | Counting interface not implemented                                      |
| Stock Adjustment Logic   | ❌ Missing  | Not implemented                                                         |
| Stock Freeze Logic       | ❌ Missing  | Not implemented                                                         |

**Completion:** ~30% - Database and basic API exist, needs full implementation

---

## 🎯 Design Overview

### Transfer In Design

**Purpose:** Receive items from showroom to warehouse

**Key Characteristics:**

- Always goes to Putaway (no Sorting step)
- Similar to ASN but from showroom instead of supplier
- Uses `source_type = 'TransferIn'` in Putaway Task

**Workflow:**

```
Transfer In Created → Submitted → In Transit → Received → Putaway → Completed
```

**Integration Points:**

1. **Inbound Session** - Receiving workflow (needs `transfer_in` field support)
2. **Putaway Task** - Auto-create with `source_type = 'TransferIn'`
3. **Stock Ledger** - Update on putaway completion

---

### Cycle Count Design

**Purpose:** Physical inventory counting and discrepancy management

**Count Types:**

1. **Full** - Entire warehouse (annual/quarterly)
2. **Cycle** - Specific zones (regular rotation)
3. **Spot** - Specific items/bins (quick verification)

**Workflow:**

```
Create Task → Generate Lines → Start Count → Count Items → Review → Approve → Adjust Stock → Complete
```

**Key Features:**

- Discrepancy calculation (actual - expected)
- Approval workflow for large discrepancies
- Stock freeze during count (optional)
- Automatic stock adjustments
- Count reporting

---

## 📋 Implementation Plan

### Phase 1: Transfer In Completion (Estimated: 2-3 weeks)

#### Week 1: API & Integration

**Tasks:**

1. ✅ Verify database schema (tables exist)
2. ⚠️ Enhance Transfer In API endpoints
   - Add `updateTransferInStatus` endpoint
   - Add `submitTransferIn` endpoint
   - Add `receiveTransferIn` endpoint
3. ⚠️ Integrate with Inbound Session
   - Add `transfer_in` field support in `tabInboundSession`
   - Update inbound controller to handle Transfer In
4. ⚠️ Integrate with Putaway Task
   - Verify `transfer_in` column exists in `tabPutawayTask`
   - Update Putaway Task creation logic
   - Auto-create Putaway Task when Transfer In received

**Files to Modify:**

- `wms-api/src/modules/transfer-in/transferInController.js`
- `wms-api/src/modules/inbound/inboundController.js`
- `wms-api/src/modules/putaway/putawayController.js`
- `wms-api/src/routes/transferInRoutes.js`

#### Week 2: Desktop App Enhancement

**Tasks:**

1. ⚠️ Enhance `TransferInDataService.cs`
   - Add create/edit methods
   - Add status update methods
   - Add submit method
2. ⚠️ Enhance `TransferInDetailViewModel.cs`
   - Add create/edit functionality
   - Add submit command
   - Add item management
3. ⚠️ Enhance `TransferInDetailWindow.xaml`
   - Add form fields
   - Add items DataGrid
   - Add action buttons
4. ⚠️ Add Excel import (optional)
   - Extend `ExcelImportService.cs`
   - Add template generation

**Files to Modify:**

- `Services/TransferInDataService.cs`
- `ViewModels/TransferInDetailViewModel.cs`
- `TransferInDetailWindow.xaml`
- `Services/ExcelImportService.cs` (optional)

#### Week 3: Mobile App & Testing

**Tasks:**

1. ⚠️ Mobile app receiving workflow
   - Transfer In list screen
   - Receiving screen (reuse ASN receiving with Transfer In support)
2. ✅ Testing
   - End-to-end workflow testing
   - Integration testing
   - Bug fixes

---

### Phase 2: Cycle Count Implementation (Estimated: 3-4 weeks)

#### Week 1: Desktop App Foundation

**Tasks:**

1. ❌ Create `CycleCountTaskDataService.cs`
   - Get all tasks
   - Get task by title
   - Create task
   - Generate lines from Stock Ledger
   - Update count lines
2. ❌ Create `CycleCountTaskListViewModel.cs`
   - List view model
   - Filter properties
   - Commands
3. ❌ Create `CycleCountTaskDetailViewModel.cs`
   - Detail view model
   - Action commands
4. ❌ Create `CycleCountTaskListView.xaml`
   - List view UI
5. ❌ Create `CycleCountTaskDetailWindow.xaml`
   - Detail window UI

**Files to Create:**

- `Services/CycleCountTaskDataService.cs`
- `ViewModels/CycleCountTaskListViewModel.cs`
- `ViewModels/CycleCountTaskDetailViewModel.cs`
- `Views/CycleCountTaskListView.xaml`
- `Views/CycleCountTaskListView.xaml.cs`
- `CycleCountTaskDetailWindow.xaml`
- `CycleCountTaskDetailWindow.xaml.cs`

#### Week 2: API Enhancement

**Tasks:**

1. ⚠️ Enhance `cycleCountController.js`
   - Add `generateCountLines` endpoint
   - Add `startCycleCount` endpoint
   - Add `updateCountLine` endpoint
   - Add `reviewDiscrepancies` endpoint
   - Add `approveDiscrepancies` endpoint
   - Add `createStockAdjustments` endpoint
   - Add `completeCycleCount` endpoint
2. ⚠️ Update `cycleCountRoutes.js`
   - Register new routes

**Files to Modify:**

- `wms-api/src/modules/cycle-count/cycleCountController.js`
- `wms-api/src/routes/cycleCountRoutes.js`

#### Week 3: Business Logic

**Tasks:**

1. ⚠️ Implement discrepancy calculation
2. ⚠️ Implement approval workflow
3. ⚠️ Implement stock adjustment logic
4. ⚠️ Implement stock freeze logic
5. ✅ Testing

**Files to Modify:**

- `wms-api/src/modules/cycle-count/cycleCountController.js`
- `Services/CycleCountTaskDataService.cs`

#### Week 4: Mobile App & Reporting

**Tasks:**

1. ❌ Mobile app counting interface
   - Cycle Count list screen
   - Cycle Count detail screen
   - Counting screen (core feature)
2. ⚠️ Reporting functionality
   - Count report generation
   - Discrepancy report
3. ✅ Testing and bug fixes

---

## 🔧 Technical Implementation Details

### Transfer In - Key Integration Points

#### 1. Inbound Session Integration

**Current State:** Inbound Session supports ASN via `asn_no`

**Required Change:**

```javascript
// In inboundController.js
// Check for transfer_in parameter
const { asn_no, transfer_in } = req.body;

// If transfer_in provided, use it instead of asn_no
const sourceDoc = transfer_in || asn_no;
const sourceType = transfer_in ? "TransferIn" : "ASN";
```

**Database:**

```sql
-- Add transfer_in column if not exists
ALTER TABLE tabInboundSession
ADD COLUMN IF NOT EXISTS transfer_in VARCHAR(100) NULL;
```

#### 2. Putaway Task Integration

**Current State:** Putaway Task supports ASN via `advance_shipping_notice` and `source_type = 'ASN'`

**Required Change:**

```javascript
// In putawayController.js
// When creating Putaway Task from Transfer In
if (source_type === 'TransferIn') {
  await connection.execute(`
    INSERT INTO tabPutawayTask
    (title, status, source_type, transfer_in, inbound_session, ...)
    VALUES (?, 'Draft', 'TransferIn', ?, ?, ...)
  `, [taskTitle, transferIn, inboundSession, ...]);
}
```

**Database:**

```sql
-- Add transfer_in column if not exists
ALTER TABLE tabPutawayTask
ADD COLUMN IF NOT EXISTS transfer_in VARCHAR(100) NULL;
```

---

### Cycle Count - Key Implementation Points

#### 1. Generate Count Lines from Stock Ledger

**Logic:**

```javascript
// Load items from tabStockLedger based on warehouse/zone
const [stockRows] = await connection.execute(
  `
  SELECT item_code, bin_location, qty
  FROM tabStockLedger
  WHERE warehouse = ? 
    AND (? IS NULL OR bin_location LIKE ?)
    AND qty > 0
`,
  [warehouse, zone, zone ? `${zone}%` : "%"]
);

// Create Cycle Count Line for each item/bin
for (const stock of stockRows) {
  await connection.execute(
    `
    INSERT INTO tabCycleCountLine 
    (parent_title, item_code, bin_location, expected_qty, status)
    VALUES (?, ?, ?, ?, 'Pending')
  `,
    [taskTitle, stock.item_code, stock.bin_location, stock.qty]
  );
}
```

#### 2. Discrepancy Calculation

**Logic:**

```javascript
// Discrepancy is calculated automatically in database
// discrepancy = actual_qty - expected_qty (STORED column)

// Check approval requirements
const thresholdPercent = 5.0; // 5%
const thresholdQty = 10.0; // 10 units

const discrepancyPercent = (Math.abs(discrepancy) / expected_qty) * 100;
const approvalRequired =
  Math.abs(discrepancy) > thresholdQty ||
  discrepancyPercent > thresholdPercent ||
  (discrepancy < 0 && requireApprovalForNegative);
```

#### 3. Stock Adjustment Creation

**Logic:**

```javascript
// For each line with discrepancy
for (const line of linesWithDiscrepancy) {
  if (line.discrepancy > 0) {
    // Material Receipt - Add stock
    await connection.execute(
      `
      UPDATE tabStockLedger 
      SET qty = qty + ?,
          qty_before = qty,
          qty_reduced = -?  -- Negative for addition
      WHERE item_code = ? AND bin_location = ?
    `,
      [line.discrepancy, line.discrepancy, line.item_code, line.bin_location]
    );
  } else if (line.discrepancy < 0) {
    // Material Issue - Reduce stock
    await connection.execute(
      `
      UPDATE tabStockLedger 
      SET qty = qty + ?,
          qty_before = qty,
          qty_reduced = ?
      WHERE item_code = ? AND bin_location = ?
    `,
      [
        line.discrepancy,
        Math.abs(line.discrepancy),
        line.item_code,
        line.bin_location,
      ]
    );
  }

  // Create Stock Transaction
  await connection.execute(
    `
    INSERT INTO tabStockTransaction 
    (item_code, warehouse, bin_location, operation_type, qty, reference_doc_type, reference_doc)
    VALUES (?, ?, ?, 'Cycle Count Adjustment', ?, 'Cycle Count Task', ?)
  `,
    [line.item_code, warehouse, line.bin_location, line.discrepancy, taskTitle]
  );
}
```

#### 4. Stock Freeze Logic

**Logic:**

```javascript
// Before allowing stock movement, check for active Cycle Count
const [activeCounts] = await connection.execute(
  `
  SELECT zone, freeze_stock
  FROM tabCycleCountTask
  WHERE warehouse = ?
    AND status IN ('In Progress', 'Counting')
    AND freeze_stock = TRUE
    AND (? IS NULL OR zone = ? OR zone IS NULL)
`,
  [warehouse, targetZone, targetZone]
);

if (activeCounts.length > 0) {
  throw new Error("Stock movements blocked: Active Cycle Count in this zone");
}
```

---

## 📊 Database Schema Verification

### Required Columns Check

**Transfer In:**

- ✅ `tabTransferIn` - Complete
- ✅ `tabTransferInItem` - Complete
- ⚠️ `tabInboundSession.transfer_in` - Check if exists
- ⚠️ `tabPutawayTask.transfer_in` - Check if exists
- ⚠️ `tabPutawayTask.source_type` - Verify exists

**Cycle Count:**

- ✅ `tabCycleCountTask` - Complete
- ✅ `tabCycleCountLine` - Complete
- ✅ `tabCycleCountSettings` - Complete

---

## 🎨 UI/UX Design Considerations

### Transfer In Desktop App

**List View:**

- Show: Title, From Showroom, To Warehouse, Transfer Date, Status, Total Qty
- Filter: Status, Showroom, Warehouse
- Actions: Create New, Open Detail

**Detail View:**

- Header: Transfer In info (editable if Draft)
- Items Grid: Item Code, Qty, Carton ID, Received Qty
- Actions: Save, Submit, Print
- Status indicator

### Cycle Count Desktop App

**List View:**

- Show: Title, Count Type, Warehouse, Zone, Count Date, Status, Progress
- Filter: Status, Warehouse, Zone, Count Type
- Actions: Create New, Open Detail

**Detail View:**

- Header: Task info
- Lines Grid: Item Code, Bin Location, Expected Qty, Actual Qty, Discrepancy, Status
- Actions: Generate Lines, Start Count, Review, Approve, Create Adjustments, Complete, Print Report
- Progress indicator: Counted Items / Total Items

---

## 🚀 Recommended Implementation Order

### Priority 1: Transfer In Completion (2-3 weeks)

**Why:** Core functionality exists, needs integration to be usable

1. Week 1: API integration (Inbound Session, Putaway Task)
2. Week 2: Desktop app enhancement
3. Week 3: Mobile app & testing

### Priority 2: Cycle Count Implementation (3-4 weeks)

**Why:** New feature, needs full implementation

1. Week 1: Desktop app foundation
2. Week 2: API enhancement
3. Week 3: Business logic (discrepancy, approval, adjustments)
4. Week 4: Mobile app & reporting

---

## ✅ Success Criteria

### Transfer In Module

- [ ] Transfer In can be created in desktop app
- [ ] Transfer In can be submitted
- [ ] Mobile app can receive Transfer In items
- [ ] Putaway Task auto-created with `source_type = 'TransferIn'`
- [ ] Stock updated correctly after putaway
- [ ] Complete workflow tested end-to-end

### Cycle Count Module

- [ ] Cycle Count Task can be created in desktop app
- [ ] Count lines can be generated from Stock Ledger
- [ ] Mobile app can count items
- [ ] Discrepancies calculated correctly
- [ ] Approval workflow works
- [ ] Stock adjustments created correctly
- [ ] Stock freeze works (if enabled)
- [ ] Complete workflow tested end-to-end

---

## 📝 Next Steps

1. **Review this design** with stakeholders
2. **Prioritize** - Transfer In first (faster completion) or Cycle Count (new feature)
3. **Create detailed task breakdown** for selected module
4. **Start implementation** with database migrations
5. **Test incrementally** - Don't wait until the end

---

---

## ⚠️ Important Note: Transfer In Items Without Carton ID

**Question:** What if Transfer In items don't come with Carton ID?

**Answer:** The system fully supports items without `carton_id`. The `carton_id` field is **NULLABLE** in the database.

**Two Receiving Scenarios:**

1. **With Carton ID:** Scan carton → Receive all items in carton
2. **Without Carton ID:** Scan item barcode → Enter quantity → Receive individual item

**See:** `TRANSFER_IN_NO_CARTON_ID_HANDLING.md` for complete implementation guide including:

- Database schema (already supports NULL)
- Mobile app receiving workflow (two scenarios)
- API endpoint updates needed
- Putaway integration (handles both types)
- Validation rules
- Test scenarios

---

**Document Version:** 1.0  
**Created:** 2026-01-05  
**Updated:** 2026-01-05 (Added Carton ID handling)  
**Status:** Ready for Implementation
