# Material Request Partial Dispatch – "Already exists (idempotent)" and Remaining Items

## What you see

When you create a Stock Entry from a Transfer Carton (Material Request flow), the API sometimes returns:

```json
{
  "message": {
    "ok": true,
    "version": "1.0.0",
    "message": "Already exists (idempotent)",
    "stock_entry": "MAT-STE-2026-00001"
  }
}
```

So the **first** dispatch (or first carton) gets a Stock Entry `MAT-STE-2026-00001`. When you try to send the **remaining** items (e.g. a second Transfer Carton for the same Material Request), the API returns the same response and **does not create a new Stock Entry** for the remaining items.

---

## Why this happens

The ERPNext API `create_stock_entry_from_transfer_carton` is almost certainly using **idempotency by Material Request** (or by some key that is the same for the whole MR):

- First call for Material Request `MAT-MR-2026-00001` → create `MAT-STE-2026-00001` and store that MR → STE link.
- Second call for the **same** Material Request (e.g. second Transfer Carton with remaining items) → API finds an existing Stock Entry for that MR and returns **"Already exists (idempotent)"** with that same `stock_entry`, instead of creating a **new** Stock Entry for the second carton.

So you only ever get **one** Stock Entry per Material Request, even when you dispatch in two (or more) parts.

---

## How to send remaining items (fix on ERPNext)

To support **partial dispatch** (multiple Stock Entries per Material Request, one per Transfer Carton), the API must key idempotency by **Transfer Carton**, not by Material Request.

### Required behaviour

| Scenario | What should happen |
|----------|--------------------|
| First time calling with `transfer_carton_id = "TC-001"` and `transfer_order = "MAT-MR-2026-00001"` | Create a **new** Stock Entry (e.g. `MAT-STE-2026-00001`), link it to this TC (and optionally to the MR). Return `ok: true`, `stock_entry` / `stock_entry_no`. |
| Second time calling with **same** `transfer_carton_id = "TC-001"` | Return **"Already exists (idempotent)"** with the **same** Stock Entry (no duplicate). |
| Call with **different** `transfer_carton_id = "TC-002"` and same `transfer_order = "MAT-MR-2026-00001"` (remaining items) | Create a **new** Stock Entry (e.g. `MAT-STE-2026-00002`). Return `ok: true`, `stock_entry` / `stock_entry_no`. **Do not** return "Already exists" just because the MR already has another Stock Entry. |

So:

- **Idempotency key** = `transfer_carton_id` (and any other unique request key you use), **not** Material Request name only.
- One Stock Entry per **Transfer Carton** (or per distinct call with a unique carton id).
- Multiple Stock Entries per **Material Request** are allowed (one per carton / partial dispatch).

### Implementation outline (ERPNext / printechs_wms)

1. **Store which Stock Entry was created for which Transfer Carton**  
   e.g. a table or custom field: `transfer_carton_id` → `stock_entry` name.

2. **On request:**
   - Read `transfer_carton_id` (and `transfer_order` / Material Request if needed) from the payload.
   - If a Stock Entry **for this `transfer_carton_id`** already exists → return `ok: true`, `message: "Already exists (idempotent)"`, `stock_entry: "<existing STE name>"`. Do **not** create another.
   - If **no** Stock Entry exists for this `transfer_carton_id` → create a **new** Stock Entry for this carton’s items (and link to MR if your design requires). Return `ok: true`, `stock_entry` / `stock_entry_no` with the **new** name.

3. **Do not** treat “Material Request already has one Stock Entry” as a reason to return "Already exists". Only return idempotent when the **same** `transfer_carton_id` is sent again.

---

## Desktop behaviour (this repo)

- The desktop sends **one** request per Transfer Carton, with:
  - `transfer_carton_id` = that carton’s ID (e.g. `TC-001`),
  - `transfer_order` = Material Request number (e.g. `MAT-MR-2026-00001`),
  - plus company, warehouses, items, etc.
- The desktop now parses both `stock_entry_no` and `stock_entry` from the API response, so an idempotent response that returns `stock_entry` (e.g. `"MAT-STE-2026-00001"`) is still handled correctly.

So once the ERPNext API keys idempotency by **transfer_carton_id** and creates a **new** Stock Entry for each new carton, you can:

1. **First partial:** Create Stock Entry for TC-001 → get `MAT-STE-2026-00001`.
2. **Remaining items:** Create Stock Entry for TC-002 (same MR) → get a **new** `MAT-STE-2026-00002`, and so on for further cartons.

---

## Summary

| Item | Action |
|------|--------|
| **"Already exists (idempotent)"** | Means the API thinks this request was already processed (currently likely by MR; should be by TC). |
| **Only one Stock Entry for full MR** | Current backend behaviour when idempotency is by Material Request. |
| **Send remaining items** | Change ERPNext so idempotency is by **transfer_carton_id** and create **one new Stock Entry per Transfer Carton** for the same Material Request. |
| **Desktop** | Already sends per–Transfer Carton and now accepts both `stock_entry` and `stock_entry_no` in the response. |
