# Server Script: fix "Same item and warehouse combination already entered"

Use this **in ERPNext** (Search → Server Script → New, or edit the existing script that throws that message).

## Script settings

- **DocType:** WMS Cycle Count Batch  
- **Event:** Before Save (or Validate, depending on where your current check runs)

## Script (paste into "Script" field)

```javascript
// Allow same (item, warehouse) when (bin_location, carton_id) differ.
// Duplicate only when the full combination (item + warehouse + bin + carton) repeats.

if (!doc.summary || doc.summary.length === 0) return;

var warehouse = doc.warehouse || "";
var seen = {};

for (var i = 0; i < doc.summary.length; i++) {
    var row = doc.summary[i];
    var item = (row.item_code || "").trim();
    var bin_loc = (row.bin_location || "").trim();
    var carton = (row.carton_id || "").trim();
    var key = item + "|" + warehouse + "|" + bin_loc + "|" + carton;

    if (seen[key]) {
        frappe.throw(__("Row # {0}: Same item, warehouse, bin location and carton combination already entered.", [i + 1]));
    }
    seen[key] = true;
}
```

## If you already have a Server Script that does the old check

- Find the block that builds a key from **item_code** and **warehouse** only and throws "Same item and warehouse combination already entered".
- Replace that block with the script above (so the key includes **bin_location** and **carton_id**).
- Save the Server Script and try **Load Actual Stock Preview** again.

## If the validation is in Python (printechs_wms) instead

- Do **not** add this Server Script on top of the Python check, or you’ll have two validations.
- Either remove/comment the duplicate check in Python and use this Server Script, or change the Python code to use the key `(item_code, warehouse, bin_location, carton_id)` as in `cycle_count_batch_validate_summary_unique_SNIPPET.py`.
