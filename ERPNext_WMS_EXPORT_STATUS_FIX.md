# ERPNext: Fix WMS Export Status Update Error

---

## Error: `update_asn_wms_status` method not found (2026-02-02)

When the desktop app posts ASN status to ERPNext, the server may return:

```text
ValidationError: Failed to get method for command printechs_wms.api.wms_sync.update_asn_wms_status
with module 'printechs_wms.api.wms_sync' has no attribute 'update_asn_wms_status'
```

### Cause

The **printechs_wms** app on the ERPNext server does not expose a whitelisted method named `update_asn_wms_status` in `wms_sync.py`. The desktop calls:

- `POST /api/method/printechs_wms.api.wms_sync.update_asn_wms_status`  
  with form body: `asn_name`, `status`, `wms_ref`.

If that function is missing, renamed, or not whitelisted, Frappe returns the error above.

### Fix (on ERPNext server)

1. Open **printechs_wms/api/wms_sync.py** on the ERPNext server.
2. Ensure there is a **whitelisted** function named exactly **`update_asn_wms_status`**, for example:

   ```python
   @frappe.whitelist()
   def update_asn_wms_status(asn_name=None, status=None, wms_ref=None):
       """Update wms_export_status and optional wms_ref for an Advance Shipping Notice."""
       if not asn_name:
           frappe.throw("asn_name is required")
       # Optional: use direct DB update to avoid UpdateAfterSubmitError (see Error 2)
       frappe.db.set_value("Advance Shipping Notice", asn_name, "wms_export_status", status or "Exported")
       if wms_ref:
           frappe.db.set_value("Advance Shipping Notice", asn_name, "wms_ref", wms_ref)
       frappe.db.commit()
       return {"ok": True}
   ```

3. Restart the app (e.g. `bench restart`). Then run **ASN sync** again from the desktop; the status push should succeed.

If your app uses a **different method name** (e.g. `update_asn_wms_export_status`), either add an alias or add the exact name `update_asn_wms_status` that the desktop expects.

---

## Error 1: TypeError `update_modified` (doc.save)

When the WMS desktop app posts ASN "Exported" status to ERPNext, the server may return:

```text
TypeError: Document._save() got an unexpected keyword argument 'update_modified'
```

Traceback points to:

- **File:** `apps/printechs_wms/printechs_wms/api/wms_sync.py`
- **Line:** ~222 in `_apply_wms_export_updates_via_doc`
- **Code:** `doc.save(update_modified=True)`

## Cause

In newer Frappe versions, `Document._save()` no longer accepts the `update_modified` keyword argument. The parameter was removed or changed in the Frappe API.

## Fix (on ERPNext server)

1. On the ERPNext server, open:
   - `printechs_wms/api/wms_sync.py`
2. Find the line (around line 222) that looks like:
   - `doc.save(update_modified=True)`
3. Change it to:
   - `doc.save()`

So the call becomes a simple save without the `update_modified` argument. The document will still be saved; only the optional "update modified timestamp" behavior is no longer passed.

## After applying

Restart the ERPNext/Frappe app (e.g. `bench restart`), then run **ASN sync** again from the WMS desktop app. The "WMS Export Status" in ERPNext should update to "Exported" without errors.

## Optional: search for other occurrences

If you have other custom code that calls `doc.save(update_modified=True)`, update those to `doc.save()` as well:

```bash
grep -r "update_modified=True" apps/printechs_wms/
```

---

## Error 2: UpdateAfterSubmitError (after fixing Error 1)

After fixing the `update_modified` issue, you may see:

```text
frappe.exceptions.UpdateAfterSubmitError: Not allowed to change WMS Export Status after submission from Pending to Exported
```

Traceback points to `validate_update_after_submit()` during `doc.save()` in `wms_sync.py` (e.g. line 222 in `_apply_wms_export_updates_via_doc`).

### Cause

The Advance Shipping Notice doctype in ERPNext does not allow changing **WMS Export Status** after the document is submitted. Frappe's "update after submit" validation blocks the change when you load the doc and call `doc.save()`.

### Fix (on ERPNext server)

Update the status **without** going through full document validation, by writing directly to the database in `wms_sync.py` instead of loading the doc and saving.

1. Open `printechs_wms/api/wms_sync.py`.
2. Find the function that applies WMS export updates (e.g. `_apply_wms_export_updates_via_doc` around lines 215–225) where it:
   - Loads the document (`frappe.get_doc(...)`),
   - Sets `wms_export_status` (and possibly `wms_ref`),
   - Calls `doc.save()`.
3. Replace that logic with a **direct DB update** so "update after submit" is not triggered:

**Option A – Prefer direct DB update (recommended)**

Use `frappe.db.set_value` and commit, and do **not** call `doc.save()` for this update:

```python
def _apply_wms_export_updates_via_doc(doctype, docname, status, wms_ref=None):
    frappe.db.set_value(doctype, docname, "wms_export_status", status)
    if wms_ref:
        frappe.db.set_value(doctype, docname, "wms_ref", wms_ref)
    frappe.db.commit()
    return True
```

(Adjust function name and signature to match your existing code; the important part is using `frappe.db.set_value` + `frappe.db.commit()` instead of `doc.save()`.)

**Option B – Allow field on submit (doctype level)**

If you prefer to keep using `doc.save()`:

1. In ERPNext, go to **Customize Form** (or the Advance Shipping Notice doctype definition).
2. Open **Advance Shipping Notice**.
3. Find the **WMS Export Status** field and enable **"Allow on Submit"** (or equivalent) so the field can be updated after the document is submitted.
4. Save and clear cache if needed.

After applying **either** Option A or B, restart the app (e.g. `bench restart`) and run **Run ASN sync test** again from the desktop app. The Status Push step should pass and WMS Export Status in ERPNext should show "Exported".

---

## Error 3: Transfer Order – "WMS Export Status cannot be 'Pending'"

When creating or importing **Transfer Orders** (e.g. TO-TEST-00001), the API may return:

```text
WMS Export Status cannot be 'Pending'. It should be one of '\nPending\nReserved\nExported'
```

The message lists "Pending" as valid but still rejects it. That usually means the server allows only **Reserved** or **Exported** when *setting* the field on create/import, not "Pending".

### Cause

The Transfer Order doctype (or import API) validates `wms_export_status` and disallows the value "Pending" for the create/import operation, even though Pending is a valid display state.

### Fix options

**Option A – Server-side (ERPNext / printechs_wms): allow "Pending" on create/import**

- In the Transfer Order import/create API (e.g. in `wms_sync.py` or the doctype API that creates TOs), change validation so that `wms_export_status = "Pending"` is allowed when creating or importing a TO.
- Or omit validation for this field on create and default new TOs to "Pending" when the client does not send it.

**Option B – Client / import data: don't send "Pending"**

- When the payload is built (Excel import, API client, or ERPNext import script), either **omit** `wms_export_status` for new TOs (let the server default it), or send **"Reserved"** instead of "Pending" if the server requires a non-Pending value on create.

**Option C – Server default when field is missing**

- In the TO create/import handler, if `wms_export_status` is not provided, set it to "Pending" (or "Reserved") and do not run the "allowed values" check against "Pending" for new records.

After applying the appropriate option, re-run the Transfer Order import; the "WMS Export Status cannot be 'Pending'" error should stop.

### Quick fix (ERPNext server)

1. On the ERPNext server, open the **printechs_wms** app and find where Transfer Order import/creation validates `wms_export_status` (search for the exact error message: `WMS Export Status cannot be`).
2. **Remove or relax** that validation so that **"Pending"** is allowed for new Transfer Orders (e.g. when `doc.docstatus == 0` or on insert).
3. In the same create/import flow, **default** `wms_export_status` to **"Pending"** when the field is missing or empty:  
   `if not doc.get("wms_export_status"): doc.wms_export_status = "Pending"`.
4. Save, clear cache, and re-run the Transfer Order import.

See also **SCRIPTS/ERPNext_TransferOrder_WmsExportStatus_Pending_Fix.py** in this repo for a copy-paste patch and examples.

---

## get_tos_for_wms: exclude Exported TOs when export_pending=1

When the WMS desktop calls `get_tos_for_wms?export_pending=1&include_items=1`, it expects **only** Transfer Orders whose **WMS Export Status** is still pending (e.g. "Pending"), not "Exported".

If the API returns TOs that are already "Exported" in ERPNext, the desktop will sync them again and show "updated: 1" every time, because the TO already exists locally and is just refreshed.

### Fix (on ERPNext server)

In **printechs_wms** (e.g. in `wms_sync.py` or wherever `get_tos_for_wms` is implemented):

1. When the request includes **`export_pending=1`** (or equivalent), apply a filter so that only TOs with **`wms_export_status != "Exported"`** (or `wms_export_status == "Pending"`) are returned.
2. Example filter logic:
   - If `export_pending=1`: add to the query/filter: `["wms_export_status", "!=", "Exported"]` (or `["wms_export_status", "in", ["Pending", ""]]` depending on your field options).
3. After this change, once a TO is marked "Exported" (by the desktop’s `update_transfer_order_wms_status` call), it will no longer appear in `get_tos_for_wms?export_pending=1`, and the desktop will show **Fetched: 0, updated: 0** on the next sync instead of "updated: 1".
