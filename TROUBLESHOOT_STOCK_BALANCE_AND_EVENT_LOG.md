# Troubleshoot: Stock Balance Not Updating (Only Cycle Count) + Event Log Empty

## What you see

- **WMS Stock Balance** in ERPNext shows only cycle count stock, not received ASN or putaway stock.
- **WMS Integration Event Log** in ERPNext is empty.

---

## 1. Event Log empty = snapshot request not reaching ERPNext (or log not written)

The desktop sends the snapshot to **push_wms_snapshot** on your **ERPNext** site. If Event Log is always empty, either:

### A) Desktop is not sending to ERPNext

- **Push WMS Snapshot** uses a **different** URL than Putaway/Cycle Count:
  - Putaway / Cycle Count use: **API Endpoint URL** + **API Key** (your WMS server).
  - Snapshot uses: **ERPNext API URL** + **ERPNext API Key**, **or** a Push Endpoint with Type **"Offline Sync"**.

**Fix:**

1. Open **Settings** in the desktop app.
2. Set **ERPNext API URL** = your **ERPNext** site base URL (e.g. `http://printechsdammam.dyndns.org:88` or `https://your-erp.com`).  
   This must be the site where **printechs_wms** and **push_wms_snapshot** are installed, **not** the WMS API server URL if that is different.
3. Set **ERPNext API Key** = API key from that ERPNext site (User → API Access → Generate Keys; use `api_key:api_secret`).
4. **Or** add a **Push Endpoint**: Type = **"Offline Sync"**, Base URL =  
   `{your ERPNext base URL}/api/method/printechs_wms.api.offline_sync.push_wms_snapshot`,  
   API Key = ERPNext API key, **Enabled** = checked.

After that, click **Push WMS Snapshot** again. If the request reaches ERPNext, you should see a new row in **WMS Integration Event Log**.

### B) ERPNext is not creating Event Log rows

The handler only writes to Event Log if the **WMS Integration Event Log** DocType exists.

**Fix (in ERPNext):**

- In **DocType List**, check that **WMS Integration Event Log** exists (from printechs_wms app).
- If it does not exist, create it or install the app version that provides it. Without this DocType, the API can still process the snapshot (and update WMS Stock Balance) but no log rows will be created.

---

## 2. Stock Balance only has cycle count (no ASN/putaway)

Two possible causes:

### A) Snapshot never reaches ERPNext with putaway data

- If the snapshot is sent to the **wrong URL** (e.g. WMS API instead of ERPNext), ERPNext never receives it, so it never updates WMS Stock Balance with putaway/ASN stock. Cycle count stock may have been updated earlier via a different flow (e.g. batch summary / load actual stock).
- **Fix:** Same as 1.A – ensure **Push WMS Snapshot** uses **ERPNext API URL** (or Offline Sync endpoint pointing to ERPNext). Then after putaway, the snapshot should hit ERPNext and update balance.

### B) Desktop is sending empty or no putaway data

- The snapshot is built from the **desktop’s local DB** (`tabCartonStock` with `qty > 0`, `tabStockTransaction`, `tabCarton`). If putaway never wrote into that DB, the snapshot has no putaway rows.
- **Fix:**
  1. Complete putaway from the **Putaway Task** screen (not only from the WMS server). That run applies putaway to the local DB and then pushes the snapshot.
  2. Use the **same machine/DB** for receiving, putaway, and Push WMS Snapshot. If the desktop uses a different DB (e.g. empty or test DB), there will be no putaway data to send.
  3. In Settings, after clicking **Push WMS Snapshot**, check the message: **“Sent: X stock rows”**. If X is 0, the local DB has no stock rows; fix DB connection and/or complete putaway from the Putaway Task screen so that `tabCartonStock` is filled.

---

## 3. Checklist

| Check | Action |
|--------|--------|
| Snapshot URL | Settings → **ERPNext API URL** = ERPNext site (not WMS API URL). Or Push Endpoint "Offline Sync" Base URL = `{ERPNext}/api/method/printechs_wms.api.offline_sync.push_wms_snapshot`. |
| Snapshot API Key | **ERPNext API Key** (or Offline Sync endpoint API Key) = key from ERPNext User → API Access. |
| Event Log DocType | In ERPNext, confirm **WMS Integration Event Log** DocType exists. |
| Data in desktop | After putaway, click Push WMS Snapshot and check message: **Sent: X stock rows**. If 0, putaway did not populate local DB or you’re on a different DB. |
| One server | If WMS API and ERPNext are the **same** site, use that same base URL for ERPNext API URL and ensure the path ends with `.../api/method/printechs_wms.api.offline_sync.push_wms_snapshot`. |

---

## 4. Quick test

1. In desktop Settings, set **ERPNext API URL** and **ERPNext API Key** (or add Offline Sync push endpoint to ERPNext).
2. Click **Push WMS Snapshot**.
3. Check the popup: **“Sent: X stock rows … ERPNext processed: …”**.
4. In ERPNext, open **WMS Integration Event Log**. You should see a new row. If not, the request is still not reaching ERPNext or the Event Log DocType is missing.
5. Open **WMS Stock Balance**. If the snapshot had stock rows and ERPNext processed them, new or updated rows should appear.
