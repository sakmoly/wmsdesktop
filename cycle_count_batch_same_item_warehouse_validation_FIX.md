# "Same item and warehouse combination already entered" (Row # 6)

## What to do (short)

1. **In your ERPNext / printechs_wms app**, find where the duplicate check runs (see "Where to change" below).
2. **Change the duplicate key** from **(item, warehouse)** to **(item, warehouse, bin_location, carton_id)** so the same item in different bins/cartons is allowed.
3. Use the snippet in **`cycle_count_batch_validate_summary_unique_SNIPPET.py`** in this folder as the new validation logic (copy into your `cycle_count_batch.py` or Server Script).

---

## Step-by-step: find and fix in ERPNext

The error is raised **inside ERPNext**, so you must change code/script **in the ERPNext site or printechs_wms app**. This repo only has the snippets; applying them is done there.

### 1) Find where the message comes from

- **Server Script:** In ERPNext go to **Search bar** → type **Server Script** → open **Server Script** list. Use **Search in Code** or open each script and search for `Same item and warehouse combination already entered`. The script is likely linked to **DocType = WMS Cycle Count Batch** and **Event = Before Save** or **Validate**.
- **Python (printechs_wms):** In your **printechs_wms** app folder (or wherever WMS Cycle Count Batch is defined), run:  
  `grep -r "Same item and warehouse" .`  
  Open the file it finds; the duplicate check will be in a `validate` method or a function called from it.

### 2) Apply the fix

- **If it’s in a Server Script:**  
  Replace the duplicate-check block with the logic from **`cycle_count_batch_validate_summary_unique_SNIPPET.py`** (use key `(item_code, warehouse, bin_location, carton_id)` and throw only when that full combination repeats).  
  Or use the ready-made **Server Script** in **`cycle_count_batch_validate_summary_unique_SERVER_SCRIPT.md`** (copy into a new or existing Server Script, same DocType + Validate).
- **If it’s in Python:**  
  In that file, replace the duplicate key from `(item_code, warehouse)` to `(item_code, warehouse, bin_location, carton_id)` and use the throw message from the snippet. Call the new validation from the batch’s `validate()`.

### 3) If you don’t find the message

- Check **Customize Form** → **WMS Cycle Count Batch** → **Document Validation** (or **Client Script** / **Server Script** attached to the form).
- Check the **child** DocType **WMS Cycle Count Batch Summary**: if any field has **Unique** checked, that can force one row per item; remove Unique from (item_code, warehouse) or change the design as above (unique on item+warehouse+bin+carton via code, not a single Unique field).

### 4) After changing

- **Server Script:** Save and clear cache (or reload the form).
- **Python:** Restart bench / the app server so the new code loads.  
Then run **Load Actual Stock Preview** again on a batch that has the same item in multiple bins; the error should stop.

---

## Why you see this message

- **WMS Cycle Count Batch** has one **Warehouse** for the whole batch (e.g. "Main Warehouse - MAATC").
- **Load Actual Stock Preview** builds the **Batch Summary** with **one row per (Item, Bin Location, Carton ID)**. So the same item can (and should) appear on multiple rows when it exists in different bins or cartons.

Example:

| No. | Item   | Bin Location   | Carton ID        | ... |
|-----|--------|----------------|------------------|-----|
| 1   | 108228 | A1-R02-L1-B2   | CTN-A1-R02-L1-B2-2 | ... |
| 2   | 108229 | A1-R02-L1-B2   | CTN-A1-R02-L1-B2-2 | ... |
| 3   | 108226 | A1-R02-L1-B2   | CTN-A1-R02-L1-B2-2 | ... |
| 4   | 108228 | A1-R02-L1-B3   | CTN-A1-R02-L1-B3-1 | ... |
| 5   | 108229 | A1-R02-L1-B3   | CTN-A1-R02-L1-B3-1 | ... |
| 6   | 108226 | A1-R02-L1-B3   | CTN-A1-R02-L1-B3-1 | ... |

- In **ERPNext**, the child DocType **WMS Cycle Count Batch Summary** has a validation that enforces **unique (Item, Warehouse)**. Because **Warehouse** is the same on every row (from the batch header), that means only **one row per Item** is allowed in the whole table.
- So when row 6 is added (Item 108226 again, but different bin/carton), ERPNext treats it as a duplicate "item + warehouse" and shows: **"Row # 6: Same item and warehouse combination already entered."**

So the message appears **because** the batch correctly has multiple rows per item (per bin/carton), but the **validation rule is too strict** for this design.

## Fix (in ERPNext / printechs_wms)

You need to change the **uniqueness** on the batch summary so it matches the intended design: **one row per (Item, Bin Location, Carton ID)** (or at least allow same Item + Warehouse when Bin/Carton differ).

### Option A – Relax validation (recommended)

1. Open the **WMS Cycle Count Batch Summary** DocType in ERPNext (Customize Form or DocType list).
2. Find the validation that enforces "Same item and warehouse combination already entered" (e.g. a **Server Script**, **Document Validation**, or **Custom Validation** on the parent **WMS Cycle Count Batch** that checks duplicate `(item_code, warehouse)` in the `summary` table).
3. Change it so that duplicates are only disallowed when **the full combination** is repeated, e.g.:
   - **(Item, Warehouse, Bin Location, Carton ID)**  
   So two rows with the same item and warehouse but different bin or carton are allowed.
4. If the check is in code (e.g. `cycle_count_batch.py`), change the duplicate key from `(item_code, warehouse)` to `(item_code, warehouse, bin_location, carton_id)` (use the actual field names from your child table).

### Option B – Consolidate rows (not recommended)

You could change **load_actual_stock_preview** to merge all rows for the same (Item, Warehouse) into one row (e.g. sum quantities). That would satisfy the current validation but would **lose bin/carton detail** and break the intended one-row-per-location design. Prefer **Option A**.

## Summary

- **Cause:** Batch summary correctly has multiple rows per item (different bin/carton). ERPNext validation allows only one row per (Item, Warehouse).
- **Fix:** In ERPNext, change the batch summary duplicate check to use **(Item, Warehouse, Bin Location, Carton ID)** (or at least include Bin and Carton so same item in different bins is allowed).
