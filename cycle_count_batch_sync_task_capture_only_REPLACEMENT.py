# Replace the full sync_task_capture_only in cycle_count_batch.py with this function.
#
# Duplicates / wrong rows: If ERPNext shows more rows than WMS (e.g. 10 vs 4) or rows from a different
# location/carton, the same task was pushed multiple times with different payloads and results were
# appended instead of replaced. Fix: (1) Deploy THIS version so DELETE + replace runs. (2) Push only
# once per task from ONE place (Desktop "Push to ERP" OR wms-api after submit, not both). (3) Each
# payload must contain the FULL current lines for that task (same external_ref).
#
# - Replace results: explicit DELETE of child rows + commit, then reload and append only payload lines.
# - Carton ID: set on row after append; skip when Link. Mandatory enforced when Data+reqd.

@frappe.whitelist()
def sync_task_capture_only(payload: dict | None = None):
    if payload is None:
        payload = frappe.local.form_dict.get("payload") or frappe.local.form_dict or {}

    task = payload.get("task") or payload.get("header") or payload.get("task_header") or payload
    lines = payload.get("lines") or payload.get("results") or payload.get("items") or []

    if not isinstance(task, dict):
        frappe.throw(_("Invalid payload.task/header (must be dict)."))

    external_ref = (task.get("external_ref") or task.get("external_task_ref") or task.get("task_id") or "").strip()
    if not external_ref:
        frappe.throw(_("external_ref is required (desktop task id)."))

    company = task.get("company")
    warehouse = task.get("warehouse")
    warehouse_code = task.get("warehouse_code")
    bin_location = (task.get("bin_location") or "").strip()  # optional at header; lines can have their own bin_location

    if not company:
        frappe.throw(_("company is required."))
    if not warehouse:
        frappe.throw(_("warehouse is required (ERP Warehouse link)."))
    if not warehouse_code:
        frappe.throw(_("warehouse_code is required."))

    posting_date = task.get("posting_date") or today()
    status = _normalize_task_status(task.get("status") or "Completed")

    existing_name = _task_by_external_ref(external_ref)
    # Resolve child doctype from task's "results" table (fallback: RESULT_DT).
    result_dt = RESULT_DT
    try:
        tf = frappe.get_meta(TASK_DT).get_field("results")
        if tf and getattr(tf, "options", None):
            result_dt = tf.options
    except Exception:
        pass
    # Carton ID: only set when field is NOT Link. When Data, we set value and enforce mandatory if reqd.
    result_has_carton = _meta_has(result_dt, "carton_id")
    carton_is_link = False
    carton_reqd = False
    if result_has_carton:
        try:
            f = frappe.get_meta(result_dt).get_field("carton_id")
            if f:
                carton_is_link = (getattr(f, "fieldtype", None) == "Link")
                if not carton_is_link:
                    carton_reqd = getattr(f, "reqd", False)
        except Exception:
            pass

    if existing_name:
        doc = frappe.get_doc(TASK_DT, existing_name)
        doc.company = company
        doc.warehouse = warehouse
        doc.warehouse_code = warehouse_code
        if _meta_has(TASK_DT, "bin_location"):
            doc.bin_location = bin_location
        if _meta_has(TASK_DT, "posting_date"):
            doc.posting_date = posting_date
        if _meta_has(TASK_DT, "status"):
            doc.status = status
        if _meta_has(TASK_DT, "sync_stage"):
            doc.sync_stage = "Captured"
        if _meta_has(TASK_DT, "sync_status"):
            doc.sync_status = "Synced"

        # Force-delete ALL existing result rows so we never append (stops duplicates from multiple pushes or different payloads).
        results_field = doc.meta.get_field("results")
        if results_field and getattr(results_field, "options", None):
            child_doctype = results_field.options
            table = None
            try:
                table = getattr(frappe.get_meta(child_doctype), "table_name", None)
            except Exception:
                pass
            if not table:
                try:
                    table = frappe.db.get_table_name(child_doctype)
                except Exception:
                    pass
            if table:
                try:
                    frappe.db.sql("DELETE FROM `%s` WHERE parent = %%s" % table, (doc.name,))
                    frappe.db.commit()
                except Exception:
                    pass
        doc.reload()
        doc.company = company
        doc.warehouse = warehouse
        doc.warehouse_code = warehouse_code
        if _meta_has(TASK_DT, "bin_location"):
            doc.bin_location = bin_location
        if _meta_has(TASK_DT, "posting_date"):
            doc.posting_date = posting_date
        if _meta_has(TASK_DT, "status"):
            doc.status = status
        if _meta_has(TASK_DT, "sync_stage"):
            doc.sync_stage = "Captured"
        if _meta_has(TASK_DT, "sync_status"):
            doc.sync_status = "Synced"
        doc.set("results", [])

        if isinstance(lines, list):
            for i, row in enumerate(lines, start=1):
                if not isinstance(row, dict):
                    continue
                item_code = row.get("item_code") or row.get("item") or row.get("code")
                if not item_code:
                    continue
                row_bin = row.get("bin_location") or bin_location
                counted_qty = _safe_float(row.get("counted_qty") or row.get("qty") or row.get("counted") or 0)
                carton_id_val = _extract_carton_id(row)
                if result_has_carton and not carton_is_link and carton_reqd and not (carton_id_val and str(carton_id_val).strip()):
                    frappe.throw(_("Row {0}: carton_id is required (Item {1}).").format(i, item_code))
                child_dict = {
                    "item_code": item_code,
                    "bin_location": row_bin,
                    "counted_qty": counted_qty,
                    "system_qty": 0.0,
                    "delta_qty": counted_qty,
                    "has_discrepancy": 1 if abs(counted_qty) > 0.000001 else 0,
                }
                if result_has_carton and not carton_is_link:
                    child_dict["carton_id"] = (carton_id_val or "").strip()
                doc.append("results", child_dict)
                # Set carton_id on the row object so it persists (some Frappe versions need this)
                if result_has_carton and not carton_is_link and doc.results:
                    doc.results[-1].carton_id = (carton_id_val or "").strip()

        doc.save(ignore_permissions=True)
        updated_lines = len(doc.results)

    else:
        doc = frappe.get_doc(
            {
                "doctype": TASK_DT,
                "company": company,
                "warehouse": warehouse,
                "warehouse_code": warehouse_code,
                "bin_location": bin_location,
                "status": status,
                "external_ref": external_ref,
                "posting_date": posting_date,
            }
        )
        if _meta_has(TASK_DT, "sync_stage"):
            doc.sync_stage = "Captured"
        if _meta_has(TASK_DT, "sync_status"):
            doc.sync_status = "Synced"

        # Build results before insert
        if isinstance(lines, list):
            for i, row in enumerate(lines, start=1):
                if not isinstance(row, dict):
                    continue
                item_code = row.get("item_code") or row.get("item") or row.get("code")
                if not item_code:
                    continue
                row_bin = row.get("bin_location") or bin_location
                counted_qty = _safe_float(row.get("counted_qty") or row.get("qty") or row.get("counted") or 0)
                carton_id_val = _extract_carton_id(row)
                if result_has_carton and not carton_is_link and carton_reqd and not (carton_id_val and str(carton_id_val).strip()):
                    frappe.throw(_("Row {0}: carton_id is required (Item {1}).").format(i, item_code))
                child_dict = {
                    "item_code": item_code,
                    "bin_location": row_bin,
                    "counted_qty": counted_qty,
                    "system_qty": 0.0,
                    "delta_qty": counted_qty,
                    "has_discrepancy": 1 if abs(counted_qty) > 0.000001 else 0,
                }
                if result_has_carton and not carton_is_link:
                    child_dict["carton_id"] = (carton_id_val or "").strip()
                doc.append("results", child_dict)
                if result_has_carton and not carton_is_link and doc.results:
                    doc.results[-1].carton_id = (carton_id_val or "").strip()

        doc.insert(ignore_permissions=True)
        updated_lines = len(doc.results)

    batch_name = link_task_to_batch(doc)

    return {
        "ok": True,
        "api_version": API_VERSION,
        "task": doc.name,
        "external_ref": external_ref,
        "batch": batch_name,
        "updated_lines": updated_lines,
    }
