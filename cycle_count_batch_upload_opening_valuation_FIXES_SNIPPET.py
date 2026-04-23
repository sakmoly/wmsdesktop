# -*- coding: utf-8 -*-
# Paste these fixes into your upload_opening_valuation_file in printechs_wms.
# See cycle_count_batch_upload_opening_valuation_API_REVIEW.md for full review.

# ---------------------------------------------------------------------------
# 1) Imports – ensure cint and nowtime
# ---------------------------------------------------------------------------
# At top of file:
#   import openpyxl
#   from frappe import _
#   from frappe.utils import cint, nowdate, nowtime

# ---------------------------------------------------------------------------
# 2) Resolve File when only file_url is passed (replace your current block)
# ---------------------------------------------------------------------------
# REPLACE:
#   fdoc = frappe.get_doc("File", file_id) if file_id else frappe.get_doc("File", {"file_url": file_url})
#   file_path = fdoc.get_full_path()
# WITH:

fdoc = None
if file_id:
    fdoc = frappe.get_doc("File", file_id)
else:
    if not file_url:
        frappe.throw(_("file_url or file_id is required"))
    file_name = frappe.db.get_value("File", {"file_url": file_url}, "name")
    if not file_name:
        frappe.throw(_("File not found for URL: {0}").format(file_url))
    fdoc = frappe.get_doc("File", file_name)
if fdoc is None:
    frappe.throw(_("Could not resolve file. Provide file_id or file_url."))
file_path = fdoc.get_full_path()

# ---------------------------------------------------------------------------
# 3) Optional: use nowtime() for posting_time
# ---------------------------------------------------------------------------
#   if sr_meta.has_field("posting_time"):
#       sr.posting_time = nowtime()   # or "00:00:00" if you prefer midnight

# ---------------------------------------------------------------------------
# 4) Reload before submit so validate sees DB state
# ---------------------------------------------------------------------------
# After sr.save(ignore_permissions=True), before if submit:
#   sr.save(ignore_permissions=True)
#   sr.reload()
#   if submit:
#       sr.submit()

# ---------------------------------------------------------------------------
# 5) "No change" message – find in ERPNext
# ---------------------------------------------------------------------------
# In your ERPNext/printechs_wms repo or Server Scripts, run:
#   grep -r "None of the items have any change" .
# Then in that validation, ensure for Opening Stock it either:
#   - skips the check, or
#   - uses current qty/value from Bin (0 when tabBin empty), not from row.qty.
