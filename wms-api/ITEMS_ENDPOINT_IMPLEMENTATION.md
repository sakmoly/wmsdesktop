# Items Master Data Endpoint Implementation ✅

## Issue

**Error:** `404: Route GET /api/master/items not found`

The mobile app was trying to fetch items master data, but the endpoint was not implemented.

## Solution Implemented

### ✅ New Endpoint Created

**Endpoint:** `GET /api/master/items`

**Purpose:** Fetch all items from the `tabItem` master table for mobile and desktop apps

**Authentication:** Required (Bearer token)

## Implementation Details

### 1. Controller Function (`masterController.js`)

Added `getAllItems` function that:
- Fetches all items from `tabItem` table
- Orders by `code` (item code)
- Returns all item fields with proper formatting
- Handles null values gracefully

### 2. Route Registration (`masterRoutes.js`)

Added route:
```javascript
router.get('/items', authenticateToken, getAllItems);
```

**Full URL:** `GET /api/master/items`

## API Documentation

### Request

```http
GET /api/master/items
Authorization: Bearer YOUR_TOKEN
```

### Response Format

**Success (200 OK):**

```json
[
  {
    "code": "ITEM-001",
    "name": "Product Name",
    "item_group": "Electronics",
    "brand": "Brand Name",
    "default_uom": "Nos",
    "stock_uom": "Nos",
    "barcode": "1234567890123",
    "maintain_stock": true,
    "stock_qty": 100.00,
    "reserved_qty": 10.00,
    "updated_on": "2025-12-23T11:32:15.000Z",
    "created_at": "2025-12-23T11:32:15.000Z",
    "updated_at": "2025-12-23T11:32:15.000Z"
  }
]
```

**Empty Response (if no items):**

```json
[]
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `code` | string | Item code (PRIMARY KEY) |
| `name` | string | Item name |
| `item_group` | string\|null | Item group/category |
| `brand` | string\|null | Brand name |
| `default_uom` | string\|null | Default unit of measure |
| `stock_uom` | string\|null | Stock unit of measure |
| `barcode` | string\|null | Barcode/SKU |
| `maintain_stock` | boolean | Whether stock is maintained |
| `stock_qty` | number | Current stock quantity |
| `reserved_qty` | number | Reserved quantity |
| `updated_on` | string\|null | Last update timestamp (ISO format) |
| `created_at` | string | Record creation timestamp (ISO format) |
| `updated_at` | string | Last update timestamp (ISO format) |

## Database Schema

The endpoint queries the `tabItem` table:

```sql
CREATE TABLE IF NOT EXISTS tabItem (
  code VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  item_group VARCHAR(100) NULL,
  brand VARCHAR(100) NULL,
  default_uom VARCHAR(50) NULL,
  stock_uom VARCHAR(50) NULL,
  barcode VARCHAR(255) NULL,
  maintain_stock BOOLEAN DEFAULT TRUE,
  stock_qty DECIMAL(10,2) DEFAULT 0,
  reserved_qty DECIMAL(10,2) DEFAULT 0,
  updated_on TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## Testing

### Using curl:

```bash
curl -X GET http://localhost:3000/api/master/items \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Using Postman:

1. Method: `GET`
2. URL: `http://localhost:3000/api/master/items`
3. Headers:
   - `Authorization: Bearer YOUR_TOKEN`

### Test Suite

The endpoint is included in the automated test suite:

```bash
cd wms-api
$env:NODE_ENV="development"
node test-api.js
```

Test case: `GET /api/master/items`

## Files Modified

1. ✅ `wms-api/src/modules/master/masterController.js`
   - Added `getAllItems` function

2. ✅ `wms-api/src/routes/masterRoutes.js`
   - Registered `/items` route
   - Added import for `getAllItems`

3. ✅ `wms-api/test-api.js`
   - Added test case for items endpoint

## Next Steps

1. **Restart Backend Server**
   ```bash
   cd wms-api
   # Stop current server (Ctrl+C)
   npm start
   ```

2. **Test the Endpoint**
   ```bash
   curl -X GET http://localhost:3000/api/master/items \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

3. **Verify Mobile App Sync**
   - Items should now sync successfully in the mobile app
   - No more 404 errors when fetching items

## Related Endpoints

This endpoint is part of the master data API suite:
- ✅ `GET /api/master/asns` - Get all ASNs
- ✅ `GET /api/master/transfer-orders` - Get all transfer orders
- ✅ `GET /api/master/boxes` - Get all boxes
- ✅ `GET /api/master/transfer-cartons` - Get all transfer cartons
- ✅ `GET /api/master/warehouses` - Get all warehouses
- ✅ `GET /api/master/warehouses-stores` - Get all warehouses and stores
- ✅ `GET /api/master/locations` - Get all locations
- ✅ `GET /api/master/users` - Get all users
- ✅ `GET /api/master/items` - Get all items ← **NEW!**

## Notes

- Items are ordered by `code` for consistent sorting
- All nullable fields return `null` instead of empty strings
- Boolean fields are properly converted (e.g., `maintain_stock`)
- Numeric fields are parsed as floats (e.g., `stock_qty`, `reserved_qty`)
- Timestamps are returned in ISO 8601 format

