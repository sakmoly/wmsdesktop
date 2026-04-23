# -*- coding: utf-8 -*-
"""
PATCH for update_asn_wms_status in wms_sync.py
File: apps/printechs_wms/printechs_wms/api/wms_sync.py

REPLACE the block from "# Set ERP status" through "doc.save()" (inclusive)
with the code below. This avoids UpdateAfterSubmitError when desktop sends
status=Exported and the ASN is already submitted with status=Received.
"""

# ========== REPLACE FROM HERE (in update_asn_wms_status) ==========
    # Set ERP status (only if field exists)
    # Do NOT set status to "Open" for submitted docs (e.g. Received -> Open triggers UpdateAfterSubmitError)
    erp_status_set = None
    if cint(doc.docstatus) == 1 and erp_status == "Open":
        # Desktop sent "Exported" -> we mapped to "Open"; skip changing status on submitted ASN
        pass
    elif _safe_set(doc, "status", erp_status):
        erp_status_set = erp_status
    else:
        # if no status field exists, try wms_status
        _safe_set(doc, "wms_status", incoming)

    # Optional fields (desktop sends wms_ref as form param)
    wms_ref = frappe.local.form_dict.get("wms_ref") or wms_reference
    if wms_ref:
        _safe_set(doc, "wms_reference", wms_ref)

    if note:
        if not _safe_set(doc, "wms_note", note):
            _safe_set(doc, "note", note)

    doc.flags.ignore_permissions = True
    doc.save()

    return {
        "ok": True,
        "asn_name": asn_name,
        "incoming_status": incoming,
        "erp_status_set": erp_status_set,
        "allowed_status": allowed_status,
        "external_status_saved_to": external_saved_to,
        "modified": doc.modified,
    }
# ========== TO HERE ==========
