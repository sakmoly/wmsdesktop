# Purchase Receipt: data is inserted on the **server** – fix by replacing items, not appending

## Where the data is inserted

The rows in the Purchase Receipt (**MAT-PRE-2026-00001**) are created by the **ERPNext server API**, not by the desktop.

- **API:** `receive_asn_and_create_purchase_receipt`  
  (e.g. `printechs_wms.api.asn_to_purchase_receipt.receive_asn_and_create_purchase_receipt`)

- The desktop sends **one request** with:
  - `asn_name`: ASN-0001  
  - `purchase_receipt_name`: MAT-PRE-2026-00001 (so the server knows which PR to update)  
  - `lines`: **only 2 lines** – e.g. `[{ "item_code": "108226", "received_qty": 15 }, { "item_code": "108227", "received_qty": 20 }]`

- The server loads the existing Purchase Receipt and then **adds** the received lines. Right now it is **appending** them to the existing item table. So:
  - First time: PR gets 2 rows.
  - Second time (or if the server also adds from another source): PR gets 2 more rows → 4.
  - After several updates or multiple sources: you see 18 rows (old items + new items, duplicates).

So the “previous data” and “many items” come from the **server always appending** and never clearing or replacing the PR items.

---

## What the server must do

In **receive_asn_and_create_purchase_receipt** (or equivalent in your codebase):

1. **When `purchase_receipt_name` is present**  
   - Load that Purchase Receipt (e.g. MAT-PRE-2026-00001).  
   - **Clear** the existing item table (delete all current item rows).  
   - **Insert** exactly the items from the request **`lines`** (one row per line).  
   - Do **not** append; do **not** add rows from the ASN/PO again. Use only the `lines` payload.

2. **When `purchase_receipt_name` is not present** (new PR)  
   - Create a new Purchase Receipt linked to the ASN.  
   - Set its items **only** from the request **`lines`** (one row per line).  
   - Do not duplicate rows from ASN item table and from `lines`; use **only** `lines` for the PR item table.

3. **Idempotent behaviour**  
   - Calling the API again with the same ASN and same `purchase_receipt_name` and same `lines` should result in the same PR with the **same** item rows (e.g. 2 lines), not more. So: **replace** items every time when updating an existing PR.

---

## Example (conceptual) server logic

```python
# In receive_asn_and_create_purchase_receipt

if purchase_receipt_name and frappe.db.exists("Purchase Receipt", purchase_receipt_name):
    pr = frappe.get_doc("Purchase Receipt", purchase_receipt_name)
    # REPLACE items: clear existing, then add from payload
    pr.items = []   # or pr.clear_table("items")
    for line in lines:
        pr.append("items", {
            "item_code": line["item_code"],
            "qty": line["received_qty"],
            # ... set other fields (warehouse, rate if needed, etc.)
        })
    pr.save()
else:
    # Create new PR and set items from lines only (same as above)
    pr = frappe.new_doc("Purchase Receipt")
    # ... set supplier, warehouse, etc. from ASN
    for line in lines:
        pr.append("items", { ... })
    pr.insert()
```

Important: do **not** do something like:

- `for line in lines: pr.append("items", ...)` **without** clearing `pr.items` first when updating an existing PR.

That is what causes “adding with previous data even after clearing”.

---

## Summary

| Question | Answer |
|----------|--------|
| Where is the data inserted? | In the **server** API `receive_asn_and_create_purchase_receipt` when it writes to the Purchase Receipt document. |
| Why do I see 18 rows when I send 2 lines? | The server is **appending** each time (and/or adding from ASN/PO). It never **replaces** the item table. |
| What to change? | When updating an existing PR (`purchase_receipt_name` provided): **clear** existing items, then set items **only** from the request **`lines`**. Do not append; replace. |

After this change, “Update Received Qty to ERPNext” with 2 lines will result in the Purchase Receipt having exactly 2 item rows (108226 and 108227), with no leftover or duplicated rows from previous calls.
