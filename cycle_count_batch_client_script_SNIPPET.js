// Client Script for WMS Cycle Count Batch
// In ERPNext: Customize Form → WMS Cycle Count Batch → Add Client Script (or paste into existing script).
// Buttons: Export Valuation Template, Upload Valuation File (Create Opening SR), Confirm & Post Batch.

frappe.ui.form.on("WMS Cycle Count Batch", {
  refresh(frm) {
    const status = frm.doc.status || "Draft";
    const isDraft = frm.doc.docstatus === 0;

    // -----------------------------
    // 1) Export valuation template
    // -----------------------------
    if (isDraft && ["Draft", "Previewed"].includes(status)) {
      frm.add_custom_button(__("Export Valuation Template"), () => {
        frappe.call({
          method: "printechs_wms.api.cycle_count_batch.export_opening_valuation_template",
          args: { batch_name: frm.doc.name },
          freeze: true,
          freeze_message: __("Generating Excel..."),
          callback: (r) => {
            const m = r.message || {};
            if (!m.ok) {
              const msg = (m.exc_type && m._server_messages) ? (m._server_messages || m.message || __("Export failed.")) : (m.message || __("Export failed."));
              frappe.msgprint({ title: __("Error"), message: msg, indicator: "red" });
              return;
            }
            frappe.msgprint({
              title: __("Template Generated"),
              message: __(
                `Items: <b>${m.item_count}</b><br>File: <a href="${m.file_url}" target="_blank">${m.file_name}</a>`
              ),
              indicator: "green",
            });
          },
        });
      }).addClass("btn-primary");
    }

    // -----------------------------
    // 2) Upload valuation file -> create Opening SR
    // -----------------------------
    if (isDraft && ["Draft", "Previewed"].includes(status)) {
      frm.add_custom_button(__("Upload Valuation File (Create Opening SR)"), () => {
        const company = frm.doc.company || "";
        frappe.prompt(
          [
            {
              fieldname: "valuation_file",
              fieldtype: "Attach",
              label: __("Valuation Excel File"),
              reqd: 1,
              description: __("Upload the filled Excel generated from 'Export Valuation Template'."),
            },
            {
              fieldname: "difference_account",
              fieldtype: "Link",
              options: "Account",
              label: __("Difference Account"),
              reqd: 1,
              description: __("Must be an Asset or Liability account. Click the field to search and select."),
              get_query: () => ({
                filters: [
                  ["Account", "root_type", "in", ["Asset", "Liability"]],
                  ["Account", "is_group", "=", 0],
                  ["Account", "company", "=", company],
                ],
              }),
            },
            {
              fieldname: "create_opening_sr",
              fieldtype: "Check",
              label: __("Create Opening Stock Reconciliation"),
              default: 1,
              read_only: 1,
            },
          ],
          (values) => {
            if (!values || !values.valuation_file) return;
            if (!values.difference_account) {
              frappe.msgprint({ title: __("Required"), message: __("Please select Difference Account."), indicator: "orange" });
              return;
            }
            frappe.call({
              method: "printechs_wms.api.cycle_count_batch.upload_opening_valuation_file",
              args: {
                file_url: values.valuation_file,
                batch_name: frm.doc.name,
                difference_account: values.difference_account,
              },
              freeze: true,
              freeze_message: __("Creating Opening Stock Reconciliation..."),
              callback: (r) => {
                const m = r.message || {};
                if (!m.ok) {
                  const msg = (m.exc_type && m._server_messages) ? (m._server_messages || m.message || __("Upload failed.")) : (m.message || __("Upload failed."));
                  frappe.msgprint({ title: __("Error"), message: msg, indicator: "red" });
                  return;
                }
                frappe.msgprint({
                  title: __("Opening Stock Created"),
                  message: __(
                    `SR: <b>${m.sr}</b><br>Rows: <b>${m.row_count}</b><br>Warehouse: <b>${m.warehouse}</b>`
                  ),
                  indicator: "green",
                });
                frm.reload_doc();
              },
            });
          },
          __("Upload Valuation Excel"),
          __("Upload & Create")
        );
      });
    }

    // -----------------------------
    // 3) Confirm & Post Batch (warehouse posting)
    // -----------------------------
    if (isDraft && ["Draft", "Previewed"].includes(status)) {
      frm.add_custom_button(__("Confirm & Post Batch"), () => {
        frappe.call({
          method: "printechs_wms.api.cycle_count_batch.confirm_and_post_batch",
          args: {
            batch_name: frm.doc.name,
            create_stock_reconciliation: 1,
          },
          freeze: true,
          freeze_message: __("Posting batch..."),
          callback: (r) => {
            const m = r.message || {};
            if (!m.ok) {
              const msg = (r.exc_type && r._server_messages) ? (r._server_messages || r.message || __("Posting failed.")) : (m.message || r.message || __("Posting failed."));
              frappe.msgprint({ title: __("Error"), message: msg, indicator: "red" });
              return;
            }
            frappe.msgprint({
              title: __("Posted"),
              message: __(
                `Batch: <b>${m.batch}</b><br>Updated Balances: <b>${m.updated_balances}</b><br>SR: <b>${m.sr || "N/A"}</b>`
              ),
              indicator: "green",
            });
            frm.reload_doc();
          },
          error: (err) => {
            console.error(err);
            const msg = (err && (err.message || err.exc)) ? (err.message || err.exc) : __("Check server logs / Error Log for details.");
            frappe.msgprint({ title: __("Error"), message: msg, indicator: "red" });
          },
        });
      }).addClass("btn-danger");
    }
  },
});
