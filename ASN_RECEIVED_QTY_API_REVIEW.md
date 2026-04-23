# ASN Received Qty API – Review (update_asn_received_qty)

**Endpoint:**  
`POST http://printechsdammam.dyndns.org:88/api/method/printechs_wms.api.asn_receiving.update_asn_received_qty`

---

## Your proposed JSON body

```json
{
  "asn_no": "ASN-0007",
  "mode": "increment",
  "update_status": 1,
  "lines": [
    { "item_code": "108226", "carton_id": "CTN-001", "received_qty": 10 },
    { "item_code": "108227", "carton_id": "CTN-002", "received_qty": 20 }
  ]
}
```

---

## Current desktop implementation (what we send today)

| Level   | Field                         | Current name/sent | Your API expects | Match? |
|--------|-------------------------------|-------------------|------------------|--------|
| Root   | ASN number                    | `asn_no`          | `asn_no`         | Yes    |
| Root   | Mode                           | `mode` ("increment") | `mode`        | Yes    |
| Root   | Update status flag            | `update_status` (1) | `update_status` (1) | Yes |
| Root   | Default receiving warehouse   | `default_receiving_warehouse_code` | *not in your sample* | See note below |
| Line   | Item code                     | `item_code`       | `item_code`      | Yes    |
| Line   | Carton ID                     | `carton_id`        | `carton_id`      | Yes    |
| Line   | Quantity received             | **`qty`**         | **`received_qty`** | No – name change |

So the only **breaking change** for the desktop is: **line-level quantity** must be sent as **`received_qty`** instead of **`qty`**. Values (e.g. 10, 20) stay the same; only the JSON key changes.

---

## Summary

- **Root:** `asn_no`, `mode`, `update_status` – no change needed; we already send these.
- **Lines:** We currently send `qty`; your API expects **`received_qty`**. We should switch the line DTO to serialize as `received_qty` for this endpoint.
- **`default_receiving_warehouse_code`:** Your sample omits it. If the API still supports it and you want it, we keep sending it. If the API no longer uses it, we can stop sending it (optional in our payload).

---

## Desktop code change (before implementing)

1. **Line DTO (`AsnReceivedQtyLineDto`)**  
   - Keep the same C# property for the value (e.g. still `Qty` or rename to `ReceivedQty`).  
   - Ensure the **JSON name** for that property is **`received_qty`** for the **update_asn_received_qty** request.  
   - Example: use `[JsonPropertyName("received_qty")]` on the quantity property so the serialized body matches your sample.

2. **Shared usage**  
   The same line DTO is used for:
   - **update_asn_received_qty** (ASN Status push) ← your change
   - **receive_asn_and_create_purchase_receipt** (Purchase Receipt push)  
   If the Purchase Receipt API still expects **`qty`** in each line, we have two options:
   - Use a **separate** line DTO for the ASN received-qty push (with `received_qty`), and keep the existing one (with `qty`) for the PR push, or
   - Use one DTO that always sends **`received_qty`** and confirm that the Purchase Receipt API also accepts **`received_qty`** (or accepts both).

3. **Optional:** Remove or make optional **`default_receiving_warehouse_code`** in the request if the API no longer uses it.

---

## Recommendation

- **Proceed with the API as you specified:** root fields `asn_no`, `mode`, `update_status`, and lines with `item_code`, `carton_id`, **`received_qty`**.
- **Desktop:** Update the ASN received-qty push to send **`received_qty`** in each line (and adjust DTO/shared usage as above).
- **Confirm:** Whether `default_receiving_warehouse_code` is still required by the API; if not, we can omit it.

Once you confirm the above (and whether the Purchase Receipt endpoint should still use `qty` or also `received_qty`), the desktop implementation can be updated accordingly.
