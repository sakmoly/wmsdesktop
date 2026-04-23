# Export Valuation Template – Duplicate/Tripled Quantity Fix

## Problem

"Export Valuation Template" produces duplicate or tripled quantities (e.g. 750 instead of 250) because the export is built from **result rows** (one per task line). When the same (item, bin, carton) appears in **multiple tasks**, you get multiple rows or a summed quantity for the same physical count.

## Fix (on ERPNext)

Use **one row per (item_code, bin_location, carton_id)** in the export, with a **single** counted quantity per key (same idea as `load_actual_stock_preview`).

### Option A: Build export from Batch Summary (recommended)

The batch **summary** table is already deduplicated (one row per item/bin/carton with `total_counted_qty`, `total_system_qty`). Use it as the source for the export:

- Iterate over `batch_doc.summary` (or the batch’s summary child table).
- Export one row per summary row: Item, Bin Location, Carton ID, Total System Qty, Total Counted Qty, Total Delta Qty.
- Do **not** iterate over result rows (task result child table) when building the export file.

### Option B: Build from result rows but deduplicate

If the export must be built from result rows:

1. Group result rows by `(item_code, bin_location, carton_id)`.
2. Per key, keep **one** counted value (e.g. **latest** by result row `name`), not a sum.
3. Output one export row per key with that single `counted_qty` (and system qty from WMS Stock Balance for that key).

Python pattern (same as in `load_actual_stock_preview_UPDATED.py`):

```python
def _key(r):
    return (r["item_code"], r["bin_location"], (r.get("carton_id") or ""))

grouped = {}
for r in result_rows:
    key = _key(r)
    q = float(r.get("counted_qty") or 0)
    rname = r.get("name") or ""
    if key not in grouped or rname > (grouped[key].get("name") or ""):
        grouped[key] = {"counted_qty": q, "name": rname}

# Then export one row per key from grouped, not one per result_rows.
```

## Ensure summary is correct first

- Run **Load Actual Stock Preview** with the updated `load_actual_stock_preview` (deduplicated logic) so the batch summary shows correct `total_counted_qty` (e.g. 250, not 750).
- Then either export from the batch **summary** (Option A) or from result rows with deduplication (Option B).

## Where to apply

In your ERPNext app (e.g. **printechs_wms**), find the method that handles **Export Valuation Template** (e.g. `export_valuation_template` or the button’s server script) and change it to use the batch summary or the deduplicated result grouping above.
