# =============================================================================
# ERPNext API: Update In-Transit Stock Entry and Material Transfer
# after creating the receipt Stock Entry in end_transit_create_receipt
# =============================================================================
# Add this logic in your end_transit_create_receipt method, AFTER you create
# and submit the receipt Stock Entry (receipt_doc). Uses Frappe/ERPNext APIs.
# =============================================================================

def update_in_transit_and_material_transfer(in_transit_stock_entry_name, receipt_stock_entry_name):
    """
    Update the in-transit Stock Entry and related Material Transfer with the
    new receipt Stock Entry name (e.g. MAT-STE-2026-00008).

    Call this from end_transit_create_receipt after creating receipt_doc:
        update_in_transit_and_material_transfer(
            in_transit_stock_entry=payload.get("in_transit_stock_entry"),
            receipt_stock_entry_name=receipt_doc.name
        )
    """
    if not in_transit_stock_entry_name or not receipt_stock_entry_name:
        return

    # -------------------------------------------------------------------------
    # 1) Update IN-TRANSIT Stock Entry
    #    Add custom field "receipt_stock_entry" (Link to Stock Entry) on
    #    Stock Entry if you don't have it. Then set it to the new receipt.
    # -------------------------------------------------------------------------
    if frappe.db.exists("Stock Entry", in_transit_stock_entry_name):
        # Option A: If your Stock Entry has custom field receipt_stock_entry
        if frappe.get_meta("Stock Entry").has_field("receipt_stock_entry"):
            frappe.db.set_value(
                "Stock Entry",
                in_transit_stock_entry_name,
                "receipt_stock_entry",
                receipt_stock_entry_name,
                update_modified=True
            )
        # Option B: Or use a custom field like custom_receipt_stock_entry (if you use Custom Field)
        elif frappe.get_meta("Stock Entry").has_field("custom_receipt_stock_entry"):
            frappe.db.set_value(
                "Stock Entry",
                in_transit_stock_entry_name,
                "custom_receipt_stock_entry",
                receipt_stock_entry_name,
                update_modified=True
            )
        # Option C: Store in remarks (no schema change, but less clean)
        # else:
        #     doc = frappe.get_doc("Stock Entry", in_transit_stock_entry_name)
        #     doc.remarks = (doc.remarks or "") + " [Receipt: " + receipt_stock_entry_name + "]"
        #     doc.db_update()

    # -------------------------------------------------------------------------
    # 2) Update RELATED Material Transfer
    #    If the in-transit Stock Entry is linked to a "Material Transfer" doc
    #    (custom doctype or another Stock Entry), update that with the receipt.
    # -------------------------------------------------------------------------
    # Option A: If Material Transfer is a separate doctype and linked from Stock Entry
    # (e.g. Stock Entry has field "material_transfer" Link to "Material Transfer")
    if frappe.db.exists("Stock Entry", in_transit_stock_entry_name):
        in_transit_doc = frappe.get_doc("Stock Entry", in_transit_stock_entry_name)
        material_transfer_name = in_transit_doc.get("material_transfer")  # adjust field name
        if material_transfer_name and frappe.db.exists("Material Transfer", material_transfer_name):
            if frappe.get_meta("Material Transfer").has_field("receipt_stock_entry"):
                frappe.db.set_value(
                    "Material Transfer",
                    material_transfer_name,
                    "receipt_stock_entry",
                    receipt_stock_entry_name,
                    update_modified=True
                )

    # Option B: If "Material Transfer" is the same in-transit Stock Entry (stock_entry_type = "Material Transfer")
    # then step 1 already updated it. No extra step.

    # Option C: If you have a custom "Transit" or "In Transit" doctype that links to Stock Entry
    # transit_name = frappe.db.get_value("Stock Entry", in_transit_stock_entry_name, "transit_reference")
    # if transit_name and frappe.db.exists("Transit", transit_name):
    #     frappe.db.set_value("Transit", transit_name, "receipt_stock_entry", receipt_stock_entry_name, update_modified=True)

    frappe.db.commit()


# =============================================================================
# Example: inside your end_transit_create_receipt API
# =============================================================================
#
# def end_transit_create_receipt():
#     payload = frappe.parse_json(frappe.form_dict.get("payload")) or {}
#     in_transit_name = (payload.get("in_transit_stock_entry") or "").strip()
#     to_warehouse = (payload.get("to_warehouse") or "").strip()
#     remarks = (payload.get("remarks") or "Received at warehouse").strip()
#
#     # ... your existing logic to create receipt_doc (receipt Stock Entry) ...
#     receipt_doc = create_receipt_stock_entry(...)  # your function
#     receipt_doc.submit()
#
#     # NEW: Update in-transit and Material Transfer with the new receipt name
#     update_in_transit_and_material_transfer(
#         in_transit_stock_entry_name=in_transit_name,
#         receipt_stock_entry_name=receipt_doc.name
#     )
#
#     # Return response (your existing response)
#     frappe.response["message"] = {
#         "ok": True,
#         "api_version": "1.0.0",
#         "status": "created",
#         "message": {"name": receipt_doc.name},
#         "data": {"name": receipt_doc.name},
#         "stock_entry": receipt_doc.name,
#         "receipt_stock_entry": receipt_doc.name,
#     }
# =============================================================================
