# ASN status push error – server fix (update_asn_wms_status)

## File to edit

**`apps/printechs_wms/printechs_wms/api/wms_sync.py`**  
Function: **`update_asn_wms_status`**

---

## Minimal fix (recommended)

Find this block:

```python
    # Set ERP status (only if field exists)
    erp_status_set = None
    if _safe_set(doc, "status", erp_status):
        erp_status_set = erp_status
    else:
        # if no status field exists, try wms_status
        _safe_set(doc, "wms_status", incoming)
```

**Replace it with:**

```python
    # Set ERP status (only if field exists)
    # Do NOT set status to "Open" for submitted docs (Received -> Open triggers UpdateAfterSubmitError)
    erp_status_set = None
    if cint(doc.docstatus) == 1 and erp_status == "Open":
        # Desktop sent "Exported" -> mapped to "Open"; skip changing status on submitted ASN
        pass
    elif _safe_set(doc, "status", erp_status):
        erp_status_set = erp_status
    else:
        # if no status field exists, try wms_status
        _safe_set(doc, "wms_status", incoming)
```

So you only add:

1. The comment about not setting "Open" for submitted docs.
2. The condition `if cint(doc.docstatus) == 1 and erp_status == "Open":` with `pass`.
3. Change the first `if` to `elif`.

---

## Optional: also accept desktop’s wms_ref

Desktop sends the reference as **`wms_ref`**. Your code reads **`wms_reference`**. To save it when the desktop pushes, ensure you read both. Right after the `if note:` block (and before `doc.flags.ignore_permissions`), add:

```python
    # Desktop sends wms_ref
    wms_ref = frappe.local.form_dict.get("wms_ref") or wms_reference
    if wms_ref:
        _safe_set(doc, "wms_reference", wms_ref)
```

(If you already have something that sets `wms_reference` from form params, you can use that; otherwise the snippet above is enough.)

---

## Summary

| Change | Purpose |
|--------|--------|
| Skip `doc.status = "Open"` when `doc.docstatus == 1` | Prevents UpdateAfterSubmitError when ASN is already Received and desktop sends Exported. |
| Optional: read `wms_ref` from form | Saves the WMS reference sent by the desktop. |

After this, Push & Pull can post ASN status "Exported" without changing a submitted ASN’s status from Received to Open; only `wms_status` / note / `wms_reference` are updated.
