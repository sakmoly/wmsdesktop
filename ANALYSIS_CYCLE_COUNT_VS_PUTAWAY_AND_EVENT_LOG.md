# Analysis: Cycle Count vs Putaway – Stock Balance & Event Log

**Purpose:** Explain why Stock Balance updates for cycle count but not for putaway, why Event Log is empty in both cases, and whether the desktop “Transaction History” should be sent to ERPNext. No code changes in this document – analysis only.

---

## 1. How Stock Balance is created/updated on ERPNext (same for both flows)

ERPNext has a single API that receives the snapshot and updates both **WMS Stock Balance** and **WMS Stock Ledger Entry** (and optionally **WMS Integration Event Log**):

- **API:** `push_wms_snapshot` (e.g. `printechs_wms.api.offline_sync.push_wms_snapshot`).
- **Payload:** JSON with:
  - `stock_transactions` – list of movements (item, bin, qty_change, qty_after, etc.).
  - `carton_stock` – list of current balances (item, warehouse, bin_location, carton_id, qty).
  - `cartons` – optional carton master rows.

**How ERPNext uses it:**

1. **WMS Stock Ledger Entry:** One row per `stock_transactions` entry (transaction log).
2. **WMS Stock Balance:** One row per `carton_stock` entry (current balance by item/warehouse/location/carton).  
   If `carton_stock` is empty but `stock_transactions` is not, the handler can **derive** balance rows from each transaction (target_bin, item_code, qty_after) and upsert those into WMS Stock Balance.

So **Stock Balance on ERPNext is driven only by what is inside the snapshot payload** (either `carton_stock` or derived from `stock_transactions`). There is no separate “cycle count only” path; the same handler serves both cycle count and putaway.

---

## 2. Where the desktop gets the snapshot data (same for both flows)

The snapshot is **always** built from the **desktop’s local MySQL**:

| Snapshot section       | Source table(s)       | What is read |
|------------------------|-----------------------|--------------|
| `stock_transactions`   | `tabStockTransaction` | Rows from this table (optionally filtered by `reference_doc`). |
| `carton_stock`         | `tabCartonStock`      | All rows with `qty > 0` (no filter by reference). |
| `cartons`              | `tabCarton`           | All rows (no filter). |

So:

- **WMS Stock Balance on ERPNext** is updated from whatever is in **`tabCartonStock`** (and, if that’s empty, from derived rows from `stock_transactions`).
- **WMS Stock Ledger Entry** is updated from **`tabStockTransaction`**.
- No other desktop table is used for this payload (in particular, not the “Transaction History” from the API – see section 5).

---

## 3. Cycle Count flow – why “all transactions” (and Stock Balance) update

**Sequence:**

1. User clicks **Push to ERPNext** on a Cycle Count task.
2. **sync_task_capture_only** is called → ERPNext creates/updates **WMS Cycle Count Task**, **Batch**, **Results** (cycle count “transactions” in your words).
3. **ApplyCycleCountFromTaskAsync** runs on the desktop:
   - Reads the task’s lines (from in-memory `CycleCountTask.Lines`).
   - For each line with discrepancy, calls **UpdateStockAsync**.
   - That writes to **local** `tabStockTransaction` (and, in carton mode, to **tabCartonStock** / tabStockLedger), with `reference_doc` = cycle count task title.
4. **BuildAndPushSnapshotWithResponseAsync(settings, stockTransactionReferenceDoc: CycleCountTask.Title)**:
   - **stock_transactions:** reads from `tabStockTransaction` **filtered by** `reference_doc = task title` (only this cycle count’s rows).
   - **carton_stock:** reads from **tabCartonStock with no filter** – i.e. **all** current balances in the desktop DB, including the ones just written in step 3.
5. That payload is sent to **push_wms_snapshot** on ERPNext.
6. ERPNext:
   - Writes **WMS Stock Ledger Entry** from `stock_transactions`.
   - Writes **WMS Stock Balance** from `carton_stock` (and/or from `stock_transactions` if `carton_stock` is empty).
   - Calls **_log_event(...)** to write **WMS Integration Event Log** (if the DocType/table exists).

So for cycle count:

- **Stock Balance updates** because:
  - Step 3 has just updated **tabCartonStock** (and tabStockTransaction) on the desktop.
  - Step 4 sends **all of tabCartonStock** in `carton_stock`, so ERPNext receives the updated balances and upserts WMS Stock Balance.
- “All transactions” (Task/Batch/Results + Ledger + Balance) update because both the cycle count API and the snapshot API are called and succeed. Only Event Log may still not show rows (see section 4).

---

## 4. Putaway flow – why Stock Balance (and Event Log) may not update

**Sequence:**

1. User completes putaway → **PutawayApiService.CompletePutawayAsync** (HTTP call to **WMS server**).
2. **ApplyPutawayTaskToLocalStockAsync(settings, PutawayTask.Title, warehouse)** on the desktop:
   - Reads **tabPutawayTask** and **tabPutawayLine** from the **desktop’s local MySQL** (same DB as `tabCartonStock` / `tabStockTransaction`).
   - For each putaway line, calls **UpdateStockAsync** → writes to **local** `tabStockTransaction` and (in carton mode) **tabCartonStock**.
3. **BuildSnapshotAsync(settings)** with **no** reference doc:
   - **stock_transactions:** last 5000 rows from `tabStockTransaction` (no filter).
   - **carton_stock:** all rows from `tabCartonStock` with `qty > 0` (no filter).
4. Snapshot is sent to **push_wms_snapshot** (same API as cycle count).

So the **mechanism** for updating Stock Balance is the same: ERPNext updates from `carton_stock` (and/or from `stock_transactions`). The difference is **whether the desktop’s local DB actually has putaway data** when the snapshot is built.

**Why putaway might not update Stock Balance:**

1. **ApplyPutawayTaskToLocalStockAsync doesn’t write (or fails):**
   - Puts data only into the **desktop’s** MySQL (`tabPutawayTask` / `tabPutawayLine` → `tabStockTransaction` / `tabCartonStock`).
   - If **tabPutawayLine** is empty for that task (e.g. putaway task lives only on the server and was never synced to the desktop, or lines weren’t saved locally), there is nothing to apply → no new rows in `tabCartonStock` / `tabStockTransaction` → snapshot has no new putaway data → ERPNext doesn’t get new balances.
2. **Different DB / machine:**
   - If “complete putaway” is done on a client that uses a **different** MySQL (or no local DB) than the one that runs the snapshot, then the snapshot might be built from a DB that never received the putaway (e.g. only the server DB was updated by the putaway API).
3. **Snapshot not reaching ERPNext:**
   - If the HTTP call to `push_wms_snapshot` fails (wrong URL, auth, or network) for the putaway flow, ERPNext never receives the payload → no Stock Balance update and no Event Log row for that push.

So: **Stock Balance doesn’t update for putaway** when either (a) the snapshot doesn’t reach ERPNext, or (b) the snapshot reaches ERPNext but the payload has no (or insufficient) putaway data because the **desktop’s** `tabCartonStock` / `tabStockTransaction` didn’t get the putaway (apply step didn’t run, failed, or had no data to apply).

---

## 5. Why Event Log is empty (both cycle count and putaway)

The same handler **push_wms_snapshot** is used for both flows. It calls **_log_event(...)** to create/update **WMS Integration Event Log**:

- It only writes if the **DocType “WMS Integration Event Log”** exists and the corresponding **table** exists.
- If the DocType or table is missing, `_log_event` returns without creating any row (and without raising an error).

So:

- **If Event Log is empty for both cycle count and putaway**, the most likely reason is that **WMS Integration Event Log** (doctype and/or table) **does not exist** on your ERPNext site, so every call to `_log_event` does nothing. In that case it’s normal that “all [other] transactions” (Task, Batch, Ledger, Stock Balance) update for cycle count, but Event Log never does.
- A less likely case is that the **putaway** snapshot never reaches ERPNext (e.g. wrong URL or auth only for that flow), so no Event Log row is created for putaway; but then Stock Balance wouldn’t update for putaway either.

So in practice: **Event Log empty in both cases** → first check that the **WMS Integration Event Log** DocType (and table) exist in ERPNext. The update logic for Stock Balance and Ledger is the same for cycle count and putaway; the difference is where the data comes from on the desktop (section 3 vs 4) and whether the putaway snapshot is sent and contains data.

---

## 6. Transaction History in the desktop – is it used for ERPNext?

**What “Transaction History” is in the desktop:**

- It is **not** a table in the desktop MySQL.
- It is data **fetched from the WMS server API** (e.g. GET `/api/transaction-history` or `/transaction-history`) using **API Endpoint URL** and **API Key**.
- It is used for **display and export** (e.g. in Transaction History view and CSV export).

**What is sent to ERPNext:**

- **push_wms_snapshot** payload is built **only** from:
  - **tabStockTransaction**
  - **tabCartonStock**
  - **tabCarton**
- So **nothing** is sent to ERPNext from the “Transaction History” API response. The snapshot is **not** “from the transaction history table”; it is from the **local** `tabStockTransaction` and `tabCartonStock`.

**Is it “required” to send from Transaction History?**

- **Current design:** No. ERPNext is updated from the **local DB state** (tabStockTransaction / tabCartonStock). That state is filled by:
  - **Cycle count:** ApplyCycleCountFromTaskAsync (from task lines).
  - **Putaway:** ApplyPutawayTaskToLocalStockAsync (from tabPutawayLine / tabPutawayTask).
  - Other flows (e.g. receiving, picking) that call UpdateStockAsync and then push snapshot.
- **If** you wanted ERPNext to reflect the **server’s** transaction history instead of (or in addition to) the desktop’s local DB, you would need a **different** design: e.g. desktop (or server) calls the transaction-history API and then posts that to ERPNext, or the server pushes to ERPNext. That is not how the current snapshot works.

So: the existing **Transaction History** in the app is **not** the source for what we send to ERPNext. The source is **tabStockTransaction** and **tabCartonStock** only.

---

## 7. Summary table

| Aspect | Cycle count | Putaway |
|--------|-------------|--------|
| **Who writes to desktop DB before snapshot?** | ApplyCycleCountFromTaskAsync (from in-memory task.Lines) | ApplyPutawayTaskToLocalStockAsync (from tabPutawayLine / tabPutawayTask) |
| **Snapshot stock_transactions** | From tabStockTransaction **filtered** by reference_doc = task title | From tabStockTransaction **unfiltered** (last 5000) |
| **Snapshot carton_stock** | From tabCartonStock **unfiltered** (all qty > 0) | Same |
| **ERPNext API** | Same: push_wms_snapshot | Same |
| **How Stock Balance is updated on ERPNext** | From `carton_stock` (and/or derived from `stock_transactions`) | Same |
| **Why Stock Balance updates for cycle count** | tabCartonStock was just updated in the same process; full tabCartonStock is sent | — |
| **Why Stock Balance may not update for putaway** | — | Either snapshot not sent, or local tabCartonStock/tabStockTransaction not updated (apply failed / no putaway lines in local DB / different DB) |
| **Event Log** | Same _log_event() call | Same; if Event Log is always empty, DocType/table likely missing on ERPNext |

---

## 8. Recommended checks (no implementation here)

1. **Event Log:** In ERPNext, confirm that the **WMS Integration Event Log** DocType (and its table) exist. If not, create or install them so _log_event can write.
2. **Putaway data on desktop:** After completing a putaway, check in the **desktop’s** MySQL:
   - **tabPutawayLine** has rows for that putaway task.
   - **tabCartonStock** (and optionally **tabStockTransaction**) get new/updated rows after ApplyPutawayTaskToLocalStockAsync.
   If tabPutawayLine is empty for that task on the desktop, fix how putaway tasks/lines are synced to the desktop DB.
3. **Snapshot after putaway:** Confirm the putaway flow uses the **same** ERPNext URL/auth as the cycle count flow (so the snapshot really hits push_wms_snapshot), and check the “Snapshot sent: X stock rows” message after putaway. If X is 0, the issue is on the desktop (no data in tabCartonStock).
4. **Transaction History:** Decide whether ERPNext should reflect (a) only the desktop’s local DB (current design: tabStockTransaction / tabCartonStock) or (b) the server’s transaction history. If (b), that would require a separate integration (e.g. server or desktop sending transaction-history data to ERPNext), not the current snapshot payload.

### 8.1 When Stock Balance only updates (no new row for putaway bin; quantities still show cycle count)

If **existing** WMS Stock Balance rows are updated but **no new row** appears for the putaway bin (e.g. A1-R02-L3-B2) and **quantities** still match cycle count:

1. **Confirm putaway bin is in the snapshot payload**
   - Run **Run ASN sync test** with "Push snapshot at end" enabled. Open the **Error Log** and search for `[Putaway→StockBalance]`. The trace now logs **every** `carton_stock` row (item + bin). Verify that a row with `bin=A1-R02-L3-B2` (or your putaway bin) is present. If it is missing, the desktop's `tabCartonStock` has no row for that bin; check that **ApplyPutawayTaskToLocalStockAsync** ran and that it writes/updates `tabCartonStock` for the putaway target bin (carton mode).

2. **On ERPNext – response errors**
   - The push response can include an `errors` array. In the trace (or in Settings after "Push WMS Snapshot"), check if any error is reported for a specific row (e.g. carton link, bin resolution). Fix the cause (e.g. create/link carton, ensure WMS Bin Location exists).

3. **On ERPNext – WMS Bin Location**
   - WMS Stock Balance is keyed by (company, warehouse, item, **location**, carton). **location** is the resolved **WMS Bin Location** name. The handler typically resolves `bin_location` from the payload via something like `_resolve_bin_location_name` (create or get WMS Bin Location). If that resolution fails or returns a different name, a new balance row may not be created. In ERPNext, confirm that a **WMS Bin Location** with name matching the putaway bin (e.g. A1-R02-L3-B2) exists (or is created by the snapshot API).

4. **List view / filters**
   - Ensure the WMS Stock Balance list is not filtered in a way that hides the putaway bin (e.g. filter by Bin Location or by a tag).

---

## 9. Run ASN sync test – Putaway → Stock Balance trace (implemented)

To trace why putaway stock balance is not updating in ERPNext:

1. In the desktop app, open **Settings** → **Sync** (or the tab where **Run ASN sync test** is).
2. Click **Run ASN sync test**.
3. The test runs ASN sync, then a **Putaway → Stock Balance trace** for the first ASN (e.g. ASN-0001). The trace:
   - Finds putaway tasks in the local DB for that ASN.
   - Counts **tabPutawayLine** and **tabCartonStock** (before and after apply).
   - For the first **Completed** putaway task, runs **ApplyPutawayTaskToLocalStockAsync** (so local tabCartonStock is updated).
   - Builds the snapshot payload and logs how many **carton_stock** and **stock_transactions** would be sent (it does **not** push by default, so it does not change ERPNext).
4. Open the **app Error Log** (e.g. under the app data folder or **ErrorLogs** in the output directory). Search for lines starting with **`[Putaway→StockBalance]`**. You will see:
   - Number of putaway tasks for the ASN and their titles.
   - Putaway line counts per task.
   - **tabCartonStock** count before and after apply.
   - Snapshot payload: **carton_stock** count and **stock_transactions** count, plus up to 5 sample stock rows.

**How to interpret:**

- **Putaway tasks: 0** → No putaway tasks for this ASN in the local DB; nothing to apply; snapshot will not contain putaway stock.
- **Putaway lines: 0** → Tasks exist but no lines in **tabPutawayLine**; apply will not add rows to **tabCartonStock**.
- **tabCartonStock after apply still 0 (or same as before)** → Apply did not add rows (e.g. no completed task, or apply failed); snapshot will have no new stock rows → ERPNext WMS Stock Balance will not update from this data.
- **Snapshot payload: 0 stock rows** → ERPNext will not receive any **carton_stock**; WMS Stock Balance will not update from this run (cycle count may have updated it earlier from a different snapshot).

This document is analysis only except for section 9, which describes the implemented trace.
