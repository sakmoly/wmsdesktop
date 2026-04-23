# -*- coding: utf-8 -*-
# ERPNext: add this logic INSIDE your push_wms_snapshot handler so tabWMS Stock Balance gets populated.
#
# Your handler receives the snapshot (event_uuid, company, warehouse, stock_transactions, carton_stock, cartons).
# This snippet reads carton_stock and inserts/updates tabWMS Stock Balance.
#
# 1. In printechs_wms, find the file that defines push_wms_snapshot (e.g. api/offline_sync.py).
# 2. After you parse the payload, call the function below (or paste the loop into your handler).
# 3. Set STOCK_BALANCE_DOCTYPE to your actual DocType name (e.g. "WMS Stock Balance").
# 4. If your table uses different column names, adjust the column names in the INSERT.

import frappe
from frappe import _

# DocType name for WMS Stock Balance in your app (change if different)
STOCK_BALANCE_DOCTYPE = "WMS Stock Balance"


def populate_wms_stock_balance_from_snapshot(payload):
    """
    Read carton_stock from push_wms_snapshot payload and write to tabWMS Stock Balance.
    Call this from inside push_wms_snapshot after you receive the payload.
    payload: dict with keys warehouse (or use company), carton_stock (list of dicts).
    """
    carton_stock = payload.get("carton_stock") or []
    warehouse = (payload.get("warehouse") or "").strip()
    if not warehouse:
        return {"rows_inserted": 0, "message": "No warehouse in payload"}
    if not carton_stock:
        return {"rows_inserted": 0, "message": "No carton_stock in payload"}

    try:
        table_name = frappe.db.get_table_name(STOCK_BALANCE_DOCTYPE)
    except Exception:
        table_name = "tabWMS Stock Balance"  # fallback if get_table_name fails

    # Optional: delete existing rows for this warehouse so we replace with snapshot (no duplicates)
    try:
        # Adjust column name if your table uses warehouse_code instead of warehouse
        frappe.db.sql(
            "DELETE FROM `%s` WHERE warehouse = %%s" % table_name,
            (warehouse,),
        )
        frappe.db.commit()
    except Exception as e:
        pass  # table or column might differ; continue to insert

    # Get column names from the DocType meta (so we match your schema)
    meta = frappe.get_meta(STOCK_BALANCE_DOCTYPE)
    has_carton = meta.get_field("carton") or meta.get_field("carton_id")
    has_location = meta.get_field("location") or meta.get_field("bin_location")
    location_col = "location" if meta.get_field("location") else "bin_location"
    carton_col = "carton" if meta.get_field("carton") else "carton_id"
    has_reserved = bool(meta.get_field("reserved_qty"))
    has_last_moved = bool(meta.get_field("last_moved_on"))

    rows_inserted = 0
    for row in carton_stock:
        item_code = (row.get("item_code") or "").strip()
        if not item_code:
            continue
        bin_loc = (row.get("bin_location") or "").strip()
        carton_id = (row.get("carton_id") or "").strip() or None
        qty = float(row.get("qty") or 0)
        reserved = float(row.get("reserved_qty") or 0) if has_reserved else 0
        last_moved = (row.get("last_moved_on") or "").strip() or None
        wh = (row.get("warehouse") or warehouse).strip()

        try:
            if has_carton and has_location and has_reserved and has_last_moved:
                frappe.db.sql(
                    """
                    INSERT INTO `%s` (warehouse, item_code, %s, %s, qty, reserved_qty, last_moved_on)
                    VALUES (%%s, %%s, %%s, %%s, %%s, %%s, %%s)
                    """ % (table_name, location_col, carton_col),
                    (wh, item_code, bin_loc, carton_id or "", qty, reserved, last_moved),
                )
            elif has_carton and has_location:
                frappe.db.sql(
                    """
                    INSERT INTO `%s` (warehouse, item_code, %s, %s, qty)
                    VALUES (%%s, %%s, %%s, %%s, %%s)
                    """ % (table_name, location_col, carton_col),
                    (wh, item_code, bin_loc, carton_id or "", qty),
                )
            else:
                # Minimal: warehouse, item_code, location, qty
                frappe.db.sql(
                    """
                    INSERT INTO `%s` (warehouse, item_code, %s, qty)
                    VALUES (%%s, %%s, %%s, %%s)
                    """ % (table_name, location_col),
                    (wh, item_code, bin_loc, qty),
                )
            rows_inserted += 1
        except Exception as e:
            frappe.log_error(title="push_wms_snapshot insert stock balance", message=str(e))
            continue

    if rows_inserted:
        frappe.db.commit()
    return {"rows_inserted": rows_inserted, "message": "ok"}


# ============ Example: how to call from push_wms_snapshot ============
#
# @frappe.whitelist()
# def push_wms_snapshot():
#     payload = frappe.local.form_dict.get("payload") or frappe.local.form_dict or {}
#     # ... your existing validation ...
#
#     result = populate_wms_stock_balance_from_snapshot(payload)
#
#     return {"ok": True, "message": "Snapshot received", "stock_balance_rows": result.get("rows_inserted", 0)}
