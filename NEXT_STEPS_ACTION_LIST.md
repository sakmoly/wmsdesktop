# What to Do Now – Action List

Use this list to get cycle count sync and WMS Stock Balance working end-to-end.

---

## 1. ERPNext (printechs_wms app)

### 1.1 Cycle count – stop duplicates and fix carton ID
- [ ] In your ERPNext repo, open **printechs_wms/api/cycle_count_batch.py**.
- [ ] **Replace the entire** `sync_task_capture_only` function with the contents of **Wms.Desktop/cycle_count_batch_sync_task_capture_only_REPLACEMENT.py** (from this repo).
- [ ] Ensure the **result** child DocType’s **Carton ID** field is type **Data** (not Link), and mandatory if you want it required.
- [ ] Restart/reload your ERPNext app (e.g. `bench restart`).
- [ ] Test: push one cycle count task from the desktop; in ERPNext the task should show **exactly** the same number of lines as in the payload, with Carton ID filled. Push again for the same task; row count should stay the same (replace, not append).

### 1.2 Load Actual Stock Preview – no Carton ID error
- [ ] In **cycle_count_batch.py**, **replace** the `load_actual_stock_preview` function with the contents of **Wms.Desktop/cycle_count_batch_load_actual_stock_preview_UPDATED.py**.
- [ ] Ensure the **batch summary** child DocType’s **Carton ID** field is type **Data** (not Link). It can be mandatory; the updated code sets a placeholder when missing.
- [ ] Restart and test: open a cycle count batch in ERPNext and click **Load Actual Stock Preview**; it should run without “Could not find Carton ID” or “Value missing for: Carton ID”.

### 1.3 tabWMS Stock Balance – populate from snapshot
- [ ] In **printechs_wms**, open the handler for **push_wms_snapshot** (e.g. **api/offline_sync.py** or wherever it lives).
- [ ] Add or fix logic that:
  - Reads **carton_stock** from the request body.
  - For each item, inserts or updates a row in **tabWMS Stock Balance** (or the DocType that uses that table), mapping: warehouse, item_code, bin_location, carton_id/carton, qty (and reserved_qty/last_moved_on if your table has them).
  - Prefer **Data** type for carton_id if WMS carton IDs are not in the Carton master.
- [ ] Optional: for each snapshot, delete existing balance rows for that warehouse, then insert from `carton_stock` so the table is a clean copy of WMS.
- [ ] Restart and test: from the desktop, click **Settings → Sync → Push WMS Snapshot**; then in ERPNext check that **tabWMS Stock Balance** (or the WMS Stock Balance list) has rows.

**Reference:** Exact payload and mapping are in **WMS_STOCK_BALANCE_ERP_SYNC_ANALYSIS.md**.

---

## 2. WMS API (wms-api) – optional alignment

- [ ] **Done in this repo:** Cycle count push payload now **omits header `bin_location`** (same as desktop final format). Each line still has `bin_location`, `carton_id`, `counted_qty`, `uom`. No other API changes were required.
- [ ] If you use wms-api to push after submit: set env **CYCLE_COUNT_ERP_URL** and **CYCLE_COUNT_ERP_API_KEY** so the push runs. To avoid duplicates, use either **desktop “Push to ERP”** or **wms-api after submit** per task, not both.

**No changes in wms-api for:** push_wms_snapshot (desktop only), tabWMS Stock Balance (ERPNext handler).

---

## 3. WMS Desktop (this repo)

### 3.1 Settings
- [ ] **Settings → Sync → Push Endpoints:**
  - One **enabled** endpoint with type **Offline Sync**, URL = your `push_wms_snapshot` URL, API Key set.
  - One **enabled** endpoint with type **Cycle Count**, URL = your `sync_task_capture_only` URL, API Key set.
- [ ] **Company** (and default warehouse if needed) set so payloads have the right company/warehouse.

### 3.2 Avoid duplicate cycle count pushes
- [ ] Use **either** the desktop **“Push to ERP”** button **or** the wms-api auto-push after submit for a given task—not both. That way the same task is not pushed twice with different payloads.
- [ ] When you push, the payload should always be the **full** current lines for that task (desktop builds this from the open task).

### 3.3 Build and run
- [ ] Build and run the desktop app. After any stock-changing action (receive, putaway, dispatch, etc.) a WMS snapshot is pushed in the background; you can also use **Push WMS Snapshot** manually.

---

## 4. Verify end-to-end

| Step | What to do | Expected result |
|------|------------|------------------|
| 1 | In desktop: complete a cycle count task (e.g. 4 lines), then click **Push to ERP**. | Success message; ERP reference shown on task. |
| 2 | In ERPNext: open the cycle count task (by ERP ref or external ref). | **Results** table shows exactly 4 rows, same items and quantities; Carton ID filled if you use Data type. |
| 3 | In ERPNext: open the linked cycle count batch, click **Load Actual Stock Preview**. | No Carton ID error; summary and system qty load. |
| 4 | In desktop: **Settings → Sync → Push WMS Snapshot**. | Success message. |
| 5 | In ERPNext: open **WMS Stock Balance** (or query tabWMS Stock Balance). | Rows exist for the warehouse/items you pushed. |

---

## 5. If something still fails

- **Cycle count duplicates again:** Ensure the **replacement** `sync_task_capture_only` (with explicit DELETE and replace) is the one deployed; push only once per task from one place.
- **Carton ID link error:** Change the field to **Data** in the ERPNext DocType (result row and/or summary row).
- **tabWMS Stock Balance still empty:** Confirm the Offline Sync endpoint is enabled and a push ran; then check that the **push_wms_snapshot** handler in ERPNext actually writes to that table (see **WMS_STOCK_BALANCE_ERP_SYNC_ANALYSIS.md**).

Use **NEXT_STEPS_ACTION_LIST.md** as a checklist and tick off items as you go.
