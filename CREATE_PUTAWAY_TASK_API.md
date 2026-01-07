# How to Create a Putaway Task for ASN-12225

## Problem
The API returns an empty array `[]` when querying tasks for `ASN-12225`, meaning no tasks exist yet.

## Solution: Create the Task

### Option 1: Scan Transfer Carton (Recommended - Automatic Task Creation)

This is the **recommended way** because it automatically:
1. Creates the putaway task if it doesn't exist
2. Creates putaway lines for all items in the transfer carton
3. Assigns the location (rack/bin)

**API Endpoint:**
```http
POST http://localhost:3000/api/putaway/scan-transfer-carton
```

**Request Body:**
```json
{
  "tc_id": "TC-1767100416319",
  "rack": "A1-R01-L1-B1",
  "bin": "B1",
  "user_id": "USER-786249"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Transfer carton scanned successfully",
  "data": {
    "putaway_task": "PUT-20251230-0001",
    "status": "In Progress",
    "items": [
      {
        "item_code": "ITEM-001",
        "qty": 50,
        "rack": "A1-R01-L1-B1",
        "bin": "B1"
      }
    ]
  }
}
```

### Option 2: Create Task for Remaining Items

Use this if you want to create a task for items that haven't been put away yet.

**API Endpoint:**
```http
POST http://localhost:3000/api/putaway/create-task-for-remaining-items
```

**Request Body:**
```json
{
  "asn_no": "ASN-12225"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Putaway task created for remaining items",
  "data": {
    "putaway_task": "PUT-20251230-0001",
    "status": "Draft",
    "items_count": 5
  }
}
```

### Option 3: Process PUTAWAY Event (Automatic)

When you send `PUTAWAY_TO_RACK` events, the system automatically creates tasks.

**API Endpoint:**
```http
POST http://localhost:3000/api/events/batch
```

**Request Body:**
```json
{
  "events": [
    {
      "offline_uuid": "unique-uuid-here",
      "event_type": "PUTAWAY_TO_RACK",
      "asn_no": "ASN-12225",
      "to_no": null,
      "inbound_session": "SESSION-ASN12225-DEVICE001-USER786249",
      "carton_id": null,
      "item_code": "ITEM-001",
      "store": null,
      "box_id": null,
      "tc_id": "TC-1767100416319",
      "rack": "A1-R01-L1-B1",
      "bin": "B1",
      "device_id": "DEVICE-001",
      "user_id": "USER-786249",
      "event_time": "2025-12-30T13:15:56.299Z",
      "synced": 0,
      "error_msg": null
    }
  ]
}
```

## Step-by-Step Workflow

### 1. Check What Exists First

**Check all tasks:**
```http
GET http://localhost:3000/api/putaway/tasks
```

**Check tasks by status:**
```http
GET http://localhost:3000/api/putaway/tasks?status=Open
GET http://localhost:3000/api/putaway/tasks?status=In Progress
```

**Check tasks by ASN:**
```http
GET http://localhost:3000/api/putaway/tasks?advance_shipping_notice=ASN-12225
```

### 2. Check Prerequisites

Before creating a task, verify:

**Check if ASN exists:**
```sql
SELECT title, status FROM tabAdvanceShippingNotice WHERE title = 'ASN-12225';
```

**Check if inbound session exists:**
```sql
SELECT title, asn_no, status FROM tabInboundSession WHERE asn_no = 'ASN-12225';
```

**Check transfer cartons:**
```sql
SELECT tc_id, asn_no, status FROM tabTransferCarton WHERE asn_no = 'ASN-12225';
```

### 3. Create the Task

Use **Option 1** (scan transfer carton) - it's the easiest and most complete.

### 4. Verify Task Created

After creating, verify:
```http
GET http://localhost:3000/api/putaway/tasks?advance_shipping_notice=ASN-12225
```

You should now see the task with its items.

## Troubleshooting

### If "Transfer Carton Not Found" Error

Make sure:
1. The transfer carton exists: `SELECT * FROM tabTransferCarton WHERE tc_id = 'TC-1767100416319';`
2. The transfer carton is sealed
3. The transfer carton has items (check `tabWmsScanEvent`)

### If "No Items Found" Error

The transfer carton has no items. Check:
```sql
SELECT * FROM tabWmsScanEvent 
WHERE tc_id = 'TC-1767100416319' 
AND event_type = 'PACK_BOX_TO_TC';
```

### If "No ASN" Error

The transfer carton is not associated with an ASN. Check:
```sql
SELECT tc_id, asn_no FROM tabTransferCarton WHERE tc_id = 'TC-1767100416319';
```

## Quick Test

Run this SQL to see what you have:
```sql
-- Check everything for ASN-12225
SELECT 'ASN' as type, title, status FROM tabAdvanceShippingNotice WHERE title = 'ASN-12225'
UNION ALL
SELECT 'InboundSession', title, status FROM tabInboundSession WHERE asn_no = 'ASN-12225'
UNION ALL
SELECT 'PutawayTask', title, status FROM tabPutawayTask WHERE advance_shipping_notice = 'ASN-12225'
UNION ALL
SELECT 'TransferCarton', tc_id, status FROM tabTransferCarton WHERE asn_no = 'ASN-12225' LIMIT 1;
```

