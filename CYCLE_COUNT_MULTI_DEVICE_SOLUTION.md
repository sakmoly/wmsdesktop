# Cycle Count – Multiple Devices: Solution & How to Handle

This document addresses your concerns when **multiple devices** are used for cycle counting: conflicts on the same bin, heavy or failing per-scan sync to ERPNext, and partial/duplicate updates when the network is unstable.

---

## 1. Problems (Recap)

| # | Problem | Impact |
|---|--------|--------|
| **A** | Multiple devices counting the **same bin** at the same time | Conflicting counts, double updates, confusion over who “owns” the result. |
| **B** | Sending **each transaction/scan** to ERPNext | Too many API calls, failures under load, ERPNext or network overload. |
| **C** | **Unstable network** → partial updates or duplicates | ERPNext gets incomplete data or the same update twice (e.g. on retry). |

---

## 2. Recommended Approach (Summary)

1. **One device per bin per task** – Use **task assignment** (and optional **lock**) so only one device can count a given bin for a given task. Other devices see “Already assigned” or “In progress by another device” and cannot start or edit.
2. **Do not push every scan to ERPNext** – Devices send count lines to the **WMS API** only (or store offline). Push to **ERPNext once per task** when the cycle count task is **completed** (or when user clicks “Sync to ERP”).
3. **One batch, idempotent push** – When pushing to ERPNext, send **one payload per completed task** (e.g. via `push_wms_snapshot` or a dedicated cycle-count sync). Use a **unique event/task id** so retries do not create duplicates (ERPNext can ignore “already processed”).

---

## 3. Solution in Detail

### 3.1 Multiple devices, same bin (conflicts)

**Goal:** Only one device should be counting a given bin for a given cycle count task at a time.

**Option A – Use existing “Assigned To” (recommended first step)**  
- Your tasks already have **Assigned To** (e.g. USER-864144).  
- **Process:** When creating or assigning a cycle count task, set **Assigned To** to the user/device that will count that bin.  
- **On device (mobile/tablet):**  
  - When opening a task, send current user/device id (e.g. `user_code` or `device_id`).  
  - **Backend (WMS API):** If the task’s `assigned_to` is not empty and does not match the current user, return an error like: *“This task is assigned to [USER-X]. You cannot count it.”*  
  - So only the assigned device can start/update that task.  
- **Desktop:** When assigning tasks, ensure each bin/task is assigned to exactly one user. Avoid assigning the same bin to two people.

**Option B – “Lock when started” (stronger guarantee)**  
- When a device **starts** a task (e.g. first scan or “Start” action), the API sets a **locked_by** (e.g. `device_id` or `session_id`) and **locked_at** on the task.  
- Any other device that tries to start or update the same task gets: *“Task is being counted by device [X]. Try again later.”*  
- When the task is **completed** or **cancelled**, clear `locked_by` so the bin can be recounted if needed.

**Implementation focus:**  
- **WMS API:** In start/update cycle count endpoints, check `assigned_to` (and optionally `locked_by`). Reject if another user/device owns the task.  
- **Mobile app:** Show “Assigned to: USER-X” and disable Start/Count if the current user is not the assignee.  
- **Desktop:** No need to block; assignment is done here. Optionally show a warning if someone tries to open the same task on two machines.

---

### 3.2 Do not send every scan to ERPNext (too heavy / fails)

**Goal:** ERPNext receives **one consolidated update per cycle count task**, not one per scan.

**Current / recommended flow:**  
1. **Device (mobile/tablet):**  
   - Scans/counts are sent to the **WMS API** only (e.g. `POST /api/cycle-count/{title}/count` or similar).  
   - Or stored **offline** and synced to WMS API when online (batch of lines for that task).  
2. **WMS (API + DB):**  
   - Stores count lines and updates task status (In Progress → Review → Completed).  
   - **Do not** call ERPNext on every count line.  
3. **When task is completed:**  
   - **Desktop** (when completion is done from desktop): Already triggers a snapshot push after “WMS transaction” completed (if cycle count is driven by a WMS transaction).  
   - **Or** when cycle count is completed via API: have the **WMS API** run **one** “sync to ERPNext” action after `Complete` (e.g. push_wms_snapshot or a dedicated cycle count sync).  
   - **Or** user clicks **“Sync to ERP”** once per task (or once for many tasks) on desktop – then desktop builds snapshot and pushes.

**Result:** ERPNext gets a single update per task (or one snapshot with all recent stock changes), not hundreds of small updates. This avoids “sending each transaction/scan to ERPNext” and reduces failures.

---

### 3.3 Partial updates / duplicates (unstable network)

**Goal:** Even with retries and bad network, ERPNext gets **exactly one** applied update per completed task (no partial state, no duplicates).

**Measures:**  
1. **One batch per task (or per snapshot):**  
   - Send full state (or full delta for that task) in **one** request.  
   - If the request fails, the client retries the **same** request.  
   - Do not send “line 1”, “line 2”, … separately so that only some lines arrive.  

2. **Idempotency:**  
   - Include a **unique id** in the payload (e.g. `event_uuid` for push_wms_snapshot, or `cycle_count_task_title` + `completed_at` for a cycle-count sync).  
   - ERPNext (or your backend) stores “already processed” ids.  
   - If the same id is sent again (retry after timeout), ERPNext responds “OK” but **does not apply again** (no duplicate adjustment).  

3. **Offline-first on device:**  
   - Device saves counts locally. When back online, syncs **whole task** to WMS API in one go.  
   - Then **one** push to ERPNext after task completion.  
   - This avoids “half the scans sent, then network fails” and keeps ERPNext consistent.

---

## 4. What You Already Have (Desktop)

- **Assigned To** on cycle count tasks – use it to enforce “one device per task” in the API.  
- **Start → Submit → Complete** flow via `CycleCountApiService` – completion is a single event; good moment to trigger **one** push to ERPNext.  
- **push_wms_snapshot** and **TryPushSnapshotAfterTransaction** – snapshot is already pushed after WMS transaction completed (including cycle count when it goes through that path). So if cycle count completion creates/updates a WMS transaction and marks it Completed, one snapshot push already happens.  
- For **cycle count completed via API only** (e.g. from mobile): add **one** call to push snapshot (or cycle-count sync) **inside the WMS API** after the cycle count complete endpoint succeeds, so ERPNext is updated without per-scan calls.

---

## 5. Checklist (What to Do)

| Area | Action |
|------|--------|
| **Conflict (same bin)** | In WMS API: reject Start/Update count if task is `assigned_to` another user (and optionally enforce `locked_by` when task is In Progress). On mobile: show assignee and disable counting if not assigned to current user. |
| **Too heavy / fails** | Do **not** call ERPNext from the device per scan. Device → WMS API only. Push to ERPNext **once per task** when task is completed (from desktop or from API after complete). |
| **Partial / duplicates** | Send **one** payload per completed task (or one snapshot). Use **unique event/task id** and make ERPNext (or backend) **idempotent** (ignore duplicate id). Prefer offline-first on device, then one sync of the full task. |

---

## 6. Optional (not implemented): Push snapshot after cycle count complete (desktop)

If you later want ERPNext to get the latest stock when a cycle count is completed from the Operations Console, you could call **`WmsSnapshotDataService.TryPushSnapshotAfterTransaction(settings)`** after `CycleCountApiService.CompleteCycleCountAsync` succeeds in `CycleCountTaskDetailViewModel.CompleteCycleCountAsync`. For now this is analysis only; no code change applied.

---

## 7. Summary

- **Multiple devices, same bin:** Use **Assigned To** (and optional **locked_by**) so only one device can count a bin per task; enforce in WMS API and show assignee on mobile.  
- **Per-scan to ERPNext:** **Don’t.** Sync counts to WMS API only; push to ERPNext **once per task** when the task is completed (or once per “Sync to ERP” action).  
- **Unstable network:** Send **one batch** per task with a **unique id**; make ERPNext handling **idempotent** and prefer **offline-first** on the device, then one full sync.

If you tell me which part you want implemented first (e.g. “enforce Assigned To in API” or “push snapshot after cycle count complete on desktop”), I can outline or apply the exact code changes next.
