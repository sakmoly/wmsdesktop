# Purchase Receipt duplicate lines – analysis

## What you’re seeing (MAT-PRE-2026-00001)

- **108226, 108227** – Same item twice with identical qty/rate/amount.
- **108228, 108229** – Same item twice with same qty but different rate/amount (50 vs 60).
- **18230 vs 108230** – Two rows with same “No.” and qty 50: one item code **18230** (C JK BLACK_), one **108230** (COLN WMN WST).

So there are **two separate causes**.

---

## Cause 1: Same item code appearing twice (108226, 108227, 108228, 108229)

**Desktop behaviour (current):**

- We send **one line per item**: we group ASN details by `item_code` and send a single `received_qty` per item.
- So in one “Update to ERPNext” call we send **at most one line per item code**.

So the “same item twice” in the PR is **not** from the desktop sending two lines for the same code. It comes from the **server** (`receive_asn_and_create_purchase_receipt`), in one (or both) of these ways:

1. **Two sources of rows**
   - The API adds PR rows from the **linked document** (e.g. Purchase Order or ASN) – one row per PO/ASN line.
   - Then it adds rows from the **`lines`** payload we send.
   - Result: each item appears **twice** (once from link, once from payload).

2. **“Update” clicked more than once**
   - Each call **appends** new rows instead of updating the existing PR.
   - So the first click adds 108226 once, the second click adds 108226 again → duplicate.

**What the server must do:**

- Build PR items from **one** source of truth:
  - **Either** use **only** the received **`lines`** we send (no extra rows from PO/ASN),  
  - **Or** use the linked PO/ASN as the template and **update** each row’s accepted qty (and rate if needed) from **`lines`** – do **not** insert a second row per item.
- When the same ASN/PR is sent again, **update** existing rows by `item_code` (or replace all items from payload) instead of appending. So repeated “Update” is idempotent.

Until the server is fixed this way, duplicates for the same item code will continue.

---

## Cause 2: Two different item codes (18230 vs 108230)

- We group by **exact** `item_code` (after trim, case-insensitive). So **18230** and **108230** are **different** keys.
- If ASN details (or inbound/receive data) have both:
  - one row with `item_code` **18230** (e.g. qty 50), and  
  - another with **108230** (e.g. qty 50),  
  we send **two lines** → two PR rows: one “18230: C JK BLACK_”, one “108230: COLN WMN WST”.

So this is **data**: two different codes for what may be the same product (typo or barcode missing leading “1”).

**What to do:**

1. **Check source data**  
   In WMS, for this ASN check:
   - ASN item details / receive lines: do you have both **18230** and **108230**?
   - If yes, fix at source: use **108230** everywhere (or the one correct code), and fix barcode/scan if it’s dropping the “1”.

2. **Optional – desktop log**  
   After “Update to ERPNext”, check the log line:
   - `Creating Purchase Receipt for ASN ..., X line(s). Item codes: [108226:15, 108227:20, ..., 18230:50, 108230:50]`
   - If you see both **18230** and **108230** in that list, the duplicate row for “18230” and “108230” is from our payload (two lines). Cleaning data so only **108230** exists will remove the extra row.

3. **Do not** merge 18230 and 108230 automatically in code (e.g. by “normalizing” to 108230) unless you’re sure they are always the same item; otherwise you can merge wrong products.

---

## Summary

| What you see | Cause | Where to fix |
|--------------|--------|--------------|
| Same item twice (e.g. 108226 twice) | Server adds rows from PO/ASN **and** from our `lines`, or appends on every “Update” | **Server**: single source of items; update by item_code; idempotent on repeat call |
| 18230 and 108230 as two rows | Two different `item_code` values in data; we send two lines | **Data**: use one code (e.g. 108230) everywhere; check barcode/ASN details |

---

## How to confirm what the desktop sends

1. Run “Update Received Qty to ERPNext” once for the ASN.
2. In the app log (e.g. `ErrorLogs` or debug output), find:
   - `Creating Purchase Receipt for ASN ASN-xxxx, warehouse ..., N line(s). Item codes: [item1:qty1, item2:qty2, ...]`
3. Check:
   - **N** = number of lines we send. You should see **one entry per item code** (e.g. 5 items → 5 lines). If you see 10 lines and 5 of them are repeated item codes, that would be a desktop bug – current code does not do that.
   - If the list contains **both** `18230` and `108230`, the two PR rows for those codes are expected from our payload until you fix data to use a single code.

The desktop is already aggregating by `item_code` and sending one line per item; the remaining duplicates are from server behaviour and/or two different item codes in data, as above.

---

## Desktop change: send existing PR name (avoid append on repeat click)

**Yes, the body is effectively constant** when you click "Update to ERPNext" again for the same ASN: same `asn_name`, same aggregated `lines` (one per item). If the server **appends** on every call instead of updating, you get duplicate rows (e.g. 4 clicks → 4× same lines).

**Desktop fix (done):** When the ASN already has a Purchase Receipt number (`asn.PurchaseReceiptNo`), we now send **`purchase_receipt_name`** in the request body. The server can use this to **update** that existing PR (replace or merge lines by item_code) instead of creating a new one or appending.

**Server must:** When `purchase_receipt_name` is present, load that PR and **set/replace** item rows from the payload (one row per item_code), not append. Then repeated "Update to ERPNext" clicks become idempotent.

---

## Root cause: two APIs, first one sent one line per carton

When you click **"Update Received Qty to ERPNext"** the desktop calls **two** APIs in order:

1. **ASN Status** (e.g. `update_asn_received_qty`) – push received quantities.
2. **Purchase Receipt** (`receive_asn_and_create_purchase_receipt`) – create/update the PR.

**What was wrong:** The **first** API was sent **one line per detail row** from the desktop (one per item + carton). So if your local ASN had 6 rows for item 108226 (e.g. 6 cartons), we sent **6 lines** with item 108226. If the backend uses that payload to create or update the Purchase Receipt, it added **6 PR rows** for 108226. The second API then sent aggregated lines (2 lines), so you could see 6 + 2 or the first API alone could create 6 rows per item. That’s why the PR didn’t match the ASN (which shows 2 item lines) and looked “repeated 4–6 times”.

**Desktop fix (done):** The **first** API payload is now **aggregated by item_code** as well: we send **one line per item** with total received qty (same shape as the PR payload). So both APIs now receive e.g. 2 lines (108226:15, 108227:20) when the ASN has 2 items. The PR should then show one row per item, matching the actual ASN.
