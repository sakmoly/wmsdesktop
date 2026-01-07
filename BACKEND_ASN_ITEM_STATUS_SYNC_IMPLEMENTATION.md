# Backend ASN Item Status Sync - Implementation Guide

## ✅ Overview

When updating carton status in `tabCartonStatus` or `tabReceivingCarton`, the backend now **automatically updates** `tabAsnItemDetails.carton_assigned_status` to keep both tables in sync.

**Mobile app requires NO changes** - it can continue calling the same API endpoints.

## 📋 Updated Endpoints

### 1. POST /api/cartons/update-status

**Updates:**
- ✅ `tabReceivingCarton.status` (primary update)
- ✅ `tabAsnItemDetails.carton_assigned_status` (automatic sync)

**Table Relationship:**
- `tabReceivingCarton.advance_shipping_notice` = `tabAsnItemDetails.parent_title` (ASN)
- `tabReceivingCarton.carton_id` = `tabAsnItemDetails.carton_id`

### 2. POST /api/carton/lock

**Updates:**
- ✅ `tabCartonStatus.status` (primary update)
- ✅ `tabAsnItemDetails.carton_assigned_status` (automatic sync)

**Table Relationship:**
- `tabCartonStatus.asn_no` = `tabAsnItemDetails.parent_title` (ASN)
- `tabCartonStatus.carton_id` = `tabAsnItemDetails.carton_id`

### 3. POST /api/carton/complete

**Updates:**
- ✅ `tabCartonStatus.status` (primary update)
- ✅ `tabAsnItemDetails.carton_assigned_status` (automatic sync)

## 🔧 Implementation Details

### Update Logic

After successfully updating carton status, the backend automatically executes:

```sql
UPDATE tabAsnItemDetails
SET carton_assigned_status = ?,  -- Same status as carton status
    updated_at = NOW()
WHERE carton_id = ? 
  AND parent_title = ?  -- ASN number
```

### Error Handling

- **Non-Critical**: If `tabAsnItemDetails` update fails, the carton status update still succeeds
- **Logged**: Warnings are logged but don't fail the request
- **Transaction Safe**: All updates are in the same database transaction

## 📊 Status Mapping

| Carton Status | ASN Item Status |
|---------------|----------------|
| `Pending` | `Pending` |
| `Unloaded` | `Unloaded` |
| `Receiving` | `Receiving` |
| `Received` | `Received` |
| `Verified` | `Verified` |
| `Closed` | `Closed` |

**Note:** The status values are identical - direct 1:1 mapping.

## 🔄 Data Flow

```
Mobile App
    ↓
POST /api/cartons/update-status
    ↓
Backend Updates:
    1. tabReceivingCarton.status = "Unloaded"
    2. tabAsnItemDetails.carton_assigned_status = "Unloaded" (automatic)
    ↓
Desktop App
    ↓
Shows updated status in ASN Details
```

## ✅ Benefits

1. **No Mobile Changes**: Mobile app continues using the same API
2. **Automatic Sync**: Both tables stay in sync automatically
3. **Consistent Data**: Desktop app always shows correct status
4. **Transaction Safe**: All updates are atomic
5. **Error Resilient**: Carton update succeeds even if ASN item update fails

## 📝 Files Updated

1. **`BACKEND_CARTON_STATUS_COMPLETE_IMPLEMENTATION.js`**
   - Added `updateAsnItemDetails` helper function
   - Calls helper after each carton status update

2. **`BACKEND_TABCARTONSTATUS_COMPLETE_FIX.js`**
   - Added `tabAsnItemDetails` update in `lockCarton`
   - Added `tabAsnItemDetails` update in `completeCarton`

## 🧪 Testing

### Test Single Carton Update:

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

### Verify Both Tables Updated:

```sql
-- Check tabReceivingCarton
SELECT carton_id, status, advance_shipping_notice
FROM tabReceivingCarton
WHERE carton_id = 'CTN-0101' AND advance_shipping_notice = 'ASN-00002';

-- Check tabAsnItemDetails
SELECT carton_id, carton_assigned_status, parent_title
FROM tabAsnItemDetails
WHERE carton_id = 'CTN-0101' AND parent_title = 'ASN-00002';
```

**Expected Result:** Both should show `status = 'Unloaded'` and `carton_assigned_status = 'Unloaded'`

## 🎯 Summary

✅ **Mobile App**: No changes required - same API calls  
✅ **Backend**: Automatically syncs `tabAsnItemDetails.carton_assigned_status`  
✅ **Desktop App**: Will show updated status from either table  
✅ **Transaction Safe**: All updates are atomic  
✅ **Error Resilient**: Non-critical failures don't break the flow

The implementation ensures both `tabCartonStatus`/`tabReceivingCarton` and `tabAsnItemDetails` stay in sync automatically whenever carton status is updated.

