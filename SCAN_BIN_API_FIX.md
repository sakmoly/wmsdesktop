# Scan Bin API Fix

## Issue

**Error Message:**
```
WARN  ⚠️ Scan bin API not available, saving locally only
ERROR  ❌ API error (400): {"code":"VALIDATION_ERROR","message":"asn and store query parameters are required"}
```

**Root Cause:**
The mobile app is trying to call `GET /api/boxes` for bin scanning, but this endpoint requires `asn` and `store` query parameters. The mobile app should be using `GET /api/master/bin-master/:bin_code` for bin validation instead.

---

## Fix Applied

### Updated `GET /api/boxes` Endpoint

**File:** `wms-api/src/modules/boxes/boxController.js`

**Changes:**
- Added detection for `bin_location` or `bin_code` query parameters
- If bin parameters are detected, return a helpful error message directing to the correct endpoint
- Improved error message to clarify when `asn` and `store` are required

**New Behavior:**
1. If `bin_location` or `bin_code` is provided → Return error with suggestion to use bin-master API
2. If `asn` and `store` are missing → Return clearer error message explaining the requirement

---

## Correct API Endpoints

### For Bin Scanning/Validation:

**Endpoint:** `GET /api/master/bin-master/:bin_code`

**Example:**
```http
GET /api/master/bin-master/A1-R02-L1-B2
Authorization: Bearer <token>
```

**Response:**
```json
{
  "location_id": "A1-R02-L1-B2",
  "bin_code": "A1-R02-L1-B2",
  "warehouse": "WH-MAIN",
  "zone": "A1",
  "rack": "Rack 02",
  "level": "L1",
  "bin_id": "B2",
  "location_type": "STORAGE",
  "is_available": true
}
```

### For Getting Boxes (Requires ASN and Store):

**Endpoint:** `GET /api/boxes?asn=ASN-0001&store=STORE-001`

**Example:**
```http
GET /api/boxes?asn=ASN-0001&store=STORE-001&status=Open
Authorization: Bearer <token>
```

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "box_id": "BOX-001",
      "status": "Open",
      "asn_no": "ASN-0001",
      "to_no": "TO-0001",
      "store": "STORE-001",
      "purpose": "STORE",
      "created_by": "USER-001",
      "created_on": "2026-01-13T10:00:00.000Z"
    }
  ]
}
```

---

## Mobile App Changes Required

The mobile app should:

1. **For Bin Scanning:** Use `GET /api/master/bin-master/:bin_code`
   ```javascript
   // When user scans a bin location
   const binCode = scannedBinCode; // e.g., "A1-R02-L1-B2"
   const response = await fetch(`${API_BASE_URL}/api/master/bin-master/${binCode}`, {
     headers: { 'Authorization': `Bearer ${token}` }
   });
   ```

2. **For Getting Boxes:** Use `GET /api/boxes?asn=...&store=...`
   ```javascript
   // When user needs to get boxes for an ASN and store
   const response = await fetch(`${API_BASE_URL}/api/boxes?asn=${asn}&store=${store}`, {
     headers: { 'Authorization': `Bearer ${token}` }
   });
   ```

---

## Error Messages

### Old Error (Unclear):
```json
{
  "code": "VALIDATION_ERROR",
  "message": "asn and store query parameters are required"
}
```

### New Error (Helpful):
```json
{
  "code": "INVALID_ENDPOINT",
  "message": "For bin scanning/validation, use GET /api/master/bin-master/:bin_code instead of GET /api/boxes",
  "suggestion": "Use: GET /api/master/bin-master/A1-R02-L1-B2"
}
```

OR (if asn/store missing but no bin parameters):
```json
{
  "code": "VALIDATION_ERROR",
  "message": "asn and store query parameters are required for getting boxes",
  "details": {
    "provided": { "asn": null, "store": null },
    "required": ["asn", "store"],
    "note": "If you are trying to scan/validate a bin location, use GET /api/master/bin-master/:bin_code instead"
  }
}
```

---

## Testing

1. **Test Bin Scanning:**
   ```bash
   curl -X GET "http://localhost:3000/api/master/bin-master/A1-R02-L1-B2" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```
   ✅ Should return bin details

2. **Test Boxes API (Correct Usage):**
   ```bash
   curl -X GET "http://localhost:3000/api/boxes?asn=ASN-0001&store=STORE-001" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```
   ✅ Should return boxes

3. **Test Boxes API (Wrong Usage - Bin Scan):**
   ```bash
   curl -X GET "http://localhost:3000/api/boxes?bin_location=A1-R02-L1-B2" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```
   ✅ Should return helpful error message

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-13
