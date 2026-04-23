# =============================================================================
# FIX: NameError: name '_find_existing_receipt' is not defined
# File: printechs_wms/api/intransit_transfer.py
# =============================================================================
# Your end_transit_create_receipt() at line 369 calls:
#   existing = _find_existing_receipt(in_transit_se)
# but _find_existing_receipt was never defined. Add the helper below in the
# same file (e.g. above end_transit_create_receipt) and ensure the API uses
# it for idempotency (return existing receipt name if already created).
# =============================================================================

import frappe


def _find_existing_receipt(in_transit_stock_entry):
    """
    If a receipt Stock Entry was already created for this in-transit Stock Entry,
    return its name so we can return it instead of creating a duplicate.
    in_transit_stock_entry: name (str) of the in-transit Stock Entry doc.
    Returns: receipt Stock Entry name (str) or None.
    """
    if not in_transit_stock_entry or not isinstance(in_transit_stock_entry, str):
        return None
    name = (in_transit_stock_entry or "").strip()
    if not name or not frappe.db.exists("Stock Entry", name):
        return None

    # Option A: In-transit Stock Entry has a field linking to the receipt (custom or standard)
    meta = frappe.get_meta("Stock Entry")
    for field_name in ("receipt_stock_entry", "custom_receipt_stock_entry"):
        if meta.has_field(field_name):
            existing = frappe.db.get_value("Stock Entry", name, field_name)
            if existing:
                return existing

    # Option B: Find a "Receipt" / "Material Transfer" Stock Entry that references this in-transit one
    # (e.g. custom field like in_transit_stock_entry or outgoing_stock_entry on Stock Entry)
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


# =============================================================================
# In end_transit_create_receipt(), use it like this (at the start, after
# parsing payload and validating in_transit_stock_entry):
# =============================================================================
#
# def end_transit_create_receipt():
#     payload = frappe.parse_json(frappe.form_dict.get("payload")) or {}
#     in_transit_se = (payload.get("in_transit_stock_entry") or "").strip()
#     to_warehouse = (payload.get("to_warehouse") or "").strip()
#     remarks = (payload.get("remarks") or "Received at warehouse").strip()
#
#     if not in_transit_se:
#         frappe.throw("in_transit_stock_entry is required")
#
#     # Idempotent: if we already created a receipt for this in-transit SE, return it
#     existing = _find_existing_receipt(in_transit_se)
#     if existing:
#         frappe.response["message"] = {
#             "ok": True,
#             "status": "already_created",
#             "name": existing,
#             "stock_entry": existing,
#             "message": {"name": existing},
#         }
#         return
#
#     # ... rest of your logic: create receipt_doc, submit, then return receipt_doc.name ...
# =============================================================================
