# Carton Status Update API - Implementation Guide

## Overview

This document provides the implementation specification for the `POST /api/cartons/update-status` endpoint to update carton statuses (specifically marking them as "Unloaded") when users click "Next" in the Unload screen.

## Database Schema

The backend uses the `tabReceivingCarton` table (not `asn_carton_status`). Here's the relevant schema:

```sql
CREATE TABLE IF NOT EXISTS tabReceivingCarton (
  id INT AUTO_INCREMENT PRIMARY KEY,
  carton_id VARCHAR(100) NOT NULL,
  advance_shipping_notice VARCHAR(100) NOT NULL,
  inbound_session VARCHAR(100) NULL,
  status VARCHAR(50) DEFAULT 'Pending',
  opened_by VARCHAR(100) NULL,
  opened_on TIMESTAMP NULL,
  locked_by VARCHAR(100) NULL,
  locked_on TIMESTAMP NULL,
  received_by VARCHAR(100) NULL,
  received_on TIMESTAMP NULL,
  verified_by VARCHAR(100) NULL,
  verified_on TIMESTAMP NULL,
  updated_on TIMESTAMP NULL,
  remarks TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_carton_asn (carton_id, advance_shipping_notice),
  INDEX idx_asn (advance_shipping_notice),
  INDEX idx_inbound_session (inbound_session),
  INDEX idx_status (status),
  INDEX idx_locked_by (locked_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Important Notes:**
- Table name: `tabReceivingCarton` (not `asn_carton_status`)
- ASN column: `advance_shipping_notice` (API should accept `asn_no` and map it)
- Session column: `inbound_session` (matches API field name)
- Status values: 'Pending', 'Unloaded', 'In Receiving', 'Received', 'Verified', 'Closed'

---

## API Endpoint Specification

### POST /api/cartons/update-status

**Purpose:** Update carton status(es) to "Unloaded" (or other status) for cartons in an ASN and inbound session.

**Authentication:** Required (Bearer token)

---

## Request Format

### Single Carton Update

```json
{
  "asn_no": "ASN-0002",
  "inbound_session": "SESSION-1721881234567",
  "carton_id": "CTN-0101",
  "status": "Unloaded",
  "user_id": "USER-172188",
  "device_id": "DEVICE-001"
}
```

### Batch Carton Update (Multiple Cartons)

```json
{
  "asn_no": "ASN-0002",
  "inbound_session": "SESSION-1721881234567",
  "cartons": [
    {
      "carton_id": "CTN-0101",
      "status": "Unloaded"
    },
    {
      "carton_id": "CTN-0102",
      "status": "Unloaded"
    }
  ],
  "user_id": "USER-172188",
  "device_id": "DEVICE-001"
}
```

---

## Field Specifications

### Required Fields

| Field Name | API Name | DB Column | Type | Description |
|------------|----------|-----------|------|-------------|
| ASN Number | `asn_no` | `advance_shipping_notice` | string | ASN number (4-digit: `ASN-0002`) |
| Session ID | `inbound_session` | `inbound_session` | string | Inbound session identifier |
| Status | `status` | `status` | string | Carton status: `"Unloaded"` |

### Required Fields (Single Format)

| Field Name | Type | Description |
|------------|------|-------------|
| `carton_id` | string | Carton identifier (e.g., `CTN-0101`) |

### Required Fields (Batch Format)

| Field Name | Type | Description |
|------------|------|-------------|
| `cartons` | array | Array of carton status objects, each with `carton_id` and `status` |

### Optional Fields

| Field Name | API Name | DB Column | Description |
|------------|----------|-----------|-------------|
| User ID | `user_id` | `received_by` | User ID who performed the action |
| Device ID | `device_id` | N/A | Device ID (can be logged to scan events) |

---

## Response Format

### Success Response (200 OK) - Single Update

```json
{
  "success": true,
  "message": "Carton status updated successfully",
  "updated_count": 1
}
```

### Success Response (200 OK) - Batch Update

```json
{
  "success": true,
  "message": "Carton statuses updated successfully",
  "updated_count": 2,
  "cartons": [
    {
      "carton_id": "CTN-0101",
      "status": "Unloaded",
      "updated": true
    },
    {
      "carton_id": "CTN-0102",
      "status": "Unloaded",
      "updated": true
    }
  ]
}
```

### Error Response (400 Bad Request)

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Missing required field: asn_no",
  "details": null
}
```

### Error Response (404 Not Found)

```json
{
  "code": "NOT_FOUND",
  "message": "Carton CTN-0101 not found for ASN ASN-0002 and session SESSION-1721881234567",
  "details": null
}
```

### Error Response (500 Internal Server Error)

```json
{
  "code": "DATABASE_ERROR",
  "message": "Database operation failed",
  "details": "Connection timeout"
}
```

---

## Backend Implementation (Node.js/Express)

### Controller Implementation

```javascript
// wms-api/src/modules/cartons/cartonController.js

const { getConnection } = require('../../db/connection');
const { normalizeAsnNumber } = require('../../utils/normalize');

/**
 * Update carton status(es) - supports single and batch updates
 * POST /api/cartons/update-status
 */
async function updateCartonStatus(req, res) {
  const {
    asn_no,
    inbound_session,
    carton_id,        // Single carton format
    cartons,          // Batch format (array)
    status,
    user_id,
    device_id
  } = req.body;

  // Validate required fields
  if (!asn_no || !inbound_session) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'asn_no and inbound_session are required'
    });
  }

  // Normalize ASN number (4-digit format)
  const normalizedAsn = normalizeAsnNumber(asn_no);
  
  // Determine if single or batch update
  const isBatch = Array.isArray(cartons) && cartons.length > 0;
  const isSingle = carton_id && status;

  if (!isBatch && !isSingle) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Either carton_id with status (single) or cartons array (batch) is required'
    });
  }

  // Validate status value
  const validStatuses = ['Pending', 'Unloaded', 'In Receiving', 'Received', 'Verified', 'Closed'];
  if (isSingle && !validStatuses.includes(status)) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: `Invalid status. Valid values: ${validStatuses.join(', ')}`
    });
  }

  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    const now = new Date();
    let updatedCount = 0;
    const updatedCartons = [];

    if (isSingle) {
      // Single carton update
      const [result] = await connection.query(
        `UPDATE tabReceivingCarton 
         SET status = ?,
             updated_on = ?,
             received_by = ?,
             updated_at = NOW()
         WHERE carton_id = ? 
           AND advance_shipping_notice = ? 
           AND inbound_session = ?`,
        [
          status,
          now,
          user_id || null,
          carton_id,
          normalizedAsn,
          inbound_session
        ]
      );

      if (result.affectedRows > 0) {
        updatedCount = 1;
        updatedCartons.push({
          carton_id: carton_id,
          status: status,
          updated: true
        });
      } else {
        // Check if carton exists at all
        const [exists] = await connection.query(
          `SELECT carton_id FROM tabReceivingCarton 
           WHERE carton_id = ? 
             AND advance_shipping_notice = ? 
             AND inbound_session = ?`,
          [carton_id, normalizedAsn, inbound_session]
        );

        if (exists.length === 0) {
          await connection.rollback();
          return res.status(404).json({
            code: 'NOT_FOUND',
            message: `Carton ${carton_id} not found for ASN ${asn_no} and session ${inbound_session}`
          });
        }
      }
    } else {
      // Batch update
      for (const carton of cartons) {
        if (!carton.carton_id || !carton.status) {
          updatedCartons.push({
            carton_id: carton.carton_id || 'unknown',
            status: carton.status || 'unknown',
            updated: false,
            error: "Missing carton_id or status"
          });
          continue;
        }

        if (!validStatuses.includes(carton.status)) {
          updatedCartons.push({
            carton_id: carton.carton_id,
            status: carton.status,
            updated: false,
            error: `Invalid status. Valid values: ${validStatuses.join(', ')}`
          });
          continue;
        }

        const [result] = await connection.query(
          `UPDATE tabReceivingCarton 
           SET status = ?,
               updated_on = ?,
               received_by = ?,
               updated_at = NOW()
           WHERE carton_id = ? 
             AND advance_shipping_notice = ? 
             AND inbound_session = ?`,
          [
            carton.status,
            now,
            user_id || null,
            carton.carton_id,
            normalizedAsn,
            inbound_session
          ]
        );

        if (result.affectedRows > 0) {
          updatedCount++;
          updatedCartons.push({
            carton_id: carton.carton_id,
            status: carton.status,
            updated: true
          });
        } else {
          // Check if carton exists
          const [exists] = await connection.query(
            `SELECT carton_id FROM tabReceivingCarton 
             WHERE carton_id = ? 
               AND advance_shipping_notice = ? 
               AND inbound_session = ?`,
            [carton.carton_id, normalizedAsn, inbound_session]
          );

          updatedCartons.push({
            carton_id: carton.carton_id,
            status: carton.status,
            updated: false,
            error: exists.length === 0 
              ? "Carton not found for this ASN and session" 
              : "Update failed"
          });
        }
      }
    }

    await connection.commit();

    res.json({
      success: true,
      message: isBatch 
        ? `Carton statuses updated successfully` 
        : `Carton status updated successfully`,
      updated_count: updatedCount,
      ...(isBatch && { cartons: updatedCartons })
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating carton status:', error);
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to update carton status',
      details: error.message
    });
  } finally {
    connection.release();
  }
}

module.exports = {
  updateCartonStatus
};
```

### Route Registration

```javascript
// wms-api/src/routes/index.js

const { updateCartonStatus } = require('../modules/cartons/cartonController');
const { authenticate } = require('../middleware/auth');

// Add this route
router.post('/api/cartons/update-status', authenticate, updateCartonStatus);
```

### Validation Schema (Optional)

```javascript
// wms-api/src/validations/schemas.js

const cartonStatusUpdateSchema = {
  type: 'object',
  required: ['asn_no', 'inbound_session'],
  properties: {
    asn_no: {
      type: 'string',
      pattern: '^ASN-\\d{4}$'
    },
    inbound_session: {
      type: 'string'
    },
    carton_id: {
      type: 'string'
    },
    status: {
      type: 'string',
      enum: ['Pending', 'Unloaded', 'In Receiving', 'Received', 'Verified', 'Closed']
    },
    cartons: {
      type: 'array',
      items: {
        type: 'object',
        required: ['carton_id', 'status'],
        properties: {
          carton_id: { type: 'string' },
          status: {
            type: 'string',
            enum: ['Pending', 'Unloaded', 'In Receiving', 'Received', 'Verified', 'Closed']
          }
        }
      }
    },
    user_id: { type: 'string' },
    device_id: { type: 'string' }
  },
  oneOf: [
    { required: ['carton_id', 'status'] },
    { required: ['cartons'] }
  ]
};
```

---

## Database Field Mapping

| API Field | Database Column | Notes |
|-----------|----------------|-------|
| `asn_no` | `advance_shipping_notice` | API accepts `asn_no`, DB stores in `advance_shipping_notice` (normalize to 4-digit format) |
| `inbound_session` | `inbound_session` | Direct mapping |
| `carton_id` | `carton_id` | Direct mapping |
| `status` | `status` | Direct mapping |
| `user_id` | `received_by` | Optional - stores who updated the status |
| `device_id` | N/A | Optional - can be logged to `tabWmsScanEvent` if needed |

---

## Important Implementation Notes

1. **ASN Format**: Use `normalizeAsnNumber()` utility to normalize ASN to 4-digit format (`ASN-0002`)

2. **Table Name**: Use `tabReceivingCarton` (not `asn_carton_status`)

3. **Column Name**: API accepts `asn_no` but database column is `advance_shipping_notice`

4. **Transaction Safety**: Use database transactions for batch updates to ensure atomicity

5. **Idempotency**: Endpoint is idempotent - calling multiple times with same data is safe

6. **Status Values**: Valid statuses are: 'Pending', 'Unloaded', 'In Receiving', 'Received', 'Verified', 'Closed'

7. **Unique Constraint**: The table has `UNIQUE KEY unique_carton_asn (carton_id, advance_shipping_notice)` - but we also filter by `inbound_session` for additional context

---

## Testing Examples

### Test Single Carton Update

```bash
curl -X POST http://localhost:3000/api/cartons/update-status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "asn_no": "ASN-0002",
    "inbound_session": "SESSION-1721881234567",
    "carton_id": "CTN-0101",
    "status": "Unloaded",
    "user_id": "USER-172188",
    "device_id": "DEVICE-001"
  }'
```

### Test Batch Carton Update

```bash
curl -X POST http://localhost:3000/api/cartons/update-status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "asn_no": "ASN-0002",
    "inbound_session": "SESSION-1721881234567",
    "cartons": [
      {
        "carton_id": "CTN-0101",
        "status": "Unloaded"
      },
      {
        "carton_id": "CTN-0102",
        "status": "Unloaded"
      }
    ],
    "user_id": "USER-172188",
    "device_id": "DEVICE-001"
  }'
```

---

## Summary

✅ **Endpoint**: `POST /api/cartons/update-status`  
✅ **Table**: `tabReceivingCarton`  
✅ **ASN Mapping**: `asn_no` (API) → `advance_shipping_notice` (DB)  
✅ **Supports**: Both single and batch carton status updates  
✅ **Status**: Updates carton status, typically to "Unloaded"  
✅ **Transaction**: Uses transactions for batch updates  
✅ **Validation**: Validates status values and required fields  

