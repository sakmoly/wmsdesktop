# Fix for load_actual_stock_preview – "Could not find Row #1: Carton ID: CTN-000131..."

## Cause
The batch **summary** child table has a **Carton ID** field. When it is type **Link**, Frappe validates that values exist in the Carton doctype. WMS carton IDs (e.g. CTN-000130, CTN-000131) are not in ERPNext’s Carton master, so `b.save()` raises **LinkValidationError**.

## Fix
Only set `carton_id` on the summary row when the summary child’s `carton_id` field is **not** a Link (e.g. when it’s **Data**). If it’s a Link, omit it so no validation runs.

---

## Code change

In your ERPNext `load_actual_stock_preview` (e.g. in `cycle_count_batch.py`), do the following.

**1. Before the loop that builds `summary_row`, add a check for the summary child’s carton_id field type:**

```python
# After: result_has_carton = _meta_has(RESULT_DT, "carton_id")
# Add:
summary_carton_is_link = False
if _meta_has(SUMMARY_CHILD_DT, "carton_id"):
    try:
        sf = frappe.get_meta(SUMMARY_CHILD_DT).get_field("carton_id")
        if sf:
            summary_carton_is_link = (getattr(sf, "fieldtype", None) == "Link")
    except Exception:
        pass
```

**2. When building `summary_row`, only set `carton_id` when it’s not a Link:**

Replace:

```python
        if _meta_has(SUMMARY_CHILD_DT, "carton_id") and result_has_carton:
            summary_row["carton_id"] = carton_id or None
```

with:

```python
        # Only set carton_id on summary when field is not Link (WMS carton IDs are not in ERPNext Carton master)
        if _meta_has(SUMMARY_CHILD_DT, "carton_id") and result_has_carton and not summary_carton_is_link:
            summary_row["carton_id"] = carton_id or None
```

---

## Optional: store Carton ID in summary (no link validation)

If you want the summary to **show** WMS carton IDs:

- In ERPNext, change the **summary** child DocType’s **Carton ID** field from **Link** to **Data** (or Small Text).
- Then keep setting `summary_row["carton_id"] = carton_id or None` when `result_has_carton` (and you can drop the `summary_carton_is_link` check for that row, or keep it for safety so that if someone changes the field back to Link, the code won’t break).

With the field as **Data**, values like CTN-000130 and CTN-000131 are stored without link validation.
