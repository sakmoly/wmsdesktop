# Box Delete API - Implementation Complete

## ✅ Endpoint Implemented

**Endpoint:** `POST /api/boxes/delete`

**Purpose:** Delete a box (CTN) from both mobile app and backend. Only allowed if box has no scanned items.

---

## Request Format

```json
{
  "box_id": "BOX-WAREHOUSE-624758"
}
```

---

## Response Formats

### Success Response (200)

```json
{
  "success": true,
  "ok": true,
  "message": "Box deleted successfully"
}
```

### Error Responses

#### 400 - Validation Error (Missing box_id)

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "box_id is required"
  }
}
```

#### 400 - Validation Error (Box has items)

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Cannot delete box with scanned items",
    "details": "Box contains 5 scanned item(s) (3 receive line(s), 2 scanned item(s))"
  }
}
```

#### 404 - Box Not Found

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Box BOX-WAREHOUSE-624758 not found"
  }
}
```

#### 500 - Database Error

```json
{
  "ok": false,
  "error": {
    "code": "DATABASE_ERROR",
    "message": "Failed to delete box",
    "details": "Error details (development only)"
  }
}
```

---

## Implementation Details

### Validation Logic

1. **Check if box_id is provided:**
   - Returns 400 if missing

2. **Check if box exists:**
   - Queries `tabSortBox` table
   - Returns 404 if not found

3. **Check for scanned items:**
   - Checks multiple possible tables:
     - `tabReceiveLine` (if exists with `box_id` column)
     - `scanned_items` (mobile app local table, if exists)
     - `tabInboundReceiveLine` (if has `box_id` column)
   - Returns 400 if box contains any items
   - Error message includes count and details

4. **Delete box:**
   - Deletes from `tabSortBox` table
   - Returns success response

### Safety Features

- ✅ **Prevents data loss:** Cannot delete boxes with items
- ✅ **Clear error messages:** Tells user exactly how many items are in the box
- ✅ **Graceful error handling:** Handles missing tables/columns gracefully
- ✅ **Transaction safety:** Uses database connection properly

---

## Testing

### Test Delete Empty Box

```bash
curl -X POST http://localhost:3000/api/boxes/delete \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "box_id": "BOX-WAREHOUSE-624758"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "ok": true,
  "message": "Box deleted successfully"
}
```

### Test Delete Box with Items

```bash
curl -X POST http://localhost:3000/api/boxes/delete \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "box_id": "BOX-SR01-001"
  }'
```

**Expected Response (if box has items):**
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Cannot delete box with scanned items",
    "details": "Box contains 5 scanned item(s)"
  }
}
```

### Test Delete Non-Existent Box

```bash
curl -X POST http://localhost:3000/api/boxes/delete \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "box_id": "BOX-NOT-EXISTS"
  }'
```

**Expected Response:**
```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Box BOX-NOT-EXISTS not found"
  }
}
```

---

## Mobile App Integration

The mobile app should:

1. **Check for scanned items** before allowing deletion
2. **Show error** if box contains items: "BOX {box_id} contains {count} scanned item(s). Please remove all items from the box before deleting it."
3. **Confirm deletion** with user: "Are you sure you want to delete BOX {box_id}? This action cannot be undone."
4. **Call backend API** to delete box
5. **Handle 404 gracefully** - if backend endpoint not implemented, still deletes locally
6. **Delete from local database** after successful backend deletion:
   - `box_cache` table
   - `scanned_items` table (items in this box)
   - `event_queue` table (events related to this box)

---

## Database Tables Checked

The endpoint checks for scanned items in these tables (if they exist):

1. **`tabReceiveLine`** - Receive lines with `box_id` column
2. **`scanned_items`** - Mobile app local scanned items table
3. **`tabInboundReceiveLine`** - Inbound receive lines (if has `box_id` column)

**Note:** The endpoint gracefully handles cases where tables or columns don't exist, so it works with different database schemas.

---

## Files Modified

1. ✅ `wms-api/src/modules/boxes/boxController.js`
   - Added `deleteBox` function

2. ✅ `wms-api/src/routes/boxRoutes.js`
   - Registered `POST /api/boxes/delete` route

---

## Status

✅ **Implementation Complete - Ready for Testing**

The endpoint is fully implemented and ready to use. It includes:
- ✅ Validation for box_id
- ✅ Check if box exists
- ✅ Check for scanned items (multiple tables)
- ✅ Prevent deletion if box has items
- ✅ Delete box if no items
- ✅ Proper error handling
- ✅ Clear error messages

---

**Last Updated:** 2024-12-25

