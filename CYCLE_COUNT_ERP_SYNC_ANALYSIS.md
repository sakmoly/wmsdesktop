# Cycle Count → ERPNext (sync_task_capture_only): Analysis & Recommended Solutions

## 1. Endpoint and payload (what you have)

- **URL:** `http://printechsdammam.dyndns.org:88/api/method/printechs_wms.api.cycle_count_batch.sync_task_capture_only`
- **Method:** POST  
- **Configured in:** WMS Settings → Sync → Push Endpoints (Send to ERPNext), name "Cycle Count", Type Custom.

**Sample payload (capture-only format):**

```json
{
  "payload": {
    "company": "Mohammed Abdullah Almousa Trading Company",
    "warehouse": "Main Warehouse - MAATC",
    "warehouse_code": "WH-MAIN",
    "posting_date": "2026-02-12",
    "external_ref": "CC-A1-R01-L2-B1-MLHXD7SA1N",
    "bin_location": "C1-R01-L4-B5",
    "opening_stock": 1,
    "counted_by": "USER-864144",
    "counted_on": "2026-02-11 14:12:00",
    "lines": [
      {
        "item_code": "108226",
        "bin_location": "C1-R01-L4-B5",
        "carton_id": "CTN-000124",
        "counted_qty": 155,
        "uom": "Nos"
      }
    ]
  }
}
```

**Field mapping (WMS → payload):**

| Payload field      | WMS source |
|--------------------|------------|
| company            | Settings or ERPNext default company |
| warehouse          | Warehouse **name** (e.g. from tabCycleCountTask.warehouse or resolved from code) |
| warehouse_code     | Warehouse **code** (e.g. WH-MAIN) |
| posting_date       | Task count_date or today |
| external_ref      | Cycle count task **title** (e.g. CC-A1-R01-L2-B1-MLHXD7SA1N) |
| bin_location       | Task **zone** (bin), e.g. A1-R02-L1-B2 |
| opening_stock      | 1 if task is “opening stock” type, else 0 (from task or settings) |
| counted_by         | First line’s counted_by or task assigned_to |
| counted_on         | First line’s counted_on or task updated_at (formatted) |
| lines[].item_code  | tabCycleCountLine.item_code |
| lines[].bin_location | tabCycleCountLine.bin_location or task zone |
| lines[].carton_id  | tabCycleCountLine.carton_id |
| lines[].counted_qty| tabCycleCountLine.actual_qty |
| lines[].uom        | Default "Nos" or from item master if available |

---

## 2. When to push (after mobile submit)

**Current flow**

- Mobile calls **wms-api** `POST /api/cycle-count/:title/submit`.
- wms-api updates task status (e.g. to Review or Completed) and may update stock; it **does not** call ERPNext.

**Required behaviour**

- After submit (and optionally after complete), the same cycle count data must be sent to ERPNext as **one** capture (sync_task_capture_only).
- So “after submit” means: **as part of the same logical step** (either in the same request/response or immediately after, in the same process or via a reliable queue).

**Better solutions (options)**

| Option | Who pushes | When | Pros | Cons |
|--------|------------|------|------|------|
| **A. wms-api after submit** | wms-api | Right after submit (or complete) in the same process | One place; mobile doesn’t need to know ERP. Works even if desktop is closed. | wms-api needs ERP URL + API key (env or config), not desktop Settings. |
| **B. Desktop on refresh** | Desktop | When user opens/refreshes a submitted/completed task | Uses existing Push Endpoints (URL + key). No wms-api config. | Push only when desktop is used; delay until someone opens the task. |
| **C. Desktop manual button only** | Desktop | User clicks “Push to ERP” | Full control; retry when needed. | No automatic push on submit. |
| **D. Hybrid (recommended)** | **Automatic:** wms-api after submit (if ERP config in wms-api). **Fallback + ref update:** Desktop “Push to ERP” button + refresh to show ERP reference. | Submit → wms-api pushes if configured; else or on failure user uses “Push to ERP” on desktop. | Automatic when possible; manual retry and reference visible on desktop. | Requires ERP push config in wms-api for auto path. |

**Recommendation:** Prefer **D (Hybrid)**:

1. **wms-api:** After successful submit (and after complete if you use that), if ERP Next URL + API key are configured (e.g. env `CYCLE_COUNT_ERP_URL`, `CYCLE_COUNT_ERP_API_KEY`), build the payload below and POST to `sync_task_capture_only`. On success, parse response and update task with ERP reference (see below).
2. **Desktop:** Add “Push to ERP” on Cycle Count Task Detail. It builds the same payload from current task + lines, uses the **Cycle Count** push endpoint from Settings, POSTs, then updates and shows ERP reference. Use for retry and when wms-api push is not configured or failed.

---

## 3. Storing and showing ERPNext reference

**Requirement:** “Once updated the reference number from erpnext should be updated in desktop.”

- ERPNext (sync_task_capture_only) should return a reference (e.g. Stock Reconciliation name or id).
- WMS must store it and desktop must show it.

**Proposed schema**

- **tabCycleCountTask:** add columns (e.g. in a small migration or ALTER):
  - `erp_reference` VARCHAR(255) NULL  — e.g. ERPNext document name.
  - `erp_synced_at` TIMESTAMP NULL     — when last successfully pushed (optional but useful).
- **Desktop:** In Cycle Count Task list and/or detail, show “ERP Ref: &lt;erp_reference&gt;” (or “Not synced” if null). After “Push to ERP” or after sync from wms-api, refresh task so the new reference appears.

**Who updates the column**

- If **wms-api** performs the push: after a successful POST to sync_task_capture_only, parse the response (e.g. `message.reference` or `message.name`), then `UPDATE tabCycleCountTask SET erp_reference = ?, erp_synced_at = NOW() WHERE title = ?`.
- If **desktop** performs the push: same UPDATE via a data service, after a successful push.

---

## 4. Manual “Push to ERP” button

**Requirement:** “Incase if the transaction not updated due to any reason need a button to push manually.”

**Place:** Cycle Count Task **Detail** window (desktop), next to Submit / Complete (e.g. “Push to ERP” or “Sync to ERP”).

**Behaviour**

1. Enabled when task is submitted or completed (e.g. status in [Review, Completed]) and has at least one counted line.
2. On click:
   - Load task + lines from DB (or use current view model).
   - Build payload in sync_task_capture_only format (company, warehouse, warehouse_code, posting_date, external_ref = task title, bin_location = zone, opening_stock, counted_by, counted_on, lines from tabCycleCountLine with item_code, bin_location, carton_id, counted_qty = actual_qty, uom).
   - Resolve **Cycle Count** push endpoint: in Settings.PushEndpoints, find entry whose BaseUrl contains `sync_task_capture_only` (or Type “Cycle Count” if you add that type).
   - POST `{ "payload": { ... } }` to that URL with auth (e.g. token from endpoint’s ApiKey).
   - On success: parse ERP reference from response; update tabCycleCountTask (erp_reference, erp_synced_at); refresh task on UI so “ERP Ref” appears.
   - On failure: show message (e.g. “Push failed: …”) so user can retry later.

This gives a clear manual retry path when auto push fails or is not configured.

---

## 5. Payload build (concise)

From **tabCycleCountTask** + **tabCycleCountLine** (for that task, actual_qty IS NOT NULL):

- **payload.company** — from Settings.Company or ERPNext default.
- **payload.warehouse** — warehouse **name** (e.g. “Main Warehouse - MAATC”); resolve from task.warehouse (code) if needed.
- **payload.warehouse_code** — task.warehouse or resolved code (e.g. WH-MAIN).
- **payload.posting_date** — task.count_date (YYYY-MM-DD).
- **payload.external_ref** — task.title.
- **payload.bin_location** — task.zone (bin).
- **payload.opening_stock** — 1 if task is opening-stock type, else 0 (e.g. from task or default 0).
- **payload.counted_by** — e.g. first line’s counted_by or task.assigned_to.
- **payload.counted_on** — e.g. first line’s counted_on or task.updated_at, formatted “YYYY-MM-DD HH:mm:ss”.
- **payload.lines** — one object per line: item_code, bin_location (line or task zone), carton_id, counted_qty = actual_qty, uom = “Nos” (or from item).

Use this in both wms-api (after submit/complete) and desktop (Push to ERP button).

---

## 6. Summary

| Item | Recommendation |
|------|----------------|
| **When to push** | Automatically in wms-api right after submit (and complete if applicable); fallback + retry via desktop “Push to ERP” button. |
| **Payload** | Build from task + lines as above; single payload per task (external_ref = task title). |
| **ERP reference** | Add tabCycleCountTask.erp_reference (and optionally erp_synced_at); update on successful push (wms-api or desktop); show on desktop. |
| **Manual push** | Add “Push to ERP” on Cycle Count Task Detail; use Cycle Count push endpoint from Settings; on success update and show ERP reference. |

**Implementation (done):** Desktop: Push Endpoint Type "Cycle Count", "Push to ERP" button, payload and PushCycleCountToErpNextAsync, MIGRATION_008 (erp_reference/erp_synced_at), ERP Reference in task detail. wms-api: after submit, optional push (set CYCLE_COUNT_ERP_URL and CYCLE_COUNT_ERP_API_KEY); updates erp_reference when columns exist. Original note: When you implement, start with (1) payload builder and “Push to ERP” button on desktop + (2) storing and displaying erp_reference; then add (3) optional auto push from wms-api if you configure ERP URL/key there.

---

## 7. ERPNext: Carton ID — Data type, mandatory allowed (no link)

WMS sends `carton_id` per line (e.g. `CTN-000124`). Those IDs are from WMS and do not exist as Carton documents in ERPNext, so the field must **not** be a Link (link validation would fail).

**In printechs_wms (ERPNext), for the cycle count result child table:**

- Set the **Carton ID** field to type **Data** (or **Small Text**), not Link. Then:
  - The value is stored and shown in Results with no link validation.
  - You can set the field to **Mandatory** in the DocType; the replacement API then requires `carton_id` in every line and returns a clear error if it is missing.
- So: **Carton ID = mandatory but not linked to master** is achieved by using Data type + Mandatory in ERPNext and using the replacement `sync_task_capture_only`.

---

## 8. ERPNext: Replace results when same external_ref (quantity/row count matching)

If the same WMS task is pushed more than once (or the document is not cleared), ERPNext may **append** new lines to the existing "Results" table instead of **replacing** it. That causes:

- **Row count mismatch:** WMS has 3 lines but ERPNext shows 5, 8, 11, etc.
- **Quantity mismatch:** Duplicate or mixed lines from multiple pushes.

**Fix in printechs_wms `sync_task_capture_only` (e.g. `cycle_count_batch.py`):**

1. When you find an **existing** document by `external_ref` (e.g. `frappe.db.exists(...)` or `get_doc`), do **not** append to the child table.
2. **Clear** the existing child table rows (e.g. `doc.set("results", [])` or delete all rows in the results table).
3. **Set** the child table from the incoming payload `lines` only (one row per payload line: item_code, bin_location, counted_qty, carton_id if present).
4. Then `doc.save(ignore_permissions=True)`.

So: **one push = one set of lines**; a second push for the same `external_ref` **replaces** the previous results instead of adding to them. That way WMS line count and quantities will match ERPNext.

**If the API returns success but the ERPNext document still shows old rows (e.g. 11 rows, or CTN-000124):** The handler may be returning 200 without actually replacing the child table, or it may be updating a different document. Ensure the code that runs on `sync_task_capture_only` (1) finds the doc by `external_ref`, (2) clears the Results child table, (3) adds exactly the incoming `lines`, (4) calls `doc.save(ignore_permissions=True)` so the change is persisted.

---

## 9. Code fix for `sync_task_capture_only` (replace results, optional carton_id)

Below is a **concrete fix** for the existing handler so that (1) results are **replaced** (not appended), and (2) carton_id is **optional** (no link validation throw).

**Problems in the current flow:**

1. **Clear happens after save:** You do `doc.save()` then `_clear_task_results(doc.name)`. So the doc is saved with the **old** children first; then you clear and insert new ones. Prefer: **clear in memory**, then **save** (so the table is empty), then **append** new rows and **save** again. That way the parent doc’s child table is consistent in one place (Frappe’s `doc.append` + `doc.save`).
2. **Using `child.insert()` for each row:** Inserting children one by one can leave the parent’s in-memory `doc.results` out of sync. Use **`doc.append("results", row_dict)`** and a single **`doc.save()`** so Frappe updates the child table in one go.
3. **Carton ID required:** You have `if result_carton_reqd and not carton_id: frappe.throw(...)`. That forces link validation when the field is required. Make carton_id **optional** (Data field or optional Link) so WMS can omit it; set it only when provided.

**Suggested pattern (existing document):**

```python
if existing_name:
    doc = frappe.get_doc(TASK_DT, existing_name)
    doc.company = company
    doc.warehouse = warehouse
    doc.warehouse_code = warehouse_code
    doc.bin_location = bin_location
    if _meta_has(TASK_DT, "posting_date"):
        doc.posting_date = posting_date
    if _meta_has(TASK_DT, "status"):
        doc.status = status
    if _meta_has(TASK_DT, "sync_stage"):
        doc.sync_stage = "Captured"
    if _meta_has(TASK_DT, "sync_status"):
        doc.sync_status = "Synced"

    # Replace results: clear in memory, then save (don't save old children first)
    doc.set("results", [])
    doc.save(ignore_permissions=True)

    # Append new rows from payload
    for i, row in enumerate(lines, start=1):
        if not isinstance(row, dict):
            continue
        item_code = row.get("item_code") or row.get("item") or row.get("code")
        if not item_code:
            continue
        row_bin = row.get("bin_location") or bin_location
        counted_qty = _safe_float(row.get("counted_qty") or row.get("qty") or row.get("counted") or 0)
        carton_id = _extract_carton_id(row)
        # Do NOT throw if carton_id missing – make it optional so WMS can omit it
        child_dict = {
            "item_code": item_code,
            "bin_location": row_bin,
            "counted_qty": counted_qty,
            "system_qty": 0.0,
            "delta_qty": counted_qty,
            "has_discrepancy": 1 if abs(counted_qty) > 0.000001 else 0,
        }
        if result_has_carton and carton_id:
            child_dict["carton_id"] = carton_id
        doc.append("results", child_dict)

    doc.save(ignore_permissions=True)
    updated_lines = len(doc.results)
```

**New document:** Keep your existing `else` branch that creates the doc and uses `doc.insert()`. Then **before** the loop over `lines`, clear and build results the same way: set `doc.results = []` or build the list, then for each line `doc.append("results", child_dict)`, then for a new doc use `doc.insert(ignore_permissions=True)` (which will insert the doc and its children).

**Payload from WMS:** The desktop sends `{"payload": { "company", "warehouse", "warehouse_code", "bin_location", "posting_date", "external_ref", "opening_stock", "counted_by", "counted_on", "lines": [ {"item_code", "bin_location", "counted_qty", "uom"} ] }}`. So `task = payload` (no nested "task"), and `lines = payload["lines"]`. Your current code already handles that with `task = payload.get("task") or payload`.

---

## 10. Full replacement for `sync_task_capture_only` (copy-paste)

See the file `cycle_count_batch_sync_task_capture_only_REPLACEMENT.py` in this repo for the drop-in replacement function body. The replacement (1) **replaces** results instead of appending, (2) stores **carton_id** as Data (not Link) and enforces **mandatory** when the child field is required, and (3) **explicitly deletes** existing child rows before re-append so the line count always matches the payload.

---

## 11. Internal test (cycle count push)

- **Desktop:** After push, the app now reads the ERP reference from `message.task` (sync_task_capture_only returns `task`), in addition to `name` and `reference`.
- **wms-api:** After push, the API now reads `message.task` for updating `erp_reference`.
- **Test script:** Run from `wms-api` folder:
  - `node test-cycle-count-push-to-erp.js`
  - Set env `CYCLE_COUNT_ERP_URL` and `CYCLE_COUNT_ERP_API_KEY` (or pass URL and API key as first two args).
  - The script sends a payload with **3 lines** and asserts `message.ok === true`, `message.updated_lines === 3`, and `message.task` is set. Use this to confirm the ERP side replaces results correctly (no duplicate rows).
