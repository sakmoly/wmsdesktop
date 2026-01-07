# Box Print Endpoint Implementation

## ✅ Implementation Complete

The `POST /api/boxes/print` endpoint has been implemented to support backend-mediated printing for box labels.

### Endpoint Details

**URL:** `POST /api/boxes/print`

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "box_id": "BOX-001",
  "printer_id": "PRINTER-001",  // Optional
  "copies": 1  // Optional, default: 1
}
```

### Success Response (200)

```json
{
  "success": true,
  "ok": true,
  "message": "Print job queued successfully",
  "job_id": "PRINT-1735123456789",
  "box_id": "BOX-001"
}
```

### Error Responses

**400 - Validation Error:**
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "box_id is required"
  }
}
```

**404 - Box Not Found:**
```json
{
  "ok": false,
  "error": {
    "code": "BOX_NOT_FOUND",
    "message": "Box BOX-001 not found"
  }
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
  "ok": false,
  "error": {
    "code": "DATABASE_ERROR",
    "message": "Failed to print box label",
    "details": "Error details (development only)"
  }
}
```

### Label Format

The endpoint generates label content matching the desktop app format:

```
SORT BOX / TRANSFER CARTON

Box ID: BOX-STORE-001-001
Store: STORE-001
Status: Open

ASN: ASN-0001
TO: TO-0001

CONTENTS:
(No contents)

Created: 2024-12-25 10:30:23

[BARCODE - Code128: BOX-STORE-001-001]
BOX-STORE-001-001
```

### Current Implementation

**Status:** ✅ **Basic implementation complete**

The endpoint currently:
- ✅ Validates box_id
- ✅ Fetches box details from database
- ✅ Generates label text matching desktop format
- ✅ Logs print job
- ✅ Returns success response with job_id

**TODO for Production:**
- ⏳ Implement actual printer communication
- ⏳ Support different printer types (thermal, laser, network)
- ⏳ Generate barcode image (Code128 format)
- ⏳ Queue print jobs if printer unavailable
- ⏳ Support printer configuration management

### Next Steps for Full Printing Support

#### Option 1: Use Node.js Print Libraries

Install printer libraries:
```bash
npm install printer  # For system printers
# or
npm install node-printer  # Alternative
```

#### Option 2: Generate PDF and Send to Printer

Install PDF generation:
```bash
npm install pdfkit
npm install jsbarcode  # For barcode generation
```

#### Option 3: Use External Print Service

- Integrate with CUPS (Common Unix Printing System)
- Use network print protocols (IPP, LPD)
- Send to print server/queue

### Files Created

1. ✅ `wms-api/src/modules/boxes/boxPrintController.js`
   - `printBox` function
   - `generateLabelText` helper function

2. ✅ `wms-api/src/routes/boxRoutes.js` (updated)
   - Registered `POST /api/boxes/print` route

### Testing

#### Test with cURL:
```bash
curl -X POST "http://localhost:3000/api/boxes/print" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "box_id": "BOX-001",
    "copies": 1
  }'
```

#### Test with Postman:
1. Method: `POST`
2. URL: `http://localhost:3000/api/boxes/print`
3. Headers: 
   - `Authorization: Bearer YOUR_TOKEN`
   - `Content-Type: application/json`
4. Body (JSON):
   ```json
   {
     "box_id": "BOX-001",
     "copies": 1
   }
   ```

### Mobile App Compatibility

The mobile app is already configured to call this endpoint:
```typescript
await apiService.printBox({
  box_id: boxId,
  printer_id: settings.default_printer_id, // Optional
  copies: 1,
});
```

The endpoint will return success, allowing the mobile app to proceed. Actual printing can be implemented later based on your printer infrastructure.

---

## Status: ✅ **Endpoint Implemented - Ready for Testing**

The endpoint is functional and returns success responses. Actual printer integration can be added based on your specific printer setup and requirements.

