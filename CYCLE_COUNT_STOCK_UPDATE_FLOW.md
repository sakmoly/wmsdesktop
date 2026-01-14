# Cycle Count Stock Update Flow

## 📋 Overview

When a cycle count task is **completed**, the system automatically updates the stock ledger and creates audit trail records. This document explains the complete process.

---

## 🔄 Complete Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User Completes Cycle Count Task                             │
│    POST /api/cycle-count/:title/complete                        │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. System Validates Task                                        │
│    ✓ Task exists                                                │
│    ✓ Task is not already "Completed"                            │
│    ✓ Task has status "Review" or "In Progress"                  │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Begin Database Transaction                                   │
│    All updates are atomic (all succeed or all fail)              │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Update Task Status                                           │
│    ✓ Status → "Completed"                                       │
│    ✓ Unfreeze stock (if frozen)                                 │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Check for Discrepancies                                      │
│    IF items_with_discrepancy > 0:                               │
│      → Proceed to stock update                                  │
│    ELSE:                                                         │
│      → Skip stock update (no changes needed)                     │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Get All Lines with Discrepancies                             │
│    SELECT from tabCycleCountLine WHERE:                          │
│      - parent_title = ?                                          │
│      - actual_qty IS NOT NULL                                    │
│      - discrepancy IS NOT NULL                                   │
│      - discrepancy != 0                                          │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. For Each Line with Discrepancy:                              │
│                                                                  │
│    a) Get Current Stock                                          │
│       SELECT qty FROM tabStockLedger WHERE:                      │
│         - item_code = ?                                          │
│         - warehouse = ?                                           │
│         - bin_location = ?                                       │
│                                                                  │
│    b) Calculate New Quantity                                     │
│       newQty = currentQty + discrepancy                         │
│       Example: currentQty=50, discrepancy=+5 → newQty=55         │
│       Example: currentQty=50, discrepancy=-3 → newQty=47         │
│                                                                  │
│    c) Update Stock Ledger                                        │
│       INSERT ... ON DUPLICATE KEY UPDATE                         │
│       - Creates new record if item doesn't exist                 │
│       - Updates existing record if item exists                   │
│       - Sets last_transaction_type = 'CycleCount'                │
│       - Sets last_transaction_ref = task title                   │
│                                                                  │
│    d) Create Stock Transaction Log                               │
│       INSERT INTO tabStockTransaction                            │
│       - transaction_type = 'CycleCount'                          │
│       - reference_doc = task title                               │
│       - qty_change = discrepancy                                 │
│       - qty_before = currentQty                                  │
│       - qty_after = newQty                                       │
│       - performed_by = counted_by                                 │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. Commit Transaction                                           │
│    All changes are saved to database                            │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 9. Return Success Response                                      │
│    {                                                             │
│      "ok": true,                                                 │
│      "message": "Cycle Count Task completed successfully",       │
│      "data": {                                                   │
│        "title": "CC-A1-R01-L1-B1-MK6KXT",                        │
│        "status": "Completed",                                    │
│        "stock_updated": true,                                    │
│        "items_adjusted": 3                                       │
│      }                                                           │
│    }                                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Stock Update Details

### What Gets Updated?

#### 1. **tabStockLedger** (Main Stock Table)

**Fields Updated:**
- `qty` → New quantity after adjustment
- `last_transaction_date` → Current timestamp
- `last_transaction_type` → `'CycleCount'`
- `last_transaction_ref` → Cycle count task title
- `updated_at` → Current timestamp

**Formula:**
```sql
new_qty = current_qty + discrepancy
```

**Examples:**

| Current Qty | Discrepancy | New Qty | Meaning |
|-------------|-------------|---------|---------|
| 50 | +5 | 55 | Found 5 more items than expected |
| 50 | -3 | 47 | Found 3 fewer items than expected |
| 0 | +10 | 10 | New item not in system (ad-hoc count) |
| 20 | 0 | 20 | No change (no discrepancy) |

---

#### 2. **tabStockTransaction** (Audit Trail)

**Purpose:** Track all stock movements for audit and reporting

**Fields Recorded:**
- `transaction_date` → When the adjustment occurred
- `transaction_type` → `'CycleCount'`
- `reference_doc_type` → `'Cycle Count Task'`
- `reference_doc` → Task title (e.g., `CC-A1-R01-L1-B1-MK6KXT`)
- `item_code` → Item that was adjusted
- `warehouse` → Warehouse location
- `bin_location` → Bin location
- `qty_change` → The discrepancy amount (+ or -)
- `qty_before` → Stock quantity before adjustment
- `qty_after` → Stock quantity after adjustment
- `source_bin` → Same as bin_location
- `target_bin` → Same as bin_location
- `performed_by` → User who counted the item

---

## 🔍 Example Scenario

### Scenario: Cycle Count Task Completed

**Task:** `CC-A1-R01-L1-B1-MK6KXT`  
**Warehouse:** `Main Warehouse`  
**Status:** `Review` → `Completed`

**Lines with Discrepancies:**

| Item Code | Bin Location | Expected Qty | Actual Qty | Discrepancy |
|-----------|--------------|--------------|------------|-------------|
| SKU-001 | A1-R01-L1-B1 | 50 | 55 | +5 |
| SKU-002 | A1-R01-L1-B1 | 30 | 27 | -3 |
| SKU-003 | A1-R01-L1-B1 | 0 | 10 | +10 (new item) |

**Before Completion:**

```sql
-- tabStockLedger
item_code | warehouse        | bin_location   | qty
----------|------------------|----------------|-----
SKU-001   | Main Warehouse   | A1-R01-L1-B1   | 50
SKU-002   | Main Warehouse   | A1-R01-L1-B1   | 30
SKU-003   | Main Warehouse   | A1-R01-L1-B1   | 0 (or doesn't exist)
```

**After Completion:**

```sql
-- tabStockLedger
item_code | warehouse        | bin_location   | qty | last_transaction_type | last_transaction_ref
----------|------------------|----------------|-----|----------------------|---------------------
SKU-001   | Main Warehouse   | A1-R01-L1-B1   | 55  | CycleCount           | CC-A1-R01-L1-B1-MK6KXT
SKU-002   | Main Warehouse   | A1-R01-L1-B1   | 27  | CycleCount           | CC-A1-R01-L1-B1-MK6KXT
SKU-003   | Main Warehouse   | A1-R01-L1-B1   | 10  | CycleCount           | CC-A1-R01-L1-B1-MK6KXT
```

**Stock Transaction Logs Created:**

```sql
-- tabStockTransaction (3 records created)
transaction_date | transaction_type | reference_doc              | item_code | qty_change | qty_before | qty_after
-----------------|------------------|----------------------------|-----------|------------|------------|----------
2025-01-09 10:00 | CycleCount       | CC-A1-R01-L1-B1-MK6KXT    | SKU-001   | +5         | 50         | 55
2025-01-09 10:00 | CycleCount       | CC-A1-R01-L1-B1-MK6KXT    | SKU-002   | -3         | 30         | 27
2025-01-09 10:00 | CycleCount       | CC-A1-R01-L1-B1-MK6KXT    | SKU-003   | +10        | 0          | 10
```

---

## ⚠️ Important Notes

### 1. **Only Discrepancies Are Updated**

- Items with `discrepancy = 0` are **NOT** updated in stock ledger
- Only items where `discrepancy != 0` trigger stock updates
- This is efficient and avoids unnecessary database writes

### 2. **Transaction Safety**

- All updates are wrapped in a database transaction
- If any update fails, **all changes are rolled back**
- Ensures data consistency

### 3. **Multiple Users' Counts**

- If multiple users counted different items in the same task:
  - All discrepancies are aggregated
  - Each line is processed independently
  - Stock is updated for all items with discrepancies

### 4. **New Items (Ad-hoc Counts)**

- If `expected_qty = 0` and `actual_qty > 0`:
  - `discrepancy = actual_qty - 0 = actual_qty`
  - Stock ledger is **created** (INSERT) if item doesn't exist
  - Stock ledger is **updated** (UPDATE) if item exists

### 5. **Reserved Quantity**

- `reserved_qty` is **preserved** during stock updates
- Only `qty` (available quantity) is adjusted
- Reserved stock is not affected by cycle count

---

## 🔗 Related Tables

### Tables Updated:
- ✅ `tabCycleCountTask` → Status changed to "Completed"
- ✅ `tabStockLedger` → Stock quantities adjusted
- ✅ `tabStockTransaction` → Audit trail created

### Tables Read:
- 📖 `tabCycleCountLine` → Get discrepancies
- 📖 `tabStockLedger` → Get current stock

---

## 📝 API Response

**Success Response:**
```json
{
  "ok": true,
  "message": "Cycle Count Task completed successfully",
  "data": {
    "title": "CC-A1-R01-L1-B1-MK6KXT",
    "status": "Completed",
    "stock_updated": true,
    "items_adjusted": 3
  }
}
```

**Fields:**
- `stock_updated` → `true` if any items were adjusted, `false` if no discrepancies
- `items_adjusted` → Number of items that had stock updates

---

## 🚀 Next Steps (Future Enhancements)

### 1. **ERP Sync**
- After stock update, sync changes to ERPNext
- Create Stock Entry document in ERPNext
- Map discrepancies to ERPNext adjustments

### 2. **Carton-Level Stock**
- If carton_id is provided, update carton stock separately
- Maintain carton-level inventory tracking

### 3. **Notifications**
- Notify warehouse manager when discrepancies are large
- Alert if stock goes negative after adjustment

---

## ✅ Summary

**When you complete a cycle count task:**

1. ✅ Task status changes to "Completed"
2. ✅ Stock ledger is updated for items with discrepancies
3. ✅ Audit trail is created in stock transaction table
4. ✅ All changes are atomic (transaction-safe)
5. ✅ Stock quantities reflect actual counted amounts

**The stock in your warehouse now matches what was physically counted!** 🎯
