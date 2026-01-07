# Add Carton Status Route - Step by Step

## ⚠️ Current Error
```
Route POST /api/cartons/update-status not found
```

This means the route needs to be added to your backend API.

---

## 📍 Step 1: Navigate to Backend API Directory

```bash
cd "D:\Development Project\Printechs WMS\wms-api"
```

---

## 📁 Step 2: Create Controller File

**Create directory:**
```bash
mkdir -p src/modules/cartons
```

**Create file:** `src/modules/cartons/cartonController.js`

**Copy the entire content from:** `BACKEND_CARTON_STATUS_UPDATE_IMPLEMENTATION.js`

Or use this file I created in your Desktop project directory.

---

## 🔗 Step 3: Add Route to routes/index.js

**Open:** `wms-api/src/routes/index.js`

**Find where other routes are defined** (look for lines like):
```javascript
router.post('/api/inbound/update', authenticate, updateInbound);
router.post('/api/inbound/complete', authenticate, completeInbound);
```

**Add these two lines:**

**At the top (with imports):**
```javascript
const { updateCartonStatus } = require('../modules/cartons/cartonController');
```

**In the routes section:**
```javascript
router.post('/api/cartons/update-status', authenticate, updateCartonStatus);
```

**Complete example:**
```javascript
// At top of file
const { updateInbound, completeInbound } = require('../modules/inbound/inboundController');
const { updateCartonStatus } = require('../modules/cartons/cartonController'); // ← ADD THIS
const { authenticate } = require('../middleware/auth');

// ... other code ...

// In routes section
router.post('/api/inbound/update', authenticate, updateInbound);
router.post('/api/inbound/complete', authenticate, completeInbound);
router.post('/api/cartons/update-status', authenticate, updateCartonStatus); // ← ADD THIS
```

---

## ✅ Step 4: Verify normalizeAsnNumber Function

**Check if file exists:** `wms-api/src/utils/normalize.js`

**If it doesn't exist, create it:**
```javascript
// wms-api/src/utils/normalize.js

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

**If it exists, make sure it exports `normalizeAsnNumber`.**

---

## 🔄 Step 5: Restart API Server

**Stop the current server** (Ctrl+C in the terminal where it's running)

**Restart:**
```bash
cd "D:\Development Project\Printechs WMS\wms-api"
npm start
```

**Or:**
```bash
node src/index.js
```

---

## 🧪 Step 6: Test the Route

**Test with curl:**
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

**Expected:** `200 OK` with success response

---

## 🔍 Quick Checklist

- [ ] Created `src/modules/cartons/cartonController.js`
- [ ] Added import in `src/routes/index.js`
- [ ] Added route `POST /api/cartons/update-status` in `src/routes/index.js`
- [ ] Verified `normalizeAsnNumber` function exists
- [ ] Restarted API server
- [ ] Tested the endpoint

---

## 📝 Files to Copy

1. **Controller:** Copy `BACKEND_CARTON_STATUS_UPDATE_IMPLEMENTATION.js` to:
   ```
   wms-api/src/modules/cartons/cartonController.js
   ```

2. **Route:** Add the route line to:
   ```
   wms-api/src/routes/index.js
   ```

That's it! After these steps, the route will be available and your mobile app will work. 🚀

