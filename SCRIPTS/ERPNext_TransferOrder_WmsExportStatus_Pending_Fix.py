# ERPNext / printechs_wms: Fix "WMS Export Status cannot be 'Pending'" for Transfer Order import
#
# Apply this fix on your ERPNext server in the printechs_wms app.
# The error occurs when creating/importing Transfer Orders with wms_export_status = "Pending".
#
# Option 1 - In the Transfer Order doctype (Customize Form or in the app's override):
#   - Ensure the "WMS Export Status" field options include Pending and allow it on new docs.
#   - Or in a custom validate() for Transfer Order: if wms_export_status is None or "", set it to "Pending".
#
# Option 2 - In the API that creates/imports Transfer Orders (e.g. wms_sync.py or import API):
#   - Before creating the TO doc, set wms_export_status to "Pending" if it is missing or empty.
#   - Do NOT raise an error when the value is "Pending"; allow it for new records.
#
# Example: In the function that creates/imports a Transfer Order, add:
#
# def before_insert_or_validate_transfer_order(doc):
#     """Allow Pending as default for wms_export_status on new Transfer Orders."""
#     if not doc.get("wms_export_status") or (str(doc.get("wms_export_status") or "").strip() == ""):
#         doc.wms_export_status = "Pending"
#     # If the validator rejects "Pending", find that validator and change it to allow "Pending"
#     # for new documents (doc.docstatus == 0 or not doc.get("__islocal") is False).
#
# Example: If validation is in a custom validate method that says "cannot be Pending", change it like this:
#
# # Before (buggy - rejects Pending even though it's in options):
# if doc.wms_export_status == "Pending":
#     frappe.throw(_("WMS Export Status cannot be 'Pending'. It should be one of ..."))
#
# # After (allow Pending for new/submitted TOs):
# # Remove the above throw, or only throw when transitioning from Exported/Reserved back to Pending
# # if that's not allowed. For new docs, Pending is the default and should be allowed.
#
# Option 3 - In Frappe/ERPNext Transfer Order doctype JSON (if you have custom field):
#   - In the custom field "wms_export_status", set options to: "Pending\nReserved\nExported"
#   - Ensure there is no custom validator that disallows "Pending" on insert.
#
# After applying, re-run the Transfer Order import; TO-TEST-00001 and others should import with
# wms_export_status = "Pending" (default) without error.
