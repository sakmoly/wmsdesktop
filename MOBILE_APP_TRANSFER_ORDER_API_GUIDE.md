# Mobile App Transfer Order API Guide

## Issue Fixed

The mobile app was not pulling Transfer Orders, and updating sessions was clearing the `transfer_order` field.

## ✅ Fixes Applied

### 1. Transfer Order Preservation
- **Problem:** When updating an Inbound Session, if `transfer_order` was not provided or was `null`, it would be cleared.
- **Fix:** The API now preserves existing `transfer_order` values:
  - If `transfer_order` is not provided in the request → preserves existing value
  - If `transfer_order` is explicitly `null` → preserves existing value (doesn't clear)
  - If `transfer_order` is provided with a value → updates it

### 2. Auto-Population of Transfer Order
- **New Feature:** If a session doesn't have a `transfer_order` and one exists for the ASN, it will be auto-populated:
  - On session creation
  - On session update (if missing)

## 📡 Available API Endpoints

### 1. Get All Transfer Orders
**Endpoint:** `GET /api/master/transfer-orders`

**Headers:**
```
Authorization: Bearer {token}
```

**Response:**
```json
[
  {
    "transfer_order": "TO-0001",
    "status": "Draft",
    "asn_no": "ASN-0001",
    "from_warehouse": "WH-MAIN",
    "prepared_by": "USER-1",
    "required_date": "2026-01-01",
    "total_allocated_qty": 500.00,
    "created_at": "2025-12-27T01:14:08.000Z",
    "updated_at": "2025-12-27T01:14:08.000Z"
  }
]
```

### 2. Get Transfer Order by ASN
**Endpoint:** `GET /api/transfer-order/by-asn/:asn_no`

**Example:**
```
GET /api/transfer-order/by-asn/ASN-0002
Authorization: Bearer {token}
```

**Response:**
```json
{
  "transfer_order": "TO-0002",
  "status": "Submitted",
  "asn_no": "ASN-0002",
  "from_warehouse": "WH-MAIN",
  "prepared_by": "USER-2",
  "required_date": "2025-12-30",
  "total_allocated_qty": 400.00,
  "created_at": "2025-12-27T01:14:08.000Z",
  "updated_at": "2025-12-27T01:14:08.000Z"
}
```

**Error (404):**
```json
{
  "code": "TRANSFER_ORDER_NOT_FOUND",
  "message": "No transfer order found for ASN ASN-0002"
}
```

### 3. Get Inbound Sessions (includes Transfer Order)
**Endpoint:** `GET /api/inbound/sessions`

**Headers:**
```
Authorization: Bearer {token}
```

**Response:**
```json
[
  {
    "inbound_session": "SESSION-ASN0002-DEVICE4-USER4",
    "asn_no": "ASN-0002",
    "status": "Receiving",
    "completed_cartons": 0,
    "total_cartons": 0,
    "transfer_order": "TO-0002",
    "dock": "DOCK-01",
    "started_by": "USER-4",
    "started_at": "2025-12-26T19:20:15.000Z",
    "ended_at": null,
    "completed_on": null,
    "created_at": "2025-12-26T19:20:15.000Z",
    "updated_at": "2025-12-27T01:20:00.000Z"
  }
]
```

### 4. Update Inbound Session (preserves Transfer Order)
**Endpoint:** `POST /api/inbound/update`

**Request Body:**
```json
{
  "inbound_session": "SESSION-ASN0002-DEVICE4-USER4",
  "asn_no": "ASN-0002",
  "status": "Receiving",
  "completed_cartons": 3,
  "total_cartons": 4,
  "dock": "DOCK-01",
  "user_id": "USER-4",
  "device_id": "DEVICE-001"
  // Note: transfer_order is optional - if not provided, existing value is preserved
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Session updated successfully",
  "action": "updated"
}
```

## 🔧 How It Works

### Transfer Order Handling Logic

1. **On Session Creation:**
   - If `transfer_order` is provided → use it
   - If `transfer_order` is not provided → auto-populate from ASN (if exists)
   - If no Transfer Order exists for ASN → set to `null`

2. **On Session Update:**
   - If `transfer_order` is provided with a value → update it
   - If `transfer_order` is not provided → preserve existing value
   - If `transfer_order` is explicitly `null` → preserve existing value (don't clear)
   - If existing `transfer_order` is `null` and not provided → try to auto-populate from ASN

## 📱 Mobile App Integration

### Recommended Flow

1. **Get Inbound Sessions:**
   ```
   GET /api/inbound/sessions
   ```
   - Returns all sessions with their `transfer_order` values
   - If `transfer_order` is `null`, you can fetch it separately

2. **Get Transfer Order for ASN (if needed):**
   ```
   GET /api/transfer-order/by-asn/ASN-0002
   ```
   - Use this if session doesn't have a `transfer_order` and you need it

3. **Update Session:**
   ```
   POST /api/inbound/update
   ```
   - Don't include `transfer_order` in the request unless you want to change it
   - The API will preserve the existing value automatically

## ✅ Testing

### Test 1: Verify Transfer Order is Returned
```bash
curl -X GET http://localhost:3000/api/inbound/sessions \
  -H "Authorization: Bearer YOUR_TOKEN"
```
**Expected:** Sessions should include `transfer_order` field (not null if exists)

### Test 2: Verify Transfer Order is Preserved on Update
```bash
curl -X POST http://localhost:3000/api/inbound/update \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "inbound_session": "SESSION-ASN0002-DEVICE4-USER4",
    "asn_no": "ASN-0002",
    "status": "Receiving",
    "completed_cartons": 3
  }'
```
**Expected:** `transfer_order` should remain `TO-0002` (not cleared)

### Test 3: Get Transfer Order by ASN
```bash
curl -X GET http://localhost:3000/api/transfer-order/by-asn/ASN-0002 \
  -H "Authorization: Bearer YOUR_TOKEN"
```
**Expected:** Returns Transfer Order details for ASN-0002

## 🎯 Summary

- ✅ Transfer Orders are now preserved when updating sessions
- ✅ Auto-population of Transfer Order from ASN if missing
- ✅ API endpoints available for mobile app to fetch Transfer Orders
- ✅ Inbound Sessions API returns `transfer_order` field
- ✅ No accidental clearing of Transfer Order values

