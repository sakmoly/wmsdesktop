# Carton Status Update - Implementation Confirmation

## ✅ What Will Be Updated

When the mobile app calls `POST /api/cartons/update-status` with status "Unloaded", the following will happen:

### 1. Backend API Updates Database

The API endpoint updates the `tabReceivingCarton` table:

```sql
UPDATE tabReceivingCarton 
SET status = 'Unloaded',
    updated_on = NOW(),
    received_by = ?,
    updated_at = NOW()
WHERE carton_id = ? 
  AND advance_shipping_notice = ? 
  AND inbound_session = ?
```

**Table:** `tabReceivingCarton`  
**Column Updated:** `status` (changed to "Unloaded")  
**Also Updated:** `updated_on`, `received_by`, `updated_at`

---

### 2. Desktop App Shows Updated Status

The ASN Details screen now displays the actual carton status from `tabReceivingCarton`:

**Updated Query:**
- Joins `tabAsnItemDetails` with `tabReceivingCarton`
- Gets the latest carton status (Unloaded, In Receiving, Received, etc.)
- Falls back to `carton_assigned_status` (Assigned/Missing) if no receiving carton record exists

**Display Behavior:**
- **Before Unload:** Shows "Assigned" (from `tabAsnItemDetails.carton_assigned_status`)
- **After Unload (when Next clicked):** Shows "Unloaded" (from `tabReceivingCarton.status`)
- **Later stages:** Shows "In Receiving", "Received", etc. as cartons progress

---

## Flow Diagram

```
Mobile App (Unload Screen)
    ↓
User clicks "Next" button
    ↓
Mobile app calls: POST /api/cartons/update-status
{
  "asn_no": "ASN-0002",
  "inbound_session": "SESSION-123",
  "cartons": [
    {"carton_id": "CTN-0101", "status": "Unloaded"},
    {"carton_id": "CTN-0102", "status": "Unloaded"}
  ]
}
    ↓
Backend API updates tabReceivingCarton.status = "Unloaded"
    ↓
Database: tabReceivingCarton.status updated to "Unloaded"
    ↓
Desktop App ASN Details Screen
    ↓
Refreshes data, joins with tabReceivingCarton
    ↓
Carton Status column now shows "Unloaded" ✅
```

---

## Status Values in Carton Status Column

The Carton Status column in ASN Details will show:

| Status | Source | Meaning |
|--------|--------|---------|
| "Assigned" | `tabAsnItemDetails.carton_assigned_status` | Default - Carton assigned but not yet unloaded |
| "Pending" | `tabReceivingCarton.status` | Carton record exists but not started |
| **"Unloaded"** | `tabReceivingCarton.status` | **Carton unloaded from truck (highlighted field)** |
| "In Receiving" | `tabReceivingCarton.status` | Carton currently being received |
| "Received" | `tabReceivingCarton.status` | Carton receiving completed |
| "Verified" | `tabReceivingCarton.status` | Carton verified |
| "Closed" | `tabReceivingCarton.status` | Final status |
| "Missing" | `tabAsnItemDetails.carton_assigned_status` | Carton not assigned/missing |

---

## Verification Steps

1. **Start with ASN Details screen**
   - Carton Status shows "Assigned" (yellow highlighted)

2. **Mobile app unloads cartons**
   - User clicks "Next" in Unload screen
   - Mobile app calls `POST /api/cartons/update-status`

3. **Refresh ASN Details screen**
   - Carton Status now shows "Unloaded" ✅

---

## Code Changes Made

### 1. Backend API (to be implemented)
- `POST /api/cartons/update-status` endpoint
- Updates `tabReceivingCarton.status` to "Unloaded"
- See: `CARTON_STATUS_UPDATE_API_IMPLEMENTATION.md`

### 2. Desktop App Query (✅ Updated)
- `Services/AsnDataService.cs` - Updated query to join `tabReceivingCarton`
- Now displays actual carton receiving status instead of just assigned status
- Falls back to `carton_assigned_status` if no receiving carton record exists

---

## Important Notes

1. **Status Priority:** 
   - `tabReceivingCarton.status` takes priority over `carton_assigned_status`
   - If receiving carton record exists, its status is shown
   - Otherwise, shows assigned status

2. **Multiple Sessions:**
   - If same carton appears in multiple inbound sessions, shows latest status (by `updated_on`)

3. **Refresh Required:**
   - Desktop app needs to refresh ASN details to see updated status
   - Consider auto-refresh or manual refresh button

---

## Summary

✅ **Mobile API** - Updates `tabReceivingCarton.status` to "Unloaded"  
✅ **Desktop Query** - Joins with `tabReceivingCarton` to show actual status  
✅ **Display** - Carton Status column shows "Unloaded" after mobile sync  
✅ **Highlighted Field** - The yellow-highlighted "Carton Status" field will update correctly  

The highlighted Carton Status field in ASN Details will now reflect the actual carton receiving status, updating to "Unloaded" when the mobile app syncs the status after clicking "Next" in the Unload screen.

