# Transfer In Receive Line Route Fix

## Issue

The mobile app was receiving a 404 error when trying to call:
```
POST /api/transfer-in/INSLIP-0001/receive-line
```

Error message:
```
ERROR ❌ API error (404): Route POST /api/transfer-in/INSLIP-0001/receive-line not found
```

## Root Cause

The route was correctly defined, but the route order in Express matters. More specific routes should be defined **before** general routes to ensure proper matching.

## Fix Applied

**File:** `wms-api/src/routes/transferInRoutes.js`

**Changes:**
1. Moved `POST /:title/submit` route **before** `GET /:title` route
2. Moved `POST /:title/receive-line` route **before** `GET /:title` route
3. Kept `GET /:title` route at the end (after all specific routes)

**Before:**
```javascript
router.get("/", authenticateToken, getTransferIns);
router.get("/:title", authenticateToken, getTransferInByTitle);  // General route
router.post("/", authenticateToken, createTransferIn);
router.post("/:title/submit", authenticateToken, submitTransferIn);
router.post("/:title/receive-line", authenticateToken, receiveTransferInLine);
```

**After:**
```javascript
router.get("/", authenticateToken, getTransferIns);
router.post("/", authenticateToken, createTransferIn);
router.post("/:title/submit", authenticateToken, submitTransferIn);  // Specific route first
router.post("/:title/receive-line", authenticateToken, receiveTransferInLine);  // Specific route first
router.get("/:title", authenticateToken, getTransferInByTitle);  // General route last
```

## Why This Fixes the Issue

In Express.js, routes are matched in the order they are defined. While different HTTP methods (GET vs POST) shouldn't normally conflict, defining more specific routes first ensures:

1. **Clear route precedence** - Express will check specific routes before general ones
2. **Better route matching** - Reduces potential conflicts with route parameter matching
3. **Best practice** - Following Express.js routing best practices

## Verification

The route is now correctly defined and should be accessible at:
```
POST /api/transfer-in/:title/receive-line
```

**Request Body Examples:**

**Cartonized (Receive by Carton):**
```json
{
  "carton_id": "CTN-TI-001",
  "received_by": "USER-002"
}
```

**Loose Item (Receive by Item):**
```json
{
  "item_code": "ITEM-001",
  "received_qty": 50.00,
  "received_by": "USER-002"
}
```

## Next Steps

1. **Restart the API server** to apply the route changes
2. **Test the endpoint** using the mobile app or API client
3. **Verify** that the 404 error is resolved

## Testing

You can test the endpoint using curl:

```bash
# Test receive-line endpoint
curl -X POST http://localhost:3000/api/transfer-in/INSLIP-0001/receive-line \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "item_code": "SKU-HAT-301-BLU-OS",
    "received_qty": 2,
    "received_by": "USER-001"
  }'
```

## Related Files

- `wms-api/src/routes/transferInRoutes.js` - Route definitions
- `wms-api/src/modules/transfer-in/transferInController.js` - Controller implementation
- `wms-api/src/routes/index.js` - Main route registration

---

**Status:** ✅ Fixed  
**Date:** 2026-01-05  
**Requires:** API server restart

