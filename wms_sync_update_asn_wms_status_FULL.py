# -*- coding: utf-8 -*-
"""
Full update_asn_wms_status function – paste this into
apps/printechs_wms/printechs_wms/api/wms_sync.py
(replace the existing update_asn_wms_status function entirely).
"""

@frappe.whitelist()
def update_asn_wms_status(asn_name=None, status=None, wms_status=None, wms_reference=None, note=None):
    """
    Update ASN status from WMS/Desktop safely.

    Desktop may send "Exported", but ERP select field 'status' only allows:
      Draft, Open, Completed, Cancelled

    Strategy:
    - If incoming status is not allowed, map it to allowed ERP status.
    - Store original incoming status in wms_status/sync_status/note if present.
    - Do NOT set doc.status to "Open" when doc is submitted (e.g. Received)
      to avoid UpdateAfterSubmitError.
    """
    if not asn_name:
        asn_name = frappe.local.form_dict.get("asn_name")
    if status is None:
        status = frappe.local.form_dict.get("status")
    if wms_status is None:
        wms_status = frappe.local.form_dict.get("wms_status")
    if wms_reference is None:
        wms_reference = frappe.local.form_dict.get("wms_reference")
    if note is None:
        note = frappe.local.form_dict.get("note")

    asn_name = cstr(asn_name).strip()
    incoming = cstr(status or wms_status).strip()

    if not asn_name:
        return {"ok": False, "message": "asn_name is required"}
    if not incoming:
        return {"ok": False, "message": "status (or wms_status) is required"}

    if not frappe.db.exists("WMS ASN", asn_name):
        return {"ok": False, "message": f"WMS ASN '{asn_name}' not found"}

    doc = frappe.get_doc("WMS ASN", asn_name)

    allowed_status = _get_select_options("WMS ASN", "status")

    # External -> ERP mapping (adjust as needed)
    map_to_erp = {
        "Exported": "Open",
        "Synced": "Open",
        "In Progress": "Open",
        "Received": "Completed",
        "Completed": "Completed",
        "Cancelled": "Cancelled",
        "Canceled": "Cancelled",
        "Open": "Open",
        "Draft": "Draft",
    }

    erp_status = incoming
    mapped = False

    if allowed_status:
        if incoming not in allowed_status:
            erp_status = map_to_erp.get(incoming) or "Open"
            mapped = True
            if erp_status not in allowed_status:
                erp_status = "Open" if "Open" in allowed_status else allowed_status[0]

    # Save original external status somewhere if we mapped
    external_saved_to = None
    if mapped:
        if _safe_set(doc, "wms_status", incoming):
            external_saved_to = "wms_status"
        elif _safe_set(doc, "sync_status", incoming):
            external_saved_to = "sync_status"
        elif _append_note(doc, "wms_note", f"WMS Status: {incoming}"):
            external_saved_to = "wms_note"
        elif _append_note(doc, "note", f"WMS Status: {incoming}"):
            external_saved_to = "note"

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

    # Optional fields (desktop sends wms_ref)
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
