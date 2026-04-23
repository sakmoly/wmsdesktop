# Fix "None of the items have any change" for Opening Stock Reconciliation

The issue is still there because either **(A)** the API is sending qty = 0 to the SR, or **(B)** ERPNext’s validation is blocking even when you do send non-zero qty. Do both steps below.

---

## Step 1: Confirm what the API is sending (in printechs_wms)

In `upload_opening_valuation_file`, **before** `sr.insert(...)`:

1. **Return the rows** that will be used for the SR so you can see if qty is 0 or not. Add to the **return** dict (even when successful):

```python
# Before: return { "ok": True, "sr": sr.name, ... }
# Add this key:
"debug_rows": [
    {"item_code": x["item_code"], "qty": x["qty"], "valuation_rate": x["valuation_rate"]}
    for x in rows
],
```

2. **Reject all-zero qty** so you get a clear error instead of "no change":

```python
# Right after: rows = [] ... for item, a in agg.items(): ... rows.append(...)
# Add:
if all(float(x.get("qty") or 0) == 0 for x in rows):
    frappe.throw(_(
        "All rows have counted_qty_total = 0. Check Excel sheet 'Opening Valuation Upload' and column 'counted_qty_total'."
    ))
```

- If you **see non-zero qty** in `debug_rows` → the API is fine; the problem is **Step 2** (ERPNext validation).
- If you **see all zeros** or get the new "All rows have counted_qty_total = 0" error → fix the Excel (sheet name, column name, and that the file the server reads is the one with numbers).

---

## Step 2: Bypass "no change" for Opening Stock (in ERPNext)

The message **"None of the items have any change in quantity or value"** is raised inside **Stock Reconciliation** (core or app). You must **relax or skip** that check when it’s an Opening Stock reconciliation.

### Option A – Server Script (recommended)

1. In ERPNext: **Search** → **Server Script** → **New**.
2. **Doc Type:** Stock Reconciliation  
   **Event:** Before Submit (or Before Save, depending when the validation runs)
3. **Script:**

```python
# Skip "no change" validation for Opening Stock
if doc.get("purpose") == "Opening Stock" or cint(doc.get("opening_entry")) == 1:
    # Allow submit even if all items have 0 difference (e.g. first-time opening)
    return
# Optional: if you want to run the default validation for non-opening SR, don’t return and let it run
```

If the standard validation runs in **validate** (not on submit), use **Event: Before Save** and the same condition. If the message still appears, the check may be in **validate**; then try **Custom Script** or an override in your app (see Option B).

### Option B – App override (if Server Script is not enough)

1. Find where the message is raised:
   - In your ERPNext/app repo:  
     `grep -r "None of the items have any change" .`
   - Often in `stock_reconciliation.py` or similar, in a `validate` method.
2. In your **printechs_wms** (or custom app), override that method or hook so that when `doc.purpose == "Opening Stock"` or `doc.opening_entry == 1`, you **skip** the block that throws "None of the items have any change".

---

## Summary

| Step | Action |
|------|--------|
| 1 | In `upload_opening_valuation_file`: return `debug_rows` and throw if all `qty` are 0. Check response/Excel so that non-zero qty is sent. |
| 2 | In ERPNext: Server Script (or app override) on Stock Reconciliation to skip the "no change" check when `purpose == "Opening Stock"` or `opening_entry == 1`. |

After Step 1 you’ll know whether the problem is data (zeros) or validation. After Step 2, Opening Stock reconciliations will no longer be blocked by that message.
