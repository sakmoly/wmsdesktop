# Quick Backend Setup - Carton Status Update API

## ⚠️ Error: Route Not Found

The error `Route POST /api/cartons/update-status not found` means the route hasn't been added to your backend API yet.

---

## 🚀 Quick Setup (3 Steps)

### Step 1: Create Controller File

**Location:** `wms-api/src/modules/cartons/cartonController.js`

**Create the directory if it doesn't exist:**
```bash
mkdir -p wms-api/src/modules/cartons
```

**Create the file with this code:**

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
      message: 'asn_no and inbound_session are required',
      details: {
        asn_no: asn_no ? null : 'asn_no is required',
        inbound_session: inbound_session ? null : 'inbound_session is required'
      }
    });
  }

  // Normalize ASN number (4-digit format: ASN-0002)
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

  // Validate status values
  const validStatuses = ['Pending', 'Unloaded', 'In Receiving', 'Received', 'Verified', 'Closed'];
  
  if (isSingle && !validStatuses.includes(status)) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: `Invalid status: ${status}. Valid values: ${validStatuses.join(', ')}`
    });
  }

  if (isBatch) {
    // Validate all cartons in batch
    for (const carton of cartons) {
      if (!carton.carton_id || !carton.status) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Each carton in batch must have carton_id and status'
        });
      }
      if (!validStatuses.includes(carton.status)) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: `Invalid status in batch: ${carton.status}. Valid values: ${validStatuses.join(', ')}`
        });
      }
    }
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
        const [exists] = await connection.query(
          `SELECT carton_id FROM tabReceivingCarton 
           WHERE carton_id = ? 
             AND advance_shipping_notice = ? 
             AND inbound_session = ?`,
          [carton_id, normalizedAsn, inbound_session]
        );

        await connection.rollback();
        
        if (exists.length === 0) {
          return res.status(404).json({
            code: 'NOT_FOUND',
            message: `Carton ${carton_id} not found for ASN ${asn_no} and session ${inbound_session}`
          });
        }
      }
    } else {
      // Batch update
      for (const carton of cartons) {
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
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
}

module.exports = {
  updateCartonStatus
};
```

---

### Step 2: Add Route to routes/index.js

**File:** `wms-api/src/routes/index.js`

**Add these lines:**

```javascript
// At the top with other imports
const { updateCartonStatus } = require('../modules/cartons/cartonController');

// In your routes section (where other POST routes are)
router.post('/api/cartons/update-status', authenticate, updateCartonStatus);
```

**Example of where to add it:**
```javascript
// Existing routes...
router.post('/api/inbound/update', authenticate, updateInbound);
router.post('/api/inbound/complete', authenticate, completeInbound);

// ADD THIS LINE:
router.post('/api/cartons/update-status', authenticate, updateCartonStatus);
```

---

### Step 3: Verify normalizeAsnNumber Function Exists

**File:** `wms-api/src/utils/normalize.js`

**Make sure this function exists:**

```javascript
function normalizeAsnNumber(asn) {
  // Normalize to 4-digit format: ASN-0002
  const match = asn.match(/ASN-(\d+)/i);
  if (match) {
    const num = parseInt(match[1], 10);
    return `ASN-${num.toString().padStart(4, '0')}`;
  }
  return asn;
}

module.exports = { normalizeAsnNumber };
```

**If the file doesn't exist, create it.**

---

### Step 4: Restart API Server

**After making changes:**
```bash
# Stop the server (Ctrl+C)
# Then restart:
cd wms-api
npm start
# or
node src/index.js
```

---

## ✅ Test the Route

After restarting, test with:

```bash
curl -X POST http://192.168.103.219:3000/api/cartons/update-status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "asn_no": "ASN-0002",
    "inbound_session": "SESSION-1721881234567",
    "cartons": [
      { "carton_id": "CTN-0101", "status": "Unloaded" },
      { "carton_id": "CTN-0102", "status": "Unloaded" }
    ],
    "user_id": "USER-172188",
    "device_id": "DEVICE-001"
  }'
```

**Expected Response:**
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

---

## 🔍 Troubleshooting

### If you still get 404:

1. **Check route is added correctly:**
   - Open `wms-api/src/routes/index.js`
   - Search for `/api/cartons/update-status`
   - Make sure it's there

2. **Check controller file exists:**
   - Verify `wms-api/src/modules/cartons/cartonController.js` exists
   - Check for syntax errors

3. **Restart the server:**
   - Make sure you restarted after adding the route

4. **Check server logs:**
   - Look for any errors when starting the server
   - Check if the route is being registered

---

## 📝 Summary

1. ✅ Create `wms-api/src/modules/cartons/cartonController.js`
2. ✅ Add route to `wms-api/src/routes/index.js`
3. ✅ Verify `normalizeAsnNumber` function exists
4. ✅ Restart API server
5. ✅ Test the endpoint

After these steps, your mobile app should be able to call the API successfully! 🎉

