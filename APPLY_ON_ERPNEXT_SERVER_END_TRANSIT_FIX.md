# Apply on ERPNext Server: Fix _find_existing_receipt NameError

The error happens in **printechs_wms** on your ERPNext server (e.g. printechsdammam.dyndns.org), not in the desktop app.

**File to edit on server:** `apps/printechs_wms/printechs_wms/api/intransit_transfer.py`

---

## Option A: Add the missing function (recommended)

1. Open `intransit_transfer.py` on the server.
2. **Above** the function `end_transit_create_receipt` (around line 369), paste this:

```python
def _find_existing_receipt(in_transit_stock_entry):
    """
    If a receipt Stock Entry was already created for this in-transit Stock Entry,
    return its name so we can return it instead of creating a duplicate.
    """
    if not in_transit_stock_entry or not isinstance(in_transit_stock_entry, str):
        return None
    name = (in_transit_stock_entry or "").strip()
    if not name or not frappe.db.exists("Stock Entry", name):
        return None

    meta = frappe.get_meta("Stock Entry")
    for field_name in ("receipt_stock_entry", "custom_receipt_stock_entry"):
        if meta.has_field(field_name):
            existing = frappe.db.get_value("Stock Entry", name, field_name)
            if existing:
                return existing

    for ref_field in ("in_transit_stock_entry", "custom_in_transit_stock_entry", "outgoing_stock_entry"):
        if meta.has_field(ref_field):
            receipt = frappe.db.get_value(
                "Stock Entry",
                {ref_field: name, "docstatus": 1},
                "name",
                order_by="creation desc"
            )
            if receipt:
                return receipt

    return None
```

3. Save the file. Restart/reload your ERPNext app (e.g. `bench restart` or restart the process).
4. Call End Transit again from the desktop; the error should be gone.

---

## Option B: Quick workaround (no new function)

If you cannot add the helper yet, you can **temporarily** remove the call so the API at least runs (no idempotency: every call may create a new receipt).

1. Open `intransit_transfer.py` on the server.
2. Go to the line that looks like:
   ```python
   existing = _find_existing_receipt(in_transit_se)
   ```
3. Comment it out and the block that uses `existing`. For example change:

   ```python
   existing = _find_existing_receipt(in_transit_se)
   if existing:
       frappe.response["message"] = { ... }
       return
   ```

   to:

   ```python
   # existing = _find_existing_receipt(in_transit_se)
   # if existing:
   #     frappe.response["message"] = { ... }
   #     return
   ```

4. Save and restart. End Transit will work, but duplicate calls might create duplicate receipt Stock Entries until you add Option A.

---

## After applying

- From the desktop: run **Push & Pull** or click **End Transit** on a completed Transfer In putaway task. You should no longer see `NameError: name '_find_existing_receipt' is not defined`.
- Prefer **Option A** so the API is idempotent and the desktop can safely retry.
