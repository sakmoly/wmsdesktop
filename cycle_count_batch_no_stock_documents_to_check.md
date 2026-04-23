# No stock in system – documents to check

When you say "in the system no stock available" but the batch shows **Total System Qty** (e.g. 100, 100, 200) or you get **"None of the items have any change in quantity or value"**, check the following in **ERPNext**. Two different "sources of stock" can be in play.

---

## 1. Where "Total System Qty" in the batch comes from

**Load Actual Stock Preview** (cycle count batch) reads **Total System Qty** from:

| Document / Table | Purpose |
|------------------|--------|
| **WMS Stock Balance** | Source for "Total System Qty" in the batch summary. Filter: warehouse, location (bin), item_code, (carton). |

So if the batch shows **Total System Qty = 100**, that value is the **sum of qty** in **WMS Stock Balance** for that item + warehouse + bin (+ carton), not from standard ERPNext stock.

---

## 2. Where "current stock" for Stock Reconciliation comes from

When you create or submit a **Stock Reconciliation**, ERPNext compares the SR lines to **standard** stock:

| Document / Table | Purpose |
|------------------|--------|
| **Bin** (or **Stock Balance** in newer ERPNext) | Current quantity per warehouse + item. Reports and SR use this. |
| **Stock Ledger Entry** | History of stock movements; balance is derived from here. |

So "no stock in the system" usually means **Bin / Stock Ledger** (or standard Stock Balance) shows **0** for those items in that warehouse.

---

## 3. Why you can see "no change" when you expect a change

- **Total System Qty** in the batch = from **WMS Stock Balance** (can be 100, 100, 200).
- **Current stock** used by SR = from **Bin / Stock Ledger** (can be 0).

If **WMS Stock Balance** has rows but **Bin / Stock Ledger** do not (or are 0):

- The batch can show non-zero "Total System Qty".
- If the **Opening SR** is built with **qty = Total System Qty** (same as WMS Stock Balance), and for some reason the SR validation compares to **WMS Stock Balance** (or the SR is built with 0), you get "no change".
- If the SR is built with **counted qty** and compared to **Bin/Stock Ledger** (0), then there *is* a change and "no change" should not appear – unless the SR is created with 0 qty or the wrong comparison is used.

So the mismatch is: **WMS Stock Balance** vs **standard stock (Bin / Stock Ledger)**.

---

## 4. Documents to check (checklist)

Use this list when debugging "no stock" vs "no change":

| # | Document / report | What to check |
|---|--------------------|----------------|
| 1 | **Stock Ledger Entry** | For the batch’s warehouse + items: are there any entries? What is the **balance**? (0 = no stock in standard books.) |
| 2 | **Bin** (Stock → Bin, or report "Stock Balance") | For the same warehouse + items: **actual qty** = 0 or not? This is what SR and reports use. |
| 3 | **WMS Stock Balance** | For the same warehouse + bin + items: do rows exist? What is **qty**? This is what **Total System Qty** in the batch uses. |
| 4 | **WMS Bin Location** | If **WMS Stock Balance** uses a Link to "WMS Bin Location", ensure the bin/location used in the batch exists here. |
| 5 | **Stock Reconciliation** (existing) | Any **Opening** or normal SR already submitted for this warehouse/items? That would have updated Bin/Stock Ledger; if it set the same qty you’re entering now, you get "no change". |
| 6 | **Item** (Default Warehouse) | Not the cause of "no change", but if you expect 0 stock, confirm no other warehouse has stock. |

---

## 5. If you want "no stock" to mean 0 everywhere

- **Standard stock (Bin / Stock Ledger):** Ensure no SR or other transaction has posted stock for that warehouse/items, or cancel those so balance is 0.
- **WMS Stock Balance:** If you use it only for WMS and want "system" to match standard:
  - Either **sync WMS Stock Balance from standard stock** (or from snapshot that reflects 0), or
  - **Don’t push snapshot** with non-zero qty until you’ve done Opening SR, so WMS Stock Balance doesn’t show 100/100/200 when Bin is 0.

Then **Load Actual Stock Preview** will show **Total System Qty = 0** (if WMS Stock Balance is 0), and an **Opening SR** with counted qty will be a clear change from 0.

---

## 6. Short summary

| Question | Answer |
|----------|--------|
| Where does batch "Total System Qty" come from? | **WMS Stock Balance** (in ERPNext). |
| Where does "current stock" for SR come from? | **Bin** / **Stock Ledger** (standard ERPNext). |
| What to check when "no stock" but batch has system qty? | **WMS Stock Balance** (has data?) and **Bin / Stock Ledger** (0?). |
| What to check when you get "no change" but expect change? | **Bin / Stock Ledger** (is balance already equal to the qty you’re putting in the SR?) and how the SR is built (using counted qty or system qty?). |
