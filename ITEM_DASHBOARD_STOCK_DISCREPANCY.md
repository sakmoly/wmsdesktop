# Item Dashboard: WMS Stock Drilldown vs Stock Levels Discrepancy

**Symptom:** On the ERPNext Item form (Dashboard tab), **WMS Stock Drilldown** shows a total (e.g. 200 + 30 = 230 for item 108226) while **Stock Levels** shows a different number (e.g. 0 or 215). You may wonder if stock is being duplicated.

---

## 1. Two different data sources (not duplication)

| Section | Data source | What it shows |
|--------|-------------|----------------|
| **WMS Stock Drilldown** | **WMS Stock Balance** (ERPNext) | Rows created/updated by **push_wms_snapshot** from the desktop (carton_stock). One row per item + warehouse + location (+ carton). The drilldown sums balance by location for that item/warehouse (e.g. A1-R02-L1-B2 = 200, A1-R02-L3-B2 = 30 → total 230). |
| **Stock Levels** | **Standard ERPNext stock** (Bin / Stock Ledger) | Quantity from ERPNext’s normal inventory (Stock Entry, Bin, Stock Ledger Entry). This is **not** updated by the WMS snapshot. |

So:

- **WMS Stock Drilldown total (230)** = sum of **WMS Stock Balance** for that item and warehouse. That is correct and **not** duplicated by the snapshot: we send one row per (item, warehouse, location, carton) and ERPNext upserts WMS Stock Balance.
- **Stock Levels (0 or 215)** = from **standard** stock. If you have not posted a Stock Entry (or similar) for that item/warehouse, it can stay 0. If it shows 215, that value comes from ERPNext’s own logic (e.g. another warehouse, reserved qty, or a dashboard widget that uses a different query).

So the mismatch is **two different sources**, not the same stock counted twice.

---

## 2. Is WMS stock balance duplicated?

**No.** The desktop sends a single snapshot with:

- **carton_stock**: one row per (warehouse, item, bin_location, carton_id, qty) from the desktop’s `tabCartonStock`.  
- ERPNext **upserts** WMS Stock Balance (by company, warehouse, item, location, carton). Same key → update; new key → insert. There is no second write that would double-count the same movement.

If you see the same physical stock in both:

- **WMS Stock Drilldown** (from WMS Stock Balance), and  
- **Stock Levels** (from standard Bin/Stock Ledger),

then ERPNext is showing the **same** inventory in two different places (WMS view vs standard view), not “duplicating” the balance. To have them match, you’d need a process that updates **standard** stock from WMS (e.g. Stock Entry from WMS snapshot or from putaway) — that’s separate from push_wms_snapshot, which only updates WMS Stock Balance and WMS Stock Ledger Entry.

---

## 3. What to check on ERPNext

1. **Stock Levels value (0 vs 215)**  
   Find where the Item Dashboard “Stock Levels” and the **215** value are defined (custom script, report, or standard ERPNext dashboard). Confirm whether it reads from Bin, Stock Ledger, or another table, and for which warehouse. That will explain why it differs from 230.

2. **Warehouse name vs code**  
   WMS Stock Drilldown shows “Warehouse: Main Warehouse - MAATC” (name). The desktop can send warehouse as **code** (e.g. WH-MAIN) after the recent fix. Ensure push_wms_snapshot (or your resolver) maps code → same warehouse document so WMS Stock Balance is still stored under the correct warehouse.

3. **Single source of truth**  
   Decide whether “stock” on the Item should be:
   - **Only WMS** → use WMS Stock Drilldown (and optionally hide or relabel Stock Levels), or  
   - **Standard + WMS** → keep both but make clear which is which, and add a separate flow to post Stock Entry from WMS if you want standard stock to match.

---

## 4. Summary

| Question | Answer |
|----------|--------|
| Is the 230 in WMS Stock Drilldown duplicated? | No. It’s the sum of WMS Stock Balance rows for that item/warehouse (one row per location/carton from snapshot). |
| Why does Stock Levels show 0 or 215? | Stock Levels uses **standard** ERPNext stock (Bin/Stock Ledger), not WMS Stock Balance. 215 is likely from another calculation or warehouse on ERPNext. |
| Does the desktop double-post stock? | No. It sends one snapshot; ERPNext upserts WMS Stock Balance and WMS Stock Ledger Entry only. |

The discrepancy is **different data sources** (WMS Stock Balance vs standard stock), not duplication of the same balance.
