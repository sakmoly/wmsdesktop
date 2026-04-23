# Why Was the Putaway Task Not Created?

## Summary

Putaway tasks are **not created automatically** in all flows. They are only created when specific code is run. If that code is never triggered (no button, no automatic call), **no putaway task will exist**.

---

## 1. Transfer In → Putaway Task

**Intended flow:** For each Transfer In, a putaway task should be created so warehouse staff can put away the received items.

**Why it wasn’t created:** The desktop app **never called** the method that creates the putaway task.

- **Method that creates it:** `PutawayTaskDataService.CreatePutawayTaskFromTransferInAsync(settings, transferInTitle, inboundSessionTitle, createdBy)`
- **Reality:** No screen or flow in the desktop invoked this method (no “Create Putaway Task” action).

**What was added:** A **“Create Putaway Task”** button on the **Transfer In Details** window. Use it after you have the Transfer In in the app (synced from ERPNext or imported):
1. Open **Transfer In** list and double‑click a Transfer In (or open it).
2. Click **“Create Putaway Task”**.
3. If the Transfer In has items in `tabTransferInItem`, a putaway task is created (or you see a message that one already exists).

**Requirements for creation to succeed:**
- Transfer In must exist in local DB (`tabTransferIn` / `tabTransferInItem`).
- Table `tabPutawayTask` must have a `transfer_in` column (and optionally `source_type`).
- There must be at least one row in `tabTransferInItem` for that Transfer In.

---

## 2. ASN (Advance Shipping Notice) → Putaway Task

**Intended flow:** After receiving items from an ASN, the app should route them: if there is **no** Transfer Order for that ASN → create a Putaway Task; if there **is** a Transfer Order → route to Sorting (no putaway).

**Why it wasn’t created:** The method that creates the putaway task is **never called** from the app.

- **Method that creates it:** `ReceivingRoutingService.RouteReceivedItemsAsync(settings, asnNo, inboundSessionTitle)`  
  which in turn calls `PutawayTaskDataService.CreatePutawayTaskFromAsnAsync(...)` when there is no Transfer Order.
- **Reality:** No part of the desktop (receiving flow, inbound session, etc.) calls `RouteReceivedItemsAsync`. So putaway is never created after ASN receiving.

**What you can do:**
- **Option A:** From your **receiving completion** flow (e.g. when user marks ASN receiving as done), call:
  - `ReceivingRoutingService.RouteReceivedItemsAsync(settings, asnNo, inboundSessionTitle)`
  so that putaway is created when there is no Transfer Order.
- **Option B:** Add a “Create Putaway Task” (or “Route to Putaway”) button on the ASN/Inbound screen that calls the same method, so the user can trigger it manually after receiving.

**Additional reason (if you do call the method):** If a **Transfer Order** exists for that ASN, the logic intentionally **does not** create a putaway task (items are routed to Sorting instead). So “putaway was not created” can also mean “it was correct not to create one because of the Transfer Order”.

---

## Quick reference

| Source        | Creates putaway?        | When / How                                                                 |
|---------------|-------------------------|-----------------------------------------------------------------------------|
| **Transfer In** | Yes                     | User clicks **“Create Putaway Task”** on Transfer In Details (now added).  |
| **ASN**         | Only if no Transfer Order | When `RouteReceivedItemsAsync` is called (currently **not** called in app). |

If you want ASN putaway creation to be automatic, the receiving completion step must call `RouteReceivedItemsAsync`.
