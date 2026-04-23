# Purchase Receipt duplicate lines – fix

## Problem

The Purchase Receipt created by `receive_asn_and_create_purchase_receipt` showed **duplicate line items** for the same Item Code (e.g. item 108226 three times, 108227 three times, etc.).

## Cause

The **desktop** was sending **one request line per ASN detail row**. ASN details can have multiple rows per item (e.g. one per carton or per receive event). The API was receiving several lines with the same `item_code` and (depending on server logic) either:

- adding one PR row per request line, or  
- being called more than once and appending each time,

so the PR ended up with multiple rows per item.

## Desktop fix (done)

In `ErpNextWmsSyncApiService.CreatePurchaseReceiptFromAsnAsync` the payload **lines are now aggregated by `item_code`** before calling the API:

- **Before:** One line per ASN detail (e.g. 15 lines for 5 items × 3 cartons).
- **After:** One line per **item** with **total received qty** (e.g. 5 lines for 5 items).

So the desktop now sends:

- `item_code`: unique per line  
- `received_qty`: **sum** of received qty for that item across all details  
- `carton_id`: not set (null) for the aggregated line  

This prevents duplicate PR rows when the server adds one row per request line.

## Server-side recommendation

To avoid duplicates when the user clicks **“Update Received Qty to ERPNext”** more than once, the `receive_asn_and_create_purchase_receipt` API should:

1. **Find PR by ASN** (e.g. link ASN ↔ PR or pass `purchase_receipt_name` when updating).
2. **Update existing PR** instead of always appending:
   - Either **merge by item_code**: for each request line, find existing PR item row with same `item_code` and **set or increment** accepted qty (don’t append a new row).
   - Or **replace** PR items for that ASN with the new lines (set qty from payload, one row per item).

Then repeated calls with the same ASN (or same PR name) become idempotent and no extra duplicate rows are created.

## Extra line with qty=1 and cost 0 (same item twice)

If the Purchase Receipt shows **two rows for the same item** (e.g. 108230 once with **Accepted Qty = 1, Rate = 0**, and again with the real qty and rate), that extra line is **not** from the desktop sending two lines for that item (we send one line per item with total received qty).

It usually comes from the **server** (`receive_asn_and_create_purchase_receipt`):

- The API may add **one row from the linked document** (Purchase Order or ASN) when creating the PR, with default qty 1 and rate 0.
- Then it adds rows from our **lines** payload (with real received qty and rate).
- Result: same item appears twice — one “placeholder” row (1, 0.00) and one real row (e.g. 50, 60.00).

**Desktop:** We now **skip lines with received_qty ≤ 0** so we never send zero-qty lines. We still send only one line per item.

**Server fix:** When building the PR, the API should **not** add a separate row from the PO/ASN for an item that is already in the **lines** payload. It should either:
- Build PR items **only** from the received **lines** (no PO/ASN row), or  
- For each item in **lines**, **update** the existing PR row (from PO/ASN) with the received qty and rate instead of inserting a second row.

That will remove the extra “qty=1, cost 0” line.

## How to verify

1. Use an ASN that has multiple detail rows per item (e.g. same item in several cartons).
2. In the desktop, set ASN status to **Received** and click **Update Received Qty to ERPNext** once.
3. In ERPNext, open the created Purchase Receipt: there should be **one row per item** with the correct total accepted quantity.
4. If you click **Update Received Qty to ERPNext** again (after the server is updated to merge/replace), the PR should not gain duplicate rows.
