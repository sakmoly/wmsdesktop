# Mobile App API Reference

> **This document reflects the ACTUAL backend API.** Use these exact field names in your mobile app.

---

## 1. Authentication

### POST `/api/auth/login`
```json
{
  "user_code": "sysadmin",
  "password": "123456"
}
```

---

## 2. ASN Inbound Flow

### 2.1 Start Inbound Session
**POST** `/api/inbound/session/start`
```json
{
  "source_type": "ASN",
  "source_doc": "ASN-0003",
  "warehouse": "WH-MAIN",
  "dock": "DOCK-01",
  "user_id": "sysadmin"
}
```

### 2.2 Receive Item into Carton
**POST** `/api/inbound/receive`
```json
{
  "session_id": "IB-YYYYMMDD-001",
  "carton_id": "CTN-ASN-0003-01",
  "item_code": "SKU-HAT-301-BLU-OS",
  "qty": 25,
  "user_id": "sysadmin"
}
```

### 2.3 Complete Inbound Session
**POST** `/api/inbound/session/complete`
```json
{
  "session_id": "IB-YYYYMMDD-001",
  "user_id": "sysadmin"
}
```

---

## 3. Putaway Flow

### 3.1 List Putaway Tasks
**GET** `/api/putaway/tasks?status=Open,In Progress`

### 3.2 Scan Carton + Assign Location
**POST** `/api/putaway/scan-transfer-carton`
```json
{
  "box_id": "CTN-ASN-0003-01",
  "location_id": "A1-R01-L1-B1",
  "user_id": "sysadmin"
}
```

### 3.3 Complete Putaway
**POST** `/api/putaway/complete`
```json
{
  "box_id": "CTN-ASN-0003-01",
  "location_id": "A1-R01-L1-B1",
  "performed_by": "sysadmin",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 25,
      "carton_id": "CTN-ASN-0003-01",
      "box_id": "CTN-ASN-0003-01"
    }
  ]
}
```

---

## 4. Transfer In Flow

### 4.1 Receive Transfer In Line
**POST** `/api/transfer-in/{title}/receive-line`
```json
{
  "item_code": "SKU-HAT-301-BLU-OS",
  "received_qty": 50,
  "received_by": "sysadmin",
  "carton_id": "CTN-TI-0001-01"
}
```

### 4.2 Complete Receiving
**POST** `/api/transfer-in/{title}/complete-receiving`
```json
{
  "completed_by": "sysadmin"
}
```
> **Note:** Field is `completed_by`, NOT `received_by`

---

## 5. Material Request (Picking / OUT)

### 5.1 Pick Items
**POST** `/api/material-requests/{title}/pick-items`
```json
{
  "user_id": "sysadmin",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "picked_qty": 5,
      "source_bin": "A1-R01-L1-B1",
      "carton_id": "CTN-ASN-0003-01"
    }
  ]
}
```
> **Note:** Use `picked_qty` (not `qty`) and `source_bin` (not `bin_location`)

---

## 6. Relocation (Bin Transfer)

### 6.1 Full Carton Move
**POST** `/api/relocation/complete-full`
```json
{
  "warehouse_id": "WH-MAIN",
  "user_id": "sysadmin",
  "from_bin": "A1-R01-L1-B1",
  "to_bin": "A1-R02-L1-B2",
  "from_carton": "CTN-ASN-0003-01",
  "mode": "FULL_CARTON"
}
```
> **Note:** Use `from_carton` (not `carton_id`), and `mode` is REQUIRED

### 6.2 Partial Move / Carton Merge
**POST** `/api/relocation/complete-partial`
```json
{
  "warehouse_id": "WH-MAIN",
  "user_id": "sysadmin",
  "from_carton": "CTN-OLD",
  "to_carton": "CTN-NEW",
  "from_bin": "A1-R01-L1-B1",
  "to_bin": "A1-R02-L1-B2",
  "mode": "PARTIAL_ITEMS",
  "lines": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 12
    }
  ]
}
```
> **Note:** Items must be in `lines` array. For multiple items, add more objects to the array.

---

## Quick Reference Table

| # | Endpoint | Method | Key Fields |
|---|----------|--------|------------|
| 1 | `/api/auth/login` | POST | `user_code`, `password` |
| 2 | `/api/inbound/session/start` | POST | `source_type`, `source_doc`, `warehouse`, `dock`, `user_id` |
| 3 | `/api/inbound/receive` | POST | `session_id`, `carton_id`, `item_code`, `qty`, `user_id` |
| 4 | `/api/inbound/session/complete` | POST | `session_id`, `user_id` |
| 5 | `/api/putaway/tasks` | GET | `status` (query param) |
| 6 | `/api/putaway/scan-transfer-carton` | POST | `box_id`, `location_id`, `user_id` |
| 7 | `/api/putaway/complete` | POST | `box_id`, `location_id`, `performed_by`, `items[]` |
| 8 | `/api/transfer-in/{title}/receive-line` | POST | `item_code`, `received_qty`, `received_by`, `carton_id` |
| 9 | `/api/transfer-in/{title}/complete-receiving` | POST | `completed_by` |
| 10 | `/api/material-requests/{title}/pick-items` | POST | `user_id`, `items[]` with `picked_qty`, `source_bin`, `carton_id` |
| 11 | `/api/relocation/complete-full` | POST | `warehouse_id`, `user_id`, `from_bin`, `to_bin`, `from_carton`, `mode` |
| 12 | `/api/relocation/complete-partial` | POST | `warehouse_id`, `user_id`, `from_carton`, `to_carton`, `from_bin`, `to_bin`, `mode`, `lines[]` |

---

## Field Name Corrections (vs your original doc)

| Endpoint | Your Doc Said | Correct Field |
|----------|---------------|---------------|
| Transfer In Complete | `received_by` | `completed_by` |
| Material Request Pick | `qty` | `picked_qty` |
| Material Request Pick | `bin_location` | `source_bin` |
| Relocation Full | `carton_id` | `from_carton` |
| Relocation Full | (missing) | `mode: "FULL_CARTON"` |
| Relocation Partial | `item_code`, `qty` at root | `lines: [{ item_code, qty }]` |
| Relocation Partial | (missing) | `mode`, `to_bin` required |
