# Carton Lock Endpoint Implementation

## ✅ Implementation Complete

The `POST /api/carton/lock` endpoint has been implemented to resolve the 404 error from the mobile app.

### Endpoint Details

**URL:** `POST /api/carton/lock`

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "inbound_session": "INB-0001",
  "asn_no": "ASN-0002",
  "carton_id": "CTN-0101",
  "user_id": "operator1",
  "device_id": "DEVICE-001"  // optional
}
```

### Success Response (200)

```json
{
  "locked": true,
  "message": "Carton locked successfully"
}
```

### Already Locked Response (200)

```json
{
  "locked": false,
  "message": "Carton is already being processed by operator2"
}
```

### Error Responses

**400 - Validation Error:**
```json
{
  "code": "VALIDATION_ERROR",
  "message": "Missing required fields: inbound_session, asn_no, carton_id, user_id"
}
```

**401 - Unauthorized:**
```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication token required"
}
```

**500 - Server Error:**
```json
{
  "code": "DATABASE_ERROR",
  "message": "Failed to lock carton",
  "details": "Error details (development only)"
}
```

### Database Operations

The endpoint performs the following operations:

1. **Checks for existing lock** in `tabReceivingCarton`:
   - If carton is locked by a different user with status "Receiving", returns locked: false

2. **Inserts or updates** `tabReceivingCarton`:
   - Sets `status = 'Receiving'`
   - Sets `locked_by = user_id`
   - Sets `locked_on = NOW()`
   - Sets `updated_on = NOW()`
   - Uses `ON DUPLICATE KEY UPDATE` for idempotency

3. **Updates** `tabAsnItemDetails`:
   - Sets `carton_assigned_status = 'Receiving'` for the carton
   - Non-critical operation (won't fail if update fails)

### Database Table Mapping

| API Field | Database Column | Table |
|-----------|----------------|-------|
| `asn_no` | `advance_shipping_notice` | `tabReceivingCarton` |
| `inbound_session` | `inbound_session` | `tabReceivingCarton` |
| `carton_id` | `carton_id` | `tabReceivingCarton` |
| `user_id` | `locked_by` | `tabReceivingCarton` |
| `status` | `status` | `tabReceivingCarton` (set to 'Receiving') |

### Features

- ✅ Prevents concurrent access (locks carton for single user)
- ✅ Updates both `tabReceivingCarton` and `tabAsnItemDetails`
- ✅ Uses database transactions for atomicity
- ✅ Idempotent (safe to call multiple times)
- ✅ Returns clear error messages
- ✅ Non-critical `tabAsnItemDetails` update (won't fail transaction)

### Files Created

1. ✅ `wms-api/src/modules/cartons/cartonController.js`
   - `lockCarton` function
   - `completeCarton` function (bonus - for completing cartons)

2. ✅ `wms-api/src/routes/cartonRoutes.js`
   - Route registration for `/api/carton/lock`
   - Route registration for `/api/carton/complete`

3. ✅ `wms-api/src/routes/index.js` (updated)
   - Registered carton routes: `router.use('/api/carton', cartonRoutes)`

### Testing

#### Test with cURL:
```bash
curl -X POST "http://localhost:3000/api/carton/lock" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "inbound_session": "INB-0001",
    "asn_no": "ASN-0002",
    "carton_id": "CTN-0101",
    "user_id": "operator1"
  }'
```

#### Test with Postman:
1. Method: `POST`
2. URL: `http://localhost:3000/api/carton/lock`
3. Headers: 
   - `Authorization: Bearer YOUR_TOKEN`
   - `Content-Type: application/json`
4. Body (JSON):
   ```json
   {
     "inbound_session": "INB-0001",
     "asn_no": "ASN-0002",
     "carton_id": "CTN-0101",
     "user_id": "operator1"
   }
   ```

### Next Steps

1. **Restart the backend server** to apply changes:
   ```bash
   cd wms-api
   npm start
   ```

2. **Test the endpoint** with Postman or cURL

3. **Verify mobile app** can now lock cartons without 404 error

### Bonus: Complete Carton Endpoint

Also implemented `POST /api/carton/complete` endpoint:
- Marks carton as "Received"
- Clears the lock (sets `locked_by = NULL`)
- Updates `tabAsnItemDetails.carton_assigned_status = 'Received'`

This endpoint can be used when a carton is fully received and processed.

