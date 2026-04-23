# Printechs WMS Desktop – ERPNext Integration Workflow

**Document version:** 1.0  
**Purpose:** Step-by-step GET and POST APIs, URLs, sample JSON, and ERPNext documents for the WMS–ERPNext integration.  
**Use:** Open this file in Microsoft Word (File → Open → select this .md file) or copy the content into Word and save as .docx.

---

## 1. Base URL and Authentication

- **Base URL example:** `http://printechsdammam.dyndns.org:88` (replace with your ERPNext site URL).
- **Authentication:** All API calls use **Token** authentication.
  - **Header:** `Authorization: token <your_api_key>`
  - API Key is created in ERPNext: **User** → **API Access** → **Generate Keys** and use the generated key.

---

## 2. GET APIs (Desktop pulls data from ERPNext)

### 2.1 Get Items (compact list)

**Purpose:** Sync item master data to WMS (e.g. item code, name, barcode, UOM).

| Item | Value |
|------|--------|
| **Method** | GET |
| **URL** | `{baseUrl}/api/method/printechs_wms.api.item.get_items_compact` |
| **Query (optional)** | `limit=500&offset=0`; filters/fields may be passed in request body for POST-style usage (check your app). |

**Sample response (concept):**
```json
{
  "message": [
    {
      "item_code": "108226",
      "item_name": "COLN WMN WST",
      "barcode": "",
      "stock_uom": "PCS"
    }
  ]
}
```

---

### 2.2 Get ASNs for WMS (Advance Shipment Notices)

**Purpose:** Fetch export-pending ASNs and their items for receiving in WMS.

| Item | Value |
|------|--------|
| **Method** | GET |
| **URL** | `{baseUrl}/api/method/printechs_wms.api.wms_sync.get_asns_for_wms?export_pending=1&include_items=1` |

**Sample response (concept):**
```json
{
  "message": [
    {
      "name": "ASN-2026-00001",
      "supplier": "Supplier A",
      "items": [
        { "item_code": "108226", "qty": 100 }
      ]
    }
  ]
}
```

---

### 2.3 Get Transfer Orders for WMS

**Purpose:** Fetch export-pending Transfer Orders for outbound/transfer in WMS.

| Item | Value |
|------|--------|
| **Method** | GET |
| **URL** | `{baseUrl}/api/method/printechs_wms.api.wms_sync.get_tos_for_wms?export_pending=1&include_items=1&docstatus=1` |

---

### 2.4 Get Material Transfer Requests

**Purpose:** Fetch material requests (e.g. for picking) from ERPNext.

| Item | Value |
|------|--------|
| **Method** | GET |
| **URL** | `{baseUrl}/api/method/printechs_wms.api.material_request.get_material_transfer_requests?from_warehouse=Main%20Warehouse%20-%20MAATC&state=Pending&docstatus=0&include_items=1&limit=200` |

---

### 2.5 Get Material Transfer Stock Entries (Transfer In)

**Purpose:** Fetch stock entries for transfer-in receiving.

| Item | Value |
|------|--------|
| **Method** | GET |
| **URL** | `{baseUrl}/api/method/printechs_wms.api.transfer_in_sync.get_material_transfer_stock_entries?to_warehouse=Main%20Warehouse%20-%20MAATC&docstatus=1` |

---

### 2.6 Get Default Company

**Purpose:** Get default company from ERPNext (used when pushing cycle count if not set in settings).

| Item | Value |
|------|--------|
| **Method** | GET |
| **URL** | `{baseUrl}/api/method/printechs_wms.api.desktop_stock_entry.get_default_company` |

**Sample response (concept):**
```json
{
  "message": {
    "default_company": "Mohammed Abdullah Almousa Trading Company"
  }
}
```
Or `"message": "Mohammed Abdullah Almousa Trading Company"`.

---

### 2.7 Get PR Status for ASN

**Purpose:** Check Purchase Receipt status for an ASN.

| Item | Value |
|------|--------|
| **Method** | GET |
| **URL** | `{baseUrl}/api/method/printechs_wms.api.asn_to_purchase_receipt.get_pr_status_for_asn?asn_no={asn_no}` |

Replace `{asn_no}` with the ASN document name (e.g. `ASN-2026-00001`).

---

## 3. POST APIs (Desktop or ERPNext UI sends data to ERPNext)

### 3.1 Cycle Count – Sync Task Capture Only (POST)

**Purpose:** Send cycle count task (counted lines) from WMS Desktop to ERPNext. Creates/updates **WMS Cycle Count Task** and links to **WMS Cycle Count Batch**.

| Item | Value |
|------|--------|
| **Method** | POST |
| **URL** | `{baseUrl}/api/method/printechs_wms.api.cycle_count_batch.sync_task_capture_only` |
| **Content-Type** | `application/json` |
| **Body** | Wrapped in `payload` key. |

**Sample JSON (POST body):**
```json
{
  "payload": {
    "company": "Mohammed Abdullah Almousa Trading Company",
    "warehouse": "Main Warehouse - MAATC",
    "warehouse_code": "WH-MAIN",
    "posting_date": "2026-02-12",
    "external_ref": "CC-A1-R02-L2-B1-MLHXD7SA131",
    "opening_stock": 1,
    "counted_by": "USER-864144",
    "counted_on": "2026-02-11 14:12:00",
    "lines": [
      {
        "item_code": "108226",
        "bin_location": "A1-R01-L4-B1",
        "carton_id": "CTN-000130",
        "counted_qty": 155,
        "uom": "Nos"
      },
      {
        "item_code": "108236",
        "bin_location": "A1-R01-L4-B1",
        "carton_id": "CTN-000131",
        "counted_qty": 15,
        "uom": "Nos"
      }
    ]
  }
}
```

**Notes:**  
- `bin_location` is optional at header level; each line can have its own `bin_location`.  
- `carton_id` is mandatory per line (Data field, not Link).  
- `external_ref` must be the desktop task ID (unique per task).

**Sample response:**
```json
{
  "message": {
    "ok": true,
    "api_version": "1",
    "task": "WMS-CCT-00001",
    "external_ref": "CC-A1-R02-L2-B1-MLHXD7SA131",
    "batch": "72nh9oi4qq",
    "updated_lines": 2
  }
}
```

**ERPNext documents updated/created:**  
- **WMS Cycle Count Task** (with results child table)  
- **WMS Cycle Count Batch** (task linked to batch)

---

### 3.2 WMS Snapshot – Push to ERPNext (POST)

**Purpose:** Sync WMS stock state to ERPNext: **WMS Stock Ledger Entry**, **WMS Stock Balance**, **WMS Carton**. Called automatically after cycle count (and other transactions) or manually from Settings.

| Item | Value |
|------|--------|
| **Method** | POST |
| **URL** | `{baseUrl}/api/method/printechs_wms.api.offline_sync.push_wms_snapshot` |
| **Content-Type** | `application/json` |

**Sample JSON (POST body):**
```json
{
  "event_uuid": "SYNC-20260211-0001",
  "company": "Mohammed Abdullah Almousa Trading Company",
  "source_system": "WMS_DESKTOP",
  "warehouse": "Main Warehouse - MAATC",
  "stock_transactions": [
    {
      "id": 2003,
      "transaction_date": "2026-02-08 22:00:00",
      "transaction_type": "PUTAWAY",
      "item_code": "108226",
      "bin_location": "BIN-RECEIVE-01",
      "target_bin": "C1-R01-L4-B5",
      "carton_id": "CTN-000124",
      "qty_change": 10,
      "qty_after": 10,
      "notes": "Putaway done"
    }
  ],
  "carton_stock": [
    {
      "warehouse": "Main Warehouse - MAATC",
      "item_code": "108226",
      "bin_location": "C1-R01-L4-B5",
      "carton_id": "CTN-000124",
      "qty": 10,
      "reserved_qty": 0,
      "last_moved_on": "2026-02-08 22:00:00"
    }
  ],
  "cartons": [
    {
      "carton_id": "CTN-000124",
      "status": "Closed",
      "current_bin_id": "C1-R01-L4-B5",
      "remarks": ""
    }
  ]
}
```

**Important:**  
- `carton_stock[].warehouse` must be the **ERPNext warehouse document name** (e.g. "Main Warehouse - MAATC"), not the code (e.g. WH-MAIN).  
- Idempotency: same `event_uuid` with status "Success" is skipped.

**Sample response:**
```json
{
  "message": {
    "ok": true,
    "event_uuid": "SYNC-20260211-0001",
    "event_type": "Putaway",
    "processed": {
      "ledger": 1,
      "carton_stock": 1,
      "cartons": 1
    },
    "errors": []
  }
}
```

**ERPNext documents updated/created:**  
- **WMS Stock Ledger Entry**  
- **WMS Stock Balance** (location = WMS Bin Location name; carton = Data or Link per your DocType)  
- **WMS Carton**  
- **WMS Integration Event Log** (optional, for idempotency)

---

### 3.3 Update ASN WMS Status (POST)

**Purpose:** Mark ASN as exported or update WMS status in ERPNext.

| Item | Value |
|------|--------|
| **Method** | POST |
| **URL** | `{baseUrl}/api/method/printechs_wms.api.wms_sync.update_asn_wms_status` or `update_asns_wms_status` (bulk) |

(Body format depends on your printechs_wms implementation; typically ASN name(s) and status.)

---

### 3.4 Update Transfer Order WMS Status (POST)

**Purpose:** Mark Transfer Order as exported or update WMS status.

| Item | Value |
|------|--------|
| **Method** | POST |
| **URL** | `{baseUrl}/api/method/printechs_wms.api.wms_sync.update_transfer_order_wms_status` |

---

### 3.5 Upload Opening Valuation File (POST) – from ERPNext UI

**Purpose:** Upload an Excel file to create **Opening Stock** **Stock Reconciliation** in ERPNext. Used from WMS Cycle Count Batch form (“Upload Valuation File (Create Opening SR)”).

| Item | Value |
|------|--------|
| **Method** | POST |
| **URL** | `{baseUrl}/api/method/printechs_wms.api.cycle_count_batch.upload_opening_valuation_file` |
| **Body (form or JSON)** | `file_url` or `file_id`, optional `batch_name`, optional `difference_account`, `submit=1` |

Excel must have sheet **"Opening Valuation Upload"** with columns: `company`, `warehouse`, `posting_date`, `item_code`, `counted_qty_total`, `valuation_rate`.

**ERPNext documents created:**  
- **Stock Reconciliation** (Purpose: Opening Stock)  
- **Stock Reconciliation Item** (child)  
- Link on **WMS Cycle Count Batch** to the SR (if `batch_name` provided)

---

### 3.6 Create Stock Entry from Transfer Carton (POST)

**Purpose:** Create a Stock Entry in ERPNext when a transfer carton is received (e.g. from desktop transfer-in flow).

| Item | Value |
|------|--------|
| **Method** | POST |
| **URL** | `{baseUrl}/api/method/printechs_wms.api.desktop_stock_entry.create_stock_entry_from_transfer_carton` |
| **Body** | `payload` with e.g. `transfer_carton_id`, `asn_no`, items list. |

(Exact payload structure is in your app; see `CreateStockEntryPayloadDto` in desktop code.)

---

## 4. Step-by-Step Workflows

### 4.1 Cycle Count Flow (Desktop → ERPNext)

1. **User completes cycle count** in WMS Desktop (task with lines: item, bin, carton, counted qty).
2. **Desktop POST – Cycle Count**  
   - **URL:** `POST {baseUrl}/api/method/printechs_wms.api.cycle_count_batch.sync_task_capture_only`  
   - **Body:** `{ "payload": { "company", "warehouse", "warehouse_code", "posting_date", "external_ref", "lines": [ { "item_code", "bin_location", "carton_id", "counted_qty", "uom" } ], ... } }`  
   - **Result:** ERPNext creates/updates **WMS Cycle Count Task** and links to **WMS Cycle Count Batch**.
3. **Desktop applies cycle count locally** (updates WMS DB: stock ledger, carton stock).
4. **Desktop POST – WMS Snapshot**  
   - **URL:** `POST {baseUrl}/api/method/printechs_wms.api.offline_sync.push_wms_snapshot`  
   - **Body:** `{ "event_uuid", "company", "warehouse", "stock_transactions", "carton_stock", "cartons" }`  
   - **Result:** ERPNext updates **WMS Stock Ledger Entry**, **WMS Stock Balance**, **WMS Carton**.
5. **(Optional) In ERPNext:** Load Actual Stock Preview on the batch → Export Valuation Template → fill valuation → **Upload Valuation File** to create Opening Stock Reconciliation.

### 4.2 Receiving / Putaway / Picking Flow (GET then POST)

1. **Desktop GET – ASNs**  
   - **URL:** `GET {baseUrl}/api/method/printechs_wms.api.wms_sync.get_asns_for_wms?export_pending=1&include_items=1`  
   - **Result:** List of ASNs to receive.
2. User receives and putaways in WMS Desktop; desktop updates local WMS DB.
3. **Desktop POST – WMS Snapshot** (automatic after transaction complete or manual from Settings).  
   - **URL:** Same as in 4.1 step 4.  
4. **Desktop POST – Update ASN status** (when your flow marks ASN as exported/processed).  
   - **URL:** `POST .../wms_sync.update_asn_wms_status` (or update_asns_wms_status).

---

## 5. ERPNext Documents (Doctypes) Involved

| Document (Doctype) | Role |
|--------------------|------|
| **WMS Cycle Count Batch** | Batch of cycle count tasks; has Batch Summary (item, bin, carton, qty). |
| **WMS Cycle Count Task** | Single task; child table Results (item, bin, carton, counted_qty). |
| **WMS Cycle Count Batch Summary** | Child of Batch; one row per (item, bin, carton). |
| **WMS Stock Ledger Entry** | Transaction log (item, location, qty_change, qty_after). |
| **WMS Stock Balance** | Current balance by item, warehouse, location, carton. |
| **WMS Carton** | Carton master (carton_id, status, current_bin_id). |
| **WMS Bin Location** | Bin/location master (used by WMS Stock Balance location link). |
| **Stock Reconciliation** | Opening/Adjustment reconciliation; created by upload_opening_valuation_file. |
| **Stock Reconciliation Item** | Child of Stock Reconciliation. |
| **Warehouse** | Standard ERPNext warehouse (Link in WMS docs). |
| **Item** | Standard ERPNext item. |
| **Company** | Standard ERPNext company. |

---

## 6. Quick Reference – API URLs (replace {baseUrl})

| API | Method | URL |
|-----|--------|-----|
| Items | GET | `{baseUrl}/api/method/printechs_wms.api.item.get_items_compact` |
| ASNs | GET | `{baseUrl}/api/method/printechs_wms.api.wms_sync.get_asns_for_wms?export_pending=1&include_items=1` |
| Transfer Orders | GET | `{baseUrl}/api/method/printechs_wms.api.wms_sync.get_tos_for_wms?export_pending=1&include_items=1&docstatus=1` |
| Material Requests | GET | `{baseUrl}/api/method/printechs_wms.api.material_request.get_material_transfer_requests?from_warehouse=...&state=Pending&docstatus=0&include_items=1&limit=200` |
| Transfer In Stock Entries | GET | `{baseUrl}/api/method/printechs_wms.api.transfer_in_sync.get_material_transfer_stock_entries?to_warehouse=...&docstatus=1` |
| Default Company | GET | `{baseUrl}/api/method/printechs_wms.api.desktop_stock_entry.get_default_company` |
| PR Status for ASN | GET | `{baseUrl}/api/method/printechs_wms.api.asn_to_purchase_receipt.get_pr_status_for_asn?asn_no={asn_no}` |
| **Cycle Count Sync** | **POST** | `{baseUrl}/api/method/printechs_wms.api.cycle_count_batch.sync_task_capture_only` |
| **WMS Snapshot** | **POST** | `{baseUrl}/api/method/printechs_wms.api.offline_sync.push_wms_snapshot` |
| Upload Opening Valuation | POST | `{baseUrl}/api/method/printechs_wms.api.cycle_count_batch.upload_opening_valuation_file` |
| Update ASN status | POST | `{baseUrl}/api/method/printechs_wms.api.wms_sync.update_asn_wms_status` |
| Update TO status | POST | `{baseUrl}/api/method/printechs_wms.api.wms_sync.update_transfer_order_wms_status` |
| Create Stock Entry from Transfer Carton | POST | `{baseUrl}/api/method/printechs_wms.api.desktop_stock_entry.create_stock_entry_from_transfer_carton` |

---

**End of document.**  
To obtain a Word file: open this `.md` in Microsoft Word (File → Open) or copy the content into a new Word document and save as `.docx`.
