# Putaway Testing Guide - Step by Step

## Prerequisites
1. API server is running on `http://localhost:3000` (or your server IP)
2. You have a valid JWT token (from `/api/auth/login`)
3. Database has test data (ASN, boxes, etc.)

---

## Step 1: Close Box (Creates Putaway Task)

**Endpoint:** `POST /api/boxes/close`

**Request:**
```json
{
  "box_id": "BOX-WHMAIN-383712",
  "closed_by": "USER-786249"
}
```

**Expected Response:**
```json
{
  "ok": true,
  "putaway_task": "PUT-20260101-0001",
  "message": "Box closed successfully. Putaway task created."
}
```

**Check:**
- ✅ Response includes `putaway_task` field
- ✅ Task is created in `tabPutawayTask` table
- ✅ Lines are created in `tabPutawayLine` table (lines_count > 0)

---

## Step 2: Get Putaway Tasks

**Endpoint:** `GET /api/putaway/tasks?status=Open`

**Query Parameters:**
- `status` (optional): Open, In Progress, Completed
- `advance_shipping_notice` (optional): Filter by ASN number

**Expected Response:**
```json
{
  "ok": true,
  "data": [
    {
      "putaway_task": "PUT-20260101-0001",
      "box_id": "BOX-WHMAIN-383712",
      "status": "Open",
      "lines_count": 2,
      "items": [
        {
          "item_code": "SKU-HAT-301-BLU-OS",
          "qty": 75,
          "carton_id": "BOX-WHMAIN-383712"
        }
      ]
    }
  ]
}
```

**Check:**
- ✅ Task appears in list
- ✅ `lines_count` > 0
- ✅ `items` array has correct items

---

## Step 3: Scan Location

**Endpoint:** `POST /api/putaway/scan-transfer-carton`

**Request:**
```json
{
  "box_id": "BOX-WHMAIN-383712",
  "location_id": "A1-R01-L1-B1",
  "user_id": "USER-786249"
}
```

**Expected Response:**
```json
{
  "ok": true,
  "message": "Putaway task created and items assigned successfully",
  "data": {
    "putaway_task": "PUT-20260101-0001",
    "status": "In Progress",
    "items": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "rack": "A1-R01-L1",
        "bin": "B1"
      }
    ]
  }
}
```

**Check:**
- ✅ Status changes to "In Progress"
- ✅ All items have `rack` and `bin` set
- ✅ Location is updated in database

---

## Step 4: Complete Putaway

**Endpoint:** `POST /api/putaway/complete`

**Request:**
```json
{
  "putaway_task": "PUT-20260101-0001",
  "performed_by": "USER-786249",
  "location_id": "A1-R01-L1-B1",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 75,
      "location_id": "A1-R01-L1-B1",
      "completed": true
    }
  ]
}
```

**⚠️ IMPORTANT:** Include `location_id` in each item to avoid validation errors.

**Expected Response:**
```json
{
  "ok": true,
  "message": "Putaway completed successfully",
  "data": {
    "putaway_task": "PUT-20260101-0001",
    "status": "Completed",
    "items_processed": 1,
    "stock_updated": true
  }
}
```

**Check:**
- ✅ Status changes to "Completed"
- ✅ Stock ledger is updated (`tabStockLedger`)
- ✅ Stock transaction is created (`tabStockTransaction`)

---

## Database Verification Queries

### Check Putaway Task
```sql
SELECT * FROM tabPutawayTask 
WHERE box_id = 'BOX-WHMAIN-383712';
```

### Check Putaway Lines
```sql
SELECT pl.* 
FROM tabPutawayLine pl
JOIN tabPutawayTask pt ON pl.parent_title = pt.title
WHERE pt.box_id = 'BOX-WHMAIN-383712';
```

### Check Stock Ledger
```sql
SELECT * FROM tabStockLedger 
WHERE item_code = 'SKU-HAT-301-BLU-OS'
AND location_id = 'A1-R01-L1-B1';
```

### Check Stock Transaction
```sql
SELECT * FROM tabStockTransaction 
WHERE item_code = 'SKU-HAT-301-BLU-OS'
AND reference_name = 'PUT-20260101-0001';
```

---

## Troubleshooting

### Issue: Putaway task created but no lines
**Solution:** Check if box was closed before fix. Close box again or check `tabWmsScanEvent` for `SORT_TO_BOX` events.

### Issue: Validation error - items missing location
**Solution:** Include `location_id` in each item in the complete request.

### Issue: Task not found
**Solution:** Verify task exists using `GET /api/putaway/tasks`

### Issue: Stock not updated
**Solution:** Check if location exists in `tabLocation` table and is available.

---

## Quick Postman Test

1. Import `Putaway_API.postman_collection.json` into Postman
2. Set `base_url` variable: `http://localhost:3000/api`
3. Run "Login" to get token (auto-saved)
4. Run requests in order: Close Box → Get Tasks → Scan Location → Complete

