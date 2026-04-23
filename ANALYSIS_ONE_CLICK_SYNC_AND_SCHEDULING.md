# Analysis: One-Click Sync, Immediate Push from Mobile, and Scheduling

**No code changes in this document — analysis only.**

---

## 1. One-click “run all pending” (main or home screen)

### Current state

- **“Sync all (items + warehouses + item groups)”** in Settings runs only:
  - Pull: Items, Warehouses, Item Groups from ERPNext.
- It does **not** run:
  - Sync ASNs (ERPNext)
  - Sync TOs (ERPNext)
  - Sync Material Requests (ERPNext)
  - Sync Transfer In (ERPNext)
  - **Push WMS Snapshot** (send WMS data to ERPNext)
  - Any other push endpoints (ASN status, Cycle Count, End Transit, etc.)

So today the user must click several buttons to “do everything”: one or more pulls, then Push WMS Snapshot (and optionally others).

### Easiest way for the user (one click)

**Option A – Single “Run all pending” / “Full sync & push” button**

- **What it does:** One command that runs a fixed sequence, for example:
  1. **Pulls (from ERPNext):**  
     Sync ASNs → Sync TOs → Sync Material Requests → Sync Transfer In  
     (and optionally existing “Sync all” for items/warehouses/item groups, or run that first).
  2. **Push (to ERPNext):**  
     Push WMS Snapshot (which already includes End Transit for completed putaway Transfer Ins).

- **Where to put it:**
  - **Main / home:** Add a **Home** or **Dashboard** view as the default content when the app opens. On it, put one prominent button, e.g. **“Run all pending”** or **“Sync & push to ERPNext”**, that runs the sequence above. No code change to existing buttons; this is an additional entry point.
  - **Alternative:** Same single command in the **Settings** tab (e.g. next to “Sync all”) so power users can still use it from there. Optionally also expose it on Home for visibility.

- **Implementation note:** Reuse existing methods in `SettingsViewModel` (`SyncAsnsFromErpNextAsync`, `SyncTransferOrdersFromErpNextAsync`, `SyncMaterialRequestsFromErpNextAsync`, `SyncTransferInFromErpNextAsync`, `PushWmsSnapshotAsync`) and call them in order from one new async method (e.g. `RunAllPendingSyncAndPushAsync`). Show a single progress or summary when done.

**Option B – “Sync all” extended**

- Extend the existing **“Sync all”** so it also runs ASN, TO, MR, Transfer In sync and then Push WMS Snapshot. Same idea as above, but without a separate Home; user still goes to Settings and clicks one button.

**Recommendation:** Option A with a **Home/Dashboard** and one **“Run all pending”** button gives the clearest “one click somewhere on main/home” experience. Option B is less UI change but keeps everything under Settings.

---

## 2. Send data to ERPNext immediately when received from mobile to desktop

### Current state

- **Mobile** sends data to **wms-api** (Node.js; e.g. `http://localhost:3000`).
- **Desktop** uses **MySQL** (host/DB in WMS Settings). When wms-api and desktop point to the **same** MySQL database, data “from mobile” is data that wms-api has written into shared tables (e.g. events, stock transactions, carton stock, material request picks).
- There is **no automatic** “as soon as mobile data is in the DB, push to ERPNext.” The user must open Settings and click **“Push WMS Snapshot”** (and any other push actions) manually.

So today there is no “immediate” send to ERPNext when data is received from mobile.

### Ways to get “immediate” (or near-immediate) send to ERPNext

**Option 1 – Polling from desktop (simplest)**

- Desktop runs a **background timer** (e.g. every 1–2 minutes, or using existing `SyncFrequencyMinutes`) while the app is open.
- On each tick, it checks whether there is “new” data since last push (e.g. max `id` or `updated_at` in `tabStockTransaction` / `tabCartonStock` or a “dirty” flag).
- If there is new data, it automatically runs **Push WMS Snapshot** (and optionally other push logic).
- **Pros:** No change to wms-api or mobile; reuses existing push logic.  
- **Cons:** Not true real-time (delay = polling interval). Only runs when desktop app is running.

**Option 2 – Webhook from wms-api to desktop**

- When wms-api finishes saving data from the mobile (e.g. after event batch or pick), it **POSTs** to a configured URL (e.g. “Push URL” or a small HTTP listener on the desktop).
- Desktop exposes a minimal HTTP endpoint (e.g. “/trigger-push”) that, when called, runs **Push WMS Snapshot** (and any other push).
- **Pros:** Near real-time (push runs right after mobile data is saved).  
- **Cons:** Desktop must run an HTTP server and be reachable from the server running wms-api; more setup and security considerations.

**Option 3 – wms-api pushes to ERPNext directly**

- Move (or duplicate) the “Push WMS Snapshot” (and related) logic into **wms-api**. After wms-api saves mobile data, it immediately calls ERPNext (same API the desktop uses).
- **Pros:** Truly immediate; no dependency on desktop being open.  
- **Cons:** Requires implementing (or reusing) snapshot build + push in Node.js and configuring ERPNext URL/keys in wms-api.

**Recommendation:** For “easiest” and no backend change: **Option 1 (polling)** with an interval of 1–2 minutes (or configurable via `SyncFrequencyMinutes`). For true “immediate” and no desktop dependency: **Option 3 (wms-api pushes)**.

---

## 3. Possibilities to schedule tasks

### Current state

- **SyncFrequencyMinutes** exists in WMS Settings (default 15) but is **not used** anywhere in the codebase to run sync or push on a schedule. There is no timer that triggers sync/push periodically.
- All sync and push actions are **manual** (button clicks in the UI).

So today there is no scheduling of sync/push tasks.

### Possibilities to schedule

**Option A – In-app timer (desktop)**

- Use `DispatcherTimer` or `System.Threading.Timer` in the desktop app.
- On a fixed interval (e.g. every **SyncFrequencyMinutes**), run:
  - either only **Push WMS Snapshot**,
  - or a small set of actions (e.g. “pull ASN/TO/MR/Transfer In” then “Push WMS Snapshot”).
- **Pros:** Reuses existing code; no new process; user can configure interval via existing Settings.  
- **Cons:** Runs only when the desktop app is **open**. If the app is closed, no scheduled run.

**Option B – Windows Task Scheduler**

- Create a scheduled task that runs at fixed times (e.g. every 15 minutes).
- The task runs a small **console app** or **script** that:
  - loads WMS settings (e.g. from the same config file the desktop uses),
  - connects to the same MySQL DB,
  - runs the same sync/push logic (e.g. build snapshot + call ERPNext API), then exits.
- **Pros:** Works even when the desktop UI is closed.  
- **Cons:** Requires a separate runnable entry point (e.g. “Wms.Desktop.Console” or a script that invokes the same services). Duplicate or shared code path for snapshot + push.

**Option C – Windows Service**

- Implement a **Windows Service** that runs in the background and, on a timer, runs sync and push (same logic as desktop or console).
- **Pros:** Always on, no user login required.  
- **Cons:** More effort (service host, install/uninstall, configuration path).

**Option D – External scheduler calling an API**

- Use an external scheduler (e.g. cron, Azure Functions timer, or a job runner) that calls an **HTTP endpoint**.
- That endpoint could live on:
  - **wms-api:** e.g. `POST /api/admin/trigger-wms-push` that builds snapshot and pushes to ERPNext (same as Option 3 in section 2). No desktop involvement.
  - **Desktop:** only if the desktop exposes an HTTP endpoint (as in Option 2 above); then the scheduler calls that to trigger push.
- **Pros:** Flexible; can run on a server; no need to keep desktop open.  
- **Cons:** Requires an HTTP trigger and, for desktop, a listener and security setup.

**Recommendation:**  
- For “schedule when the app is open”: **Option A** using **SyncFrequencyMinutes** and a timer in the desktop app.  
- For “schedule even when the app is closed”: **Option B** (Task Scheduler + console/script) or **Option D** with wms-api (timer calls wms-api to push to ERPNext).

---

## Summary table

| Goal | Easiest approach |
|------|-------------------|
| **One-click run all pending** | Add a Home/Dashboard with one “Run all pending” button that runs: Pull ASNs → TOs → MR → Transfer In, then Push WMS Snapshot (reusing existing SettingsViewModel methods). |
| **Send to ERPNext “immediately” after mobile data** | Desktop polling every 1–2 min (or SyncFrequencyMinutes) to run Push WMS Snapshot when new data is detected; or wms-api pushes to ERPNext right after saving mobile data. |
| **Schedule sync/push** | In-app timer using SyncFrequencyMinutes when app is open; or Windows Task Scheduler + small console/script when app can be closed; or external scheduler calling wms-api to push. |

All of the above can be implemented without changing the **current behavior** of existing buttons; they add new entry points and/or background behavior.
