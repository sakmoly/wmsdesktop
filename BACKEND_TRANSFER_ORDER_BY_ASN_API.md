# Backend: Transfer Order by ASN API (Box Management)

## Endpoint

```http
GET /api/transfer-order/by-asn/{asn_no}
```

**Example:** `GET /api/transfer-order/by-asn/ASN-0003`

**Purpose:** Return the Transfer Order and store list (or allocations) for a given ASN so the app can show **Box Management** for that ASN: one block per store with “+ Create BOX” per store.

---

## Expected response shapes

The backend **should return one of the following**. The app will accept the field names below; alternatives in parentheses are also accepted where noted.

---

### Option A – Allocations with store (preferred)

Each allocation has a store and optional item/qty. The app will derive the **list of stores** from the unique `store` (or alternate) values.

```json
{
  "to_no": "WMS-TO-00006",
  "allocations": [
    { "store": "SR-01", "item_code": "108226", "allocated_qty": 10 },
    { "store": "SR-02", "item_code": "108227", "allocated_qty": 20 }
  ]
}
```

**Field names:**

| Field | Required | Alternatives accepted |
|-------|----------|------------------------|
| `to_no` | Yes | `to_number`, `transfer_order`, `transfer_order_no` |
| `allocations` | Yes | `items`, `lines` |
| `allocations[].store` | Yes (for store list) | `store_code`, `destination`, `target_store`, `warehouse` |

`item_code` and `allocated_qty` are optional in each allocation; the app mainly needs **TO number** and **per-allocation store** to build one block per store.

---

### Option B – Direct store list

TO number plus a simple list of store codes. The app will show one block per entry in this list.

```json
{
  "to_no": "WMS-TO-00006",
  "stores": ["SR-01", "SR-02"]
}
```

**Field names:**

| Field | Required | Alternatives accepted |
|-------|----------|------------------------|
| `to_no` | Yes | `to_number`, `transfer_order`, `transfer_order_no` |
| `stores` | Yes | `store_codes`, `destinations`, `target_stores` |

Each element is a string (store code, e.g. `"SR-01"`).

---

## How the app uses the response

1. **Transfer Order:** From `to_no` (or alternate). Displayed as e.g. “Transfer Order: WMS-TO-00006”.
2. **Store list:**  
   - **Option A:** Unique values of `allocations[].store` (or `store_code` / `destination` / `target_store`).  
   - **Option B:** The array `stores` (or `store_codes` / `destinations`).
3. **Box Management UI:** One block per store (e.g. SR-01, SR-02), each with “+ Create BOX”. Creating a box uses the current ASN, this TO, and the selected store.

---

## Sample response for ASN-0003 (Option A)

```json
{
  "to_no": "WMS-TO-00006",
  "allocations": [
    { "store": "SR-01", "item_code": "108226", "allocated_qty": 10 },
    { "store": "SR-02", "item_code": "108227", "allocated_qty": 20 }
  ]
}
```

## Sample response for ASN-0003 (Option B)

```json
{
  "to_no": "WMS-TO-00006",
  "stores": ["SR-01", "SR-02"]
}
```

---

## Error / not found

- If there is no Transfer Order for the given ASN: return **404** or a body like `{ "message": "No transfer order found for this ASN" }`.
- The app will then show an appropriate message and will not show store blocks or Create BOX for that ASN.

---

## Summary

| Item | Value |
|------|--------|
| **Endpoint** | `GET /api/transfer-order/by-asn/{asn_no}` (e.g. ASN-0003) |
| **TO field** | `to_no` (or `transfer_order`, `to_number`, `transfer_order_no`) |
| **Option A** | `allocations[]` with `store` (or `store_code`, `destination`, `target_store`) per entry |
| **Option B** | `stores` (or `store_codes`, `destinations`) array of store code strings |
| **Usage** | Show “Transfer Order: &lt;to_no&gt;” and one “+ Create BOX” block per store |

If you share a sample response from your `GET /api/transfer-order/by-asn/ASN-0003` (with sensitive data removed), the app can be aligned to your exact field names if they differ from the ones above.
