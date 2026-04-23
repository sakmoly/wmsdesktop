# -*- coding: utf-8 -*-
# Use this in ERPNext (printechs_wms) to fix "Same item and warehouse combination already entered".
# Replace the existing duplicate check for WMS Cycle Count Batch summary with this logic.
#
# Where to add: In the WMS Cycle Count Batch doctype's validate() method, or in the Python file
# that defines the batch (e.g. cycle_count_batch.py), or in a Server Script on "WMS Cycle Count Batch".
#
# OLD (too strict): duplicate key = (item_code, warehouse)  -> only one row per item in whole batch.
# NEW (correct):   duplicate key = (item_code, warehouse, bin_location, carton_id)  -> one row per item+bin+carton.

import frappe
from frappe import _


def validate_batch_summary_no_duplicate_item_warehouse_bin_carton(doc):
    """
    Call this from WMS Cycle Count Batch validate().
    Allow same (item, warehouse) when (bin_location, carton_id) differ.
    """
    if not doc.get("summary") or len(doc.summary) == 0:
        return

    # Use the batch's warehouse (same for all rows)
    warehouse = doc.get("warehouse") or ""
    seen = set()
    for i, row in enumerate(doc.summary, start=1):
        item = (row.get("item_code") or "").strip()
        bin_loc = (row.get("bin_location") or "").strip()
        carton = (row.get("carton_id") or "").strip()
        key = (item, warehouse, bin_loc, carton)
        if key in seen:
            frappe.throw(
                _("Row # {0}: Same item, warehouse, bin location and carton combination already entered.").format(i)
            )
        seen.add(key)


# --- If your current code looks like this (remove it and use the function above):
#
# def validate_duplicate_item_warehouse(doc):
#     seen = set()
#     for i, row in enumerate(doc.summary, start=1):
#         key = (row.get("item_code"), doc.get("warehouse"))   # <-- too strict
#         if key in seen:
#             frappe.throw(_("Row # {0}: Same item and warehouse combination already entered.").format(i))
#         seen.add(key)
#
# Replace with a call to: validate_batch_summary_no_duplicate_item_warehouse_bin_carton(doc)
