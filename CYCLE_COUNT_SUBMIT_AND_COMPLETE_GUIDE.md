# Cycle Count Submit and Complete - Guide

## Overview

There are **two endpoints** for finalizing a cycle count session:

1. **Submit** - Marks the task as ready for review/completion
2. **Complete** - Finalizes the task and updates stock ledger

## Workflow

```
Draft → Start → In Progress → Submit → Review/Completed → Complete → Completed (with stock update)
```

## 1. Submit Cycle Count Task

### URL
```
POST /api/cycle-count/{title}/submit
```

### Example
```
POST http://localhost:3000/api/cycle-count/CC-A1-R01-L1-B1-MK6MZ1UR/submit
```

### Request Body
**No body required** - just send an empty POST request or `{}`

### Requirements
- Task status must be **"In Progress"**
- All items must be counted (`counted_items >= total_items`)

### What It Does
- Changes status from **"In Progress"** to:
  - **"Review"** if there are discrepancies (`items_with_discrepancy > 0`)
  - **"Completed"** if no discrepancies (`items_with_discrepancy = 0`)

### Response
```json
{
    "ok": true,
    "message": "Cycle Count Task submitted successfully. Status: Review",
    "data": {
        "title": "CC-A1-R01-L1-B1-MK6MZ1UR",
        "status": "Review",
        "items_with_discrepancy": 2
    }
}
```

### Errors
- **400 INVALID_STATUS**: Task is not "In Progress"
- **400 INCOMPLETE_COUNT**: Not all items have been counted
- **404 NOT_FOUND**: Task doesn't exist

---

## 2. Complete Cycle Count Task

### URL
```
POST /api/cycle-count/{title}/complete
```

### Example
```
POST http://localhost:3000/api/cycle-count/CC-A1-R01-L1-B1-MK6MZ1UR/complete
```

### Request Body
**No body required** - just send an empty POST request or `{}`

### Requirements
- Task status must be **"Review"** or **"In Progress"** (or any status except "Completed")
- Task must exist

### What It Does
1. Updates task status to **"Completed"**
2. Unfreezes stock if it was frozen
3. **Updates stock ledger** if there are discrepancies:
   - For each line with `discrepancy != 0`:
     - Updates `tabStockLedger.qty` by adding the discrepancy
     - Creates a record in `tabStockTransaction` for audit trail
4. Commits all changes in a transaction

### Response
```json
{
    "ok": true,
    "message": "Cycle Count Task completed successfully",
    "data": {
        "title": "CC-A1-R01-L1-B1-MK6MZ1UR",
        "status": "Completed",
        "stock_updated": true,
        "items_adjusted": 2
    }
}
```

### Errors
- **400 ALREADY_COMPLETED**: Task is already completed
- **404 NOT_FOUND**: Task doesn't exist
- **500 DATABASE_ERROR**: Failed to update stock

---

## Complete Workflow Example

### Step 1: Start the Task
```
POST /api/cycle-count/CC-A1-R01-L1-B1-MK6MZ1UR/start
Body: { "started_by": "USER-001" }
```
Status: `Draft` → `In Progress`

### Step 2: Submit Count Lines (Multiple Times)
```
POST /api/cycle-count/CC-A1-R01-L1-B1-MK6MZ1UR/count
Body: {
    "counted_by": "USER-001",
    "lines": [
        {
            "item_code": "SKU-001",
            "bin_location": "A1-R01-L1-B1",
            "carton_id": "CARTON-001",
            "actual_qty": 48.00
        }
    ]
}
```
Status: Still `In Progress` (until all items counted)

### Step 3: Submit the Task
```
POST /api/cycle-count/CC-A1-R01-L1-B1-MK6MZ1UR/submit
Body: {}
```
Status: `In Progress` → `Review` (if discrepancies) or `Completed` (if no discrepancies)

### Step 4: Complete the Task (Finalize)
```
POST /api/cycle-count/CC-A1-R01-L1-B1-MK6MZ1UR/complete
Body: {}
```
Status: `Review` → `Completed` (with stock updates)

---

## Postman Examples

### Submit Request
```http
POST http://localhost:3000/api/cycle-count/CC-A1-R01-L1-B1-MK6MZ1UR/submit
Authorization: Bearer {your-token}
Content-Type: application/json

{}
```

### Complete Request
```http
POST http://localhost:3000/api/cycle-count/CC-A1-R01-L1-B1-MK6MZ1UR/complete
Authorization: Bearer {your-token}
Content-Type: application/json

{}
```

---

## Key Differences

| Feature | Submit | Complete |
|---------|--------|----------|
| **Status Change** | In Progress → Review/Completed | Review → Completed |
| **Stock Update** | ❌ No | ✅ Yes (if discrepancies) |
| **Requires All Items Counted** | ✅ Yes | ❌ No |
| **Can Be Called Multiple Times** | ❌ No (status changes) | ❌ No (already completed) |
| **Use Case** | Mark task as ready for review | Finalize and update inventory |

---

## Notes

1. **Submit** is typically called when all counting is done and you want to mark it ready for review
2. **Complete** is called after review/approval to finalize and update stock
3. If there are no discrepancies, **Submit** will set status to "Completed" directly
4. **Complete** will update the stock ledger automatically for items with discrepancies
5. Both endpoints use transactions to ensure data consistency

