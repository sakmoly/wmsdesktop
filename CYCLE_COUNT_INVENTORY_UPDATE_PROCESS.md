# Cycle Count Inventory Update Process - Analysis & Implementation Guide

## Current State Analysis

### 1. Cycle Count Workflow (Current)

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Task Creation & Counting                            │
├─────────────────────────────────────────────────────────────┤
│ 1. Create Cycle Count Task (Desktop App)                     │
│    - Status: "Draft"                                         │
│    - Title: CC-A1-R01-L1-B1-MK6KXT                          │
│                                                              │
│ 2. Start Task (Change to "In Progress")                     │
│                                                              │
│ 3. Multiple Users Scan Items (Mobile App)                    │
│    - User A scans items → POST /api/cycle-count/:title/count │
│    - User B scans items → POST /api/cycle-count/:title/count │
│    - User C scans items → POST /api/cycle-count/:title/count │
│    - Each scan updates tabCycleCountLine with actual_qty     │
│    - Each scan updates task statistics (counted_items)       │
│                                                              │
│ 4. Submit Task (Desktop App)                                │
│    - POST /api/cycle-count/:title/submit                    │
│    - Status: "Review" (if discrepancies) OR "Completed"      │
│                                                              │
│ 5. Complete Task (Desktop App)                               │
│    - POST /api/cycle-count/:title/complete                  │
│    - Status: "Completed"                                     │
│    - Unfreezes stock (if frozen)                            │
└─────────────────────────────────────────────────────────────┘
```

### 2. Current Inventory Update Status

#### ❌ **MISSING: Inventory Update on Completion**

**Current Behavior:**

- ✅ Cycle count lines are updated with `actual_qty`
- ✅ Discrepancies are calculated (`discrepancy = actual_qty - expected_qty`)
- ✅ Task status changes to "Completed"
- ❌ **Stock ledger is NOT updated automatically**
- ❌ **WMS Transaction is NOT created**
- ❌ **ERP sync is NOT triggered**

**Why Inventory is Not Updated:**

1. The `completeCycleCount` endpoint only changes status
2. No WMS Transaction is created for cycle count
3. `StockLedgerService.UpdateStockAfterCycleCountAsync` expects a WMS Transaction to exist
4. The service looks for `tabWmsTransactionDetail` records, but cycle count doesn't create them

---

## Required Implementation

### Option 1: Create WMS Transaction on Completion (RECOMMENDED)

#### Flow:

```
1. User completes cycle count
2. System creates WMS Transaction (if not exists)
3. System creates WMS Transaction Details (from cycle count lines with discrepancies)
4. System updates stock ledger (via StockLedgerService)
5. System syncs to ERP (if configured)
```

#### Implementation Steps:

**Step 1: Update `completeCycleCount` Endpoint**

```javascript
export const completeCycleCount = async (req, res) => {
  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    const { title } = req.params;

    // 1. Check if task exists and get details
    const [taskRows] = await connection.execute(
      `
      SELECT status, warehouse, items_with_discrepancy
      FROM tabCycleCountTask WHERE title = ?
    `,
      [title]
    );

    if (taskRows.length === 0) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
    }

    const task = taskRows[0];

    // 2. Update status to "Completed"
    await connection.execute(
      `
      UPDATE tabCycleCountTask 
      SET status = 'Completed', updated_at = NOW()
      WHERE title = ?
    `,
      [title]
    );

    // 3. Unfreeze stock if frozen
    await connection.execute(
      `
      UPDATE tabCycleCountTask 
      SET freeze_stock = FALSE
      WHERE title = ? AND freeze_stock = TRUE
    `,
      [title]
    );

    // 4. Create WMS Transaction (if discrepancies exist)
    if (parseInt(task.items_with_discrepancy) > 0) {
      // Check if WMS Transaction already exists
      const [existingTx] = await connection.execute(
        `
        SELECT title FROM tabWmsTransaction WHERE title = ?
      `,
        [title]
      );

      if (existingTx.length === 0) {
        // Create WMS Transaction
        await connection.execute(
          `
          INSERT INTO tabWmsTransaction 
            (title, status, operation_type, transaction_date, transaction_status,
             source_warehouse, target_warehouse, reference_doc_type, reference_doc)
          VALUES (?, 'Completed', 'CycleCount', NOW(), 'Completed',
                  ?, ?, 'Cycle Count Task', ?)
        `,
          [title, task.warehouse, task.warehouse, title]
        );

        // Get all lines with discrepancies
        const [linesWithDiscrepancy] = await connection.execute(
          `
          SELECT 
            item_code,
            bin_location,
            expected_qty,
            actual_qty,
            discrepancy,
            counted_by
          FROM tabCycleCountLine
          WHERE parent_title = ?
            AND actual_qty IS NOT NULL
            AND discrepancy IS NOT NULL
            AND discrepancy != 0
        `,
          [title]
        );

        // Create WMS Transaction Details
        for (const line of linesWithDiscrepancy) {
          await connection.execute(
            `
            INSERT INTO tabWmsTransactionDetail
              (parent_title, item_code, qty, actual_qty_counted, discrepancy,
               source_bin, assignment_status)
            VALUES (?, ?, ?, ?, ?, ?, 'Completed')
          `,
            [
              title,
              line.item_code,
              line.expected_qty || 0,
              line.actual_qty,
              line.discrepancy,
              line.bin_location,
            ]
          );
        }
      }
    }

    await connection.commit();

    // 5. Update stock ledger (desktop app will call this)
    // Note: This should be done in desktop app after completion

    res.json({
      ok: true,
      message: "Cycle Count Task completed successfully",
      data: {
        title: title,
        status: "Completed",
        wms_transaction_created: parseInt(task.items_with_discrepancy) > 0,
      },
    });
  } catch (error) {
    await connection.rollback();
    // ... error handling
  } finally {
    connection.release();
  }
};
```

**Step 2: Update Desktop App to Call Stock Update**

```csharp
// In CycleCountApiService.cs or CycleCountTaskDetailViewModel.cs
public async Task<ApiResult> CompleteCycleCountAsync(WmsSettings settings, string title)
{
    // 1. Call complete endpoint
    var completeResult = await CallApiAsync(settings,
        $"POST /api/cycle-count/{title}/complete", null);

    if (!completeResult.Success)
        return completeResult;

    // 2. Update stock ledger (if WMS Transaction was created)
    var transactionCreated = completeResult.Data?.wms_transaction_created ?? false;
    if (transactionCreated)
    {
        // Get task to get warehouse
        var task = await CycleCountTaskDataService.GetCycleCountTaskByTitleAsync(settings, title);
        if (task != null)
        {
            // Update stock ledger
            await StockLedgerService.UpdateStockAfterCycleCountAsync(
                settings, title, task.Warehouse);
        }
    }

    return completeResult;
}
```

---

### Option 2: Update Stock Directly from Cycle Count Lines (SIMPLER)

#### Flow:

```
1. User completes cycle count
2. System updates stock ledger directly from cycle count lines
3. System creates stock transaction log
4. System syncs to ERP (if configured)
```

#### Implementation:

**Update `completeCycleCount` Endpoint:**

```javascript
export const completeCycleCount = async (req, res) => {
  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    const { title } = req.params;

    // 1. Get task details
    const [taskRows] = await connection.execute(
      `
      SELECT status, warehouse, items_with_discrepancy
      FROM tabCycleCountTask WHERE title = ?
    `,
      [title]
    );

    if (taskRows.length === 0) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
    }

    const task = taskRows[0];
    const warehouse = task.warehouse;

    // 2. Update status to "Completed"
    await connection.execute(
      `
      UPDATE tabCycleCountTask 
      SET status = 'Completed', updated_at = NOW()
      WHERE title = ?
    `,
      [title]
    );

    // 3. Unfreeze stock
    await connection.execute(
      `
      UPDATE tabCycleCountTask 
      SET freeze_stock = FALSE
      WHERE title = ? AND freeze_stock = TRUE
    `,
      [title]
    );

    // 4. Update stock ledger directly (if discrepancies exist)
    if (parseInt(task.items_with_discrepancy) > 0) {
      // Get all lines with discrepancies
      const [linesWithDiscrepancy] = await connection.execute(
        `
        SELECT 
          item_code,
          bin_location,
          expected_qty,
          actual_qty,
          discrepancy,
          counted_by
        FROM tabCycleCountLine
        WHERE parent_title = ?
          AND actual_qty IS NOT NULL
          AND discrepancy IS NOT NULL
          AND discrepancy != 0
      `,
        [title]
      );

      for (const line of linesWithDiscrepancy) {
        const itemCode = line.item_code;
        const binLocation = line.bin_location;
        const discrepancy = parseFloat(line.discrepancy);

        // Get current stock
        const [currentStock] = await connection.execute(
          `
          SELECT qty, reserved_qty
          FROM tabStockLedger
          WHERE item_code = ? AND warehouse = ? 
            AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
        `,
          [itemCode, warehouse, binLocation, binLocation]
        );

        let currentQty = 0;
        let currentReservedQty = 0;
        if (currentStock.length > 0) {
          currentQty = parseFloat(currentStock[0].qty) || 0;
          currentReservedQty = parseFloat(currentStock[0].reserved_qty) || 0;
        }

        const newQty = currentQty + discrepancy;

        // Update or insert stock ledger
        await connection.execute(
          `
          INSERT INTO tabStockLedger 
            (item_code, warehouse, bin_location, qty, reserved_qty, 
             last_transaction_date, last_transaction_type, last_transaction_ref, 
             updated_at, created_at)
          VALUES (?, ?, ?, ?, ?,
                  NOW(), 'CycleCount', ?, NOW(), NOW())
          ON DUPLICATE KEY UPDATE
            qty = ?,
            last_transaction_date = NOW(),
            last_transaction_type = 'CycleCount',
            last_transaction_ref = ?,
            updated_at = NOW()
        `,
          [
            itemCode,
            warehouse,
            binLocation || null,
            newQty,
            currentReservedQty,
            title,
            newQty,
            title,
          ]
        );

        // Create stock transaction log
        await connection.execute(
          `
          INSERT INTO tabStockTransaction
            (transaction_date, transaction_type, reference_doc_type, reference_doc,
             item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
             source_bin, target_bin, performed_by, created_at)
          VALUES (NOW(), 'CycleCount', 'Cycle Count Task', ?,
                  ?, ?, ?, ?, ?, ?,
                  ?, ?, ?, NOW())
        `,
          [
            title,
            itemCode,
            warehouse,
            binLocation || null,
            discrepancy,
            currentQty,
            newQty,
            binLocation,
            binLocation,
            line.counted_by || null,
          ]
        );
      }
    }

    await connection.commit();

    res.json({
      ok: true,
      message: "Cycle Count Task completed successfully",
      data: {
        title: title,
        status: "Completed",
        stock_updated: parseInt(task.items_with_discrepancy) > 0,
      },
    });
  } catch (error) {
    await connection.rollback();
    // ... error handling
  } finally {
    connection.release();
  }
};
```

---

## Recommended Approach: Hybrid Solution

### Implementation Plan

**Phase 1: Direct Stock Update (Immediate)**

- Update `completeCycleCount` to update stock ledger directly
- Create stock transaction logs
- Works immediately without WMS Transaction dependency

**Phase 2: WMS Transaction Integration (Future)**

- Create WMS Transaction for audit trail
- Use existing `StockLedgerService` methods
- Better integration with other modules

---

## Multiple Users / Sessions Handling

### Current Behavior

**✅ Already Handled:**

- Multiple users can scan items simultaneously
- Each scan updates `tabCycleCountLine` independently
- `counted_by` field tracks who counted each item
- Task statistics are recalculated on each update
- No conflicts because each line is updated independently

**Example:**

```
User A scans: Item SKU-001, Qty 50 → Updates line 1
User B scans: Item SKU-002, Qty 30 → Updates line 2
User C scans: Item SKU-001, Qty 48 → Updates line 1 (overwrites)
```

### Inventory Update Process

**When Task is Completed:**

1. **All scanned items are aggregated** (from all users)
2. **Discrepancies are calculated** (actual_qty - expected_qty)
3. **Stock is updated once** (not per user, but per item)
4. **Stock transaction log** records the adjustment

**Example:**

```
Task: CC-A1-R01-L1-B1-MK6KXT
- User A counted: SKU-001 → 50 (expected: 50, discrepancy: 0)
- User B counted: SKU-002 → 30 (expected: 32, discrepancy: -2)
- User C counted: SKU-003 → 25 (expected: 20, discrepancy: +5)

On Completion:
- SKU-001: No stock change (discrepancy = 0)
- SKU-002: Decrease by 2 (discrepancy = -2)
- SKU-003: Increase by 5 (discrepancy = +5)
```

---

## Local vs ERP Sync

### Local Database (WMS)

**Update Process:**

1. ✅ **Immediate Update**: Stock ledger updated when cycle count is completed
2. ✅ **Transaction Log**: All adjustments logged in `tabStockTransaction`
3. ✅ **Audit Trail**: `counted_by` field tracks who counted each item

**Tables Updated:**

- `tabStockLedger` - Current stock levels
- `tabStockTransaction` - Transaction history
- `tabCycleCountLine` - Count results (already updated during counting)

### ERP Sync (ERPNext)

**Current Status:** ❌ **NOT IMPLEMENTED**

**Required Implementation:**

#### Option A: Real-time Sync (Recommended)

```javascript
// After stock update in completeCycleCount
if (erpSyncEnabled) {
  // Create Stock Entry in ERPNext
  await syncToErpNext(title, warehouse, linesWithDiscrepancy);
}
```

#### Option B: Batch Sync (Alternative)

```javascript
// Queue for later sync
await queueForErpSync(title, "CycleCount");
```

**ERPNext Stock Entry Format:**

```json
{
  "stock_entry_type": "Material Receipt", // or "Material Issue"
  "posting_date": "2025-01-09",
  "items": [
    {
      "item_code": "SKU-002",
      "qty": -2, // Negative for decrease
      "warehouse": "WH-MAIN",
      "target_warehouse": "WH-MAIN"
    },
    {
      "item_code": "SKU-003",
      "qty": 5, // Positive for increase
      "warehouse": "WH-MAIN",
      "target_warehouse": "WH-MAIN"
    }
  ]
}
```

---

## Implementation Checklist

### Backend API Changes

- [ ] Update `completeCycleCount` endpoint to update stock ledger
- [ ] Add stock transaction log creation
- [ ] Handle multiple users' counts (aggregate discrepancies)
- [ ] Add ERP sync integration (optional)
- [ ] Add error handling and rollback

### Desktop App Changes

- [ ] Update `CompleteCycleCountAsync` to handle stock update response
- [ ] Show confirmation message after stock update
- [ ] Display stock adjustment summary

### Testing

- [ ] Test with single user count
- [ ] Test with multiple users counting same items
- [ ] Test with multiple users counting different items
- [ ] Test stock update on completion
- [ ] Test ERP sync (if implemented)
- [ ] Test error handling (rollback on failure)

---

## Summary

### Current State

- ✅ Multiple users can scan items
- ✅ Counts are stored in database
- ✅ Discrepancies are calculated
- ❌ **Stock is NOT updated on completion**
- ❌ **ERP is NOT synced**

### Required Changes

1. **Update `completeCycleCount` endpoint** to update stock ledger
2. **Create stock transaction logs** for audit trail
3. **Add ERP sync** (optional, can be done later)

### Recommended Implementation

- **Use Option 2 (Direct Stock Update)** for immediate implementation
- **Add WMS Transaction creation** later for better audit trail
- **Add ERP sync** as separate feature

---

**Document Version:** 1.0  
**Date:** 2025-01-09  
**Status:** Ready for Implementation
