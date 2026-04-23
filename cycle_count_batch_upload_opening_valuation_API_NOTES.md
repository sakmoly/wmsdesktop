# upload_opening_valuation_file API – notes and compatibility

## API summary

- **Purpose:** Upload an Excel file → create **Opening Stock** Stock Reconciliation (SR), optionally link to WMS Cycle Count Batch.
- **Sheet:** `Opening Valuation Upload`
- **Required columns:** `company`, `warehouse`, `posting_date`, `item_code`, `counted_qty_total`, `valuation_rate`
- **Aggregation:** Rows are aggregated by **(item_code, warehouse)** with summed qty and weighted-average valuation rate. So an Excel with multiple rows per item (e.g. from different bins/cartons) is handled correctly — no double counting.

## No change required for “same item + warehouse” fix

The **batch summary** validation fix (unique by item+warehouse+bin+carton) only affects **Load Actual Stock Preview** and the batch summary table. This upload API:

- Reads Excel, not the batch summary table.
- Already aggregates by (item_code, warehouse) before creating SR items.

So no update is needed in this API for the duplicate-item validation issue.

## Export → Upload compatibility

If you **export** from a cycle count batch and then **upload** that file to this API:

1. **Export** must produce a sheet named **`Opening Valuation Upload`** with at least:  
   `company`, `warehouse`, `posting_date`, `item_code`, `counted_qty_total`, `valuation_rate`.
2. **Batch summary** has: item_code, bin_location, carton_id, total_system_qty, total_counted_qty, total_delta_qty — no company/warehouse/posting_date/valuation_rate.
3. So when building the export file for this API, take **company, warehouse, posting_date** from the **batch** header, **counted_qty_total** from summary (and aggregate by item if you want one row per item, or leave multiple rows — the upload API will aggregate). **valuation_rate** can be taken from **Item** (e.g. `frappe.db.get_value("Item", item_code, "valuation_rate")`) or a default.

See **`cycle_count_batch_export_for_opening_upload_SNIPPET.py`** for a helper that builds rows in the exact format this API expects.

## Optional robustness (in your API file)

- Ensure imports at top of file:  
  `import openpyxl`  
  `from frappe import _, cint, nowdate, nowtime`  
  and that `BATCH_DT`, `_meta_has` are defined (or imported from your cycle_count_batch module).
- If the Excel has a header in a different row, the current code assumes row 1 is header; adjust if needed.

## Summary

- **No update required** to the upload API logic for the “same item and warehouse” validation fix.
- For **export → upload** flow: export must write sheet **Opening Valuation Upload** with columns expected by this API; use the new snippet to build that export from batch summary + batch header + Item valuation.
