# Transfer Carton – create_stock_entry_from_transfer_carton (Intransit payload)

The desktop app now sends the **intransit** payload shape to:

`POST {baseUrl}/api/method/printechs_wms.api.desktop_stock_entry.create_stock_entry_from_transfer_carton`

## Request body (aligned with your sample)

```json
{
  "payload": {
    "company": "Mohammed Abdullah Almousa Trading Company",
    "material_request": "MAT-MR-2026-00001",
    "from_warehouse": "001 - Unaizah - Almoosa - MAATC",
    "to_warehouse": "Goods In Transit - MAATC",
    "custom_receiving_warehouse": "Main Warehouse - MAATC",
    "remarks": "Send by Postman",
    "external_ref": "WMS-TRANSIT-00002",
    "submit": 1,
    "items": [
      { "item_code": "108229", "qty": 10 }
    ]
  }
}
```

## Where each value comes from (desktop)

| Payload field | Source |
|---------------|--------|
| **company** | ERPNext default company API, or Settings → Company |
| **material_request** | Settings → "Material Request (Transfer Carton Stock Entry)" (optional). If blank, not sent. |
| **from_warehouse** | Warehouse **name** resolved from Settings "Default Receiving Warehouse" / "Default Picking Warehouse" (via Masters → Warehouses) |
| **to_warehouse** | Settings → "Intransit Warehouse Name". Default: `Goods In Transit - MAATC` |
| **custom_receiving_warehouse** | Transfer carton **Store** resolved to warehouse **name** (via Masters → Warehouses) |
| **remarks** | Transfer carton Remarks (optional) |
| **external_ref** | Transfer carton ID (e.g. `WMS-TRANSIT-00002` or TC id) |
| **submit** | Always `1` |
| **items** | Carton contents: `item_code`, `qty` (and optionally `source_carton` if API supports it; nulls are omitted) |

## Settings (Settings → ERPNext / Sync tab)

- **Intransit Warehouse Name** – Used as `to_warehouse`. Example: `Goods In Transit - MAATC`.
- **Material Request (Transfer Carton Stock Entry)** – Optional. Set e.g. `MAT-MR-2026-00001` when generating stock entry from transfer carton for an MR; leave blank if not used.

## Code changes (summary)

1. **CreateStockEntryPayloadDto** – Switched to: `company`, `material_request`, `from_warehouse`, `to_warehouse`, `custom_receiving_warehouse`, `remarks`, `external_ref`, `submit`, `items` (no more `transfer_carton_id`, `asn_no`, `transfer_order`, `from_warehouse_code`, `to_warehouse_code`, `posting_date`).
2. **TransferCartonDetailViewModel** – Builds the new payload; resolves from/store to warehouse **names** via `WarehouseDataService.ResolveToName`.
3. **WmsSettings** – New: `IntransitWarehouseName`, `MaterialRequestForTransferCarton` (load/save and Settings UI).
4. **SettingsView** – New fields: "Intransit Warehouse Name" and "Material Request (Transfer Carton Stock Entry)".

Your API can keep using the same endpoint; the desktop now sends this intransit-style payload.
