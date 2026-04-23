# -*- coding: utf-8 -*-
# Snippet for Export Valuation Template – use batch SUMMARY to avoid duplicate/tripled quantity.
# In ERPNext, find the method that handles "Export Valuation Template" (e.g. export_valuation_template)
# and build the export from batch.summary (one row per item/bin/carton) instead of from result rows.
#
# If your export currently does: for each task -> for each result row -> write row to CSV/Excel
# then the same (item, bin, carton) can appear 3 times (3 tasks) and quantity is tripled.
# Fix: build from batch.summary so each (item, bin, carton) appears once with total_counted_qty.

import frappe
from frappe import _

# Typical batch summary child has: item_code, bin_location, carton_id, total_system_qty, total_counted_qty, total_delta_qty
SUMMARY_CHILD = "WMS Cycle Count Batch Summary"  # adjust to your DocType name
BATCH_DT = "WMS Cycle Count Batch"


def get_valuation_export_rows_from_summary(batch_name: str):
    """
    Return one row per (item, bin, carton) from the batch SUMMARY (no duplicates).
    Use this when building the Export Valuation Template file instead of iterating over result rows.
    """
    batch = frappe.get_doc(BATCH_DT, batch_name)
    if not batch.get("summary"):
        return []

    rows = []
    for s in batch.summary:
        rows.append({
            "item_code": s.get("item_code"),
            "bin_location": s.get("bin_location"),
            "carton_id": (s.get("carton_id") or "").strip(),
            "total_system_qty": float(s.get("total_system_qty") or 0),
            "total_counted_qty": float(s.get("total_counted_qty") or 0),
            "total_delta_qty": float(s.get("total_delta_qty") or 0),
        })
    return rows


# Example: if your export_valuation_template currently does something like:
#
#   task_names = frappe.get_all("WMS Cycle Count Task", filters={"batch": batch_name}, pluck="name")
#   for task in task_names:
#       task_doc = frappe.get_doc("WMS Cycle Count Task", task)
#       for row in task_doc.results:   # <-- this causes tripling when same bin in 3 tasks
#           writer.writerow([row.item_code, row.bin_location, row.counted_qty, ...])
#
# Replace with:
#
#   rows = get_valuation_export_rows_from_summary(batch_name)
#   for row in rows:
#       writer.writerow([row["item_code"], row["bin_location"], row["carton_id"],
#                       row["total_system_qty"], row["total_counted_qty"], row["total_delta_qty"]])
