# -*- coding: utf-8 -*-
# Build export rows for the "Opening Valuation Upload" sheet consumed by upload_opening_valuation_file.
# Use from your Export Valuation Template or a dedicated "Export for Opening Upload" button.
#
# Sheet name must be: Opening Valuation Upload
# Columns: company, warehouse, posting_date, item_code, counted_qty_total, valuation_rate

import frappe

BATCH_DT = "WMS Cycle Count Batch"
SUMMARY_CHILD_DT = "WMS Cycle Count Batch Summary"


def get_opening_upload_rows_from_batch(batch_name: str):
    """
    One row per (item_code, warehouse) with total counted qty and valuation rate.
    company, warehouse, posting_date from batch; valuation_rate from Item Master (fallback 0).
    Use these rows to write Excel sheet "Opening Valuation Upload" for upload_opening_valuation_file.
    """
    batch = frappe.get_doc(BATCH_DT, batch_name)
    if not batch.get("summary"):
        return []

    company = (batch.get("company") or "").strip()
    warehouse = (batch.get("warehouse") or "").strip()
    posting_date = batch.get("posting_date") or frappe.utils.nowdate()

    # Aggregate by item_code (same warehouse for whole batch)
    agg = {}
    for s in batch.summary:
        item_code = (s.get("item_code") or "").strip()
        if not item_code:
            continue
        qty = float(s.get("total_counted_qty") or 0)
        if item_code not in agg:
            agg[item_code] = {"qty": 0.0, "total_val": 0.0}
        agg[item_code]["qty"] += qty
        rate = _item_valuation_rate(item_code)
        agg[item_code]["total_val"] += qty * rate

    rows = []
    for item_code, v in agg.items():
        qty = v["qty"]
        rate = (v["total_val"] / qty) if qty else _item_valuation_rate(item_code)
        rows.append({
            "company": company,
            "warehouse": warehouse,
            "posting_date": posting_date,
            "item_code": item_code,
            "counted_qty_total": qty,
            "valuation_rate": rate,
        })
    return rows


def _item_valuation_rate(item_code: str) -> float:
    try:
        return float(frappe.db.get_value("Item", item_code, "valuation_rate") or 0)
    except Exception:
        return 0.0


# --- Example: write Excel for upload_opening_valuation_file ---
#
# import openpyxl
# from openpyxl import Workbook
#
# rows = get_opening_upload_rows_from_batch(batch_name)
# wb = Workbook()
# ws = wb.active
# ws.title = "Opening Valuation Upload"
# ws.append(["company", "warehouse", "posting_date", "item_code", "counted_qty_total", "valuation_rate"])
# for r in rows:
#     ws.append([r["company"], r["warehouse"], r["posting_date"], r["item_code"],
#                r["counted_qty_total"], r["valuation_rate"]])
# wb.save("/path/to/Opening-Valuation.xlsx")
# # Then call upload_opening_valuation_file(file_url=..., batch_name=batch_name)
