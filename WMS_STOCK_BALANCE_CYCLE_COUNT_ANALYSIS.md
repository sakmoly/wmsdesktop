# WMS Stock Balance Not Updating When Sending Cycle Count – Analysis

## Flow today when you click "Push to ERPNext" (Cycle Count Task)

1. **Cycle count** is sent to ERPNext via **sync_task_capture_only** (Cycle Count endpoint).
2. **Immediately after**, the app builds a **WMS snapshot** from the **current WMS database** and sends it to **push_wms_snapshot** (Offline Sync / Snapshot endpoint).

## Why WMS Stock Balance doesn’t update

### Root cause: snapshot is built **before** cycle count is applied in the WMS DB

- **Push to ERPNext** from the Cycle Count Task screen does **not** write the cycle count results into the WMS DB (tabStockLedger / tabCartonStock / tabStockTransaction).
- Stock is updated only when a **WMS Transaction** of type Cycle Count is completed (different flow: Wms Transaction → Save → `UpdateStockAfterCycleCountAsync`).
- So when we build the snapshot right after pushing the cycle count, we read:
  - **tabCartonStock** – current rows with `qty > 0` (unchanged by the push).
  - **tabStockTransaction** – last 5000 transactions (no new cycle count rows from this push).
- The payload sent to **push_wms_snapshot** therefore still reflects the **pre–cycle count** state. ERPNext’s handler overwrites/upserts WMS Stock Balance (and Ledger) from that payload, so balances don’t reflect the cycle count you just sent.

So: **WMS Stock Balance doesn’t update** because the snapshot we send is the **old** state, not the state **after** applying the cycle count.

### Other possible contributors

| Factor | Effect |
|--------|--------|
| **Empty carton_stock** | Snapshot reads `carton_stock` from **tabCartonStock** only. In **bin-level** mode, cycle count updates **tabStockLedger** + **tabStockTransaction**, not tabCartonStock, so `carton_stock` can be empty. The ERPNext handler can derive balance from **stock_transactions**; if it doesn’t, or if that logic fails, WMS Stock Balance stays empty or stale. |
| **ERPNext handler** | WMS Stock Balance is filled only by the **push_wms_snapshot** handler (e.g. `offline_sync_push_wms_snapshot_UPDATED.py`). If that handler isn’t deployed, or doesn’t write to WMS Stock Balance (or only from `carton_stock` and never from `stock_transactions`), the table won’t update. |
| **Link validation** | If the handler fails on **location** (WMS Bin Location) or **carton** (WMS Carton) links, it can skip rows or return errors; then WMS Stock Balance may be partially updated or not at all. |

## Recommended fix (desktop): apply cycle count to WMS DB before snapshot

So that the snapshot sent to **push_wms_snapshot** reflects the **post–cycle count** state:

1. When the user clicks **Push to ERPNext** from the Cycle Count Task and **sync_task_capture_only** succeeds:
2. **Apply** the cycle count to the WMS DB (tabStockLedger and, if used, tabCartonStock; and tabStockTransaction) using the **task lines** (item, bin, discrepancy / actual qty).
3. **Then** build and push the WMS snapshot to **push_wms_snapshot**.

Result:

- Snapshot payload contains the **updated** balances and transactions.
- ERPNext’s **push_wms_snapshot** handler can correctly update **WMS Stock Balance** (and Ledger) from that payload.

## Checklist (if it still doesn’t update after the fix)

- [ ] Offline Sync push endpoint is enabled and URL is `.../push_wms_snapshot`.
- [ ] After push, success message shows “WMS snapshot (Stock Balance / Ledger) pushed to ERPNext.” (no snapshot error).
- [ ] ERPNext handler for **push_wms_snapshot** is the one that writes to **WMS Stock Balance** (and Ledger) from `carton_stock` and/or `stock_transactions`.
- [ ] On ERPNext, WMS Bin Location (and WMS Carton if used) exist or are created so link validation doesn’t drop rows.
