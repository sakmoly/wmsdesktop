# Fix: ASN Status "Exported" ValidationError

## Error

```
ValidationError: Status cannot be "Exported". It should be one of "Draft", "Open", "Completed", "Cancelled"
```

The desktop posts ASN status **Exported** to `update_asn_wms_status` after syncing ASNs. Your ERPNext ASN DocType’s **status** field only allows the four values above, so saving with `status = "Exported"` raises this error.

---

## Option A – Use a separate “export” field (recommended)

Keep the main **status** for workflow (Draft → Open → Completed/Cancelled) and use a dedicated field for “exported to WMS”.

### 1. In ERPNext (printechs_wms)

1. **Add a field to the ASN DocType** (if it doesn’t exist):
   - Fieldname: `wms_export_status` (or `export_status`)
   - Type: **Data** or **Select**
   - Options (if Select): `Pending`, `Exported`
   - Default: `Pending`

2. **Update `update_asn_wms_status`** in `printechs_wms/api/wms_sync.py` as in the snippet below so that when the desktop sends `status=Exported` you set `wms_export_status` (or your field) instead of `doc.status`.

3. **Update `get_asns_for_wms`** (if you use `export_pending=1`): filter ASNs where `wms_export_status != "Exported"` (or is null) so already-exported ASNs are not re-sent. If you currently filter by something like `status != "Exported"`, change it to use `wms_export_status` (or `export_status`) instead.

### 2. Snippet for `update_asn_wms_status`

Replace or adjust the part that sets status and saves (around line 259) so it looks like this:

```python
# update_asn_wms_status - handle "Exported" without changing main status
status = (frappe.form_dict.get("status") or "").strip()
asn_name = (frappe.form_dict.get("asn_name") or "").strip()
if not asn_name:
    frappe.throw("asn_name is required")

doc = frappe.get_doc("Advance Shipment Notice", asn_name)  # use your ASN doctype name if different

if status == "Exported":
    # Use a separate export field so we don't change main status (which may only allow Draft/Open/Completed/Cancelled)
    if doc.meta.has_field("wms_export_status"):
        doc.wms_export_status = "Exported"
    elif doc.meta.has_field("export_status"):
        doc.export_status = "Exported"
    else:
        frappe.throw(
            "ASN DocType must have either 'Exported' in status options (Customize DocType) "
            "or a field 'wms_export_status' / 'export_status' for WMS export."
        )
    if frappe.form_dict.get("wms_ref"):
        doc.db_set("wms_ref", frappe.form_dict.get("wms_ref"))
else:
    doc.status = status
    if frappe.form_dict.get("wms_ref") and doc.meta.has_field("wms_ref"):
        doc.wms_ref = frappe.form_dict.get("wms_ref")

doc.save(ignore_permissions=True)
```

Use your actual ASN doctype name (e.g. `"Advance Shipment Notice"` or `"ASN"`) and field names (`wms_export_status` / `export_status`) to match your app.

---

## Option B – Add "Exported" to status options

If you prefer to keep using the main **status** for “Exported”:

1. In ERPNext: **Customize Form** → open the ASN DocType.
2. Edit the **status** field and add **Exported** to the options (e.g. Draft, Open, Exported, Completed, Cancelled).
3. Save.

Then the existing `update_asn_wms_status` logic that does `doc.status = "Exported"` and `doc.save()` will work without change.

---

## Summary

| Option | Pros | Cons |
|--------|------|------|
| **A – wms_export_status field** | Keeps main status for business workflow; clear “exported to WMS” meaning | Requires one new field and small API change |
| **B – Add "Exported" to status** | No new field; minimal change | Mixes “exported to WMS” with workflow status |

Use **Option A** if you want to keep status strictly as Draft/Open/Completed/Cancelled; use **Option B** for a quick fix with no new field.
