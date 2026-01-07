# Carton Scan API - URL and Usage Guide

## ✅ API Endpoint

**URL:** `POST /api/cartons/update-status`

**Full URL:** `http://localhost:3000/api/cartons/update-status`

*(Replace `localhost:3000` with your actual backend server URL)*

---

## 📋 Request Format

### Single Carton (When Scanning One Carton)

```json
{
  "asn_no": "ASN-0002",
  "inbound_session": "SESSION-ASN0002-DEVICE001-USER172188",
  "carton_id": "CTN-0101",
  "status": "Unloaded",
  "user_id": "USER-172188",
  "device_id": "DEVICE-001"
}
```

### Batch Update (When Scanning Multiple Cartons)

```json
{
  "asn_no": "ASN-0002",
  "inbound_session": "SESSION-ASN0002-DEVICE001-USER172188",
  "cartons": [
    { "carton_id": "CTN-0101", "status": "Unloaded" },
    { "carton_id": "CTN-0102", "status": "Unloaded" }
  ],
  "user_id": "USER-172188",
  "device_id": "DEVICE-001"
}
```

---

## 🔧 What the API Does

When you call this API with status `"Unloaded"`, it will:

1. ✅ **Update `tabReceivingCarton`** table with the status
2. ✅ **Update `tabCartonStatus`** table with the status (UPSERT - creates if doesn't exist)
3. ✅ **Update `tabAsnItemDetails.carton_assigned_status`** with the status
4. ✅ **Preserve ASN format** (uses exact format from request, no normalization)

---

## 📱 Mobile App Integration

### Example: React Native / JavaScript

```javascript
// When carton is scanned and status should be "Unloaded"
const updateCartonToUnloaded = async (cartonId, asnNo, sessionId, userId, deviceId) => {
  try {
    const response = await fetch('http://your-backend-url/api/cartons/update-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${yourAuthToken}`
      },
      body: JSON.stringify({
        asn_no: asnNo,  // e.g., "ASN-0002"
        inbound_session: sessionId,  // e.g., "SESSION-ASN0002-DEVICE001-USER172188"
        carton_id: cartonId,  // e.g., "CTN-0101"
        status: "Unloaded",
        user_id: userId,  // e.g., "USER-172188"
        device_id: deviceId  // e.g., "DEVICE-001"
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Carton status updated to Unloaded');
      console.log('Updated count:', result.updated_count);
    } else {
      console.error('❌ Failed to update carton status:', result);
    }
  } catch (error) {
    console.error('❌ Error updating carton status:', error);
  }
};

// Usage:
// updateCartonToUnloaded("CTN-0101", "ASN-0002", "SESSION-ASN0002-DEVICE001-USER172188", "USER-172188", "DEVICE-001");
```

---

## ✅ Response Format

**Success (200 OK):**
```json
{
  "success": true,
  "message": "Carton status updated successfully",
  "updated_count": 1
}
```

**Error (400 Bad Request):**
```json
{
  "code": "VALIDATION_ERROR",
  "message": "asn_no and inbound_session are required",
  "details": {
    "asn_no": "asn_no is required",
    "inbound_session": "inbound_session is required"
  }
}
```

---

## 🎯 Key Points

1. **Status Value:** Use `"Unloaded"` (capitalized)
2. **ASN Format:** Use exact format from database (e.g., `"ASN-0002"`, `"ASN-0004"`)
3. **UPSERT Logic:** API automatically creates carton in `tabCartonStatus` if doesn't exist
4. **Multiple Updates:** Updates `tabReceivingCarton`, `tabCartonStatus`, and `tabAsnItemDetails`

---

## 📋 Complete API Details

**Endpoint:** `POST /api/cartons/update-status`  
**Authentication:** Required (Bearer Token)  
**Content-Type:** `application/json`

**Required Fields:**
- `asn_no` - ASN number (e.g., "ASN-0002")
- `inbound_session` - Session ID
- Either `carton_id` + `status` (single) OR `cartons` array (batch)

**Optional Fields:**
- `user_id` - User who scanned the carton
- `device_id` - Device used for scanning

---

**Status:** ✅ **API READY**  
**URL:** `POST /api/cartons/update-status`  
**Action:** Use this URL in your mobile app when scanning cartons

