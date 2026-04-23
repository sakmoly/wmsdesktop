# Process After ASN Is Submitted on Mobile – Detailed Steps

This document describes the **end-to-end process** from the time an ASN is submitted (or ready) on mobile through receiving, routing, and finally updating ERPNext from the desktop.

---

## 1. Prerequisites (Before Mobile Starts)

- **ASN exists** in WMS (synced from ERPNext via Desktop **Push & Pull** or sync).
- **ASN status** in WMS is **Submitted** (so mobile can start receiving). If it shows Draft, use Desktop: open ASN → **Mark as Received** (or ensure all items received and reopen so auto-status runs).
- **Transfer Order (TO)** may or may not exist for this ASN:
  - **With TO:** Receiving is followed by **Sorting** and **Transfer Cartons** (dispatch to stores).
  - **Without TO (or putaway path):** Receiving is followed by **Putaway** (store in warehouse bins).

---

## 2. Mobile – Receiving (Inbound)

| Step | Action | API / Notes |
|------|--------|-------------|
| 2.1 | **Start Inbound Session** | `POST /api/inbound/session/start` (or equivalent) with `asn_no`, `source_type: "ASN"`, `warehouse`, `user_id`. |
| 2.2 | **Unload / receive cartons** | Update carton status (Unloaded → Receiving → Received). Receive lines: `POST /api/inbound/receive-lines` or receive-by-item APIs. |
| 2.3 | **Complete Inbound Session** | `POST /api/inbound/session/complete` (or `POST /api/inbound/complete`). This creates **Putaway Task(s)** and/or makes boxes available for sorting. |

After this, the system **routes**:

- **If Transfer Order exists for this ASN** → go to **Section 3 (Sorting & Transfer Cartons)**.
- **If no TO or putaway path** → go to **Section 4 (Putaway)**.

---

## 3. Path A: With Transfer Order – Sorting & Transfer Cartons

### 3.1 Create Sort Boxes (Desktop or Mobile)

- **Desktop:** Inbound Operations → **Sort Boxes** → Create boxes per store (ASN + Transfer Order + Store).
- **API:** `POST /api/boxes/create` with `advance_shipping_notice`, `transfer_order`, `store`, `created_by`.  
- **Note:** `store` must exist in **tabWarehouse** (warehouse master). Each box = one store destination.

### 3.2 Sort Items to Boxes (Mobile)

- User scans **box** → scans **item** → confirms quantity. Items are sorted into boxes by store.
- **API:** Events e.g. `POST /api/events/batch` with `event_type: "SORT_TO_BOX"`, `box_id`, `item_code`, `qty`, `advance_shipping_notice`, `transfer_order`, `store`.

### 3.3 Close Box (Mobile)

- When a box is full, close it.
- **API:** e.g. `POST /api/boxes/{box_id}/close`.

### 3.4 Create Transfer Carton (Desktop or Mobile)

- One **Transfer Carton** per destination (e.g. per store) to pack closed boxes for dispatch.
- **API:** `POST /api/boxes/create` with purpose **STORE** (or the create transfer-carton endpoint) – or create TC with `asn_no`, `to_no` (Transfer Order), `store`, `user_id`.  
- In your setup, **Transfer Cartons** are created (e.g. TC-0001-xxxx) and linked to ASN + TO + Store.

### 3.5 Pack Boxes into Transfer Carton (Mobile)

- User packs closed boxes into the Transfer Carton.
- **API:** Events e.g. `PACK_BOX_TO_TC` via `POST /api/events/batch`, so the TC gets contents (items from scan events / carton contents).

### 3.6 Seal Transfer Carton (Mobile / Desktop)

- When packing is done, **Seal** the transfer carton. Status becomes **Sealed**.

### 3.7 Dispatch Transfer Carton (Mobile / Desktop)

- **Dispatch** the transfer carton. Status becomes **Dispatched**. Stock is reduced at source (e.g. warehouse).

---

## 4. Path B: Putaway (No TO or Putaway Path)

| Step | Action | API / Notes |
|------|--------|-------------|
| 4.1 | **Putaway task** | Already created when inbound session was completed (e.g. `PUT-20260120-0001`). |
| 4.2 | **Get putaway tasks** | `GET /api/putaway/tasks?advance_shipping_notice=ASN-0001&status=In Progress`. |
| 4.3 | **Scan location for putaway** | Mobile: scan bin/location, submit. **API:** `POST /api/putaway/scan-transfer-carton` with `box_id` (carton id), `location_id`, `user_id`. This assigns location and updates **tabStockLedger**, **tabTransactionHistory**, **tabItem** stock. |
| 4.4 | **Complete putaway** | When all lines have location and are confirmed, putaway task status becomes **Completed**. |

---

## 5. Desktop – Update ERPNext (Received Qty & Purchase Receipt)

These steps are done on the **Desktop** app to keep ERPNext in sync.

### 5.1 Mark ASN as Received (if still Draft)

- Open **ASN** (e.g. ASN-0001) in Desktop → if status is still **Draft** but all items are received, click **Mark as Received** so status becomes **Received**.  
- Or reopen the ASN detail; if fully received, status may auto-update to Received.

### 5.2 Update Received Qty to ERPNext

- In **ASN detail**, click **Update Received Qty to ERPNext** (enabled only when ASN status = **Received**).  
- This sends received quantities to ERPNext (e.g. `push_asn_received_qty` / receive API).  
- Optionally, a **Purchase Receipt** is created in ERPNext (e.g. MAT-PRE-2026-00001). If the API creates it as **Draft**, **submit the Purchase Receipt in ERPNext** (Submit button in the PR document).

---

## 6. Desktop – Transfer Cartons (When Path A Was Used)

For each **dispatched** transfer carton that should create a **Stock Entry** (Material Transfer) in ERPNext:

| Step | Action | Notes |
|------|--------|------|
| 6.1 | Open **Transfer Cartons** (Inbound Operations) → open the **Transfer Carton** (e.g. TC-0001-1772158095535). | |
| 6.2 | **Get Purchase Receipt** | Click **Get Purchase Receipt**. Desktop calls ERPNext `get_pr_status_for_asn` for the ASN. If a Purchase Receipt exists and is **submitted** (or docstatus=1), the app shows e.g. "MAT-PRE-2026-00001 (Submitted)" and enables **Generate Stock Entry**. |
| 6.3 | **Generate Stock Entry** | When PR is submitted, click **Generate Stock Entry**. Desktop calls ERPNext **create_stock_entry_from_transfer_carton** with: transfer_carton_id, asn_no, transfer_order, company, from_warehouse_code, to_warehouse_code (store), posting_date, items (from carton contents). ERPNext creates a **Material Transfer** Stock Entry and returns the Stock Entry name. Desktop saves it on the transfer carton (Warehouse Transfer / Stock Entry field). |

So: **After ASN submitted on mobile** → receiving → (if TO) sorting & transfer cartons → seal & dispatch → **on desktop**: ensure ASN = Received → Update Received Qty to ERPNext → submit PR in ERPNext if needed → for each TC, **Get Purchase Receipt** then **Generate Stock Entry**.

---

## 7. Optional: Push & Pull (Desktop)

- From **Home**, click **Push & Pull**.  
- **Pull:** ASNs, Transfer Orders, Material Requests, Transfer In from ERPNext.  
- **Push:** WMS snapshot (stock transactions, carton stock, cartons) to ERPNext.  
- **End transit** for completed Transfer In putaways.  
- **Rebuild WMS stock balance** in ERPNext.  

Use this to keep WMS and ERPNext in sync and to fix stock balance.

---

## 8. Summary Flow (Short)

1. **Mobile:** ASN submitted/ready → Start inbound session → Receive items/cartons → Complete session.  
2. **Routing:** With TO → Sorting → Create boxes → Sort to box → Close box → Create Transfer Carton → Pack box to TC → Seal → Dispatch. Without TO → Putaway (scan location, complete putaway).  
3. **Desktop – ASN:** Mark ASN as Received if needed → **Update Received Qty to ERPNext** → Submit Purchase Receipt in ERPNext if created as draft.  
4. **Desktop – Transfer Carton (if applicable):** Open TC → **Get Purchase Receipt** → **Generate Stock Entry** (creates Material Transfer in ERPNext and links to TC).  
5. **Optional:** **Push & Pull** for full sync and stock balance rebuild.

---

## 9. Key APIs (Quick Reference)

| Step | API / Endpoint |
|------|----------------|
| Mobile – Start session | `POST /api/inbound/session/start` |
| Mobile – Receive lines | `POST /api/inbound/receive-lines` or receive-by-item |
| Mobile – Complete session | `POST /api/inbound/session/complete` or `/api/inbound/complete` |
| Create box (sort) | `POST /api/boxes/create` (ASN, TO, store) |
| Sort to box | `POST /api/events/batch` (SORT_TO_BOX) |
| Create transfer carton | `POST /api/boxes/create` or transfer-carton create (ASN, TO, store) |
| Putaway – scan location | `POST /api/putaway/scan-transfer-carton` |
| Desktop – PR status | ERPNext: `get_pr_status_for_asn?asn_no=ASN-0001` |
| Desktop – Create Stock Entry from TC | ERPNext: `create_stock_entry_from_transfer_carton` (payload: transfer_carton_id, asn_no, transfer_order, company, from/to_warehouse_code, items) |
| Desktop – Update ASN received qty | ERPNext: push ASN received qty / receive API (from Desktop ASN detail) |

This is the **current process after ASN is submitted on mobile**, with detailed steps and where desktop and ERPNext fit in.
