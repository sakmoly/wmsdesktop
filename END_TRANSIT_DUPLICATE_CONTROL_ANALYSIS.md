# End Transit Duplicate Control – Analysis and Changes

## Problem
- **Duplicate End Transit**: Clicking "Push WMS Snapshot" was calling `end_transit_create_receipt` for every Transfer In with a completed putaway task every time, so the same in-transit stock entry could get multiple receipt Stock Entries in ERPNext.
- **Control requirement**: Update back the **Stock Entry (receipt) reference** in Putaway, and optionally **Putaway reference** in the Stock Entry, so we only end transit once per transfer in.

---

## Changes Implemented (WMS Desktop)

### 1. **tabPutawayTask – new column**
- **Column**: `receipt_stock_entry_no` (VARCHAR(100) NULL).
- **Meaning**: Stock Entry name created by ERPNext when we call `end_transit_create_receipt` (e.g. `MAT-REC-2026-00001`).
- **When set**: After a successful End Transit API call, we update the completed putaway task(s) for that Transfer In with this value.
- **Duplicate control**: When building the list for End Transit, we only include Transfer Ins whose completed putaway task has **no** `receipt_stock_entry_no` (i.e. not yet end-transited). Once set, that transfer in is skipped on the next Push WMS Snapshot.

**Migration**: `DatabaseService.EnsurePutawayTaskReceiptStockEntryNoColumnAsync` adds the column if it does not exist. It runs automatically before the end-transit step when you click Push WMS Snapshot.

### 2. **End Transit API – return created Stock Entry**
- **Before**: `EndTransitCreateReceiptAsync` returned `(bool Success, string? Error)`.
- **After**: Returns `(bool Success, string? Error, string? ReceiptStockEntryNo)`.
- The desktop parses the API response for the created Stock Entry name (tries `message.name`, `message` string, `data.name`, `stock_entry`). That value is used to update `tabPutawayTask.receipt_stock_entry_no`.

### 3. **PutawayTaskDataService**
- **GetTransferInTitlesWithCompletedPutawayAsync**: Now returns only Transfer In titles that have a completed putaway task **and** `receipt_stock_entry_no` IS NULL or empty (i.e. “not yet end-transited”). So we only call the API for transfer ins that have not been ended yet.
- **UpdateReceiptStockEntryNoForTransferInAsync(settings, transferInTitle, receiptStockEntryNo)**: Updates `tabPutawayTask` SET `receipt_stock_entry_no = @no` WHERE `transfer_in = @ti` AND `status = 'Completed'`. Called from Settings after a successful End Transit.

### 4. **SettingsViewModel (Push WMS Snapshot)**
- Before the end-transit loop: ensures `receipt_stock_entry_no` column exists.
- Calls `EndTransitCreateReceiptAsync` (which now returns the receipt Stock Entry no).
- On success: if `receiptStockEntryNo` is not empty, calls `PutawayTaskDataService.UpdateReceiptStockEntryNoForTransferInAsync(settings, ti.Title, receiptStockEntryNo)` so the putaway task stores the Stock Entry reference.

---

## Flow After Changes

1. User completes a putaway task for Transfer In `MAT-STE-2026-00014`.
2. User clicks **Push WMS Snapshot**.
3. Snapshot is pushed; then End Transit runs only for transfer ins that have completed putaway and **no** `receipt_stock_entry_no`.
4. For `MAT-STE-2026-00014`, desktop calls `end_transit_create_receipt`. ERPNext creates e.g. `MAT-REC-2026-00001`.
5. Desktop parses the response, gets `MAT-REC-2026-00001`, and runs `UPDATE tabPutawayTask SET receipt_stock_entry_no = 'MAT-REC-2026-00001' WHERE transfer_in = 'MAT-STE-2026-00014' AND status = 'Completed'`.
6. Next time user clicks Push WMS Snapshot, `MAT-STE-2026-00014` is **excluded** from the end-transit list (because it already has `receipt_stock_entry_no` set). No duplicate receipt.

---

## What You Need on ERPNext Side

### 1. **API response must return the created Stock Entry name**
For duplicate control to work, `end_transit_create_receipt` should return the name of the newly created receipt Stock Entry so the desktop can store it. For example one of:

- `{"message": {"name": "MAT-REC-2026-00001"}}`
- `{"message": "MAT-REC-2026-00001"}`
- `{"data": {"name": "MAT-REC-2026-00001"}}`
- `{"stock_entry": "MAT-REC-2026-00001"}`

The desktop already tries these patterns in `TryParseStockEntryNoFromResponse`. If your API uses a different key, add that key in `ErpNextWmsSyncApiService.TryParseStockEntryNoFromResponse` (or change the API to one of the above).

### 2. **Update Putaway Number in Stock Entry (optional)**
You asked to “update putaway Number in Stock Entry”. Two options:

**Option A – ERPNext API accepts putaway reference**  
- Extend the `end_transit_create_receipt` payload to accept an optional field, e.g. `putaway_task_title` (e.g. `PUT-20260224-0001`).
- When creating the receipt Stock Entry in ERPNext, set a custom field or remarks from this value (e.g. `wms_putaway_task` or in `remarks`).
- In the desktop, we can then pass the putaway task title when calling the API (we have the transfer in and can look up the completed putaway task title). This would require a small change in the desktop to send `putaway_task_title` in the payload and possibly a new optional field in the DTO.

**Option B – ERPNext only**  
- After creating the receipt Stock Entry, your API (or a separate API) updates that Stock Entry doc with the putaway task reference (e.g. from a custom field or from the request if you add `putaway_task_title` to the request).

If you tell us the exact field name and payload shape (e.g. `putaway_task_title` in `payload`), we can add it to the desktop request in a follow-up.

---

## Summary Table

| Location              | Change |
|-----------------------|--------|
| **tabPutawayTask**     | New column `receipt_stock_entry_no`; stores created Stock Entry name after End Transit. |
| **DatabaseService**   | `EnsurePutawayTaskReceiptStockEntryNoColumnAsync` adds column if missing. |
| **ErpNextWmsSyncApiService** | `EndTransitCreateReceiptAsync` returns `ReceiptStockEntryNo`; `TryParseStockEntryNoFromResponse` parses response. |
| **PutawayTaskDataService** | `GetTransferInTitlesWithCompletedPutawayAsync` excludes rows that already have `receipt_stock_entry_no`; new `UpdateReceiptStockEntryNoForTransferInAsync`. |
| **SettingsViewModel** | Ensures column; after successful End Transit, updates putaway with receipt Stock Entry no. |

Result: **Stock Entry reference is stored in Putaway**; only transfer ins **not yet end-transited** get the API call, so duplicate End Transit creation is avoided.
