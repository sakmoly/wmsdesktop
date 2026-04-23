# -*- coding: utf-8 -*-
"""
Snippet for printechs_wms/api/wms_sync.py – update_asn_wms_status
Use this when ASN DocType status only allows: Draft, Open, Completed, Cancelled.
Desktop sends status=Exported; this sets wms_export_status (or export_status) instead of status.
"""
# Replace the existing update_asn_wms_status in wms_sync.py with the logic below.
# Adjust doctype name if yours is not "Advance Shipment Notice".

import frappe


@frappe.whitelist()
def update_asn_wms_status(asn_name=None, status=None, wms_ref=None):
    """Update ASN WMS status. When status is 'Exported', set wms_export_status (or export_status) to avoid ValidationError on main status."""
    asn_name = (asn_name or frappe.form_dict.get("asn_name") or "").strip()
    status = (status or frappe.form_dict.get("status") or "").strip()
    wms_ref = (wms_ref or frappe.form_dict.get("wms_ref") or "").strip()

    if not asn_name:
        frappe.throw("asn_name is required")

    # Use your ASN doctype name if different
    doctype = "Advance Shipment Notice"
    if not frappe.db.exists(doctype, asn_name):
        frappe.throw(f"ASN {asn_name} not found")

    doc = frappe.get_doc(doctype, asn_name)

    if status == "Exported":
        # Do not set doc.status; use a separate export field
        if doc.meta.has_field("wms_export_status"):
            doc.wms_export_status = "Exported"
        elif doc.meta.has_field("export_status"):
            doc.export_status = "Exported"
        else:
            frappe.throw(
                "ASN DocType must have field 'wms_export_status' or 'export_status' for WMS export, "
                "or add 'Exported' to status options in Customize Form."
            )
        if wms_ref and doc.meta.has_field("wms_ref"):
            doc.wms_ref = wms_ref
    else:
        doc.status = status
        if wms_ref and doc.meta.has_field("wms_ref"):
            doc.wms_ref = wms_ref

    doc.save(ignore_permissions=True)
    return {"ok": True, "asn_name": asn_name, "status": status}
