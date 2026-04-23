# -*- coding: utf-8 -*-
# Updated load_actual_stock_preview: set carton_id on batch summary so "Value missing for: Carton ID" is avoided.
# REQUIREMENT: In ERPNext, the batch summary child DocType's "Carton ID" field MUST be type Data (not Link).
# If it is Link: you get LinkValidationError. If we omit the value and the field is mandatory: "Value missing".
# Change Carton ID to Data in the summary child, then this code will set WMS carton IDs and validation will pass.

@frappe.whitelist()
def load_actual_stock_preview(batch_name: str):
    b = frappe.get_doc(BATCH_DT, batch_name)

    warehouse_code = b.warehouse_code
    if not warehouse_code:
        frappe.throw(_("Batch.warehouse_code is required."))

    task_names = frappe.get_all(TASK_DT, filters={"batch": batch_name}, pluck="name")
    if not task_names:
        return {"ok": True, "updated_lines": 0, "summary_rows": 0, "note": "No tasks linked to this batch"}

    result_has_carton = _meta_has(RESULT_DT, "carton_id")
    stock_has_carton = _meta_has(STOCK_BAL_DT, "carton") or _meta_has(STOCK_BAL_DT, "carton_id")

    summary_carton_reqd = False
    if _meta_has(SUMMARY_CHILD_DT, "carton_id"):
        try:
            sf = frappe.get_meta(SUMMARY_CHILD_DT).get_field("carton_id")
            if sf:
                summary_carton_reqd = getattr(sf, "reqd", False)
        except Exception:
            pass

    res_fields = ["name", "parent", "item_code", "bin_location", "counted_qty"]
    if result_has_carton:
        res_fields.append("carton_id")

    res_rows = frappe.get_all(
        RESULT_DT,
        filters={"parent": ["in", task_names]},
        fields=res_fields,
    )

    def _k(r):
        if result_has_carton:
            return (r["item_code"], r["bin_location"], (r.get("carton_id") or ""))
        return (r["item_code"], r["bin_location"])

    # One counted_qty per (item, bin, carton). Use latest result row to avoid tripling when same bin
    # appears in multiple tasks (summing would give 250+250+250=750 instead of 250).
    grouped = {}
    for r in res_rows:
        key = _k(r)
        q = _safe_float(r.get("counted_qty"))
        rname = r.get("name") or ""
        if key not in grouped or (rname > (grouped[key].get("name") or "")):
            grouped[key] = {"counted": q, "name": rname}

    b.set("summary", [])
    system_map = {}

    for key, agg in grouped.items():
        if result_has_carton:
            item_code, bin_location, carton_id = key
        else:
            item_code, bin_location = key
            carton_id = None

        where = ["warehouse = %s", "location = %s", "item_code = %s"]
        params = [b.warehouse, bin_location, item_code]

        if carton_id and _meta_has(STOCK_BAL_DT, "carton"):
            where.append("carton = %s")
            params.append(carton_id)

        system_qty = frappe.db.sql(
            f"""
            SELECT COALESCE(SUM(qty), 0)
            FROM `tab{STOCK_BAL_DT}`
            WHERE {" AND ".join(where)}
            """,
            tuple(params),
        )[0][0] or 0

        system_qty = float(system_qty)
        counted = float(agg["counted"])
        delta = counted - system_qty

        system_map[key] = system_qty

        summary_row = {
            "item_code": item_code,
            "bin_location": bin_location,
            "total_system_qty": system_qty,
            "total_counted_qty": counted,
            "total_delta_qty": delta,
        }
        # Set carton_id so mandatory is satisfied. Summary Carton ID must be Data type (not Link) in ERPNext.
        if _meta_has(SUMMARY_CHILD_DT, "carton_id"):
            summary_row["carton_id"] = (carton_id or "").strip() if result_has_carton else ""
            if summary_row["carton_id"] == "" and summary_carton_reqd:
                summary_row["carton_id"] = "-"  # placeholder when mandatory but no carton from results

        b.append("summary", summary_row)

    updated_lines = 0
    for r in res_rows:
        key = _k(r)
        sys_qty = float(system_map.get(key, 0.0))
        counted = _safe_float(r.get("counted_qty"))
        delta = counted - sys_qty
        has_disc = 1 if abs(delta) > 0.000001 else 0

        frappe.db.set_value(RESULT_DT, r["name"], "system_qty", sys_qty, update_modified=False)
        frappe.db.set_value(RESULT_DT, r["name"], "delta_qty", delta, update_modified=False)
        frappe.db.set_value(RESULT_DT, r["name"], "has_discrepancy", has_disc, update_modified=False)
        updated_lines += 1

    if _meta_has(BATCH_DT, "preview_loaded_on"):
        b.preview_loaded_on = now_datetime()

    if _meta_has(BATCH_DT, "status"):
        b.status = "Previewed"

    b.save(ignore_permissions=True)

    return {"ok": True, "batch": batch_name, "updated_lines": updated_lines, "summary_rows": len(b.summary)}
