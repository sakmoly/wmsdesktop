# Why WMS Stock Balance Was Not Updating After ASN Putaway + Snapshot

## What you saw

- You received an ASN, did putaway, and called **push_wms_snapshot** (`POST .../api/method/printechs_wms.api.offline_sync.push_wms_snapshot`).
- **WMS Stock Balance** in ERPNext did not show the new stock (or only showed older rows with “Last Updated On” from a previous run).

## Root cause

The snapshot payload is built on the **desktop** from its **local WMS database** (MySQL: `tabCartonStock`, `tabStockTransaction`, `tabCarton`). ERPNext then creates/updates **WMS Stock Balance** (and ledger/cartons) from that payload.

When you complete putaway from the **Putaway Task** screen:

1. The desktop calls the **WMS server API** (`/api/putaway/complete`) to complete the task.
2. The desktop then triggered a **fire‑and‑forget** snapshot push to ERPNext.
3. The **desktop’s local DB was never updated** in this flow: no `tabCartonStock` or `tabStockTransaction` rows were written for this putaway (that only happens when a **WMS Transaction** is saved as Completed via `WmsTransactionDataService`, which is a different flow).
4. So the snapshot sent to ERPNext had **no new putaway data** (empty or stale `carton_stock` / `stock_transactions`), and **WMS Stock Balance** did not change.

So the issue was **not** the ERPNext API or the `push_wms_snapshot` handler; it was that the **desktop was sending a snapshot that did not contain the putaway you had just completed**.

## Fix applied (desktop)

1. **Apply putaway to local DB after API success**  
   After `PutawayApiService.CompletePutawayAsync` succeeds, the desktop now:
   - Reads the completed putaway task from `tabPutawayTask` / `tabPutawayLine`.
   - Calls **`StockLedgerService.ApplyPutawayTaskToLocalStockAsync`** to write the putaway into the local WMS DB (`tabCartonStock`, `tabStockTransaction`, and bin-level ledger if used).

2. **Then push snapshot (awaited)**  
   After applying to local stock, the desktop **awaits** **`WmsSnapshotDataService.BuildAndPushSnapshotAsync`** (no longer fire‑and‑forget for this flow). So the snapshot that is sent to ERPNext **includes the new putaway** and ERPNext can update **WMS Stock Balance** correctly.

## What to do on your side

- **Desktop:** Deploy the updated desktop (with `ApplyPutawayTaskToLocalStockAsync` and the updated Putaway Task complete flow). No ERPNext code change is required for this fix.
- **ERPNext:** Ensure `push_wms_snapshot` is the version that:
  - Uses **warehouse name** (e.g. `"Main Warehouse - MAATC"`) in `carton_stock` and does not expect warehouse code (e.g. `WH-MAIN`) for the Warehouse link.
  - Resolves **WMS Bin Location** and **Carton** (Link vs Data) as in `offline_sync_push_wms_snapshot_UPDATED.py`.

## If WMS Stock Balance still doesn’t update

**Event Log empty:** If WMS Integration Event Log has no rows, the request never reached ERPNext. The desktop now falls back to ERPNext API URL + API Key from Settings when no "Offline Sync" Push Endpoint is set; set those or add the push endpoint. Failed snapshot push after putaway shows a warning in the dialog.

Check:

1. **Payload content**  
   In ERPNext, check **WMS Integration Event Log** for the `event_uuid` of the push: confirm `payload_json` contains non‑empty `carton_stock` (and/or `stock_transactions`) with the expected items and bins.

2. **Errors in response**  
   The API returns `processed` and `errors`. If `errors` is non‑empty, one of the `carton_stock` or `stock_transactions` rows may be failing (e.g. bin resolution, carton link, or warehouse). Fix those so the balance rows can be created/updated.

3. **Idempotency**  
   If the same `event_uuid` was already processed with status **Success**, the handler skips processing and returns zeros. Use a new snapshot (new `event_uuid`) for each push.

4. **Desktop DB**  
   After putaway complete, confirm in the desktop DB that `tabCartonStock` (and optionally `tabStockTransaction`) has new rows for the putaway task so the next snapshot is built with that data.
