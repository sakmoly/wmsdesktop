# Warehouses/Stores Endpoint Fix

## 🔍 Issue

**Error:** `ERROR ❌ API error (404): Route GET /api/warehouses/stores not found`

**Problem:** Mobile app is calling `/api/warehouses/stores` but this endpoint doesn't exist.

**Existing Endpoint:** `/api/master/warehouses-stores` exists and works correctly.

---

## ✅ Solution

Created a new route file and registered the endpoint at the path the mobile app expects.

### Changes Made

1. **Created `wms-api/src/routes/warehouseRoutes.js`**
   - New route file for warehouse-related endpoints
   - Added `GET /api/warehouses/stores` route
   - Uses existing `getWarehousesStores` controller function

2. **Updated `wms-api/src/routes/index.js`**
   - Imported `warehouseRoutes`
   - Registered routes at `/api/warehouses`

---

## 📡 API Endpoint

### GET /api/warehouses/stores

**Purpose:** Get all warehouses and stores from `tabWarehouse` master table

**Request:**
```http
GET /api/warehouses/stores
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
[
  {
    "code": "WH-MAIN",
    "name": "Main Warehouse",
    "warehouse_type": "Warehouse",
    "is_group": 0,
    "parent_warehouse": null,
    "created_at": "2025-12-23T11:32:15.000Z",
    "updated_at": "2025-12-23T11:32:15.000Z"
  },
  {
    "code": "STORE-001",
    "name": "Downtown Store",
    "warehouse_type": "Store",
    "is_group": 0,
    "parent_warehouse": null,
    "created_at": "2025-12-23T11:32:15.000Z",
    "updated_at": "2025-12-23T11:32:15.000Z"
  }
]
```

**Response Format:**
- Array of warehouse/store objects
- Ordered by `warehouse_type DESC` (Warehouse first), then `code ASC`
- Each object contains:
  - `code` - Warehouse/Store code
  - `name` - Warehouse/Store name
  - `warehouse_type` - "Warehouse" or "Store"
  - `is_group` - 0 or 1 (integer)
  - `parent_warehouse` - Parent warehouse code (if any)
  - `created_at` - ISO timestamp
  - `updated_at` - ISO timestamp

**Error Response (500):**
```json
{
  "code": "DATABASE_ERROR",
  "message": "Failed to fetch warehouses and stores",
  "details": "Error message (development only)"
}
```

---

## 🔄 Alternative Endpoints

The same data is also available at:
- `GET /api/master/warehouses-stores` (original endpoint)

Both endpoints return the same data and use the same controller function.

---

## ✅ Verification

After restarting the API server:

1. **Test the endpoint:**
   ```bash
   curl -X GET "http://localhost:3000/api/warehouses/stores" \
     -H "Authorization: Bearer <token>"
   ```

2. **Expected Result:**
   - Should return 200 OK
   - Should return array of warehouses and stores
   - No more 404 errors in mobile app logs

---

## 📝 Notes

- This endpoint is an alias for `/api/master/warehouses-stores`
- Uses the same controller function (`getWarehousesStores`)
- Maintains backward compatibility with existing `/api/master/warehouses-stores` endpoint
- Mobile app can now use either endpoint

---

**Status:** ✅ Fixed  
**Date:** 2026-01-06  
**Requires:** API server restart

