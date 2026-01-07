# WMS Transaction to ERPNext Stock Entry Mapping

## Overview

When WMS Transactions are **completed**, they should be sent to ERPNext as **Stock Entries** to update inventory in ERPNext.

## Which Transactions Should Be Sent to ERPNext?

### ✅ **1. Receiving Transaction** → Stock Entry (Material Receipt)

**When:** When `transaction_status = "Completed"` and `operation_type = "Receiving"`

**Stock Entry Type:** `Material Receipt`

**Purpose:** Record items received into the warehouse from suppliers

**Stock Entry Details:**
- **Source Warehouse:** `null` (external supplier)
- **Target Warehouse:** `transaction.target_warehouse` (e.g., "WH-MAIN")
- **Items:** From `tabWmsTransactionDetail` where `assignment_status = "Completed"`
- **Reference:** `transaction.reference_doc` (ASN number)

**Example:**
```json
{
  "stock_entry_type": "Material Receipt",
  "from_warehouse": null,
  "to_warehouse": "WH-MAIN",
  "posting_date": "2025-12-26",
  "posting_time": "23:55:00",
  "reference_doctype": "Advance Shipping Notice",
  "reference_docname": "ASN-0004",
  "items": [
    {
      "item_code": "SKU-JEANS-041-BLK-32",
      "qty": 60,
      "uom": "Nos",
      "t_warehouse": "WH-MAIN",
      "s_warehouse": null
    }
  ]
}
```

---

### ✅ **2. Putaway Transaction** → Stock Entry (Material Transfer)

**When:** When `transaction_status = "Completed"` and `operation_type = "Putaway"`

**Stock Entry Type:** `Material Transfer`

**Purpose:** Record items moved from receiving dock to storage bins

**Stock Entry Details:**
- **Source Warehouse:** `transaction.source_warehouse` (e.g., "WH-MAIN")
- **Target Warehouse:** `transaction.target_warehouse` (e.g., "WH-MAIN")
- **Source Bin:** `detail.source_bin` (e.g., "DOCK-01")
- **Target Bin:** `detail.target_bin` (e.g., "RACK-01-BIN-05")
- **Items:** From `tabWmsTransactionDetail` where `assignment_status = "Completed"` and `target_bin IS NOT NULL`

**Example:**
```json
{
  "stock_entry_type": "Material Transfer",
  "from_warehouse": "WH-MAIN",
  "to_warehouse": "WH-MAIN",
  "posting_date": "2025-12-26",
  "posting_time": "23:55:00",
  "reference_doctype": "Putaway Task",
  "reference_docname": "PUTAWAY-TASK-001",
  "items": [
    {
      "item_code": "SKU-JEANS-041-BLK-32",
      "qty": 60,
      "uom": "Nos",
      "s_warehouse": "WH-MAIN",
      "s_warehouse": "DOCK-01",
      "t_warehouse": "WH-MAIN",
      "t_warehouse": "RACK-01-BIN-05"
    }
  ]
}
```

---

### ⚠️ **3. Picking Transaction** → Stock Entry (Material Transfer) - Optional

**When:** When `transaction_status = "Completed"` and `operation_type = "Picking"`

**Stock Entry Type:** `Material Transfer`

**Purpose:** Record items picked from storage bins to staging area for dispatch

**Note:** This depends on your workflow:
- **If picking moves items to staging:** Create Stock Entry
- **If picking is just preparation (items still in warehouse):** Don't create Stock Entry until dispatch

**Stock Entry Details:**
- **Source Warehouse:** `transaction.source_warehouse`
- **Target Warehouse:** `transaction.target_warehouse` or staging area
- **Source Bin:** `detail.source_bin` (storage bin)
- **Target Bin:** `detail.target_bin` (staging area, e.g., "STAGE-STORE-001")

---

### ❌ **4. Cycle Count Transaction** → Stock Entry (Material Transfer) - Only if Adjustment Needed

**When:** When `transaction_status = "Completed"` and `operation_type = "CycleCount"` and `discrepancy != 0`

**Stock Entry Type:** `Material Transfer` or `Material Receipt` / `Material Issue`

**Purpose:** Adjust inventory when cycle count finds discrepancies

**Stock Entry Details:**
- Only create Stock Entry if there's a **discrepancy** (actual count ≠ expected count)
- **Positive discrepancy** (more found): Material Receipt
- **Negative discrepancy** (less found): Material Issue

---

## Transaction Status Flow

```
Draft → Submitted → In Progress → Partial → Completed
                                              ↓
                                    Send to ERPNext
                                    (Stock Entry)
```

## When to Send to ERPNext

### ✅ **Send When:**
- `transaction_status = "Completed"`
- `completion_progress = 100`
- All items in `tabWmsTransactionDetail` have `assignment_status = "Completed"`

### ❌ **Don't Send When:**
- `transaction_status` is "Draft", "Submitted", "In Progress", or "Partial"
- `completion_progress < 100`
- Items still have `assignment_status = "Pending"` or `"Assigned"`

## Implementation Logic

### Query for Completed Transactions Ready to Sync

```sql
SELECT 
    t.title,
    t.operation_type,
    t.transaction_status,
    t.completion_progress,
    t.reference_doc,
    t.reference_doc_type,
    t.source_warehouse,
    t.target_warehouse,
    t.transaction_date
FROM tabWmsTransaction t
WHERE t.transaction_status = 'Completed'
  AND t.completion_progress = 100
  AND NOT EXISTS (
      SELECT 1 
      FROM tabWmsTransactionDetail d 
      WHERE d.parent_title = t.title 
        AND d.assignment_status != 'Completed'
  )
  AND NOT EXISTS (
      SELECT 1 
      FROM tabErpnextSyncLog s 
      WHERE s.wms_transaction_title = t.title 
        AND s.sync_status = 'Success'
  )
ORDER BY t.transaction_date ASC;
```

### Get Transaction Details for Stock Entry

```sql
SELECT 
    item_code,
    item_name,
    qty,
    uom,
    container_id,
    source_bin,
    target_bin,
    actual_qty_counted,
    discrepancy
FROM tabWmsTransactionDetail
WHERE parent_title = @transaction_title
  AND assignment_status = 'Completed'
ORDER BY item_code;
```

## Stock Entry Mapping by Operation Type

| WMS Transaction | ERPNext Stock Entry Type | Source | Target | When to Send |
|----------------|-------------------------|--------|--------|--------------|
| **Receiving** | Material Receipt | `null` (Supplier) | `target_warehouse` | When completed |
| **Putaway** | Material Transfer | `source_warehouse` + `source_bin` | `target_warehouse` + `target_bin` | When completed |
| **Picking** | Material Transfer | `source_warehouse` + `source_bin` | `target_warehouse` + `target_bin` | When completed (optional) |
| **Cycle Count** | Material Receipt/Issue | `source_warehouse` | `target_warehouse` | Only if discrepancy exists |

## Recommended Approach

### Priority 1: Receiving Transaction ✅
**Most Important** - This creates inventory in ERPNext when items are received.

### Priority 2: Putaway Transaction ✅
**Important** - This updates bin locations in ERPNext for accurate inventory tracking.

### Priority 3: Picking Transaction ⚠️
**Optional** - Only if your workflow requires tracking items in staging area.

### Priority 4: Cycle Count Transaction ⚠️
**Only if needed** - Only send if there are discrepancies to adjust.

## Sync Status Tracking

Create a sync log table to track which transactions have been sent:

```sql
CREATE TABLE IF NOT EXISTS tabErpnextSyncLog (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  wms_transaction_title VARCHAR(100) NOT NULL,
  stock_entry_name VARCHAR(100) NULL,
  sync_status VARCHAR(50) NOT NULL, -- 'Pending', 'Success', 'Failed'
  error_message TEXT NULL,
  synced_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_transaction (wms_transaction_title),
  INDEX idx_status (sync_status)
);
```

## Summary

**Send to ERPNext as Stock Entry:**
1. ✅ **Receiving Transaction** (when completed) → Material Receipt
2. ✅ **Putaway Transaction** (when completed) → Material Transfer
3. ⚠️ **Picking Transaction** (when completed) → Material Transfer (optional)
4. ⚠️ **Cycle Count Transaction** (when completed with discrepancy) → Material Receipt/Issue

**Key Condition:** `transaction_status = "Completed"` AND all items have `assignment_status = "Completed"`

