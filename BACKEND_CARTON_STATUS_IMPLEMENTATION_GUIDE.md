# Backend Carton Status Sync - Complete Implementation Guide

## ✅ Overview

This guide provides the complete implementation for the `POST /api/cartons/update-status` endpoint with:
- ✅ **UPSERT Logic**: Creates cartons if they don't exist, updates if they exist
- ✅ **Automatic ASN Status Updates**: Updates ASN status based on carton progress
- ✅ **Exact ASN Format Handling**: Uses original ASN format from mobile (no normalization)
- ✅ **Status Validation**: Handles "Receiving" status correctly

## 📋 Implementation Steps

### Step 1: Update Carton Controller

Replace the `updateCartonStatus` function in `wms-api/src/modules/cartons/cartonController.js` with the complete implementation from `BACKEND_CARTON_STATUS_COMPLETE_IMPLEMENTATION.js`.

**Key Changes:**
1. **Removed ASN Normalization**: Uses exact ASN format from mobile app (e.g., "ASN-00002")
2. **Added UPSERT Logic**: Tries UPDATE first, then INSERT if carton doesn't exist
3. **Added ASN Status Auto-Update**: Automatically updates ASN status based on carton progress
4. **Handles Both ASN Tables**: Tries `tabAdvanceShippingNotice` first, then `tabASN` if needed

### Step 2: Verify Route Registration

Ensure the route is registered in `wms-api/src/routes/index.js`:

```javascript
import { updateCartonStatus } from '../modules/cartons/cartonController.js';

// ... existing code ...

router.post('/cartons/update-status', authenticateToken, updateCartonStatus);
```

### Step 3: Restart Backend Server

Restart your Node.js backend server to apply the changes.

## 🔄 Status Flow

### Carton Status Transitions

```
Pending → Unloaded → Receiving → Received → Verified → Closed
```

### ASN Status Auto-Update Logic

| Carton Progress | ASN Status |
|----------------|------------|
| All cartons are "Pending" or "Assigned" | "Submitted" (unchanged) |
| At least one carton is "Unloaded", "Receiving", or "Received" | "Receiving" (or "In Progress") |
| All cartons are "Received" | "Received" |
| All cartons are "Verified" or "Closed" | "Completed" |

## 📊 Database Updates

### 1. Carton Status Update (UPSERT)

```sql
-- Tries UPDATE first
UPDATE tabReceivingCarton 
SET status = ?,
    updated_on = ?,
    received_by = ?,
    updated_at = NOW()
WHERE carton_id = ? 
  AND advance_shipping_notice = ?  -- Uses exact ASN format
  AND inbound_session = ?;

-- If UPDATE affects 0 rows, INSERT instead
INSERT INTO tabReceivingCarton 
(carton_id, advance_shipping_notice, inbound_session, status, 
 received_by, updated_on, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW());
```

### 2. ASN Status Auto-Update

```sql
-- Updates ASN status based on carton progress
UPDATE tabAdvanceShippingNotice 
SET status = ?,  -- 'Receiving', 'Received', or 'Completed'
    updated_on = ?,
    updated_at = NOW() 
WHERE title = ?;  -- Uses exact ASN format
```

## 🧪 Testing

### Test Single Carton Update (UPSERT)

```bash
curl -X POST http://localhost:3000/api/cartons/update-status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "asn_no": "ASN-00002",
    "inbound_session": "SESSION-ASN0002-DEVICE001-USER172188",
    "carton_id": "CTN-0101",
    "status": "Unloaded",
    "user_id": "USER-172188",
    "device_id": "DEVICE-001"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Carton status updated successfully",
  "updated_count": 1,
  "inserted_count": 0
}
```

### Test Batch Carton Update

```bash
curl -X POST http://localhost:3000/api/cartons/update-status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "asn_no": "ASN-00002",
    "inbound_session": "SESSION-ASN0002-DEVICE001-USER172188",
    "cartons": [
      { "carton_id": "CTN-0101", "status": "Unloaded" },
      { "carton_id": "CTN-0102", "status": "Unloaded" }
    ],
    "user_id": "USER-172188",
    "device_id": "DEVICE-001"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Carton statuses updated successfully",
  "updated_count": 2,
  "inserted_count": 0,
  "cartons": [
    { "carton_id": "CTN-0101", "status": "Unloaded", "updated": true },
    { "carton_id": "CTN-0102", "status": "Unloaded", "updated": true }
  ]
}
```

### Test Carton Creation (UPSERT)

If a carton doesn't exist, it will be created:

```bash
curl -X POST http://localhost:3000/api/cartons/update-status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "asn_no": "ASN-00002",
    "inbound_session": "SESSION-ASN0002-DEVICE001-USER172188",
    "carton_id": "CTN-9999",
    "status": "Pending",
    "user_id": "USER-172188",
    "device_id": "DEVICE-001"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Carton status updated successfully",
  "updated_count": 0,
  "inserted_count": 1
}
```

## ✅ Verification Checklist

After implementing, verify:

- [ ] **UPSERT Works**: Cartons are created if they don't exist
- [ ] **ASN Status Updates**: ASN status changes from "Submitted" → "Receiving" → "Received" → "Completed"
- [ ] **Exact ASN Format**: Uses original format from mobile (e.g., "ASN-00002")
- [ ] **Status Validation**: Accepts "Receiving"
- [ ] **Batch Updates**: Handles multiple cartons in one request
- [ ] **Error Handling**: Returns appropriate error messages for validation failures
- [ ] **Logging**: Logs carton updates and ASN status changes

## 🔍 Troubleshooting

### Issue: Carton Not Found (404)

**Solution**: The UPSERT logic now creates cartons if they don't exist. This should no longer occur.

### Issue: ASN Status Not Updating

**Possible Causes:**
1. ASN table name mismatch (tries both `tabAdvanceShippingNotice` and `tabASN`)
2. ASN not found in database
3. All cartons still in "Pending" status (ASN status won't change)

**Check Logs:**
```javascript
logger.warn({ asn_no: exactAsn }, 'ASN not found in ASN table - status not updated');
```

### Issue: Duplicate Key Error

**Solution**: The UPSERT logic handles duplicate key errors by retrying the UPDATE with a different WHERE clause.

## 📝 Important Notes

1. **ASN Format**: The endpoint uses the exact ASN format from the mobile app (e.g., "ASN-00002"). No normalization is performed.

2. **Status Values**: Valid statuses are:
   - `"Pending"`
   - `"Unloaded"`
   - `"Receiving"`
   - `"Received"`
   - `"Verified"`
   - `"Closed"`

3. **ASN Status Values**: The endpoint updates ASN status to:
   - `"Receiving"` (or `"In Progress"`) when cartons are being processed
   - `"Received"` when all cartons are received
   - `"Completed"` when all cartons are verified/closed

4. **Transaction Safety**: All updates are wrapped in a database transaction for atomicity.

5. **Non-Critical ASN Update**: If ASN status update fails, the carton update still succeeds (non-critical error).

## 🎯 Summary

✅ **UPSERT Logic**: Creates cartons if they don't exist  
✅ **ASN Status Auto-Update**: Updates ASN status based on carton progress  
✅ **Exact ASN Format**: Uses original format from mobile (no normalization)  
✅ **Status Validation**: Handles "Receiving" status correctly  
✅ **Error Handling**: Graceful error handling with detailed messages  
✅ **Logging**: Comprehensive logging for debugging  

The implementation is complete and ready for production use.

