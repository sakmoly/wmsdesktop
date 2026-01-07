# Restart API Server After Material Request Changes

## ✅ No Build Required

The WMS API is written in **plain JavaScript (ES modules)**, so **no build/compilation is needed**.

However, **the server must be restarted** to load the new code changes.

---

## 🔄 How to Restart

### Option 1: If Using `npm run dev` (Auto-Reload)

If you're running the server with:
```bash
npm run dev
```

The server should **automatically restart** when files change (Node.js `--watch` mode).

**Check if it restarted:**
- Look for console messages indicating file changes
- Test the new endpoint: `POST /api/material-requests/MR-0001/pick-items`

### Option 2: If Using `npm start` (Manual Restart Required)

If you're running the server with:
```bash
npm start
```

**You need to manually restart:**

1. **Stop the server:**
   - Press `Ctrl+C` in the terminal where it's running
   - Or find and kill the Node.js process

2. **Start the server again:**
   ```bash
   cd wms-api
   npm start
   ```

### Option 3: If Using PM2 (Production)

If the server is running with PM2:

```bash
cd wms-api

# Restart the API
pm2 restart wms-api

# Or if you don't know the name
pm2 restart all

# Check status
pm2 status

# View logs to verify it restarted
pm2 logs wms-api --lines 50
```

---

## ✅ Verify Changes Are Loaded

After restarting, test the new endpoint:

```bash
# Test the new pick-items endpoint
curl -X POST http://localhost:3000/api/material-requests/MR-0001/pick-items \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "picked_qty": 20.00,
        "source_bin": "A1-R01-L1-B1"
      }
    ]
  }'
```

Or check the health endpoint:
```bash
curl http://localhost:3000/api/health
```

---

## 📝 Files Changed (No Build Needed)

The following files were modified (all JavaScript, no compilation):

1. ✅ `wms-api/src/modules/material-request/materialRequestController.js`
   - Added `pickMaterialRequestItems` function

2. ✅ `wms-api/src/routes/materialRequestRoutes.js`
   - Added route: `POST /api/material-requests/:title/pick-items`

3. ✅ `wms-api/src/modules/events/eventController.js`
   - Added Material Request picking logic
   - Added `processMaterialRequestPicking` function

4. ✅ `wms-api/src/modules/transfer-cartons/transferCartonController.js`
   - Added Material Request status update on seal

---

## 🚀 Quick Restart Commands

### Development (Auto-Reload)
```bash
cd wms-api
npm run dev
```

### Production (PM2)
```bash
cd wms-api
pm2 restart wms-api
```

### Direct Node
```bash
cd wms-api
# Stop current process (Ctrl+C), then:
node src/server.js
```

---

## ⚠️ Important Notes

1. **No build step required** - Just restart the server
2. **Database changes** - No database migrations needed (we only modified code)
3. **Backward compatible** - Existing endpoints still work
4. **New endpoint available** - `POST /api/material-requests/:title/pick-items` is now active

---

## 🔍 Check Server Status

```bash
# Check if server is running
netstat -ano | Select-String ":3000"

# Or test health endpoint
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "message": "WMS API Server is running"
}
```

