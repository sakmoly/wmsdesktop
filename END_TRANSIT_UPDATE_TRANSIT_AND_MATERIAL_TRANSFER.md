# Update In-Transit and Material Transfer (ERPNext API)

The desktop already parses your response and saves `receipt_stock_entry_no` into **tabPutawayTask** so duplicates are avoided.

To **update the in-transit Stock Entry and the related Material Transfer** with the new receipt Stock Entry number, add the logic **inside your ERPNext API** (`end_transit_create_receipt`) after creating the receipt doc.

**Ready-to-use snippet:** see **`end_transit_update_in_transit_and_material_transfer_SNIPPET.py`** in this folder. Copy the function and call it from your API after creating the receipt.

---

## 1. Response format (already correct)

Your response is valid and the desktop parses it:

```json
{
    "message": {
        "ok": true,
        "api_version": "1.0.0",
        "status": "created",
        "message": { "name": "MAT-STE-2026-00008" },
        "data": { "name": "MAT-STE-2026-00008" },
        "stock_entry": "MAT-STE-2026-00008",
        "receipt_stock_entry": "MAT-STE-2026-00008"
    }
}
```

The desktop reads `message.stock_entry` / `message.receipt_stock_entry` / `message.data.name` / `message.message.name` and stores that value in **tabPutawayTask.receipt_stock_entry_no**. No change needed in the response shape.

---

## 2. What to do in the API: update Transit and Material Transfer

After you create the receipt Stock Entry (`receipt_doc`), set its name (e.g. `MAT-STE-2026-00008`) on:

1. **Transit module** – the record that represents “this in-transit movement” (e.g. custom Transit doctype or the in-transit Stock Entry).
2. **Related Material Transfer** – the document that is the “Material Transfer” for this flow (if it’s a separate doctype or link from the in-transit Stock Entry).

Concrete steps in Python (pseudocode; adapt to your doctypes and field names):

```python
# In end_transit_create_receipt, after creating and submitting the receipt Stock Entry:

receipt_name = receipt_doc.name  # e.g. "MAT-STE-2026-00008"
in_transit_name = payload.get("in_transit_stock_entry")  # e.g. "MAT-STE-2026-00012"

# 1) Update the in-transit Stock Entry (or your Transit module record) with the receipt stock entry number
#    Example: if the in-transit doc has a field like "receipt_stock_entry" or "linked_receipt"
in_transit_doc = frappe.get_doc("Stock Entry", in_transit_name)
in_transit_doc.db_set("receipt_stock_entry", receipt_name)  # or your custom field name
in_transit_doc.notify_update()

# 2) If you have a "Material Transfer" doctype (or similar) linked to this in-transit Stock Entry,
#    update that doc with the same stock entry number
#    Example: material_transfer has field "receipt_stock_entry" or "stock_entry"
# material_transfer_name = in_transit_doc.get("material_transfer")  # or how you link them
# if material_transfer_name:
#     frappe.db.set_value("Material Transfer", material_transfer_name, "receipt_stock_entry", receipt_name)
# frappe.db.commit()
```

You need to map this to your real schema:

- **Transit module**: exact doctype name and the field where the receipt Stock Entry name should be stored (e.g. `receipt_stock_entry`, `receipt_stock_entry_no`, etc.).
- **Related Material Transfer**: how you link from the in-transit Stock Entry (or Transit) to the “Material Transfer” doc, and the field on that doc that should hold the receipt Stock Entry name.

---

## 3. Field names to add (if not already present)

- **On the in-transit Stock Entry (or Transit doctype)**  
  A field such as:  
  `receipt_stock_entry` (Link to Stock Entry) or `receipt_stock_entry_no` (Data).  
  After creating the receipt, set it to `receipt_doc.name`.

- **On the related Material Transfer doctype**  
  A field such as:  
  `receipt_stock_entry` (Link to Stock Entry) or `stock_entry` (if it should store the receipt).  
  After creating the receipt, set it to `receipt_doc.name` on the linked Material Transfer document.

---

## 4. Summary

| Where | Action |
|-------|--------|
| **WMS Desktop** | Already parses your response and saves `receipt_stock_entry_no` in **tabPutawayTask** (no change needed). |
| **ERPNext API** | After creating the receipt Stock Entry, update (1) the **Transit module** record and (2) the **related Material Transfer** with the new stock entry number (`receipt_doc.name`). Add the above fields if they don’t exist. |

If you share the exact doctype names and field names (Transit module and Material Transfer), the Python snippet can be made exact for your codebase.
