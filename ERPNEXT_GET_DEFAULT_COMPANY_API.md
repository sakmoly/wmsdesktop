# ERPNext: get_default_company API (for Desktop Create Stock Entry)

The desktop app calls this API to use the **default company from the ERPNext instance** when creating a Stock Entry from a Transfer Carton, instead of relying on the company name in desktop Settings (which may not exist in ERPNext).

## Endpoint

- **Method:** GET  
- **URL:** `/api/method/printechs_wms.api.desktop_stock_entry.get_default_company`

## Expected response

Return the default company **name** (as in the Company doctype):

**Option A – message as string (recommended):**
```json
{
  "message": "Mohammed Abdullah Almousa Trading Company"
}
```

**Option B – message as object:**
```json
{
  "message": {
    "default_company": "Mohammed Abdullah Almousa Trading Company"
  }
}
```

## Backend implementation (printechs_wms)

Add in `printechs_wms/api/desktop_stock_entry.py` (or create the file and whitelist the method):

```python
import frappe

@frappe.whitelist()
def get_default_company():
    """Return the default company from the instance (Global Defaults or first Company)."""
    company = frappe.defaults.get_default("Company")
    if company:
        return company
    # Fallback: first Company doc
    name = frappe.db.get_value("Company", None, "name")
    return name or ""
```

Then the desktop will:

1. Call `get_default_company` when you click **Generate Stock Entry**.
2. Use the returned company name in the `create_stock_entry_from_transfer_carton` payload.
3. If the call fails or returns nothing, fall back to **Settings → Company** (current behaviour).

This avoids `LinkValidationError: Could not find Company: ...` when the desktop Settings company does not match any Company in ERPNext.
