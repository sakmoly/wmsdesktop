# Cycle Count Completion Process & ERP Sync - Complete Guide

## 📋 Overview

This document explains the complete cycle count completion process, stock update mechanism, and ERP sync options (single task vs consolidated batch).

---

## 🔄 Cycle Count Completion Process

### Current Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Task Creation & Counting                            │
├─────────────────────────────────────────────────────────────┤
│ 1. Create Cycle Count Task (Desktop App)                     │
│    - Status: "Draft"                                         │
│    - Title: CC-A1-R01-L1-B1-MK6KXT                          │
│                                                              │
│ 2. Start Task (Desktop App)                                 │
│    - POST /api/cycle-count/:title/start                     │
│    - Status: "In Progress"                                   │
│                                                              │
│ 3. Multiple Users Scan Items (Mobile App)                    │
│    - User A scans items → POST /api/cycle-count/:title/count│
│    - User B scans items → POST /api/cycle-count/:title/count│
│    - User C scans items → POST /api/cycle-count/:title/count│
│    - Each scan updates tabCycleCountLine with actual_qty     │
│    - Each scan updates task statistics (counted_items)       │
│    - Items are validated against master data (tabItem)       │
│    - Barcode auto-sync if item found by item_code            │
│                                                              │
│ 4. Submit Task (Desktop App)                                │
│    - POST /api/cycle-count/:title/submit                    │
│    - Status: "Review" (if discrepancies) OR "Completed"      │
│    - If status = "Completed" (no discrepancies):            │
│      ✅ Stock is updated immediately                         │
│      ✅ tabItem.stock_qty is updated                         │
│                                                              │
│ 5. Complete Task (Desktop App) - For "Review" status        │
│    - POST /api/cycle-count/:title/complete                  │
│    - Status: "Completed"                                     │
│    - ✅ Stock is updated immediately                         │
│    - ✅ tabItem.stock_qty is updated                         │
│    - ✅ Stock transactions are logged                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Stock Update Process (Automatic on Completion)

### What Happens When a Cycle Count is Completed?

#### 1. **Stock Ledger Update** (`tabStockLedger`)

- **Updated for each item with discrepancy:**
  - Items with `expected_qty > 0` and `discrepancy != 0` (existing stock with variance)
  - Items with `expected_qty = 0` and `actual_qty > 0` (opening stock - new items)

- **Calculation:**
  ```sql
  new_qty = current_qty + discrepancy
  discrepancy = actual_qty - expected_qty
  ```

- **Example:**
  - Current stock: 100
  - Expected qty: 100
  - Actual qty: 105
  - Discrepancy: +5
  - New stock: 105

#### 2. **Stock Transaction Log** (`tabStockTransaction`)

- Creates audit trail for each stock adjustment
- Records:
  - Transaction date/time
  - Item code, warehouse, bin location
  - Quantity change (discrepancy)
  - Quantity before/after
  - Counted by (user)
  - Reference document (cycle count task title)

#### 3. **Item Master Stock Update** (`tabItem.stock_qty`) ⭐ NEW

- **Updated immediately after cycle count completion**
- Calculates total stock from all warehouses/bins:
  ```sql
  UPDATE tabItem
  SET stock_qty = (
    SELECT COALESCE(SUM(qty), 0)
    FROM tabStockLedger 
    WHERE item_code = tabItem.code
  )
  ```
- **Result:** Stock quantities are immediately visible in the desktop app

#### 4. **Desktop App Stock Refresh**

- `tabItem.stock_qty` is updated automatically, so stock is visible immediately
- Stock Ledger view can be manually refreshed if open
- Items list will show updated stock quantities on next refresh

---

## 🌐 ERP Sync Process

### Option 1: Single Task Sync (Individual)

**Endpoint:** `POST /api/cycle-count/:title/sync-to-erp`

**Use Case:**
- Sync each completed cycle count task individually
- Each task creates a separate ERP transaction
- Better for real-time sync requirements

**Request:**
```bash
POST http://localhost:3000/api/cycle-count/CC-A1-R01-L1-B1-MK6KXT/sync-to-erp
Authorization: Bearer <token>
```

**Response:**
```json
{
  "ok": true,
  "message": "Cycle Count Task synced to ERP successfully",
  "data": {
    "title": "CC-A1-R01-L1-B1-MK6KXT",
    "synced": true,
    "items_count": 3,
    "payload": {
      "transaction_type": "CYCLE_COUNT_ADJUSTMENT",
      "wms_reference": "CC-A1-R01-L1-B1-MK6KXT",
      "warehouse": "WH-MAIN",
      "count_date": "2026-01-09",
      "created_by": "USER-150526",
      "adjustments": [
        {
          "item_code": "SKU-001",
          "bin_location": "A1-R01-L1-B1",
          "expected_qty": 0,
          "actual_qty": 48,
          "adjustment_qty": 48,
          "counted_by": "USER-001",
          "counted_on": "2026-01-09T11:40:43.000Z"
        },
        {
          "item_code": "SKU-HAT-301-RED-OS",
          "bin_location": "A1-R01-L1-B1",
          "expected_qty": 0,
          "actual_qty": 1,
          "adjustment_qty": 1,
          "counted_by": "USER-150526",
          "counted_on": "2026-01-09T11:42:58.000Z"
        }
      ]
    }
  }
}
```

---

### Option 2: Consolidated Batch Sync (Recommended for Multiple Tasks)

**Endpoint:** `POST /api/cycle-count/sync-to-erp`

**Use Case:**
- Sync multiple completed cycle count tasks in a single ERP transaction
- Reduces ERP API calls
- Better for batch processing (e.g., end-of-day sync)
- Consolidates multiple adjustments into one transaction

**Request:**
```bash
POST http://localhost:3000/api/cycle-count/sync-to-erp
Authorization: Bearer <token>
Content-Type: application/json

{
  "task_titles": ["CC-A1-R01-L1-B1-MK6KXT", "CC-A1-R01-L1-B1-MK6KXU"],  // Optional: specific tasks
  "warehouse": "WH-MAIN",  // Optional: filter by warehouse
  "from_date": "2026-01-01",  // Optional: filter by date range
  "to_date": "2026-01-31"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Successfully synced 2 Cycle Count Task(s) to ERP in a consolidated transaction",
  "data": {
    "tasks_count": 2,
    "items_count": 5,
    "synced": true,
    "payload": {
      "transaction_type": "CYCLE_COUNT_BATCH_ADJUSTMENT",
      "batch_date": "2026-01-09T12:00:00.000Z",
      "tasks": [
        {
          "wms_reference": "CC-A1-R01-L1-B1-MK6KXT",
          "warehouse": "WH-MAIN",
          "count_date": "2026-01-09",
          "adjustments": [
            {
              "item_code": "SKU-001",
              "bin_location": "A1-R01-L1-B1",
              "expected_qty": 0,
              "actual_qty": 48,
              "adjustment_qty": 48,
              "counted_by": "USER-001",
              "counted_on": "2026-01-09T11:40:43.000Z"
            }
          ]
        },
        {
          "wms_reference": "CC-A1-R01-L1-B1-MK6KXU",
          "warehouse": "WH-MAIN",
          "count_date": "2026-01-09",
          "adjustments": [
            {
              "item_code": "SKU-002",
              "bin_location": "A1-R01-L1-B2",
              "expected_qty": 10,
              "actual_qty": 12,
              "adjustment_qty": 2,
              "counted_by": "USER-002",
              "counted_on": "2026-01-09T11:45:00.000Z"
            }
          ]
        }
      ],
      "summary": {
        "total_tasks": 2,
        "total_adjustments": 5,
        "warehouses": ["WH-MAIN"]
      }
    }
  }
}
```

---

## 🤔 Which ERP Sync Option to Use?

### Use Single Task Sync When:
- ✅ Real-time sync is required (immediate ERP updates)
- ✅ Each cycle count task must be a separate ERP transaction
- ✅ You need to track individual task sync status
- ✅ ERP requires separate transactions for audit purposes

### Use Consolidated Batch Sync When:
- ✅ Batch processing is acceptable (e.g., end-of-day)
- ✅ You want to reduce ERP API calls
- ✅ Multiple tasks can be combined into one transaction
- ✅ ERP supports batch/adjustment transactions
- ✅ Better performance for large volumes

**Recommendation:** Use consolidated batch sync for better performance and fewer ERP API calls, unless real-time sync is a business requirement.

---

## 📝 Implementation Status

### ✅ Completed Features

1. **Stock Update on Completion:**
   - ✅ `tabStockLedger` updated automatically
   - ✅ `tabStockTransaction` logged for audit
   - ✅ `tabItem.stock_qty` updated immediately ⭐ NEW

2. **ERP Sync Endpoints:**
   - ✅ Single task sync endpoint (`POST /api/cycle-count/:title/sync-to-erp`)
   - ✅ Consolidated batch sync endpoint (`POST /api/cycle-count/sync-to-erp`)

3. **Item Validation:**
   - ✅ Items validated against master data (`tabItem`)
   - ✅ Barcode auto-sync when item found by item_code

### 🔜 TODO (ERP Integration)

1. **Implement Actual ERP API Call:**
   - Replace TODO comments with actual ERP API integration
   - Configure ERP API URL and authentication
   - Handle ERP API responses and errors

2. **Sync Status Tracking (Optional):**
   - Add `sync_status` and `synced_at` fields to `tabCycleCountTask`
   - Mark tasks as synced after successful ERP sync
   - Prevent duplicate syncs

3. **Error Handling:**
   - Retry logic for failed ERP syncs
   - Queue for failed syncs (e.g., ERP API down)
   - Notification system for sync failures

---

## 🧪 Testing

### Test Stock Update After Completion

```bash
# 1. Complete a cycle count task
POST http://localhost:3000/api/cycle-count/CC-A1-R01-L1-B1-MK6KXT/complete
Authorization: Bearer <token>

# 2. Verify stock ledger updated
SELECT * FROM tabStockLedger WHERE last_transaction_ref = 'CC-A1-R01-L1-B1-MK6KXT';

# 3. Verify tabItem.stock_qty updated
SELECT code, name, stock_qty FROM tabItem WHERE code IN (
  SELECT DISTINCT item_code FROM tabCycleCountLine 
  WHERE parent_title = 'CC-A1-R01-L1-B1-MK6KXT'
);
```

### Test ERP Sync (Single Task)

```bash
POST http://localhost:3000/api/cycle-count/CC-A1-R01-L1-B1-MK6KXT/sync-to-erp
Authorization: Bearer <token>
```

### Test ERP Sync (Consolidated Batch)

```bash
POST http://localhost:3000/api/cycle-count/sync-to-erp
Authorization: Bearer <token>
Content-Type: application/json

{
  "warehouse": "WH-MAIN",
  "from_date": "2026-01-01",
  "to_date": "2026-01-31"
}
```

---

## 💡 Best Practices

1. **Complete tasks before syncing:**
   - Only sync "Completed" tasks to ERP
   - Ensure stock is updated first

2. **Use consolidated batch sync:**
   - Better performance for multiple tasks
   - Reduces ERP API load

3. **Monitor sync status:**
   - Check ERP sync logs regularly
   - Handle failed syncs promptly

4. **Stock visibility:**
   - `tabItem.stock_qty` is updated automatically
   - Desktop app will show updated stock immediately
   - No manual refresh needed for item stock quantities

---

## 🚀 Next Steps

1. **Restart API Server:**
   ```bash
   cd wms-api
   npm run build
   npm start
   ```

2. **Test Stock Update:**
   - Complete a cycle count task
   - Verify `tabItem.stock_qty` is updated
   - Check desktop app shows updated stock

3. **Implement ERP Integration:**
   - Replace TODO comments with actual ERP API calls
   - Test single task sync
   - Test consolidated batch sync

4. **Optional Enhancements:**
   - Add sync status tracking
   - Implement retry logic
   - Add notification system

---

## 📚 Related Documentation

- [Cycle Count Opening Stock Identification](./CYCLE_COUNT_OPENING_STOCK_IDENTIFICATION.md)
- [Cycle Count Inventory Update Process](./CYCLE_COUNT_INVENTORY_UPDATE_PROCESS.md)
