# "There is no quantity currently" but still "None of the items have any change"

## Why you see the message

The validation compares **current** quantity (from Bin = 0 in your case) with **proposed** quantity (what the Stock Reconciliation is trying to set).

- **Current quantity = 0** (no stock, tabBin empty) ✓  
- So the only way it can say **"no change"** is if **proposed quantity is also 0** for every item.

So: the SR is being created with **qty = 0** (or no effective change) for all lines. The system is correctly saying "no change" because 0 → 0.

---

## Where the zeros come from

The proposed qty in the SR comes from your **Excel file** via the upload API:

1. **Excel column**  
   The API expects a column named exactly **`counted_qty_total`** (and **`valuation_rate`**). If the header is different (e.g. "Counted Qty", "Total Qty", extra space), the code uses `idx("counted_qty_total")` which returns `None`, and then `vals[idx(...)]` can be wrong or zero.

2. **Empty or zero cells**  
   If in the Excel file the **counted_qty_total** (and valuation_rate) cells are empty or 0 for all rows, parsed qty will be 0 and the SR will have 0 → 0 = no change.

3. **Wrong sheet**  
   The API reads the sheet **"Opening Valuation Upload"**. If the data is in another sheet, it won’t be read.

4. **Aggregation**  
   If by any bug all parsed rows end up with qty 0, the aggregated rows passed to the SR will also have qty 0.

---

## What to check

1. **Open the Excel file** you upload:
   - Sheet name must be **Opening Valuation Upload**.
   - Row 1 must have headers including **counted_qty_total** and **valuation_rate** (exact spelling, no extra spaces).
   - For at least one item, **counted_qty_total** and **valuation_rate** must be **positive numbers** (e.g. 100 and 1.5).

2. **Return parsed/aggregated data from the API** (temporary debug):  
   In `upload_opening_valuation_file`, before creating the SR, add to the return dict (or log) the list of **rows** you pass to the SR, e.g.:
   ```python
   "debug_rows": [{"item_code": x["item_code"], "qty": x["qty"], "valuation_rate": x["valuation_rate"]} for x in rows]
   ```
   Call the API and check: are **qty** and **valuation_rate** in **debug_rows** non-zero? If they are 0, the bug is in reading/parsing the Excel or in aggregation.

3. **Column index**  
   If the header row has a different order, `idx("counted_qty_total")` must point to the column that actually contains the total counted quantity. Add a quick check after parsing, e.g.:
   ```python
   if not parsed:
       frappe.throw(_("No valid rows found in Excel"))
   if all(float(x.get("qty") or 0) == 0 for x in parsed):
       frappe.throw(_("All rows have counted_qty_total = 0. Please check the Excel file and column name 'counted_qty_total'."))
   ```
   So you get a clear error instead of "no change" when the file has no quantities.

---

## Summary

| Your situation | What it means |
|----------------|----------------|
| Current quantity = 0 (no stock) | Correct. |
| Message "no change" | Proposed quantity in the SR is also 0 for all items. |
| Fix | Ensure the uploaded Excel has sheet **Opening Valuation Upload**, column **counted_qty_total** with **positive numbers**, and (optional) add validation or debug return so you see the qtys being sent to the SR. |

So: **there is no quantity currently** is right; the message appears because the **proposed** quantities in the reconciliation are 0 as well. Fix the Excel content/column names (and optionally the API checks above) and the message will go away when you upload real quantities.
