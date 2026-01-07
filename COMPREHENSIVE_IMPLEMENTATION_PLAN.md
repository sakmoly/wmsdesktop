# Comprehensive Implementation Plan
## Supplier-to-Warehouse, Showroom-to-Warehouse, and Physical Count

---

## 📋 Overview

This document outlines the complete implementation plan for:
1. **Supplier-to-Warehouse → Putaway** (Current: ASN-based)
2. **Showroom-to-Warehouse → Putaway** (New: Transfer In-based)
3. **Physical Count / Cycle Count** (Analysis and Implementation)

---

## 🔄 Part 1: Putaway Flows Analysis

### Current Flow: Supplier-to-Warehouse → Putaway

```
Supplier → ASN → Inbound Session → Receiving Transaction → Putaway Task → Putaway Transaction
```

**Database Tables:**
- `tabAdvanceShippingNotice` (ASN)
- `tabAsnItemDetails` (ASN items)
- `tabInboundSession` (receiving session)
- `tabPutawayTask` (putaway task, references ASN)
- `tabPutawayLine` (putaway items)
- `tabWmsTransaction` (receiving & putaway transactions)

**Key Fields:**
- `tabPutawayTask.advance_shipping_notice` → Links to ASN
- `tabInboundSession.asn_no` → Links to ASN
- `tabWmsTransaction.reference_doc_type = 'Advance Shipping Notice'`

### New Flow: Showroom-to-Warehouse → Putaway

```
Showroom → Transfer In → Inbound Session → Receiving Transaction → Putaway Task → Putaway Transaction
```

**Required Changes:**
- Add `tabTransferIn` and `tabTransferInItem` tables
- Extend `tabPutawayTask` with `source_type` and `transfer_in` columns
- Extend `tabInboundSession` with `transfer_in` column
- Update services to handle both ASN and Transfer In

---

## 🔍 Part 2: Physical Count / Cycle Count Analysis

### Current State

**Existing Infrastructure:**
- ✅ `OperationType.CycleCount` enum exists
- ✅ `tabWmsTransaction.cycle_count_zone` field exists
- ✅ `tabWmsTransaction.freeze_stock_during_count` field exists
- ✅ `WmsTransactionItemDetail.ActualQtyCounted` field exists (inferred from code)
- ✅ `WmsTransactionItemDetail.Discrepancy` field exists (inferred from code)

**What's Missing:**
- ❌ Cycle Count Task table (like Putaway Task)
- ❌ Cycle Count creation service
- ❌ Physical count workflow UI
- ❌ Discrepancy handling and approval
- ❌ Stock adjustment creation from discrepancies

### Physical Count Requirements

#### 1. **Cycle Count Types**

**A. Full Physical Count**
- Count entire warehouse
- Usually done annually or quarterly
- Freezes all stock movements during count

**B. Cycle Count (Partial)**
- Count specific zones/areas
- Done regularly (daily, weekly, monthly)
- Rotates through different zones
- Doesn't freeze entire warehouse

**C. Spot Count**
- Count specific items/bins
- Usually for discrepancies or audits
- Quick verification

#### 2. **Cycle Count Workflow**

```
1. Create Cycle Count Task
   ├── Select Zone/Area (or Full Warehouse)
   ├── Select Items/Bins to count
   ├── Set count date
   └── Assign operators

2. Freeze Stock (Optional)
   ├── If freeze_stock_during_count = TRUE
   ├── Block all movements in count zone
   └── Allow only count transactions

3. Create Cycle Count Transaction
   ├── Auto-create from Cycle Count Task
   ├── Load expected quantities from ERPNext/Stock Ledger
   └── Assign items to operators

4. Operators Count Items
   ├── Scan bin/item
   ├── Enter actual quantity
   ├── System calculates discrepancy
   └── Mark item as counted

5. Review Discrepancies
   ├── Show items with discrepancies
   ├── Require approval for large discrepancies
   └── Add notes/reasons

6. Create Stock Adjustments
   ├── If discrepancy > 0: Material Receipt
   ├── If discrepancy < 0: Material Issue
   └── Send to ERPNext as Stock Entry

7. Complete Cycle Count
   ├── Update stock ledger
   ├── Unfreeze stock (if frozen)
   └── Generate count report
```

#### 3. **Database Schema for Cycle Count**

```sql
-- Cycle Count Task (Parent)
CREATE TABLE IF NOT EXISTS tabCycleCountTask (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft', -- Draft, In Progress, Counting, Review, Completed, Cancelled
  count_type VARCHAR(50) NOT NULL, -- 'Full', 'Cycle', 'Spot'
  warehouse VARCHAR(100) NOT NULL,
  zone VARCHAR(100) NULL, -- NULL for Full count
  count_date DATE NOT NULL,
  scheduled_start_time TIME NULL,
  scheduled_end_time TIME NULL,
  freeze_stock BOOLEAN DEFAULT FALSE,
  created_by VARCHAR(100) NOT NULL,
  assigned_to VARCHAR(100) NULL,
  total_items INT DEFAULT 0,
  counted_items INT DEFAULT 0,
  items_with_discrepancy INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_count_type (count_type),
  INDEX idx_warehouse (warehouse),
  INDEX idx_zone (zone),
  INDEX idx_count_date (count_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cycle Count Line (Child Table)
CREATE TABLE IF NOT EXISTS tabCycleCountLine (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NULL, -- NULL if counting by item only
  expected_qty DECIMAL(10,2) NOT NULL, -- From ERPNext/Stock Ledger
  actual_qty DECIMAL(10,2) NULL, -- Entered by operator
  discrepancy DECIMAL(10,2) AS (COALESCE(actual_qty, 0) - expected_qty) STORED,
  counted_by VARCHAR(100) NULL,
  counted_on TIMESTAMP NULL,
  reviewed_by VARCHAR(100) NULL,
  reviewed_on TIMESTAMP NULL,
  approval_required BOOLEAN DEFAULT FALSE, -- TRUE if discrepancy exceeds threshold
  approved_by VARCHAR(100) NULL,
  approved_on TIMESTAMP NULL,
  discrepancy_reason TEXT NULL,
  status VARCHAR(50) DEFAULT 'Pending', -- Pending, Counting, Counted, Reviewed, Approved, Adjusted
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_item_code (item_code),
  INDEX idx_bin_location (bin_location),
  INDEX idx_status (status),
  INDEX idx_discrepancy (discrepancy),
  FOREIGN KEY (parent_title) REFERENCES tabCycleCountTask(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cycle Count Settings (Configuration)
CREATE TABLE IF NOT EXISTS tabCycleCountSettings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  warehouse VARCHAR(100) NOT NULL,
  zone VARCHAR(100) NULL, -- NULL for warehouse-wide settings
  count_frequency VARCHAR(50) DEFAULT 'Monthly', -- Daily, Weekly, Monthly, Quarterly, Annually
  discrepancy_threshold_percent DECIMAL(5,2) DEFAULT 5.00, -- Require approval if > 5%
  discrepancy_threshold_qty DECIMAL(10,2) DEFAULT 10.00, -- Require approval if > 10 units
  auto_adjust_small_discrepancies BOOLEAN DEFAULT FALSE, -- Auto-adjust if below threshold
  freeze_stock_during_count BOOLEAN DEFAULT TRUE,
  require_approval_for_negative BOOLEAN DEFAULT TRUE, -- Always require approval for stock loss
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_warehouse_zone (warehouse, zone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 4. **WMS Transaction Integration**

**Cycle Count Transaction:**
- `operation_type = 'CycleCount'`
- `reference_doc_type = 'Cycle Count Task'`
- `reference_doc = Cycle Count Task title`
- `cycle_count_zone = Zone being counted`
- `freeze_stock_during_count = TRUE/FALSE`

**Transaction Details:**
- `qty = Expected quantity` (from stock ledger)
- `actual_qty_counted = Actual quantity` (entered by operator)
- `discrepancy = actual_qty_counted - qty`
- `source_bin = Bin location being counted`
- `target_bin = Same as source_bin` (no movement, just count)

---

## 🗄️ Part 3: Complete Database Schema

### 3.1 Transfer In Tables (Showroom-to-Warehouse)

```sql
-- Transfer In (from Showroom to Warehouse)
CREATE TABLE IF NOT EXISTS tabTransferIn (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft', -- Draft, Submitted, In Transit, Received, Completed
  from_showroom VARCHAR(100) NOT NULL,
  to_warehouse VARCHAR(100) NOT NULL,
  transfer_date DATE NOT NULL,
  expected_arrival_date DATE NULL,
  prepared_by VARCHAR(100) NOT NULL,
  received_by VARCHAR(100) NULL,
  received_on TIMESTAMP NULL,
  total_qty DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_from_showroom (from_showroom),
  INDEX idx_to_warehouse (to_warehouse),
  INDEX idx_status (status),
  INDEX idx_transfer_date (transfer_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transfer In Item (Child Table)
CREATE TABLE IF NOT EXISTS tabTransferInItem (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  qty DECIMAL(10,2) NOT NULL,
  carton_id VARCHAR(100) NULL,
  received_qty DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_item_code (item_code),
  FOREIGN KEY (parent_title) REFERENCES tabTransferIn(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.2 Extend Putaway Task Table

```sql
-- Add columns to tabPutawayTask
ALTER TABLE tabPutawayTask 
ADD COLUMN source_type VARCHAR(50) DEFAULT 'ASN' AFTER status,
ADD COLUMN transfer_in VARCHAR(100) NULL AFTER advance_shipping_notice,
ADD INDEX idx_source_type (source_type),
ADD INDEX idx_transfer_in (transfer_in);

-- Update existing records
UPDATE tabPutawayTask SET source_type = 'ASN' WHERE source_type IS NULL;
```

### 3.3 Extend Inbound Session Table

```sql
-- Add transfer_in column to tabInboundSession
ALTER TABLE tabInboundSession 
ADD COLUMN transfer_in VARCHAR(100) NULL AFTER transfer_order,
ADD INDEX idx_transfer_in (transfer_in);
```

### 3.4 Cycle Count Tables (See Section 2.3 above)

---

## 💻 Part 4: Code Implementation Plan

### 4.1 Models

#### A. Transfer In Model

```csharp
// Models/TransferIn.cs
public sealed class TransferIn
{
    public string Title { get; init; } = string.Empty;
    public string Status { get; init; } = "Draft";
    public string FromShowroom { get; init; } = string.Empty;
    public string ToWarehouse { get; init; } = string.Empty;
    public DateTime TransferDate { get; init; }
    public DateTime? ExpectedArrivalDate { get; init; }
    public string PreparedBy { get; init; } = string.Empty;
    public string? ReceivedBy { get; init; }
    public DateTime? ReceivedOn { get; init; }
    public double TotalQty { get; init; }
    
    public IReadOnlyList<TransferInItem> Items { get; init; } = Array.Empty<TransferInItem>();
}

public sealed class TransferInItem
{
    public string ItemCode { get; init; } = string.Empty;
    public double Qty { get; init; }
    public string? CartonId { get; init; }
    public double ReceivedQty { get; init; }
}
```

#### B. Cycle Count Task Model

```csharp
// Models/CycleCountTask.cs
public sealed class CycleCountTask
{
    public string Title { get; init; } = string.Empty;
    public string Status { get; init; } = "Draft";
    public string CountType { get; init; } = "Cycle"; // Full, Cycle, Spot
    public string Warehouse { get; init; } = string.Empty;
    public string? Zone { get; init; }
    public DateTime CountDate { get; init; }
    public TimeSpan? ScheduledStartTime { get; init; }
    public TimeSpan? ScheduledEndTime { get; init; }
    public bool FreezeStock { get; init; }
    public string CreatedBy { get; init; } = string.Empty;
    public string? AssignedTo { get; init; }
    public int TotalItems { get; init; }
    public int CountedItems { get; init; }
    public int ItemsWithDiscrepancy { get; init; }
    
    public IReadOnlyList<CycleCountLine> Lines { get; init; } = Array.Empty<CycleCountLine>();
}

public sealed class CycleCountLine
{
    public string ItemCode { get; init; } = string.Empty;
    public string? BinLocation { get; init; }
    public double ExpectedQty { get; init; }
    public double? ActualQty { get; init; }
    public double Discrepancy => (ActualQty ?? 0) - ExpectedQty;
    public string? CountedBy { get; init; }
    public DateTime? CountedOn { get; init; }
    public string? ReviewedBy { get; init; }
    public DateTime? ReviewedOn { get; init; }
    public bool ApprovalRequired { get; init; }
    public string? ApprovedBy { get; init; }
    public DateTime? ApprovedOn { get; init; }
    public string? DiscrepancyReason { get; init; }
    public string Status { get; init; } = "Pending";
}
```

#### C. Extend Putaway Task Model

```csharp
// Models/PutawayTask.cs (Extended)
public sealed class PutawayTask
{
    public string Title { get; init; } = string.Empty;
    public string Status { get; init; } = "Draft";
    public string SourceType { get; init; } = "ASN"; // "ASN" or "TransferIn"
    
    // For ASN-based putaway
    public string? AdvanceShippingNotice { get; init; }
    
    // For Transfer In-based putaway
    public string? TransferIn { get; init; }
    
    public string InboundSession { get; init; } = string.Empty;
    public string CreatedBy { get; init; } = string.Empty;

    public IReadOnlyList<PutawayLine> Lines { get; init; } = Array.Empty<PutawayLine>();
}
```

### 4.2 Services

#### A. Transfer In Service

```csharp
// Services/TransferInDataService.cs
public static class TransferInDataService
{
    public static async Task<List<TransferIn>> GetTransferInsAsync(WmsSettings settings)
    {
        // Query tabTransferIn and tabTransferInItem
    }
    
    public static async Task<bool> CreateInboundSessionFromTransferInAsync(
        WmsSettings settings,
        string transferInTitle,
        string dock,
        string startedBy)
    {
        // Create inbound session for Transfer In
        // Similar to ASN inbound session creation
    }
}
```

#### B. Cycle Count Service

```csharp
// Services/CycleCountDataService.cs
public static class CycleCountDataService
{
    public static async Task<List<CycleCountTask>> GetCycleCountTasksAsync(WmsSettings settings)
    {
        // Query tabCycleCountTask and tabCycleCountLine
    }
    
    public static async Task<bool> CreateCycleCountTaskAsync(
        WmsSettings settings,
        string warehouse,
        string? zone,
        string countType,
        DateTime countDate,
        string createdBy)
    {
        // 1. Get items/bins to count from stock ledger
        // 2. Create Cycle Count Task
        // 3. Create Cycle Count Lines with expected quantities
    }
    
    public static async Task<bool> CreateCycleCountTransactionAsync(
        WmsSettings settings,
        string cycleCountTaskTitle)
    {
        // Auto-create WMS Transaction for Cycle Count
        // Load expected quantities
        // Set freeze_stock_during_count
    }
    
    public static async Task<bool> UpdateCountedQuantityAsync(
        WmsSettings settings,
        string cycleCountTaskTitle,
        string itemCode,
        string? binLocation,
        double actualQty,
        string countedBy)
    {
        // Update actual_qty in tabCycleCountLine
        // Calculate discrepancy
        // Check if approval required
    }
    
    public static async Task<bool> ApproveDiscrepancyAsync(
        WmsSettings settings,
        string cycleCountTaskTitle,
        string itemCode,
        string? binLocation,
        string approvedBy,
        string? reason)
    {
        // Mark discrepancy as approved
        // Create stock adjustment if needed
    }
    
    public static async Task<bool> CreateStockAdjustmentsAsync(
        WmsSettings settings,
        string cycleCountTaskTitle)
    {
        // For each line with discrepancy:
        // - If discrepancy > 0: Create Material Receipt
        // - If discrepancy < 0: Create Material Issue
        // Send to ERPNext
    }
}
```

#### C. Extend Putaway Task Service

```csharp
// Services/PutawayTaskDataService.cs (Extended)
public static async Task<bool> CreatePutawayTaskFromTransferInAsync(
    WmsSettings settings,
    string transferInTitle,
    string inboundSessionTitle,
    string createdBy)
{
    // Create putaway task for Transfer In
    // Set source_type = 'TransferIn'
    // Set transfer_in = transferInTitle
}
```

#### D. Extend WMS Transaction Auto-Create Service

```csharp
// Services/WmsTransactionAutoCreateService.cs (Extended)
public static async Task<bool> CreateReceivingTransactionFromTransferInAsync(
    WmsSettings settings,
    string inboundSessionTitle,
    string transferInTitle,
    string? dock,
    string startedBy)
{
    // Similar to CreateReceivingTransactionFromSessionAsync
    // But reference Transfer In instead of ASN
    // Set reference_doc_type = "Transfer In"
}

public static async Task<bool> CreateCycleCountTransactionFromTaskAsync(
    WmsSettings settings,
    string cycleCountTaskTitle)
{
    // Create Cycle Count transaction
    // Load expected quantities from stock ledger
    // Set cycle_count_zone
    // Set freeze_stock_during_count
}
```

### 4.3 UI Components

#### A. Transfer In List View
- Similar to ASN List View
- Show Transfer Ins from showrooms
- Create Inbound Session button

#### B. Cycle Count Task List View
- Show Cycle Count Tasks
- Filter by status, warehouse, zone
- Create Cycle Count Transaction button

#### C. Cycle Count Detail Window
- Show task details
- Show count lines with expected/actual/discrepancy
- Allow entering actual quantities
- Show approval workflow
- Generate stock adjustments

#### D. Update Putaway Task List View
- Add "Source Type" column
- Add "Source Document" column (ASN or Transfer In)

---

## 📊 Part 5: Workflow Diagrams

### 5.1 Supplier-to-Warehouse → Putaway

```
┌─────────┐
│ Supplier│
└────┬────┘
     │ Creates
     ▼
┌─────────┐
│   ASN   │
└────┬────┘
     │ Receives
     ▼
┌─────────────────┐
│ Inbound Session │ (asn_no = ASN-0001)
└────┬────────────┘
     │ Auto-creates
     ▼
┌──────────────────────┐
│ Receiving Transaction│ (reference_doc = ASN-0001)
└────┬─────────────────┘
     │ Creates
     ▼
┌─────────────────┐
│ Putaway Task    │ (source_type = 'ASN', advance_shipping_notice = ASN-0001)
└────┬────────────┘
     │ Auto-creates
     ▼
┌──────────────────────┐
│ Putaway Transaction  │ (reference_doc = PUT-0001)
└──────────────────────┘
```

### 5.2 Showroom-to-Warehouse → Putaway

```
┌──────────┐
│Showroom  │
└────┬─────┘
     │ Creates
     ▼
┌─────────────┐
│ Transfer In │
└────┬────────┘
     │ Receives
     ▼
┌─────────────────┐
│ Inbound Session │ (transfer_in = TI-0001)
└────┬────────────┘
     │ Auto-creates
     ▼
┌──────────────────────┐
│ Receiving Transaction│ (reference_doc = TI-0001, reference_doc_type = 'Transfer In')
└────┬─────────────────┘
     │ Creates
     ▼
┌─────────────────┐
│ Putaway Task    │ (source_type = 'TransferIn', transfer_in = TI-0001)
└────┬────────────┘
     │ Auto-creates
     ▼
┌──────────────────────┐
│ Putaway Transaction  │ (reference_doc = PUT-0006)
└──────────────────────┘
```

### 5.3 Physical Count / Cycle Count

```
┌──────────────────┐
│ Cycle Count Task │ (count_type = 'Cycle', zone = 'ZONE-A')
└────┬─────────────┘
     │ Auto-creates
     ▼
┌──────────────────────┐
│ Cycle Count          │ (operation_type = 'CycleCount')
│ Transaction          │ (freeze_stock_during_count = TRUE)
└────┬─────────────────┘
     │ Operators count
     ▼
┌──────────────────────┐
│ Update Actual Qty    │ (actual_qty_counted entered)
│ Calculate Discrepancy│ (discrepancy = actual - expected)
└────┬─────────────────┘
     │ Review
     ▼
┌──────────────────────┐
│ Approve Discrepancies│ (if > threshold)
└────┬─────────────────┘
     │ Create adjustments
     ▼
┌──────────────────────┐
│ Stock Adjustments    │ (Material Receipt/Issue to ERPNext)
└──────────────────────┘
```

---

## ✅ Part 6: Implementation Checklist

### Phase 1: Database Schema (Priority: High)

- [ ] Create `tabTransferIn` and `tabTransferInItem` tables
- [ ] Add `source_type` and `transfer_in` columns to `tabPutawayTask`
- [ ] Add `transfer_in` column to `tabInboundSession`
- [ ] Create `tabCycleCountTask` and `tabCycleCountLine` tables
- [ ] Create `tabCycleCountSettings` table
- [ ] Update existing records with default values

### Phase 2: Models and Services (Priority: High)

- [ ] Create `TransferIn` and `TransferInItem` models
- [ ] Create `CycleCountTask` and `CycleCountLine` models
- [ ] Extend `PutawayTask` model with `SourceType` and `TransferIn`
- [ ] Create `TransferInDataService`
- [ ] Create `CycleCountDataService`
- [ ] Extend `PutawayTaskDataService` for Transfer In
- [ ] Extend `WmsTransactionAutoCreateService` for Transfer In and Cycle Count

### Phase 3: UI Components (Priority: Medium)

- [ ] Create Transfer In List View
- [ ] Create Transfer In Detail Window
- [ ] Create Cycle Count Task List View
- [ ] Create Cycle Count Detail Window
- [ ] Update Putaway Task List View (add Source Type column)
- [ ] Update WMS Transaction List View (filter by reference_doc_type)

### Phase 4: Integration (Priority: Medium)

- [ ] Integrate Transfer In with Inbound Session creation
- [ ] Integrate Transfer In with Putaway Task creation
- [ ] Integrate Cycle Count with WMS Transaction creation
- [ ] Integrate Cycle Count with Stock Adjustment creation
- [ ] ERPNext sync for Transfer In
- [ ] ERPNext sync for Cycle Count adjustments

### Phase 5: Testing (Priority: High)

- [ ] Test Supplier-to-Warehouse → Putaway flow
- [ ] Test Showroom-to-Warehouse → Putaway flow
- [ ] Test Cycle Count creation and counting
- [ ] Test discrepancy approval workflow
- [ ] Test stock adjustment creation
- [ ] Test ERPNext integration

---

## 🎯 Part 7: Decision Points

### Decision 1: Putaway Task Source Type

**Option A:** Single table with `source_type` column (Recommended)
- ✅ One table, flexible
- ✅ Easy to query
- ✅ Backward compatible

**Option B:** Separate tables for ASN and Transfer In putaway
- ❌ More complex
- ❌ Duplicate code

**Decision: Option A** ✅

### Decision 2: Cycle Count Freeze Stock

**Option A:** Freeze entire warehouse during count
- ✅ Prevents all movements
- ❌ Disrupts operations

**Option B:** Freeze only count zone
- ✅ Minimal disruption
- ✅ Allows other zones to operate
- ⚠️ Need zone-based locking

**Decision: Option B** ✅ (with zone-based locking)

### Decision 3: Discrepancy Approval Threshold

**Option A:** Fixed threshold (e.g., 5% or 10 units)
- ✅ Simple
- ✅ Consistent

**Option B:** Configurable per warehouse/zone
- ✅ Flexible
- ✅ Different rules per area

**Decision: Option B** ✅ (stored in `tabCycleCountSettings`)

### Decision 4: Auto-Adjust Small Discrepancies

**Option A:** Always require approval
- ✅ Full control
- ❌ More manual work

**Option B:** Auto-adjust below threshold
- ✅ Faster for small discrepancies
- ⚠️ Need audit trail

**Decision: Option B** ✅ (with audit trail and configurable threshold)

---

## 📝 Part 8: Next Steps

1. **Review this document** with stakeholders
2. **Approve database schema changes**
3. **Prioritize implementation phases**
4. **Assign development tasks**
5. **Create detailed technical specifications** for each phase
6. **Begin Phase 1 implementation** (Database Schema)

---

## 📚 Related Documents

- `SHOWROOM_TRANSFER_AND_MATERIAL_REQUEST.md` - Initial showroom transfer analysis
- `WMS_TRANSACTION_TO_ERPNext_STOCK_ENTRY.md` - ERPNext integration guide
- `WMS_CONCEPTS_CLARIFICATION.md` - WMS concepts explanation

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-27  
**Status:** Ready for Review

