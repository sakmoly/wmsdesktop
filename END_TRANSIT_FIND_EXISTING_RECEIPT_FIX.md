# Fix: end_transit_create_receipt — _find_existing_receipt is not defined

## Error (ERPNext server)

```
NameError: name '_find_existing_receipt' is not defined
  File "apps/printechs_wms/printechs_wms/api/intransit_transfer.py", line 369, in end_transit_create_receipt
    existing = _find_existing_receipt(in_transit_se)
```

The API calls a helper `_find_existing_receipt(in_transit_se)` that was never defined (or was removed).

## Fix (on ERPNext server)

1. Open **printechs_wms/api/intransit_transfer.py** on your ERPNext server (e.g. `printechsdammam.dyndns.org`).
2. Add the **`_find_existing_receipt`** function in that file (e.g. above `end_transit_create_receipt`).  
   Full code: see **END_TRANSIT_FIX_find_existing_receipt_SNIPPET.py** in this repo.
3. Ensure **end_transit_create_receipt** uses it for idempotency:
   - At the start (after parsing payload), call `existing = _find_existing_receipt(in_transit_se)`.
   - If `existing` is not None, return a success response with that receipt name (e.g. `message.name` / `stock_entry`) and **do not** create a new receipt.
   - Otherwise create the receipt as usual and return its name.

After adding the helper and the idempotent check, Push & Pull’s “End transit” step should succeed and stop raising this error.

## Desktop side

No change needed in Wms.Desktop; the failure is entirely in the ERPNext app.
