# How to Move Sort Box to Putaway

## Overview

You have a sort box `PAW-ASN12225-1767112384558` with items that need to be put away. Here's how to do it:

---

## Method 1: Scan Transfer Carton/Box for Putaway (Recommended)

This is the **easiest method** - it automatically creates the putaway task and assigns locations.

### Step 1: Scan the Box with Location

**API Endpoint:**

```http
POST http://localhost:3000/api/putaway/scan-transfer-carton
Content-Type: application/json
Authorization: Bearer {your_token}
```

**Request Body:**

```json
{
  "box_id": "PAW-ASN12225-1767112384558",
  "rack": "STAGE-01",
  "bin": "SL-01",
  "user_id": "USER-786249"
}
```

**OR if you have a transfer carton ID:**

```json
{
  "tc_id": "PAW-ASN12225-1767112384558",
  "rack": "STAGE-01",
  "bin": "SL-01",
  "user_id": "USER-786249"
}
```

**What This Does:**

1. ✅ Finds or creates the putaway task for ASN-12225
2. ✅ Creates putaway lines for all items in the box
3. ✅ Assigns the location (rack/bin) to all items
4. ✅ Updates task status to "In Progress"
5. ✅ Returns the putaway task details

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
        "item_code": "SKU-HAT-301-BLU-OS",
        "qty": 75,
        "rack": "STAGE-01",
        "bin": "SL-01",
        "box_id": "PAW-ASN12225-1767112384558"
      },
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "qty": 400,
        "rack": "STAGE-01",
        "bin": "SL-01",
        "box_id": "PAW-ASN12225-1767112384558"
      }
    ]
  }
}
```

---

## Method 2: Complete Putaway Task Directly

If the putaway task already exists, you can complete it directly.

### Step 1: Get the Putaway Task

**API Endpoint:**

```http
GET http://localhost:3000/api/putaway/tasks?advance_shipping_notice=ASN-12225
Authorization: Bearer {your_token}
```

This will show you the putaway task title (e.g., `PUT-20251230-0001`).

### Step 2: Complete the Putaway

**API Endpoint:**

```http
POST http://localhost:3000/api/putaway/complete
Content-Type: application/json
Authorization: Bearer {your_token}
```

**Request Body:**

```json
{
  "putaway_task": "PUT-20251230-0001",
  "performed_by": "USER-786249",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 75,
      "target_bin": "STAGE-01-SL-01",
      "completed": true,
      "box_id": "PAW-ASN12225-1767112384558"
    },
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "qty": 400,
      "target_bin": "STAGE-01-SL-01",
      "completed": true,
      "box_id": "PAW-ASN12225-1767112384558"
    }
  ]
}
```

**What This Does:**

1. ✅ Updates putaway lines with locations
2. ✅ Updates stock ledger
3. ✅ Updates item stock quantities
4. ✅ Creates stock transactions
5. ✅ Marks task as "Completed"

---

## Method 3: Using PUTAWAY Events (Mobile App Style)

If you're using the mobile app or event-based system:

**API Endpoint:**

```http
POST http://localhost:3000/api/events/batch
Content-Type: application/json
Authorization: Bearer {your_token}
```

**Request Body:**

```json
{
  "events": [
    {
      "offline_uuid": "unique-uuid-1",
      "event_type": "PUTAWAY_TO_RACK",
      "asn_no": "ASN-12225",
      "inbound_session": "SESSION-ASN12225-DEVICE001-USER786249",
      "box_id": "PAW-ASN12225-1767112384558",
      "tc_id": "PAW-ASN12225-1767112384558",
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 75,
      "rack": "STAGE-01",
      "bin": "SL-01",
      "device_id": "DEVICE-001",
      "user_id": "USER-786249",
      "event_time": "2025-12-30T19:33:00Z",
      "synced": 0
    },
    {
      "offline_uuid": "unique-uuid-2",
      "event_type": "PUTAWAY_TO_RACK",
      "asn_no": "ASN-12225",
      "inbound_session": "SESSION-ASN12225-DEVICE001-USER786249",
      "box_id": "PAW-ASN12225-1767112384558",
      "tc_id": "PAW-ASN12225-1767112384558",
      "item_code": "SKU-HAT-301-GRN-OS",
      "qty": 400,
      "rack": "STAGE-01",
      "bin": "SL-01",
      "device_id": "DEVICE-001",
      "user_id": "USER-786249",
      "event_time": "2025-12-30T19:33:00Z",
      "synced": 0
    }
  ]
}
```

---

## Quick Workflow Summary

### For Your Box: `PAW-ASN12225-1767112384558`

**Simplest Approach:**

1. **Scan the box with location:**

   ```bash
   POST /api/putaway/scan-transfer-carton
   {
     "box_id": "PAW-ASN12225-1767112384558",
     "rack": "STAGE-01",
     "bin": "SL-01",
     "user_id": "USER-786249"
   }
   ```

2. **Verify in desktop app:**

   - Go to Putaway Tasks
   - You should see the task with 2 lines
   - Both items should have the location assigned

3. **Complete putaway (if needed):**
   ```bash
   POST /api/putaway/complete
   {
     "putaway_task": "PUT-20251230-0001",
     "performed_by": "USER-786249"
   }
   ```

---

## Important Notes

1. **Box ID vs Transfer Carton ID:**

   - The box ID `PAW-ASN12225-1767112384558` can be used as both `box_id` and `tc_id`
   - The API will handle it automatically

2. **Location Format:**

   - `rack`: "STAGE-01"
   - `bin`: "SL-01"
   - Or combined: `target_bin`: "STAGE-01-SL-01"

3. **Auto-Creation:**

   - If the putaway task doesn't exist, it will be created automatically
   - If the transfer carton doesn't exist, it will be created automatically (with default `to_no`)

4. **Stock Updates:**
   - Stock is updated when you complete the putaway
   - Or automatically when you scan the location (depending on configuration)

---

## Troubleshooting

### If "Transfer Carton Not Found" Error:

The system will auto-create it now. Make sure you provide:

- `box_id` or `tc_id`
- `rack` (required)
- `user_id` (optional but recommended)

### If "Putaway Task Not Found" Error:

The system will auto-create it when you scan the transfer carton.

### If Items Don't Show Up:

Make sure the box has items from `SORT_TO_BOX` events. The system reads items from `tabWmsScanEvent` where `event_type = 'PACK_BOX_TO_TC'` or `'SORT_TO_BOX'`.

---

## Example cURL Command

```bash
curl -X POST http://localhost:3000/api/putaway/scan-transfer-carton \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "box_id": "PAW-ASN12225-1767112384558",
    "rack": "STAGE-01",
    "bin": "SL-01",
    "user_id": "USER-786249"
  }'
```

---

## Next Steps After Putaway

1. **Verify Stock:**

   - Check `tabStockLedger` to see stock by location
   - Check `tabItem.stock_qty` for total stock

2. **View in Desktop App:**

   - Open Putaway Tasks
   - You should see the completed task
   - Items should show the assigned locations

3. **Complete the Box:**
   - Close the sort box in the desktop app
   - This marks it as completed
