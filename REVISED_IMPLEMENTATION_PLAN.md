# Revised Comprehensive Implementation Plan
## Supplier-to-Warehouse Routing, Showroom-to-Warehouse, Physical Count, and Real-Time Stock Tracking

---

## 📋 Clarified Requirements

### 1. Supplier-to-Warehouse → Showroom OR Putaway
**Decision Logic:**
- **IF Transfer Order exists** → Items go to **Sorting → Transfer Cartons → Showroom** (NO Putaway)
- **IF NO Transfer Order OR Remaining qty after sorting** → Items go to **Putaway** (Storage)

### 2. Showroom-to-Warehouse → Putaway
- Transfer In from Showroom → Receiving → Putaway (Storage)

### 3. Physical Count / Cycle Count
- Full warehouse, cycle count (zone-based), spot count
- Discrepancy handling and stock adjustments

### 4. Real-Time Stock Tracking ⚠️ **CRITICAL NEW REQUIREMENT**
- Update stock quantity (+/-) after each transaction
- Show real-time stock in UI
- Track stock by: Item + Warehouse + Bin Location

---

## 🔄 Part 1: Supplier-to-Warehouse Routing Logic

### Current Flow Analysis

**After Receiving:**
1. Items are received via ASN
2. Receiving Transaction created
3. **Decision Point:** Check if Transfer Order exists for this ASN

### New Routing Logic

```
ASN Received
    ↓
Check: Does Transfer Order exist for this ASN?
    ├── YES → Route to Sorting
    │   ├── Create Sort Boxes
    │   ├── Sort items to boxes (SORT_TO_BOX events)
    │   ├── Pack boxes to Transfer Cartons (PACK_BOX_TO_TC events)
    │   └── Dispatch to Showroom (NO Putaway needed)
    │
    └── NO → Route to Putaway
        ├── Create Putaway Task
        └── Put items in storage bins

OR

ASN Received with Transfer Order
    ↓
Sort items to Transfer Cartons (for Transfer Order)
    ↓
Check: Are there remaining items not allocated to Transfer Order?
    ├── YES → Route remaining items to Putaway
    └── NO → All items sorted, no Putaway needed
```

### Implementation Logic

```csharp
// Services/ReceivingRoutingService.cs (New Service)
public static class ReceivingRoutingService
{
    public static async Task<bool> RouteReceivedItemsAsync(
        WmsSettings settings,
        string asnNo,
        string inboundSessionTitle)
    {
        // 1. Check if Transfer Order exists for this ASN
        var transferOrder = await TransferOrderDataService.GetTransferOrderByAsnAsync(settings, asnNo);
        
        if (transferOrder != null)
        {
            // Route to Sorting (Transfer Order exists)
            // Items will be sorted to boxes and packed to transfer cartons
            // NO Putaway Task needed for these items
            return true;
        }
        else
        {
            // Route to Putaway (No Transfer Order)
            // Create Putaway Task for all received items
            await PutawayTaskDataService.CreatePutawayTaskFromAsnAsync(
                settings, asnNo, inboundSessionTitle);
            return true;
        }
    }
    
    public static async Task<bool> RouteRemainingItemsToPutawayAsync(
        WmsSettings settings,
        string asnNo)
    {
        // After sorting is complete, check for remaining items
        // Calculate: ASN Total Qty - Sorted Qty (from SORT_TO_BOX events)
        // If remaining > 0, create Putaway Task for remaining items
        
        var asnTotalQty = await GetAsnTotalQtyAsync(settings, asnNo);
        var sortedQty = await GetSortedQtyFromEventsAsync(settings, asnNo);
        var remainingQty = asnTotalQty - sortedQty;
        
        if (remainingQty > 0)
        {
            // Create Putaway Task for remaining items
            await PutawayTaskDataService.CreatePutawayTaskForRemainingItemsAsync(
                settings, asnNo, remainingQty);
        }
        
        return true;
    }
}
```

### Database Changes

**No new tables needed** - Use existing logic:
- Check `tabTransferOrder.advance_shipping_notice = ASN` to see if TO exists
- Calculate sorted qty from `tabWmsScanEvent` (SORT_TO_BOX events)
- Create Putaway Task only if needed

---

## 🔄 Part 2: Showroom-to-Warehouse → Putaway

### Flow

```
Showroom → Transfer In → Inbound Session → Receiving Transaction → Putaway Task → Putaway Transaction
```

**Key Points:**
- Transfer In always goes to Putaway (no sorting/transfer cartons)
- Same workflow as ASN putaway, but `source_type = 'TransferIn'`

**Implementation:** Same as previous plan (see `COMPREHENSIVE_IMPLEMENTATION_PLAN.md`)

---

## 🔍 Part 3: Physical Count / Cycle Count

### Implementation

**Same as previous plan** (see `COMPREHENSIVE_IMPLEMENTATION_PLAN.md` Part 2)

**Key Components:**
- `tabCycleCountTask` + `tabCycleCountLine` tables
- Cycle Count Transaction (uses existing `OperationType.CycleCount`)
- Discrepancy approval workflow
- Stock adjustments (Material Receipt/Issue)

---

## ⚠️ Part 4: Real-Time Stock Tracking (CRITICAL NEW REQUIREMENT)

### Current State Analysis

**Existing:**
- `tabItem.stock_qty` - Item-level stock (not bin-specific)
- `tabItem.reserved_qty` - Reserved quantity
- **Problem:** These are likely not updated in real-time after transactions

**Missing:**
- Bin-level stock tracking (Item + Warehouse + Bin)
- Stock ledger/transaction log
- Real-time stock updates after each transaction

### Required Solution

#### 4.1 Stock Ledger Table

```sql
-- Stock Ledger (Real-time stock tracking by Item + Warehouse + Bin)
CREATE TABLE IF NOT EXISTS tabStockLedger (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  item_code VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NULL, -- NULL for warehouse-level stock
  qty DECIMAL(10,2) NOT NULL DEFAULT 0,
  reserved_qty DECIMAL(10,2) DEFAULT 0,
  available_qty DECIMAL(10,2) AS (qty - reserved_qty) STORED,
  last_transaction_date TIMESTAMP NULL,
  last_transaction_type VARCHAR(50) NULL, -- 'Receiving', 'Putaway', 'Picking', 'CycleCount', etc.
  last_transaction_ref VARCHAR(100) NULL, -- Reference document
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_item_warehouse_bin (item_code, warehouse, bin_location),
  INDEX idx_item_code (item_code),
  INDEX idx_warehouse (warehouse),
  INDEX idx_bin_location (bin_location),
  INDEX idx_last_transaction_date (last_transaction_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stock Transaction Log (Audit trail of all stock movements)
CREATE TABLE IF NOT EXISTS tabStockTransaction (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transaction_date TIMESTAMP NOT NULL,
  transaction_type VARCHAR(50) NOT NULL, -- 'Receiving', 'Putaway', 'Picking', 'CycleCount', 'TransferIn', 'MaterialRequest'
  reference_doc_type VARCHAR(100) NULL, -- 'Advance Shipping Notice', 'Transfer In', 'Transfer Order', etc.
  reference_doc VARCHAR(100) NULL,
  wms_transaction_title VARCHAR(100) NULL, -- Link to tabWmsTransaction
  item_code VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NULL,
  qty_change DECIMAL(10,2) NOT NULL, -- Positive for increase, negative for decrease
  qty_before DECIMAL(10,2) NOT NULL,
  qty_after DECIMAL(10,2) NOT NULL,
  source_bin VARCHAR(100) NULL, -- For transfers
  target_bin VARCHAR(100) NULL, -- For transfers
  performed_by VARCHAR(100) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_transaction_date (transaction_date),
  INDEX idx_transaction_type (transaction_type),
  INDEX idx_reference_doc (reference_doc),
  INDEX idx_wms_transaction (wms_transaction_title),
  INDEX idx_item_code (item_code),
  INDEX idx_warehouse (warehouse)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 4.2 Stock Update Logic

**When to Update Stock:**

| Transaction | Stock Change | Bin Change |
|-------------|-------------|------------|
| **Receiving Completed** | +qty (warehouse level) | DOCK-01 → NULL (not in bin yet) |
| **Putaway Completed** | No change (already in warehouse) | DOCK-01 → RACK-A-01-BIN-05 |
| **Picking Completed** | -qty (if dispatched) OR move to staging | RACK-A-01-BIN-05 → STAGE-STORE-001 |
| **Cycle Count Adjustment** | +/-qty (based on discrepancy) | Same bin (no movement) |
| **Transfer In Completed** | +qty (warehouse level) | DOCK-01 → NULL |
| **Material Request Completed** | -qty (if dispatched) | RACK-A-01-BIN-05 → NULL |

#### 4.3 Stock Update Service

```csharp
// Services/StockLedgerService.cs (New Service)
public static class StockLedgerService
{
    /// <summary>
    /// Update stock after Receiving Transaction completed
    /// </summary>
    public static async Task<bool> UpdateStockAfterReceivingAsync(
        WmsSettings settings,
        string wmsTransactionTitle,
        string warehouse)
    {
        // Get all completed items from Receiving Transaction
        var items = await GetCompletedTransactionItemsAsync(settings, wmsTransactionTitle);
        
        foreach (var item in items)
        {
            // Update stock ledger (warehouse level, no bin yet)
            await UpdateStockAsync(
                settings,
                item.ItemCode,
                warehouse,
                binLocation: null, // Not in bin yet
                qtyChange: item.Qty, // Positive (increase)
                transactionType: "Receiving",
                referenceDoc: wmsTransactionTitle,
                sourceBin: item.SourceBin, // DOCK-01
                targetBin: null
            );
        }
        
        return true;
    }
    
    /// <summary>
    /// Update stock after Putaway Transaction completed
    /// </summary>
    public static async Task<bool> UpdateStockAfterPutawayAsync(
        WmsSettings settings,
        string wmsTransactionTitle,
        string warehouse)
    {
        // Get all completed items from Putaway Transaction
        var items = await GetCompletedTransactionItemsAsync(settings, wmsTransactionTitle);
        
        foreach (var item in items)
        {
            // Move stock from source bin to target bin
            // Decrease from source bin (DOCK-01)
            await UpdateStockAsync(
                settings,
                item.ItemCode,
                warehouse,
                binLocation: item.SourceBin, // DOCK-01
                qtyChange: -item.Qty, // Negative (decrease)
                transactionType: "Putaway",
                referenceDoc: wmsTransactionTitle,
                sourceBin: item.SourceBin,
                targetBin: item.TargetBin
            );
            
            // Increase in target bin (RACK-A-01-BIN-05)
            await UpdateStockAsync(
                settings,
                item.ItemCode,
                warehouse,
                binLocation: item.TargetBin, // RACK-A-01-BIN-05
                qtyChange: item.Qty, // Positive (increase)
                transactionType: "Putaway",
                referenceDoc: wmsTransactionTitle,
                sourceBin: item.SourceBin,
                targetBin: item.TargetBin
            );
        }
        
        return true;
    }
    
    /// <summary>
    /// Update stock after Picking Transaction completed
    /// </summary>
    public static async Task<bool> UpdateStockAfterPickingAsync(
        WmsSettings settings,
        string wmsTransactionTitle,
        string warehouse)
    {
        // Get all completed items from Picking Transaction
        var items = await GetCompletedTransactionItemsAsync(settings, wmsTransactionTitle);
        
        foreach (var item in items)
        {
            // Decrease stock from source bin (if dispatched)
            // OR move to staging bin (if staged)
            if (item.TargetBin != null && item.TargetBin.StartsWith("STAGE-"))
            {
                // Move to staging (no net change, just bin movement)
                await UpdateStockAsync(
                    settings,
                    item.ItemCode,
                    warehouse,
                    binLocation: item.SourceBin,
                    qtyChange: -item.Qty,
                    transactionType: "Picking",
                    referenceDoc: wmsTransactionTitle,
                    sourceBin: item.SourceBin,
                    targetBin: item.TargetBin
                );
                
                await UpdateStockAsync(
                    settings,
                    item.ItemCode,
                    warehouse,
                    binLocation: item.TargetBin,
                    qtyChange: item.Qty,
                    transactionType: "Picking",
                    referenceDoc: wmsTransactionTitle,
                    sourceBin: item.SourceBin,
                    targetBin: item.TargetBin
                );
            }
            else
            {
                // Dispatched (decrease stock)
                await UpdateStockAsync(
                    settings,
                    item.ItemCode,
                    warehouse,
                    binLocation: item.SourceBin,
                    qtyChange: -item.Qty, // Negative (decrease)
                    transactionType: "Picking",
                    referenceDoc: wmsTransactionTitle,
                    sourceBin: item.SourceBin,
                    targetBin: null
                );
            }
        }
        
        return true;
    }
    
    /// <summary>
    /// Update stock after Cycle Count adjustment
    /// </summary>
    public static async Task<bool> UpdateStockAfterCycleCountAsync(
        WmsSettings settings,
        string wmsTransactionTitle,
        string warehouse)
    {
        // Get all items with discrepancies
        var items = await GetCycleCountItemsWithDiscrepancyAsync(settings, wmsTransactionTitle);
        
        foreach (var item in items)
        {
            // Discrepancy = actual - expected
            // If discrepancy > 0: Increase stock
            // If discrepancy < 0: Decrease stock
            await UpdateStockAsync(
                settings,
                item.ItemCode,
                warehouse,
                binLocation: item.SourceBin, // Same bin (no movement)
                qtyChange: item.Discrepancy, // Can be positive or negative
                transactionType: "CycleCount",
                referenceDoc: wmsTransactionTitle,
                sourceBin: item.SourceBin,
                targetBin: item.SourceBin // Same bin
            );
        }
        
        return true;
    }
    
    /// <summary>
    /// Core stock update method
    /// </summary>
    private static async Task UpdateStockAsync(
        WmsSettings settings,
        string itemCode,
        string warehouse,
        string? binLocation,
        double qtyChange,
        string transactionType,
        string referenceDoc,
        string? sourceBin,
        string? targetBin)
    {
        var connectionString = DatabaseService.BuildConnectionString(settings);
        await using var connection = new MySqlConnection(connectionString);
        await connection.OpenAsync();
        
        await using var transaction = await connection.BeginTransactionAsync();
        
        try
        {
            // Get current stock
            var [currentStock] = await connection.QueryAsync<StockLedger>(@"
                SELECT qty, reserved_qty
                FROM tabStockLedger
                WHERE item_code = @itemCode
                  AND warehouse = @warehouse
                  AND (bin_location = @binLocation OR (bin_location IS NULL AND @binLocation IS NULL))
                FOR UPDATE
            ", new { itemCode, warehouse, binLocation });
            
            var currentQty = currentStock?.Qty ?? 0;
            var newQty = currentQty + qtyChange;
            
            if (newQty < 0)
            {
                throw new InvalidOperationException(
                    $"Insufficient stock: Cannot decrease {itemCode} by {qtyChange}. Current: {currentQty}");
            }
            
            // Update or insert stock ledger
            await connection.ExecuteAsync(@"
                INSERT INTO tabStockLedger 
                    (item_code, warehouse, bin_location, qty, last_transaction_date, 
                     last_transaction_type, last_transaction_ref, updated_at)
                VALUES 
                    (@itemCode, @warehouse, @binLocation, @newQty, NOW(), 
                     @transactionType, @referenceDoc, NOW())
                ON DUPLICATE KEY UPDATE
                    qty = @newQty,
                    last_transaction_date = NOW(),
                    last_transaction_type = @transactionType,
                    last_transaction_ref = @referenceDoc,
                    updated_at = NOW()
            ", new { itemCode, warehouse, binLocation, newQty, transactionType, referenceDoc });
            
            // Insert stock transaction log
            await connection.ExecuteAsync(@"
                INSERT INTO tabStockTransaction 
                    (transaction_date, transaction_type, reference_doc, wms_transaction_title,
                     item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
                     source_bin, target_bin, created_at)
                VALUES 
                    (NOW(), @transactionType, @referenceDoc, @wmsTransactionTitle,
                     @itemCode, @warehouse, @binLocation, @qtyChange, @currentQty, @newQty,
                     @sourceBin, @targetBin, NOW())
            ", new { 
                transactionType, 
                referenceDoc, 
                wmsTransactionTitle = referenceDoc, // Can be enhanced
                itemCode, 
                warehouse, 
                binLocation, 
                qtyChange, 
                currentQty, 
                newQty,
                sourceBin,
                targetBin
            });
            
            // Update tabItem.stock_qty (warehouse-level summary)
            await connection.ExecuteAsync(@"
                UPDATE tabItem
                SET stock_qty = (
                    SELECT SUM(qty) 
                    FROM tabStockLedger 
                    WHERE item_code = @itemCode
                ),
                updated_at = NOW()
                WHERE code = @itemCode
            ", new { itemCode });
            
            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }
    
    /// <summary>
    /// Get real-time stock for an item in a warehouse/bin
    /// </summary>
    public static async Task<double> GetStockAsync(
        WmsSettings settings,
        string itemCode,
        string warehouse,
        string? binLocation = null)
    {
        var connectionString = DatabaseService.BuildConnectionString(settings);
        await using var connection = new MySqlConnection(connectionString);
        
        var [result] = await connection.QueryAsync<StockLedger>(@"
            SELECT qty
            FROM tabStockLedger
            WHERE item_code = @itemCode
              AND warehouse = @warehouse
              AND (bin_location = @binLocation OR (bin_location IS NULL AND @binLocation IS NULL))
        ", new { itemCode, warehouse, binLocation });
        
        return result?.Qty ?? 0;
    }
    
    /// <summary>
    /// Get stock breakdown by bin for an item
    /// </summary>
    public static async Task<List<StockLedger>> GetStockByBinAsync(
        WmsSettings settings,
        string itemCode,
        string warehouse)
    {
        var connectionString = DatabaseService.BuildConnectionString(settings);
        await using var connection = new MySqlConnection(connectionString);
        
        var results = await connection.QueryAsync<StockLedger>(@"
            SELECT item_code, warehouse, bin_location, qty, reserved_qty, available_qty
            FROM tabStockLedger
            WHERE item_code = @itemCode
              AND warehouse = @warehouse
            ORDER BY bin_location
        ", new { itemCode, warehouse });
        
        return results.ToList();
    }
}

// Models/StockLedger.cs
public sealed class StockLedger
{
    public string ItemCode { get; init; } = string.Empty;
    public string Warehouse { get; init; } = string.Empty;
    public string? BinLocation { get; init; }
    public double Qty { get; init; }
    public double ReservedQty { get; init; }
    public double AvailableQty => Qty - ReservedQty;
    public DateTime? LastTransactionDate { get; init; }
    public string? LastTransactionType { get; init; }
    public string? LastTransactionRef { get; init; }
}
```

#### 4.4 Integration Points

**Update Stock After Transaction Completion:**

```csharp
// Services/WmsTransactionDataService.cs (Extended)
public static async Task<bool> SaveWmsTransactionAsync(WmsSettings settings, WmsTransaction transaction)
{
    // ... existing save logic ...
    
    // After transaction is saved and status is "Completed"
    if (transaction.TransactionStatus == "Completed")
    {
        // Update stock based on operation type
        switch (transaction.OperationType)
        {
            case OperationType.Receiving:
                await StockLedgerService.UpdateStockAfterReceivingAsync(
                    settings, transaction.Title, transaction.TargetWarehouse);
                break;
                
            case OperationType.Putaway:
                await StockLedgerService.UpdateStockAfterPutawayAsync(
                    settings, transaction.Title, transaction.TargetWarehouse);
                break;
                
            case OperationType.Picking:
                await StockLedgerService.UpdateStockAfterPickingAsync(
                    settings, transaction.Title, transaction.SourceWarehouse);
                break;
                
            case OperationType.CycleCount:
                await StockLedgerService.UpdateStockAfterCycleCountAsync(
                    settings, transaction.Title, transaction.SourceWarehouse);
                break;
        }
    }
    
    return true;
}
```

#### 4.5 UI Integration

**Show Real-Time Stock:**

```csharp
// ViewModels/ItemStockViewModel.cs (New)
public sealed class ItemStockViewModel : BaseViewModel
{
    public ObservableCollection<StockLedger> StockByBin { get; } = new();
    public double TotalStock => StockByBin.Sum(s => s.Qty);
    public double TotalAvailable => StockByBin.Sum(s => s.AvailableQty);
    
    public async Task LoadStockAsync(string itemCode, string warehouse)
    {
        var stock = await StockLedgerService.GetStockByBinAsync(settings, itemCode, warehouse);
        StockByBin.Clear();
        foreach (var s in stock)
        {
            StockByBin.Add(s);
        }
    }
}
```

---

## 📊 Part 5: Complete Workflow with Stock Tracking

### Workflow 1: Supplier-to-Warehouse → Showroom (with Transfer Order)

```
1. ASN Received
   └── Receiving Transaction Created
       └── Stock: +qty (warehouse level, DOCK-01)

2. Transfer Order Exists
   └── Route to Sorting (NO Putaway)
       ├── Sort items to boxes (SORT_TO_BOX events)
       ├── Pack boxes to Transfer Cartons (PACK_BOX_TO_TC events)
       └── Dispatch to Showroom
           └── Stock: -qty (warehouse level, when dispatched)

3. Check Remaining Items
   └── IF remaining qty > 0
       └── Route to Putaway
           └── Putaway Transaction
               └── Stock: Move from DOCK-01 → RACK-A-01-BIN-05
```

### Workflow 2: Supplier-to-Warehouse → Putaway (No Transfer Order)

```
1. ASN Received
   └── Receiving Transaction Created
       └── Stock: +qty (warehouse level, DOCK-01)

2. NO Transfer Order
   └── Route to Putaway
       └── Putaway Transaction
           └── Stock: Move from DOCK-01 → RACK-A-01-BIN-05
```

### Workflow 3: Showroom-to-Warehouse → Putaway

```
1. Transfer In Received
   └── Receiving Transaction Created
       └── Stock: +qty (warehouse level, DOCK-01)

2. Putaway Task Created
   └── Putaway Transaction
       └── Stock: Move from DOCK-01 → RACK-A-01-BIN-05
```

### Workflow 4: Physical Count / Cycle Count

```
1. Cycle Count Task Created
   └── Load expected qty from tabStockLedger

2. Operators Count Items
   └── Enter actual qty
       └── Calculate discrepancy

3. Review & Approve Discrepancies
   └── Cycle Count Transaction Completed
       └── Stock: +/-qty (based on discrepancy)
           └── Update tabStockLedger
```

---

## 🗄️ Part 6: Complete Database Schema

### 6.1 Stock Tracking Tables

```sql
-- Stock Ledger (Real-time stock by Item + Warehouse + Bin)
CREATE TABLE IF NOT EXISTS tabStockLedger (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  item_code VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NULL,
  qty DECIMAL(10,2) NOT NULL DEFAULT 0,
  reserved_qty DECIMAL(10,2) DEFAULT 0,
  available_qty DECIMAL(10,2) AS (qty - reserved_qty) STORED,
  last_transaction_date TIMESTAMP NULL,
  last_transaction_type VARCHAR(50) NULL,
  last_transaction_ref VARCHAR(100) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_item_warehouse_bin (item_code, warehouse, bin_location),
  INDEX idx_item_code (item_code),
  INDEX idx_warehouse (warehouse),
  INDEX idx_bin_location (bin_location)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stock Transaction Log (Audit trail)
CREATE TABLE IF NOT EXISTS tabStockTransaction (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transaction_date TIMESTAMP NOT NULL,
  transaction_type VARCHAR(50) NOT NULL,
  reference_doc_type VARCHAR(100) NULL,
  reference_doc VARCHAR(100) NULL,
  wms_transaction_title VARCHAR(100) NULL,
  item_code VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NULL,
  qty_change DECIMAL(10,2) NOT NULL,
  qty_before DECIMAL(10,2) NOT NULL,
  qty_after DECIMAL(10,2) NOT NULL,
  source_bin VARCHAR(100) NULL,
  target_bin VARCHAR(100) NULL,
  performed_by VARCHAR(100) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_transaction_date (transaction_date),
  INDEX idx_item_code (item_code),
  INDEX idx_warehouse (warehouse),
  INDEX idx_wms_transaction (wms_transaction_title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 6.2 Transfer In Tables (Same as before)

```sql
-- Transfer In (from Showroom to Warehouse)
CREATE TABLE IF NOT EXISTS tabTransferIn (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft',
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
  INDEX idx_status (status)
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

### 6.3 Cycle Count Tables (Same as before)

```sql
-- Cycle Count Task
CREATE TABLE IF NOT EXISTS tabCycleCountTask (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft',
  count_type VARCHAR(50) NOT NULL, -- 'Full', 'Cycle', 'Spot'
  warehouse VARCHAR(100) NOT NULL,
  zone VARCHAR(100) NULL,
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
  INDEX idx_warehouse (warehouse),
  INDEX idx_zone (zone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cycle Count Line
CREATE TABLE IF NOT EXISTS tabCycleCountLine (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NULL,
  expected_qty DECIMAL(10,2) NOT NULL,
  actual_qty DECIMAL(10,2) NULL,
  discrepancy DECIMAL(10,2) AS (COALESCE(actual_qty, 0) - expected_qty) STORED,
  counted_by VARCHAR(100) NULL,
  counted_on TIMESTAMP NULL,
  reviewed_by VARCHAR(100) NULL,
  reviewed_on TIMESTAMP NULL,
  approval_required BOOLEAN DEFAULT FALSE,
  approved_by VARCHAR(100) NULL,
  approved_on TIMESTAMP NULL,
  discrepancy_reason TEXT NULL,
  status VARCHAR(50) DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_item_code (item_code),
  INDEX idx_bin_location (bin_location),
  FOREIGN KEY (parent_title) REFERENCES tabCycleCountTask(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 6.4 Extended Tables

```sql
-- Extend Putaway Task
ALTER TABLE tabPutawayTask 
ADD COLUMN source_type VARCHAR(50) DEFAULT 'ASN' AFTER status,
ADD COLUMN transfer_in VARCHAR(100) NULL AFTER advance_shipping_notice,
ADD INDEX idx_source_type (source_type),
ADD INDEX idx_transfer_in (transfer_in);

-- Extend Inbound Session
ALTER TABLE tabInboundSession 
ADD COLUMN transfer_in VARCHAR(100) NULL AFTER transfer_order,
ADD INDEX idx_transfer_in (transfer_in);
```

---

## 💻 Part 7: Implementation Checklist

### Phase 1: Database Schema (Priority: Critical)

- [ ] Create `tabStockLedger` table
- [ ] Create `tabStockTransaction` table
- [ ] Create `tabTransferIn` and `tabTransferInItem` tables
- [ ] Create `tabCycleCountTask` and `tabCycleCountLine` tables
- [ ] Extend `tabPutawayTask` with `source_type` and `transfer_in`
- [ ] Extend `tabInboundSession` with `transfer_in`
- [ ] Create indexes for performance

### Phase 2: Stock Tracking Service (Priority: Critical)

- [ ] Create `StockLedgerService` with core update methods
- [ ] Implement `UpdateStockAfterReceivingAsync`
- [ ] Implement `UpdateStockAfterPutawayAsync`
- [ ] Implement `UpdateStockAfterPickingAsync`
- [ ] Implement `UpdateStockAfterCycleCountAsync`
- [ ] Implement `GetStockAsync` and `GetStockByBinAsync`
- [ ] Integrate stock updates into `WmsTransactionDataService.SaveWmsTransactionAsync`

### Phase 3: Routing Logic (Priority: High)

- [ ] Create `ReceivingRoutingService`
- [ ] Implement `RouteReceivedItemsAsync` (check Transfer Order)
- [ ] Implement `RouteRemainingItemsToPutawayAsync` (after sorting)
- [ ] Integrate routing into Inbound Session completion

### Phase 4: Transfer In & Cycle Count (Priority: High)

- [ ] Create `TransferInDataService`
- [ ] Create `CycleCountDataService`
- [ ] Extend `PutawayTaskDataService` for Transfer In
- [ ] Extend `WmsTransactionAutoCreateService` for Transfer In and Cycle Count

### Phase 5: UI Components (Priority: Medium)

- [ ] Create Stock Ledger View (show real-time stock by item/bin)
- [ ] Create Transfer In List View
- [ ] Create Cycle Count Task List View
- [ ] Update Putaway Task List View (add Source Type)
- [ ] Add stock display in Item Detail views

### Phase 6: Testing (Priority: Critical)

- [ ] Test stock updates after Receiving
- [ ] Test stock updates after Putaway
- [ ] Test stock updates after Picking
- [ ] Test stock updates after Cycle Count
- [ ] Test routing logic (Transfer Order vs. Putaway)
- [ ] Test real-time stock display
- [ ] Test stock transaction log

---

## 🎯 Part 8: Key Implementation Points

### 1. Stock Update Timing

**Critical:** Stock must be updated **immediately** when transaction status changes to "Completed"

**Implementation:**
- Hook into `WmsTransactionDataService.SaveWmsTransactionAsync`
- Check if `transaction_status = "Completed"`
- Call appropriate `StockLedgerService` method based on `operation_type`

### 2. Stock Query Performance

**Optimization:**
- Use `tabStockLedger` for real-time queries (fast)
- Use `tabStockTransaction` for historical queries (audit trail)
- Index on `(item_code, warehouse, bin_location)` for fast lookups

### 3. Stock Validation

**Before Decrease:**
- Check `available_qty >= qty_to_decrease`
- Throw error if insufficient stock
- Prevent negative stock

### 4. Bin-Level vs. Warehouse-Level Stock

**Warehouse-Level:** `bin_location = NULL`
- Used for items at dock (not yet put away)
- Used for items in transit

**Bin-Level:** `bin_location = 'RACK-A-01-BIN-05'`
- Used for items in storage bins
- Enables bin-level picking and cycle count

---

## 📝 Part 9: Real-Time Stock Display

### UI Components Needed

1. **Stock Ledger View**
   - Show stock by Item + Warehouse + Bin
   - Filter by item, warehouse, bin
   - Show available qty (qty - reserved_qty)
   - Show last transaction date

2. **Item Detail View (Enhanced)**
   - Show total stock across all bins
   - Show stock breakdown by bin
   - Show reserved qty
   - Show available qty

3. **Bin Detail View**
   - Show all items in a bin
   - Show quantities per item
   - Show last transaction

4. **Stock Transaction History**
   - Show all stock movements
   - Filter by date, item, transaction type
   - Show qty_before, qty_change, qty_after

---

## ✅ Summary

### Requirements Addressed

1. ✅ **Supplier-to-Warehouse → Showroom OR Putaway**
   - Routing logic based on Transfer Order existence
   - Remaining items after sorting go to Putaway

2. ✅ **Showroom-to-Warehouse → Putaway**
   - Transfer In → Receiving → Putaway

3. ✅ **Physical Count / Cycle Count**
   - Complete cycle count workflow with discrepancy handling

4. ✅ **Real-Time Stock Tracking** ⚠️ **NEW**
   - `tabStockLedger` for real-time stock by Item + Warehouse + Bin
   - `tabStockTransaction` for audit trail
   - Auto-update stock after each transaction
   - Real-time stock display in UI

### Critical New Components

1. **Stock Ledger Service** - Core stock update logic
2. **Stock Ledger Table** - Real-time stock tracking
3. **Stock Transaction Log** - Complete audit trail
4. **Routing Service** - Decide Showroom vs. Putaway

### Next Steps

1. Review and approve this revised plan
2. Begin Phase 1 (Database Schema) - **CRITICAL for stock tracking**
3. Implement Phase 2 (Stock Tracking Service) - **CRITICAL for real-time stock**
4. Continue with other phases

---

**Document Version:** 2.0 (Revised)  
**Last Updated:** 2025-12-27  
**Status:** Ready for Implementation

