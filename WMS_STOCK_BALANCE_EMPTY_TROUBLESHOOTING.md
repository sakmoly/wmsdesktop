# WMS Stock Balance Still Empty – Troubleshooting

If the WMS Stock Balance list on ERPNext stays empty after pushing cycle count or snapshot, work through these checks.

---

## 1. Confirm the snapshot is sent and what ERPNext returns

**In the desktop app:**

1. Open **Settings** → scroll to the sync / push section.
2. Click **"Test Push WMS Snapshot"** (next to "Push WMS Snapshot").
3. In the result dialog, check:
   - **Steps**: "Push to ERPNext" should show something like `processed: ledger=X, carton_stock=Y, cartons=Z`.
   - **tabWMS Stock Balance rows (carton_stock):** should be **Y** (number of balance rows ERPNext says it processed).
   - **Errors from ERPNext:** if any, they explain why rows were skipped (e.g. invalid Link, missing Item/Warehouse).

**Interpretation:**

- If **carton_stock = 0** and **ledger = 0**: the payload had no data. Then either:
  - WMS DB has no (or no recent) data in tabCartonStock (qty > 0) and tabStockTransaction, or
  - Snapshot is built before any stock/transaction data exists.
- If **carton_stock > 0** but the list is still empty: the handler ran but something on ERPNext prevents rows from appearing (see sections 2–4).
- If there are **errors**: fix those first (e.g. create WMS Bin Location, fix Item/Warehouse links).

---

## 2. Confirm the correct handler runs on ERPNext

WMS Stock Balance is filled **only** by the **push_wms_snapshot** API handler. If an old or different handler is installed, it might not write to WMS Stock Balance.

**On the ERPNext server (printechs_wms app):**

- Open the file that implements **push_wms_snapshot** (e.g. `api/offline_sync.py` or similar).
- Confirm it:
  - Reads **carton_stock** and/or **stock_transactions** from the request.
  - Calls logic that **inserts/updates WMS Stock Balance** (e.g. `upsert_wms_stock_balance` or equivalent).
- Use the **offline_sync_push_wms_snapshot_UPDATED.py** we provided in this repo as the reference implementation (it writes to both WMS Stock Ledger Entry and WMS Stock Balance, and derives balance from stock_transactions when carton_stock is empty).

---

## 3. WMS Bin Location and Link validation

The handler maps each row’s **bin_location** to a **WMS Bin Location** doc (Link). If that doc doesn’t exist, the handler may create it (e.g. by `bin_id`) or throw and skip the row.

**On ERPNext:**

- In **WMS Bin Location** (or your bin doctype), confirm that the bins sent by the desktop (e.g. from tabStockTransaction / tabCartonStock) either:
  - Exist (name or bin_id matches), or
  - Are created by the handler.
- If the handler throws for every row (e.g. "could not resolve bin_location"), the list will stay empty. Check **Error Log** in ERPNext for `push_wms_snapshot` or `upsert_wms_stock_balance`.

---

## 4. WMS Stock Balance DocType: standalone vs child table

**In ERPNext:**

- Go to **DocType → WMS Stock Balance**.
- Check **"Is Table" (istable)**:
  - If **Yes**: WMS Stock Balance is a **child table**. The list view you see may be for a **parent** DocType; child rows don’t have their own list. The handler would need to create/update a **parent** document and append balance rows as children (different from the current snippet that does `doc.insert()` on WMS Stock Balance).
  - If **No**: WMS Stock Balance is a **standalone** DocType. Then `doc.insert()` in the handler should create rows that appear in the "WMS Stock Balance" list. If the list is still empty, the handler is likely not running for this DocType or every insert is failing (check Error Log).

---

## 5. Quick checklist

| # | Check | Where |
|---|--------|--------|
| 1 | "Test Push WMS Snapshot" shows **processed.carton_stock** (or ledger) > 0 and no errors. | Desktop: Settings |
| 2 | push_wms_snapshot handler on ERPNext writes to **WMS Stock Balance** from carton_stock and/or stock_transactions. | ERPNext: printechs_wms |
| 3 | WMS Bin Location (and WMS Carton if used) exist or are created so Link validation doesn’t fail. | ERPNext |
| 4 | WMS Stock Balance is standalone (Is Table = No); if it’s a child table, handler must write to the parent and add child rows. | ERPNext: DocType |
| 5 | After cycle count, success message shows "WMS snapshot (Stock Balance / Ledger) pushed to ERPNext." | Desktop: after Push to ERPNext |

If 1 is OK but the list is still empty, the issue is on ERPNext (handler, links, or DocType structure). Use the Error Log and the response from "Test Push WMS Snapshot" (errors array) to see which rows are failing and why.
