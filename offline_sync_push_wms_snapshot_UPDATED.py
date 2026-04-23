# -*- coding: utf-8 -*-
"""
Desktop -> ERPNext offline sync (push_wms_snapshot).

Tables/Doctypes involved:
- WMS Stock Ledger Entry (transaction log)
- WMS Stock Balance (current balance by item+warehouse+bin+carton)
- WMS Carton (carton master)
- WMS Integration Event Log (idempotency + tracking)

WMS Stock Balance structure:
- company (Link Company) [MANDATORY]
- warehouse (Link Warehouse) [MANDATORY]
- item_code (Link Item) [MANDATORY]
- location (Link WMS Bin Location) [MANDATORY]
- carton (Link WMS Carton) [optional]
- qty, reserved_qty, last_txn_datetime [optional]

Fixes applied:
- Force warehouse (and company) into each carton_stock row before upsert.
- Resolve location string to valid WMS Bin Location name (get or create by bin_id/name).
- Resolve carton_id to WMS Carton doc name for Link; only set carton when valid (avoid Link validation errors).
"""
from __future__ import annotations

import json
import frappe
from frappe.utils import now_datetime, get_datetime

LEDGER_DOCTYPE = "WMS Stock Ledger Entry"
BALANCE_DOCTYPE = "WMS Stock Balance"
CARTON_DOCTYPE = "WMS Carton"
BIN_LOCATION_DOCTYPE = "WMS Bin Location"
EVENTLOG_DOCTYPE = "WMS Integration Event Log"


# -----------------------------
# Helpers
# -----------------------------

def _dt(v):
    if not v:
        return now_datetime()
    try:
        return get_datetime(v)
    except Exception:
        return now_datetime()


def _as_json(payload) -> str:
    try:
        return json.dumps(payload, ensure_ascii=False, default=str)
    except Exception:
        return str(payload)


def _safe_has_field(doctype: str, fieldname: str) -> bool:
    try:
        return frappe.get_meta(doctype, ignore_permissions=True).has_field(fieldname)
    except Exception:
        return False


def _get_payload():
    """
    Reliable payload reader for JSON POST + form_dict + wrapper keys.
    """
    payload = None
    try:
        payload = frappe.request.get_json(silent=True)
    except Exception:
        payload = None

    if not payload:
        payload = frappe.local.form_dict or {}

    if isinstance(payload, dict) and "data" in payload:
        payload = payload.get("data")
    if isinstance(payload, dict) and "payload" in payload:
        payload = payload.get("payload")

    if isinstance(payload, str):
        s = payload.strip()
        if s.startswith("{") and s.endswith("}"):
            try:
                payload = json.loads(s)
            except Exception:
                payload = {}

    if not isinstance(payload, dict):
        payload = {}

    return payload


def _map_carton_status(v: str) -> str:
    v = (v or "").strip().lower()
    if v in ("open", "opened", "new"):
        return "Open"
    if v in ("closed", "stored", "putaway", "putaway_done", "completed", "saved"):
        return "Closed"
    if v in ("consumed", "picked", "issued", "delivered", "shipped"):
        return "Consumed"
    if v in ("damaged", "damage"):
        return "Damaged"
    return "Open"


_EVENT_TYPE_MAP = {
    "PUTAWAY": "Putaway",
    "RECEIVE": "Receive", "RECEIVING": "Receive", "GRN": "Receive",
    "TRANSFER": "Transfer", "TRANSFERIN": "Transfer", "TRANSFER_IN": "Transfer",
    "TRANSFEROUT": "Transfer", "TRANSFER_OUT": "Transfer",
    "MOVE": "Transfer",
    "PICK": "Pick", "PICKING": "Pick",
    "CYCLECOUNT": "CycleCount", "CYCLE_COUNT": "CycleCount",
    "ADJUST": "Adjust", "ADJUSTMENT": "Adjust",
}


def _map_event_type(v: str) -> str:
    if not v or not str(v).strip():
        return "Adjust"
    key = (str(v).strip()).upper().replace("-", "_").replace(" ", "")
    return _EVENT_TYPE_MAP.get(key, "Adjust")


def _get_bin_from_row(row: dict):
    to_keys = ("target_bin", "to_bin", "to_location", "destination_bin", "destination", "bin_to")
    from_keys = ("bin_location", "from_bin", "from_location", "source_bin", "source", "bin_from", "bin", "location")
    to_val = ""
    from_val = ""
    for k in to_keys:
        v = row.get(k)
        if v is not None and str(v).strip():
            to_val = str(v).strip()
            break
    for k in from_keys:
        v = row.get(k)
        if v is not None and str(v).strip():
            from_val = str(v).strip()
            break
    return (to_val, from_val)


def _resolve_warehouse(payload: dict, row: dict | None = None) -> str:
    row = row or {}
    wh = (row.get("warehouse") or row.get("warehouse_name") or "").strip()
    if not wh:
        wh = (payload.get("warehouse") or payload.get("warehouse_name") or "").strip()
    return wh


def _resolve_bin_location_name(bin_location_string: str, warehouse: str | None = None) -> str | None:
    """
    Resolve desktop bin_location string to ERPNext WMS Bin Location doc name.
    Tries: name = string, then field bin_id/bin_code, then create if allowed.
    """
    s = (bin_location_string or "").strip()
    if not s:
        return None
    if not frappe.db.exists("DocType", BIN_LOCATION_DOCTYPE):
        return s
    if frappe.db.exists(BIN_LOCATION_DOCTYPE, s):
        return s
    name = frappe.db.get_value(BIN_LOCATION_DOCTYPE, {"bin_id": s}, "name")
    if name:
        return name
    if _safe_has_field(BIN_LOCATION_DOCTYPE, "bin_code"):
        name = frappe.db.get_value(BIN_LOCATION_DOCTYPE, {"bin_code": s}, "name")
        if name:
            return name
    try:
        doc = frappe.new_doc(BIN_LOCATION_DOCTYPE)
        if _safe_has_field(BIN_LOCATION_DOCTYPE, "bin_id"):
            doc.bin_id = s
        elif _safe_has_field(BIN_LOCATION_DOCTYPE, "bin_code"):
            doc.bin_code = s
        if warehouse and _safe_has_field(BIN_LOCATION_DOCTYPE, "warehouse"):
            doc.warehouse = warehouse
        doc.insert(ignore_permissions=True)
        return doc.name
    except Exception:
        return s


def _resolve_carton_name(carton_id: str) -> str | None:
    """
    Resolve desktop carton_id to ERPNext WMS Carton doc name (for Link field).
    Returns None if not found so we do not set invalid link.
    """
    c = (carton_id or "").strip()
    if not c:
        return None
    name = frappe.db.get_value(CARTON_DOCTYPE, {"carton_id": c}, "name")
    return name


def _carton_field_is_link() -> bool:
    """Return True if WMS Stock Balance 'carton' field is Link type (else Data/text)."""
    try:
        meta = frappe.get_meta(BALANCE_DOCTYPE, ignore_permissions=True)
        field = meta.get_field("carton")
        return field and (field.fieldtype or "").lower() == "link"
    except Exception:
        return False


def _log_event(event_uuid, event_type, source_system, status, payload, processed=None, error=None):
    try:
        if not frappe.db.exists("DocType", EVENTLOG_DOCTYPE):
            return None
        table_name = f"tab{EVENTLOG_DOCTYPE}"
        if not frappe.db.table_exists(table_name):
            return None
        payload_json = _as_json(payload)
        processed_json = _as_json(processed) if processed is not None else None
        name = frappe.db.get_value(EVENTLOG_DOCTYPE, {"event_uuid": event_uuid}, "name")
        if name:
            values = {
                "event_type": event_type,
                "event_time": now_datetime(),
                "source_system": source_system,
                "status": status,
                "payload_json": payload_json,
            }
            if processed_json is not None and frappe.db.has_column(table_name, "processed_json"):
                values["processed_json"] = processed_json
            if error and frappe.db.has_column(table_name, "error"):
                values["error"] = error
            frappe.db.set_value(EVENTLOG_DOCTYPE, name, values, update_modified=True)
            return name
        doc = frappe.new_doc(EVENTLOG_DOCTYPE)
        doc.event_uuid = event_uuid
        doc.event_type = event_type
        doc.event_time = now_datetime()
        doc.source_system = source_system
        doc.status = status
        doc.payload_json = payload_json
        if processed_json is not None and hasattr(doc, "processed_json"):
            doc.processed_json = processed_json
        if error and hasattr(doc, "error"):
            doc.error = error
        doc.insert(ignore_permissions=True)
        return doc.name
    except Exception:
        return None


# -----------------------------
# UPSERTS
# -----------------------------

def upsert_wms_carton(row: dict, company: str, payload: dict) -> str:
    carton_id = (row.get("carton_id") or "").strip()
    if not carton_id:
        frappe.throw("cartons[].carton_id is required")
    values = {
        "company": company,
        "status": _map_carton_status(row.get("status")),
        "source_type": row.get("source_type") or "ASN",
        "source_ref": row.get("asn_no") or row.get("source_ref"),
        "current_location": row.get("current_bin_id") or row.get("current_location"),
        "remarks": row.get("remarks"),
    }
    wh = _resolve_warehouse(payload, row)
    if wh and _safe_has_field(CARTON_DOCTYPE, "warehouse"):
        values["warehouse"] = wh
    name = frappe.db.get_value(CARTON_DOCTYPE, {"carton_id": carton_id}, "name")
    if name:
        frappe.db.set_value(CARTON_DOCTYPE, name, values, update_modified=True)
        return name
    doc = frappe.new_doc(CARTON_DOCTYPE)
    doc.carton_id = carton_id
    for k, v in values.items():
        if hasattr(doc, k):
            setattr(doc, k, v)
    doc.insert(ignore_permissions=True)
    return doc.name


def upsert_wms_stock_ledger(row: dict, company: str, payload: dict, source_system: str) -> str:
    raw_id = row.get("id")
    if raw_id is None or str(raw_id).strip() == "":
        frappe.throw("stock_transactions[].id is required")
    wms_txn_id = f"DESKTOP-STX-{raw_id}"
    existing = frappe.db.get_value(LEDGER_DOCTYPE, {"wms_txn_id": wms_txn_id}, "name")
    if existing:
        return existing
    to_bin, from_bin = _get_bin_from_row(row)
    location = to_bin or from_bin
    if not location:
        frappe.throw("stock_transactions[] must have bin_location or target_bin")
    doc = frappe.new_doc(LEDGER_DOCTYPE)
    doc.posting_datetime = _dt(row.get("transaction_date"))
    doc.company = company
    doc.item_code = row.get("item_code")
    doc.location = location
    doc.carton = row.get("carton_id")
    doc.qty_change = row.get("qty_change") or 0
    doc.qty_after = row.get("qty_after")
    doc.event_type = _map_event_type(row.get("transaction_type"))
    doc.voucher_doctype = row.get("reference_doc_type")
    doc.voucher_name = row.get("reference_doc")
    doc.wms_txn_id = wms_txn_id
    doc.remarks = row.get("notes")
    if hasattr(doc, "from_bin") and from_bin:
        doc.from_bin = from_bin
    if hasattr(doc, "to_bin") and to_bin:
        doc.to_bin = to_bin
    if hasattr(doc, "source_system"):
        doc.source_system = source_system
    wh = _resolve_warehouse(payload, row)
    if wh and _safe_has_field(LEDGER_DOCTYPE, "warehouse"):
        doc.warehouse = wh
    doc.insert(ignore_permissions=True)
    return doc.name


def upsert_wms_stock_balance(row: dict, company: str, payload: dict) -> str:
    """
    Upsert WMS Stock Balance. Resolves location (WMS Bin Location) doc name.
    Carton: if the field is Link, resolve to WMS Carton doc name; if Data/text, use raw carton_id.
    """
    item_code = (row.get("item_code") or "").strip()
    bin_location_raw = (row.get("bin_location") or row.get("location") or "").strip()
    carton_id_raw = (row.get("carton_id") or row.get("carton") or "") or ""

    wh = _resolve_warehouse(payload, row)
    if not wh:
        frappe.throw(
            "WMS Stock Balance: Warehouse is required. Provide payload.warehouse or carton_stock[].warehouse."
        )
    if not item_code:
        frappe.throw("carton_stock[] requires item_code")
    if not bin_location_raw:
        frappe.throw("carton_stock[] requires bin_location (or location)")

    # Resolve location to WMS Bin Location doc name (required Link)
    location_name = _resolve_bin_location_name(bin_location_raw, wh)
    if not location_name:
        frappe.throw("carton_stock[]: could not resolve bin_location to WMS Bin Location")

    # Carton: use doc name only when field is Link; otherwise use raw carton_id (Data field)
    carton_value = ""
    if _carton_field_is_link():
        carton_name = _resolve_carton_name(carton_id_raw) if carton_id_raw else None
        carton_value = carton_name or ""
    else:
        carton_value = (carton_id_raw or "").strip()

    qty = float(row.get("qty") or row.get("qty_after") or 0)
    reserved_qty = float(row.get("reserved_qty") or 0)
    last_txn = _dt(row.get("last_moved_on") or row.get("last_txn_datetime") or row.get("transaction_date"))

    filters = {
        "company": company,
        "warehouse": wh,
        "item_code": item_code,
        "location": location_name,
        "carton": carton_value,
    }

    name = frappe.db.get_value(BALANCE_DOCTYPE, filters, "name")
    values = {"qty": qty, "reserved_qty": reserved_qty, "last_txn_datetime": last_txn}

    if name:
        frappe.db.set_value(BALANCE_DOCTYPE, name, values, update_modified=True)
        return name

    doc = frappe.new_doc(BALANCE_DOCTYPE)
    doc.company = company
    doc.warehouse = wh
    doc.item_code = item_code
    doc.location = location_name
    doc.carton = carton_value
    doc.qty = qty
    doc.reserved_qty = reserved_qty
    doc.last_txn_datetime = last_txn
    doc.insert(ignore_permissions=True)
    return doc.name


# -----------------------------
# API
# -----------------------------

@frappe.whitelist(methods=["POST"])
def push_wms_snapshot():
    payload = _get_payload()

    event_uuid = (payload.get("event_uuid") or "").strip()
    company = (payload.get("company") or "").strip()
    source_system = (payload.get("source_system") or "WMS_DESKTOP").strip()

    if not event_uuid:
        frappe.throw("event_uuid is required")
    if not company:
        frappe.throw("company is required")

    stock_txns = payload.get("stock_transactions") or []
    if stock_txns and isinstance(stock_txns[0], dict):
        event_type = _map_event_type(stock_txns[0].get("transaction_type"))
    else:
        event_type = "Adjust"

    if frappe.db.table_exists(f"tab{EVENTLOG_DOCTYPE}"):
        already_success = frappe.db.exists(EVENTLOG_DOCTYPE, {"event_uuid": event_uuid, "status": "Success"})
        if already_success:
            return {
                "ok": True,
                "event_uuid": event_uuid,
                "event_type": event_type,
                "processed": {"ledger": 0, "carton_stock": 0, "cartons": 0},
                "errors": [],
            }

    processed = {"ledger": 0, "carton_stock": 0, "cartons": 0}
    errors = []

    _log_event(event_uuid, event_type, source_system, "Processed", payload, processed=processed, error=None)

    try:
        for row in (payload.get("cartons") or []):
            try:
                upsert_wms_carton(row, company, payload)
                processed["cartons"] += 1
            except Exception as e:
                errors.append("cartons: " + (str(e) or frappe.get_traceback()))

        for row in (payload.get("stock_transactions") or []):
            try:
                carton_id = (row.get("carton_id") or "").strip()
                if carton_id and not frappe.db.exists(CARTON_DOCTYPE, {"carton_id": carton_id}):
                    to_b, from_b = _get_bin_from_row(row)
                    upsert_wms_carton(
                        {
                            "carton_id": carton_id,
                            "status": "Open",
                            "current_bin_id": to_b or from_b,
                            "source_type": row.get("source_type") or "ASN",
                            "source_ref": row.get("source_ref") or row.get("reference_doc"),
                            "warehouse": row.get("warehouse") or payload.get("warehouse"),
                        },
                        company,
                        payload,
                    )
                    processed["cartons"] += 1
                upsert_wms_stock_ledger(row, company, payload, source_system)
                processed["ledger"] += 1
            except Exception as e:
                errors.append("ledger: " + (str(e) or frappe.get_traceback()))

        # Balances: force warehouse and company into each row, then upsert with resolved Link fields
        for row in (payload.get("carton_stock") or []):
            try:
                row["warehouse"] = row.get("warehouse") or payload.get("warehouse")
                row["company"] = company
                upsert_wms_stock_balance(row, company, payload)
                processed["carton_stock"] += 1
            except Exception as e:
                errors.append("carton_stock: " + (str(e) or frappe.get_traceback()))

        if not (payload.get("carton_stock") or []) and (payload.get("stock_transactions") or []):
            for row in payload.get("stock_transactions") or []:
                try:
                    to_b, from_b = _get_bin_from_row(row)
                    loc = (to_b or from_b or "").strip()
                    derived = {
                        "warehouse": row.get("warehouse") or payload.get("warehouse"),
                        "item_code": row.get("item_code"),
                        "bin_location": loc,
                        "carton_id": row.get("carton_id"),
                        "qty_after": row.get("qty_after"),
                        "transaction_date": row.get("transaction_date"),
                    }
                    if derived.get("item_code") and derived.get("bin_location"):
                        upsert_wms_stock_balance(derived, company, payload)
                        processed["carton_stock"] += 1
                except Exception as e:
                    errors.append("carton_stock: " + (str(e) or frappe.get_traceback()))

        status = "Success" if not errors else "Failed"
        _log_event(
            event_uuid,
            event_type,
            source_system,
            status,
            payload,
            processed=processed,
            error="\n".join(errors) if errors else None,
        )
        return {
            "ok": len(errors) == 0,
            "event_uuid": event_uuid,
            "event_type": event_type,
            "processed": processed,
            "errors": errors,
        }

    except Exception as e:
        _log_event(
            event_uuid,
            event_type,
            source_system,
            "Failed",
            payload,
            processed=processed,
            error=str(e),
        )
        return {
            "ok": False,
            "event_uuid": event_uuid,
            "event_type": event_type,
            "processed": processed,
            "errors": [str(e)],
        }
