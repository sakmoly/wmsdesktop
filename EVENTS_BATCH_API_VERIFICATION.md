# Events Batch API Verification

## ✅ API Status: WORKING

The `/api/events/batch` endpoint is **working correctly**. Test results show successful event insertion.

## Test Results

**Request:**
```json
{
  "events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
      "event_type": "PACK_ITEM_TO_TC",
      "event_time": "2026-01-11T21:56:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-150526",
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 1.0,
      "carton_id": "PAW-ASN365425473-1768138301111",
      "tc_id": "TC-MR-123459-1768157787512",
      "transfer_order": "MR-123459",
      "to_no": "MR-123459",
      "material_request": "MR-123459",
      "source_bin": "A1-R02-L1-B2",
      "bin": "A1-R02-L1-B2",
      "location_id": "A1-R02-L1-B2",
      "rack": "A1-R02-L1-B2",
      "store": "STORE-002"
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Events saved successfully",
  "inserted_count": 1,
  "total_count": 1
}
```

## Common Issues

### 1. Missing Authentication Token

**Error:** `401 Unauthorized` or `403 Forbidden`

**Solution:** Include Bearer token in request headers:
```
Authorization: Bearer {your_token}
```

**How to get token:**
```
POST /api/auth/login
{
  "user_code": "sysadmin",
  "password": "123456"
}
```

### 2. Carton Validation Failure

**Error:** `Carton {carton_id} not found in bin {bin_location} for item {item_code}`

**Cause:** The carton doesn't exist in `tabCartonStock` at the specified bin location.

**Solution:**
- Verify the carton exists: Check `tabCartonStock` table
- Verify the bin location: The `source_bin` must match exactly (or use the parsing logic)
- Check carton status: Must be `PUTAWAY` or `NULL`

### 3. Transfer Carton Status

**Error:** `Transfer carton {tc_id} is {status} and cannot accept new items`

**Cause:** Transfer carton is `Sealed`, `Dispatched`, or `Completed`.

**Solution:** Only `Created` status transfer cartons can accept new packing events.

### 4. Missing Required Fields

**Error:** `Missing required fields: offline_uuid, event_type, event_time, device_id, user_id`

**Solution:** Ensure all required fields are included in the event object.

## Validation Rules

The API validates:

1. ✅ **Required Fields:** `offline_uuid`, `event_type`, `event_time`, `device_id`, `user_id`
2. ✅ **Carton ID:** Required for carton-level inventory mode
3. ✅ **Carton Exists:** Carton must exist in `tabCartonStock` at the specified bin location
4. ✅ **Transfer Carton Status:** Must be `Created` (not `Sealed`, `Dispatched`, or `Completed`)
5. ✅ **TC ID:** Required for `PACK_ITEM_TO_TC` events

## Debugging Steps

### Step 1: Check Authentication

```bash
# Test login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user_code":"sysadmin","password":"123456"}'
```

### Step 2: Test Events Batch with Token

```bash
# Replace {token} with actual token from Step 1
curl -X POST http://localhost:3000/api/events/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "events": [{
      "offline_uuid": "test-001",
      "event_type": "PACK_ITEM_TO_TC",
      "event_time": "2026-01-11T21:56:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-150526",
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 1.0,
      "carton_id": "PAW-ASN365425473-1768138301111",
      "tc_id": "TC-MR-123459-1768157787512",
      "source_bin": "A1-R02-L1-B2",
      "store": "STORE-002"
    }]
  }'
```

### Step 3: Check Response

**Success Response:**
```json
{
  "ok": true,
  "message": "Events saved successfully",
  "inserted_count": 1,
  "total_count": 1
}
```

**Error Response:**
```json
{
  "ok": true,
  "message": "Events saved successfully",
  "inserted_count": 0,
  "total_count": 1,
  "failed": 1,
  "failed_events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
      "error": "Carton PAW-ASN365425473-1768138301111 not found in bin A1-R02-L1-B2 for item SKU-HAT-301-BLU-OS. Please verify the carton exists at this location."
    }
  ]
}
```

## Postman Setup

### Headers:
```
Authorization: Bearer {your_token}
Content-Type: application/json
```

### Body (raw JSON):
```json
{
  "events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
      "event_type": "PACK_ITEM_TO_TC",
      "event_time": "2026-01-11T21:56:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-150526",
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 1.0,
      "carton_id": "PAW-ASN365425473-1768138301111",
      "tc_id": "TC-MR-123459-1768157787512",
      "transfer_order": "MR-123459",
      "to_no": "MR-123459",
      "material_request": "MR-123459",
      "source_bin": "A1-R02-L1-B2",
      "bin": "A1-R02-L1-B2",
      "location_id": "A1-R02-L1-B2",
      "rack": "A1-R02-L1-B2",
      "store": "STORE-002"
    }
  ]
}
```

## Verification

After sending the event, verify it was inserted:

```sql
SELECT * FROM tabWmsScanEvent 
WHERE tc_id = 'TC-MR-123459-1768157787512' 
  AND event_type = 'PACK_ITEM_TO_TC'
ORDER BY event_time DESC;
```

## Summary

✅ **API is working** - Test confirms successful event insertion  
✅ **Authentication required** - Must include Bearer token  
✅ **Validation active** - Carton and transfer carton status are validated  
✅ **Events are inserted** - Check `tabWmsScanEvent` table to verify

If events are not showing in transfer carton details, check:
1. ✅ Query uses `GROUP BY item_code, carton_id` (fixed)
2. ✅ Query uses `SUM(qty)` (fixed)
3. ✅ Desktop app needs to be rebuilt and refreshed

---

**Status:** ✅ **API WORKING**  
**Date:** 2026-01-12  
**Test Result:** Successfully inserted 1 event
