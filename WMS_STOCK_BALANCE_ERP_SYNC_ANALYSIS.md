# tabWMS Stock Balance on ERPNext – When We Send Data & Why It May Stay Empty

## 1. When does the desktop send data to ERPNext?

The desktop sends WMS stock data to ERPNext via the **push_wms_snapshot** API (Offline Sync). It does **not** send to a dedicated “WMS Stock Balance” API; it sends a **snapshot** that includes transactions and carton stock. ERPNext is responsible for writing that into **tabWMS Stock Balance** (or equivalent) inside the `push_wms_snapshot` handler.

### When the snapshot is pushed

| Trigger | Where |
|--------|--------|
| After a WMS transaction is saved as **Completed** (receiving, putaway, picking, cycle count, transfer in, material request) | `WmsTransactionDataService.SaveWmsTransactionAsync` → `WmsSnapshotDataService.TryPushSnapshotAfterTransaction` |
| After **putaway completed** via API | `PutawayTaskDetailViewModel.CompletePutawayAsync` → `WmsSnapshotDataService.TryPushSnapshotAfterTransaction` |
| After **transfer carton dispatch** | `TransferCartonDataService.DispatchTransferCartonAsync` → `WmsSnapshotDataService.TryPushSnapshotAfterTransaction` |
| **Manual** “Push WMS Snapshot” in Settings → Sync | `SettingsViewModel.PushWmsSnapshotAsync` → `WmsSnapshotDataService.BuildAndPushSnapshotAsync` |

So: **tabWMS Stock Balance** on ERPNext is only updated when:

1. A push actually runs (endpoint configured and one of the triggers above fires), and  
2. The **ERPNext** `push_wms_snapshot` handler writes the received data into **tabWMS Stock Balance**.

---

## 2. What is sent in the snapshot?

**Endpoint:**  
`POST .../printechs_wms.api.offline_sync.push_wms_snapshot`  
(URL from Settings → Push Endpoints → type **Offline Sync**; default e.g.  
`http://printechsdammam.dyndns.org:88/api/method/printechs_wms.api.offline_sync.push_wms_snapshot`.)

**Exact payload keys (JSON, as sent by desktop):**

```json
{
  "event_uuid": "SYNC-20260226-ABCD",
  "company": "Mohammed Abdullah Almousa Trading Company",
  "source_system": "WMS_DESKTOP",
  "warehouse": "Main Warehouse - MAATC",
  "stock_transactions": [
    {
      "id": 1,
      "transaction_date": "2026-02-21 14:30:00",
      "transaction_type": "Putaway",
      "item_code": "108226",
      "bin_location": "A1-R01-L4-B1",
      "target_bin": null,
      "carton_id": "CTN-000130",
      "qty_change": 100,
      "qty_after": 100,
      "notes": null
    }
  ],
  "carton_stock": [
    {
      "warehouse": "WH-MAIN",
      "item_code": "108226",
      "bin_location": "A1-R01-L4-B1",
      "carton_id": "CTN-000130",
      "qty": 100,
      "reserved_qty": 0,
      "last_moved_on": "2026-02-21 14:30:00"
    }
  ],
  "cartons": [
    {
      "carton_id": "CTN-000130",
      "status": "PUTAWAY",
      "current_bin_id": "A1-R01-L4-B1",
      "remarks": ""
    }
  ]
}
```

**Source of data (WMS desktop):**

| Payload key | WMS table | Limit / filter |
|-------------|-----------|-----------------|
| `stock_transactions` | `tabStockTransaction` | Last 5000 rows, all columns above |
| `carton_stock` | `tabCartonStock` | Up to 10000 rows where `qty > 0` |
| `cartons` | `tabCarton` | Up to 10000 rows |

There is **no** `stock_balance` array in the payload. **tabWMS Stock Balance** on ERPNext must be filled by the **ERPNext** `push_wms_snapshot` handler using `carton_stock` and/or `stock_transactions`.

---

## 3. Why tabWMS Stock Balance might still be empty

### A. Push never runs (desktop)

- **No Offline Sync push endpoint**  
  Settings → Sync → Push Endpoints: there must be an **enabled** endpoint with type **“Offline Sync”**, with Base URL = `push_wms_snapshot` and a valid API Key.  
  If this is missing or disabled, no snapshot is sent and ERPNext never receives data.

- **Triggers never fire**  
  Snapshot is pushed only after: transaction completed, putaway complete (via API), transfer carton dispatch, or manual “Push WMS Snapshot”. If none of these happen after configuring the endpoint, no data is sent.

**Check:** Use “Push WMS Snapshot” manually and confirm in logs that the request is sent and (if possible) that ERPNext returns 200.

### B. Snapshot payload is empty (WMS DB)

- **tabStockTransaction** – used for `stock_transactions`. If this table is empty, the list is empty.
- **tabCartonStock** – used for `carton_stock`. If this table is empty or has no rows with `qty > 0`, the list is empty.
- **tabCarton** – used for `cartons`. Optional for “balance”; balance is usually from transactions or carton_stock.

If both `stock_transactions` and `carton_stock` are empty, the handler on ERPNext has nothing to turn into **tabWMS Stock Balance** rows.

**Check:** Before pushing, ensure the WMS DB has data in `tabStockTransaction` and/or `tabCartonStock` (e.g. after a receive/putaway).

### C. ERPNext handler does not write to tabWMS Stock Balance

- The handler for `push_wms_snapshot` (e.g. in `printechs_wms.api.offline_sync`) might:
  - Only log or validate the payload, or  
  - Write only to other tables (e.g. only “WMS Snapshot Log”), or  
  - Expect a different payload shape and ignore `carton_stock` / `stock_transactions`.

In that case, **tabWMS Stock Balance** would never be filled.

**Check:** In the ERPNext app, open the implementation of `push_wms_snapshot` and confirm that it:
- Reads `carton_stock` and/or `stock_transactions`, and  
- Inserts/updates **tabWMS Stock Balance** (or the DocType that uses that table).

### D. Table or field name mismatch on ERPNext

- The table might be named differently (e.g. `tabWMS Stock Balance` vs `tabWMSStockBalance` or another doctype).
- The handler might be writing to a different table or using wrong column names (e.g. `warehouse` vs `warehouse_code`, `location` vs `bin_location`).

**Check:** In ERPNext, confirm the exact DocType and table name for “WMS Stock Balance” and that the handler uses that table and correct field names.

### E. Warehouse / company filter on ERPNext

- The handler might write only for certain `warehouse` or `company`. If the snapshot sends a warehouse name that the handler doesn’t match (e.g. “Main Warehouse - MAATC” vs “Main Warehouse”), rows might be written with a different warehouse or not at all.

**Check:** In the handler, see how it filters or sets `warehouse` / `company` when inserting into **tabWMS Stock Balance**.

---

## 4. What the ERPNext side must do to populate tabWMS Stock Balance

### 4.1 Implement or extend `push_wms_snapshot`

In **printechs_wms** (e.g. `api/offline_sync.py` or equivalent):

1. Read the request body (e.g. `frappe.local.form_dict` or `payload`).
2. Parse `payload.get("carton_stock")` and/or `payload.get("stock_transactions")`.
3. For each row that should become a balance row, insert or update **tabWMS Stock Balance** (or the DocType that uses that table).

### 4.2 Recommended: use `carton_stock` for tabWMS Stock Balance

**carton_stock** is the best source for balance: it already has one row per (warehouse, item_code, bin_location, carton_id) with `qty` and optional `reserved_qty`, `last_moved_on`.

**Field mapping (carton_stock → tabWMS Stock Balance):**

| Payload (`carton_stock` item) | tabWMS Stock Balance column (typical) |
|-------------------------------|----------------------------------------|
| `warehouse` | `warehouse` (or link to Warehouse) |
| `item_code` | `item_code` |
| `bin_location` | `location` or `bin_location` |
| `carton_id` | `carton` or `carton_id` (use **Data** type if WMS IDs are not in Carton master) |
| `qty` | `qty` |
| `reserved_qty` | `reserved_qty` (if exists) |
| `last_moved_on` | optional |

Use the **payload** `warehouse` (or request-level `warehouse`) for the warehouse; the desktop sends warehouse **name** (e.g. Main Warehouse - MAATC). Ensure the handler uses the same DocType/table name as **WMS Stock Balance** in ERPNext (e.g. `frappe.db.get_table_name("WMS Stock Balance")`).

### 4.3 Optional: replace balance by warehouse for this snapshot

To avoid duplicates and keep ERPNext in sync with WMS:

1. Delete existing rows in **tabWMS Stock Balance** for the snapshot’s `warehouse` (and optionally `company` / `source_system`).
2. Insert one row per `carton_stock` item with the mapping above.

Alternatively, upsert by key (warehouse + item_code + location + carton_id) if your schema supports it.

---

## 5. Quick checklist (tabWMS Stock Balance empty)

| # | Check | Where |
|---|--------|--------|
| 1 | Offline Sync push endpoint is configured and enabled (URL + API Key). | Desktop: Settings → Sync → Push Endpoints |
| 2 | At least one push has run (e.g. manual “Push WMS Snapshot” or a completed transaction). | Desktop logs / ERPNext request logs |
| 3 | WMS DB has data in tabStockTransaction and/or tabCartonStock (qty > 0). | WMS database |
| 4 | push_wms_snapshot handler on ERPNext writes to tabWMS Stock Balance (or its DocType). | ERPNext: printechs_wms.api.offline_sync |
| 5 | Handler maps carton_stock (and/or transactions) to the correct columns and table. | Same handler |
| 6 | No warehouse/company filter that excludes the snapshot you send. | Same handler |

If 1–3 are OK and the table is still empty, the fix is on **ERPNext**: implement or fix the logic in `push_wms_snapshot` that fills **tabWMS Stock Balance** from `carton_stock` and/or `stock_transactions`.

---

## 6. Reference: desktop code (Wms.Desktop)

| What | File / location |
|------|-------------------|
| Build snapshot (read DB, build DTO) | `Services/WmsSnapshotDataService.cs` – `BuildSnapshotAsync`, `ReadStockTransactionsAsync`, `ReadCartonStockAsync`, `ReadCartonsAsync` |
| Push to ERPNext | `Services/ErpNextWmsSyncApiService.cs` – `PushWmsSnapshotToErpNextAsync`, `WmsSnapshotRequestDto`, `WmsSnapshotCartonStockDto` |
| When push is triggered | `PUSH_WMS_SNAPSHOT_CALL_POINTS.md` |
| Offline Sync endpoint default URL | `Models/PushEndpointConfig.cs` – `DefaultOfflineSyncBaseUrl` |

**Note:** Cycle count’s `load_actual_stock_preview` on ERPNext reads from **tabWMS Stock Balance** (or `STOCK_BAL_DT`) to show system qty. That table is the same one that must be populated by `push_wms_snapshot` so that “Load Actual Stock Preview” shows correct system quantities.
