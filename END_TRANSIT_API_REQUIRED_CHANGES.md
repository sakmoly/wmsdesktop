# End Transit API – Required Changes (ERPNext) to Stop Duplicates

## Why duplicates still happen
The desktop only skips calling End Transit for a Transfer In **after** it has saved the **receipt Stock Entry name** in `tabPutawayTask.receipt_stock_entry_no`. It gets that name by **parsing the API response**. If your API does **not** return the created Stock Entry name (or returns it in a format the desktop doesn’t read), the desktop never saves it and will call the API again on every Push WMS Snapshot → **duplicate receipts**.

---

## 1. API must return the created Stock Entry name

**Endpoint:** `printechs_wms.api.intransit_transfer.end_transit_create_receipt`

**Required:** On success (after creating the receipt Stock Entry), the response body **must** include the **name of the newly created Stock Entry** (e.g. `MAT-REC-2026-00001`) in one of these forms so the desktop can parse it:

| Format | Example | Desktop reads |
|--------|--------|----------------|
| `message` object with `name` | `{"message": {"name": "MAT-REC-2026-00001"}}` | ✅ Yes |
| `message` as string (doc name) | `{"message": "MAT-REC-2026-00001"}` | ✅ Yes (if value starts with `MAT-` or `STE-`) |
| `data.name` | `{"data": {"name": "MAT-REC-2026-00001"}}` | ✅ Yes |
| `stock_entry` at root | `{"stock_entry": "MAT-REC-2026-00001"}` | ✅ Yes |
| `receipt_stock_entry` at root | `{"receipt_stock_entry": "MAT-REC-2026-00001"}` | ✅ Yes (desktop can be extended) |

**Minimal change in your API (Python):**  
After creating the receipt Stock Entry doc, return it in the response, e.g.:

```python
# In end_transit_create_receipt (or equivalent)
receipt_doc = create_receipt_stock_entry(...)  # your existing logic

# Return the name so WMS Desktop can store it and avoid duplicate calls
return {
    "message": {
        "name": receipt_doc.name   # e.g. "MAT-REC-2026-00001"
    }
}
```

Or if you use Frappe’s standard response:

```python
frappe.response["message"] = {"name": receipt_doc.name}
# or
frappe.msgprint(_("Receipt {0} created").format(receipt_doc.name))
# and ensure response includes: message.name = receipt_doc.name
```

**Important:** The desktop only stops duplicate calls when it receives a **non‑empty** name from the response and saves it to `tabPutawayTask.receipt_stock_entry_no`. If the response has no name (or a different structure), duplicates will continue.

---

## 2. (Recommended) Make the API idempotent

To avoid creating a second receipt even if the desktop calls the API twice (e.g. before the first response was processed):

- Before creating a new receipt, check if this **in_transit_stock_entry** already has a linked receipt (e.g. a “Receipt” Stock Entry that was created from it).
- If **yes**: do **not** create another; return **HTTP 200** with the **existing** receipt Stock Entry name in the same format as above (e.g. `{"message": {"name": "<existing_receipt_name>"}}`).
- If **no**: create the receipt as now and return its name as above.

Then:
- First call: creates receipt, returns name → desktop saves it → no duplicate.
- Second call (e.g. retry or bug): no new doc, returns existing name → desktop can still save that name → no duplicate.

---

## 3. How to verify

1. **Check current API response**  
   Call `end_transit_create_receipt` from Postman/browser and look at the **response body**. Is there a field that contains the new Stock Entry name (e.g. `MAT-REC-2026-00001`)?  
   - If **no** → add the return format above (e.g. `message.name`).  
   - If **yes** but under a different key → either change the API to use one of the keys in the table above, or tell us the exact key and we can add it to the desktop parser.

2. **Check desktop logs**  
   After a successful End Transit, the desktop logs something like:  
   `ErpNextWmsSyncApiService: end_transit_create_receipt created Stock Entry: MAT-REC-2026-00001`  
   If you never see that line, the desktop is not parsing the name → API response change (or parser change) is required.

3. **Check database**  
   After one successful Push WMS Snapshot (with API returning the name), run:  
   `SELECT title, transfer_in, status, receipt_stock_entry_no FROM tabPutawayTask WHERE status = 'Completed' AND transfer_in IS NOT NULL;`  
   You should see `receipt_stock_entry_no` filled for the relevant transfer in. If it stays NULL, the API is not returning the name in a format the desktop understands.

---

## Summary

| Change in API | Purpose |
|---------------|--------|
| **Return created Stock Entry name** in response (e.g. `message.name` or `data.name`) | Desktop stores it in `tabPutawayTask.receipt_stock_entry_no` and skips that transfer in on next Push WMS Snapshot → **stops duplicates**. |
| **Idempotent behaviour** (return existing receipt name if already created for this in_transit_stock_entry) | Prevents duplicate receipts even if the desktop calls the API more than once. |

Without (1), the desktop has no way to “remember” that a receipt was already created, so duplicates will continue.
