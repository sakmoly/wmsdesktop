# Cycle Count: Two WMS Tasks → One ERP Transaction (Analysis / Study)

**Status: Analysis and study only. No consolidation logic is implemented in code at this time.** The wms-api batch sync (`POST /api/cycle-count/sync-to-erp`) currently sends one payload per batch but **grouped by task** (`tasks[]`), not merged by (warehouse, bin, item). This doc describes how consolidation could work when you are ready to implement.

## The issue

- **Two devices** counting the same bin (or related bins) can create **two separate** cycle count tasks in WMS (e.g. `CC-A1-R01-L2-B1-MLHXD7Q4` and `CC-A1-R01-L2-B1-XXXXX`).
- Sending **two separate** transactions to ERPNext is a problem: ERP expects **one** stock adjustment per (warehouse, bin, item), not two competing updates.

## Approach: consolidate before sending to ERP

Keep **two tasks in WMS** (no need to force a single task). When syncing to ERP, **merge** all selected completed tasks into **one** ERP transaction:

- **Key:** `(warehouse, bin_location, item_code)`
- **Rule:** For each (warehouse, bin, item), sum the **discrepancy** from every line (across all selected tasks) → that is the **net adjustment** for ERP.
- **Payload:** One list of adjustments: one row per (warehouse, bin, item) with `net_adjustment_qty`. ERP applies that list once = **one transaction**.

## How it could be implemented (wms-api) – for study

**Endpoint:** `POST /api/cycle-count/sync-to-erp` (batch sync) – exists today; consolidation by (warehouse, bin, item) is **not** in code yet.

**Request body (optional filters):**

```json
{
  "task_titles": ["CC-A1-R01-L2-B1-MLHXD7Q4", "CC-A1-R01-L2-B1-XXXXX"],
  "warehouse": "WH-MAIN",
  "from_date": "2026-01-01",
  "to_date": "2026-01-31"
}
```

- Omit `task_titles` to sync **all** completed tasks (or use `warehouse` / `from_date` / `to_date` to limit).

**Consolidation logic (proposed, not in code):**

1. Load all completed tasks (optionally filtered by `task_titles`, `warehouse`, `from_date`, `to_date`).
2. Load all discrepancy lines from those tasks.
3. **Consolidate by (warehouse, bin_location, item_code):**
   - For each key, sum `discrepancy` → `net_adjustment_qty`.
   - One record per key (last line’s `actual_qty` / `expected_qty` kept for reference; ERP uses `net_adjustment_qty`).
4. Build **one** payload for ERP with a single `adjustments[]` array.

**Response payload shape (for ERP):**

```json
{
  "transaction_type": "CYCLE_COUNT_CONSOLIDATED",
  "batch_date": "2026-02-11T...",
  "source_task_titles": ["CC-A1-R01-L2-B1-MLHXD7Q4", "CC-A1-R01-L2-B1-XXXXX"],
  "summary": {
    "total_tasks": 2,
    "total_lines_before_consolidation": 12,
    "total_adjustments_after_consolidation": 5,
    "warehouses": ["WH-MAIN"]
  },
  "adjustments": [
    {
      "warehouse": "WH-MAIN",
      "bin_location": "A1-R01-L2-B1",
      "item_code": "108226",
      "expected_qty": 10,
      "actual_qty": 8,
      "net_adjustment_qty": -2,
      "source_task_count": 2
    }
  ],
  "tasks": [ ... ]
}
```

- **adjustments:** Use this in ERP as the **single transaction** (one row per warehouse+bin+item, apply each `net_adjustment_qty` once).
- **tasks:** Per-task detail for audit only; ERP can ignore.

## How to send to ERP

1. **From desktop / Operations Console**  
   - Add a “Sync cycle count to ERP” action that calls:
   - `POST {wms-api}/api/cycle-count/sync-to-erp` with optional body `{ "from_date": "...", "to_date": "..." }` (or leave body empty to sync all completed).
   - Use the returned `payload.adjustments` (and optionally `payload.summary`) to build **one** ERP document (e.g. one Stock Reconciliation or one batch of Stock Ledger entries).

2. **From wms-api (automated)**  
   - After cycle count complete (or on a schedule), call your ERP API once with the **consolidated** payload (e.g. POST to ERPNext stock adjustment API with `payload.adjustments`).

3. **Idempotency**  
   - Use `batch_date` + `source_task_titles` (or a hash) as a unique batch id. In ERP, mark “this batch already applied” so the same sync run twice doesn’t apply twice.

## Summary

| In WMS | Sent to ERP |
|--------|-------------|
| Two (or more) tasks for same bin | One consolidated transaction |
| Many lines across tasks | One row per (warehouse, bin, item) with `net_adjustment_qty` |
| Multiple devices, multiple tasks | Single batch payload: `transaction_type: 'CYCLE_COUNT_CONSOLIDATED'`, `adjustments: [...]` |

So: **yes, two devices can create two tasks in WMS; the proposed approach is to consolidate them into one transaction (one list of net adjustments) before sending to ERP. Implementation is for later; this doc is for analysis and study.**
