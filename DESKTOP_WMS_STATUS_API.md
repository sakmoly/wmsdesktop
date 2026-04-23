# Desktop WMS Status API – Instructions

Instructions for updating ASN and Transfer Order (TO) WMS export status in ERPNext from the WMS Desktop app. Use the same **Base URL** as your ERPNext sync (e.g. `http://printechsdammam.dyndns.org:88` or your server).

---

## Base URL

- **Base URL:** `http://printechsdammam.dyndns.org:88` (or your ERPNext server URL)
- Replace `{BASE_URL}` in the URLs below with this value.

---

## ASN – Single (after each ASN sync)

Call once per ASN after syncing it to WMS.

**URL (GET or POST with form body):**
```
{BASE_URL}/api/method/printechs_wms.api.wms_sync.update_asn_wms_status?asn_name={ASN_NAME}&status=Exported&wms_ref={BATCH_ID}
```

**Placeholders:**
- `{ASN_NAME}` = from `get_asns_for_wms` → `response.rows[i].name` (e.g. `ASN-0003`)
- `{BATCH_ID}` = your WMS batch/reference (optional)

**Example:**
```
http://printechsdammam.dyndns.org:88/api/method/printechs_wms.api.wms_sync.update_asn_wms_status?asn_name=ASN-0003&status=Exported&wms_ref=WMS-2026-001
```

---

## ASN – Bulk (once after syncing many ASNs)

Call once after syncing multiple ASNs to WMS.

**URL:**
```
{BASE_URL}/api/method/printechs_wms.api.wms_sync.mark_asns_exported?asn_names={ASN_1},{ASN_2}&export_status=Exported&wms_batch_id={BATCH_ID}
```

**Placeholders:**
- `{ASN_1},{ASN_2}` = comma-separated list: `response.rows.map(r => r.name).join(',')`
- `{BATCH_ID}` = your WMS batch/reference (optional)

**Example:**
```
http://printechsdammam.dyndns.org:88/api/method/printechs_wms.api.wms_sync.mark_asns_exported?asn_names=ASN-0001,ASN-0002,ASN-0003&export_status=Exported&wms_batch_id=WMS-2026-001
```

---

## TO – Single (after each TO sync)

Call once per Transfer Order after syncing it to WMS.

**URL:**
```
{BASE_URL}/api/method/printechs_wms.api.wms_sync.update_transfer_order_wms_status?to_name={TO_NAME}&status=Exported&wms_ref={BATCH_ID}
```

**Parameters:** `to_name`, `status`, `wms_ref`, `exported_by` (optional).

**Placeholders:**
- `{TO_NAME}` = from `get_tos_for_wms` → `response.rows[i].name` (e.g. `TO-TEST-00001`)
- `{BATCH_ID}` = your WMS batch/reference (optional)

**Example:**
```
http://printechsdammam.dyndns.org:88/api/method/printechs_wms.api.wms_sync.update_transfer_order_wms_status?to_name=TO-TEST-00001&status=Exported&wms_ref=WMS-2026-001
```

---

## TO – Bulk (once after syncing many TOs)

Call once after syncing multiple Transfer Orders to WMS.

**URL:**
```
{BASE_URL}/api/method/printechs_wms.api.wms_sync.mark_tos_exported?to_names={TO_1},{TO_2}&export_status=Exported&wms_batch_id={BATCH_ID}
```

**Placeholders:**
- `{TO_1},{TO_2}` = comma-separated list: `response.rows.map(r => r.name).join(',')`
- `{BATCH_ID}` = your WMS batch/reference (optional)

**Example:**
```
http://printechsdammam.dyndns.org:88/api/method/printechs_wms.api.wms_sync.mark_tos_exported?to_names=TO-TEST-00001,TO-TEST-00002&export_status=Exported&wms_batch_id=WMS-2026-001
```

---

## Desktop flow

1. **Pull:** Call `get_asns_for_wms` or `get_tos_for_wms` (per your sync type).
2. **Sync to WMS:** Process the response and sync ASNs/TOs into the local WMS database.
3. **Update status in ERPNext:** Call the matching status-update API:
   - **Single:** After each ASN/TO sync, call the single URL with that document’s `name` (and optional `wms_ref`/batch id).
   - **Bulk:** After syncing many ASNs/TOs, call the bulk URL with comma-separated names and optional `wms_batch_id`.

Use the same Base URL and authentication (e.g. API key / token) as for the pull requests. Full parameter details and examples are in this document; the server-side reference is `printechs_wms/api/DESKTOP_WMS_STATUS_API.md` on ERPNext.
