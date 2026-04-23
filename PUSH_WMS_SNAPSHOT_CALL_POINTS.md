# Push WMS Snapshot – Where the API Is Called

The **push_wms_snapshot** API (`POST .../printechs_wms.api.offline_sync.push_wms_snapshot`) sends current WMS stock (stock_transactions, carton_stock, cartons) to ERPNext so ERPNext stock stays in sync. This document describes **where** the snapshot is pushed after each transaction type.

---

## Summary: When Snapshot Is Pushed (Desktop)

| Transaction / action                 | Where it’s triggered | Call point |
|--------------------------------------|----------------------|------------|
| Receiving completed                  | Desktop saves WMS transaction as Completed | `WmsTransactionDataService.SaveWmsTransactionAsync` (after stock update) |
| Putaway completed (via WMS API)      | Desktop calls Putaway API complete         | `PutawayTaskDetailViewModel.CompletePutawayAsync` (after API success) |
| Putaway completed (via desktop save) | Desktop saves WMS transaction as Completed | `WmsTransactionDataService.SaveWmsTransactionAsync` (after stock update) |
| Picking completed                    | Desktop saves WMS transaction as Completed | Same as above |
| Material Request picking completed   | Desktop saves WMS transaction as Completed | Same as above |
| Cycle count completed                | Desktop saves WMS transaction as Completed | Same as above |
| Transfer In receive completed        | Desktop saves WMS transaction as Completed | Same as above |
| Transfer carton dispatch             | Desktop dispatches transfer carton         | `TransferCartonDataService.DispatchTransferCartonAsync` (after commit) |
| Manual “Push WMS Snapshot”           | User clicks button in Settings → Sync      | Settings “Push WMS Snapshot” button |

---

## 1. After WMS transaction completed (central hook)

**File:** `Services/WmsTransactionDataService.cs`  
**Method:** `SaveWmsTransactionAsync`

When a WMS transaction is saved with **status = Completed**, the service:

1. Updates stock (via `StockLedgerService.UpdateStockAfterReceivingAsync`, `UpdateStockAfterPutawayAsync`, `UpdateStockAfterPickingAsync`, `UpdateStockAfterCycleCountAsync`, `UpdateStockAfterTransferInAsync`, or `UpdateStockAfterMaterialRequestAsync`).
2. Then calls **`WmsSnapshotDataService.TryPushSnapshotAfterTransaction(settings)`** (fire-and-forget).

So **one place** covers:

- Receiving completed  
- Putaway completed (when completed by saving the transaction in desktop)  
- Picking completed  
- Material Request picking completed  
- Cycle count completed  
- Transfer In receive completed  

All of these go through `SaveWmsTransactionAsync` when the transaction is marked Completed and stock is updated.

---

## 2. After putaway completed via API

**File:** `ViewModels/PutawayTaskDetailViewModel.cs`  
**Method:** `CompletePutawayAsync`

When the user completes a putaway task from the UI:

1. Desktop calls **PutawayApiService.CompletePutawayAsync** (wms-api `POST /api/putaway/complete`).
2. The API updates stock (e.g. tabStockTransaction, tabCartonStock) on the **server** (or shared DB).
3. On **API success**, desktop calls **`WmsSnapshotDataService.TryPushSnapshotAfterTransaction(settings)`**.

So snapshot is pushed after putaway complete when the flow goes through the Putaway API.  
If desktop and wms-api use the **same MySQL** database, the snapshot built on desktop will include the putaway that the API just wrote. If they use different databases, consider adding a snapshot push inside wms-api after putaway complete as well.

---

## 3. After transfer carton dispatch

**File:** `Services/TransferCartonDataService.cs`  
**Method:** `DispatchTransferCartonAsync`

When a transfer carton is dispatched:

1. Stock is reduced and **INSERT INTO tabStockTransaction** (and related updates) run inside a transaction.
2. After **successful commit**, **`WmsSnapshotDataService.TryPushSnapshotAfterTransaction(settings)`** is called (fire-and-forget).

So every successful dispatch triggers a snapshot push.

---

## 4. Manual push (Settings)

**File:** `ViewModels/SettingsViewModel.cs`  
**Button:** “Push WMS Snapshot” in Settings → Sync tab  

The user can push at any time. This uses **`WmsSnapshotDataService.BuildAndPushSnapshotAsync`** (awaited, with success/error message).

---

## Helper: TryPushSnapshotAfterTransaction

**File:** `Services/WmsSnapshotDataService.cs`

- **`TryPushSnapshotAfterTransaction(settings)`**  
  - Runs **BuildAndPushSnapshotAsync** in a fire-and-forget task.  
  - Logs success or failure; does not throw.  
  - Used after transaction save, putaway complete, and dispatch so the main flow is not blocked.

---

## Flows that only touch wms-api (e.g. mobile)

If stock is changed **only** by wms-api (e.g. mobile app: receive lines, putaway complete, relocation, etc.) and desktop does not run the corresponding transaction save or API complete:

- **Shared DB:** A later desktop action (e.g. opening a screen that triggers a save, or manual “Push WMS Snapshot”) will push a snapshot that includes those changes.  
- **Separate DB:** To keep ERPNext in sync immediately after such actions, add a call to push_wms_snapshot (or an internal builder + push) **inside wms-api** after:
  - Putaway complete  
  - Receive line(s) / session complete  
  - Relocation commit  
  - Any other API that updates tabStockTransaction / tabCartonStock / tabCarton  

Then ERPNext will get the snapshot after each such transaction even when the change originates from the API/mobile.

---

## Snapshot payload (reminder)

The body sent to push_wms_snapshot includes:

- **event_uuid** – e.g. `SYNC-YYYYMMDD-XXXX`
- **company**, **source_system** (`WMS_DESKTOP`), **warehouse**
- **stock_transactions** – id, transaction_date, transaction_type, item_code, bin_location, target_bin, carton_id, qty_change, qty_after, notes
- **carton_stock** – warehouse, item_code, bin_location, carton_id, qty, reserved_qty, last_moved_on
- **cartons** – carton_id, status, current_bin_id, remarks  

This matches the API contract so ERPNext can align stock with WMS.
