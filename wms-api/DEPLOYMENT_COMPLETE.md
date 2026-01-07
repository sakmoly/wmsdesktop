# ✅ Complete API Deployment Package

## 📦 Deployment Status: READY

The complete API deployment package has been built and is ready for client deployment.

---

## 📁 Package Location

**Path:** `wms-api/deployment/`

**Full Path:** `D:\Development Project\Printechs WMS\Wms.Desktop\wms-api\deployment\`

---

## 📋 Package Contents

### ✅ Required Files

1. **wms-api.exe** ⚠️ **MUST UPDATE**
   - Main executable (includes Node.js runtime)
   - Size: ~50-70 MB
   - Contains all latest API changes and bug fixes
   - **Action:** Replace existing file on client machine

### 📄 Configuration Files

2. **.env.template**
   - Configuration template
   - **Action:** Only update if new environment variables were added
   - **Note:** Client's existing `.env` file should remain unchanged

3. **README.txt**
   - Documentation and setup instructions
   - **Action:** Optional update (for latest documentation)

4. **VERSION.txt**
   - Version information
   - **Action:** Optional update (informational only)

### 🔧 Scripts

5. **install.bat** - Installation script
6. **start-server.bat** - Start server script
7. **stop-server.bat** - Stop server process
8. **setup-firewall.bat** - Firewall setup
9. **update.bat** - Update script
10. **install-service.bat** - Install as Windows Service
11. **uninstall-service.bat** - Remove Windows Service
12. **start-hidden.vbs** - Start in hidden window

**Note:** Scripts are optional updates. Client can keep existing versions.

---

## 🆕 Latest Changes Included

### 1. Putaway Task Duplicate Entry Fix ✅

- Fixed duplicate entry error when mobile app sends `putaway_task` parameter
- Now checks if task exists before creating
- Handles duplicate entry errors gracefully
- **File:** `wms-api/src/modules/putaway/putawayController.js`
- **Error Fixed:** `Duplicate entry 'PAW-ASN365425473-1767609465623' for key 'PRIMARY'`

### 2. Stock Ledger Pagination & Filtering ✅

- Added pagination support (`page`, `page_size` parameters)
- Added date range filtering (`from_date`, `to_date`)
- Added item code search (partial match with `LIKE`)
- Returns paginated response with metadata
- **File:** `wms-api/src/modules/stock-ledger/stockLedgerController.js`

### 3. Stock Ledger qty_before and qty_reduced ✅

- Added `qty_before` and `qty_reduced` fields to stock ledger responses
- These fields are populated during dispatch operations
- **Files:**
  - `wms-api/src/modules/stock-ledger/stockLedgerController.js`
  - `wms-api/src/modules/transfer-cartons/transferCartonController.js`

### 4. Material Request Status Management ✅

- Item-level status tracking in `tabMaterialRequestItem`
- Status updates: Pending → In Progress → Picked → Sealed
- Header status derived from item statuses
- **File:** `wms-api/src/modules/material-request/materialRequestController.js`

### 5. Transfer Carton Dispatch - Stock Reduction ✅

- Stock reduction occurs on dispatch (not seal)
- Updates `qty_before` and `qty_reduced` in stock ledger
- Creates stock transactions for audit trail
- **File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

### 6. Transfer Carton Sealed Validation ✅

- Prevents adding items to sealed/dispatched/completed transfer cartons
- **File:** `wms-api/src/modules/events/eventController.js`

### 7. Material Request Transfer Carton Support ✅

- Support for Material Request numbers in `to_no`/`transfer_order` field
- Fallback logic to find items when `tc_id` is missing
- Time window logic for event retrieval
- **File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

---

## 🚀 Client Deployment Steps

### Step 1: Stop the API Server

On the client machine, stop the running API server:

```batch
# Option 1: If running as service
net stop WmsApiService

# Option 2: If running manually
# Close the command window or use stop-server.bat
stop-server.bat
```

### Step 2: Backup Current Executable (Recommended)

```batch
# Navigate to API installation directory
cd "C:\Path\To\API\Installation"

# Rename existing executable
ren wms-api.exe wms-api.exe.backup
```

### Step 3: Replace Executable

1. Copy the new `wms-api.exe` from `wms-api/deployment/` folder
2. Paste it into the client's API installation directory
3. Replace the existing `wms-api.exe`

### Step 4: Start the API Server

```batch
# Option 1: If running as service
net start WmsApiService

# Option 2: If running manually
start-server.bat

# Option 3: Run directly
wms-api.exe
```

### Step 5: Verify Deployment

1. **Health Check:**
   ```
   GET http://localhost:3000/health
   ```
   Should return: `{"ok": true, "status": "healthy"}`

2. **Test Putaway Endpoint:**
   ```
   POST http://localhost:3000/api/putaway/scan-transfer-carton
   ```
   Should not return duplicate entry errors

3. **Check Logs:**
   - Verify no errors in console/logs
   - Check that API starts successfully

---

## 📊 Database Migrations (If Required)

If the client database hasn't been updated, run these migrations:

### 1. Stock Ledger qty_before and qty_reduced

```bash
cd wms-api
node add-qty-before-reduced-to-stock-ledger.js
```

### 2. Material Request Item Status

```bash
cd wms-api
node add-status-column-to-material-request-item.js
```

### 3. Transfer Carton dispatched_by Column

```bash
cd wms-api
node add-dispatched-by-column.js
```

**Note:** These migrations are idempotent (safe to run multiple times).

---

## ✅ Testing Checklist

After deployment, verify the following:

### 1. Putaway Task Duplicate Entry Fix

- [ ] Mobile app can send `putaway_task` parameter without errors
- [ ] No duplicate entry errors in logs
- [ ] Existing tasks are reused correctly

### 2. Stock Ledger Pagination

```
GET /api/stock-ledger?page=1&page_size=100&from_date=2026-01-01&to_date=2026-01-31&item_code=SKU
```

- [ ] Returns paginated response with `data` and `pagination` objects
- [ ] Date range filtering works
- [ ] Item code search works

### 3. Stock Ledger qty_before and qty_reduced

```
GET /api/stock-ledger
```

- [ ] Responses include `qty_before` and `qty_reduced` fields
- [ ] Fields are populated after dispatch operations

### 4. Transfer Carton Dispatch

```
POST /api/transfer-cartons/:tc_id/dispatch
```

- [ ] Stock is reduced from stock ledger
- [ ] `qty_before` and `qty_reduced` are populated
- [ ] Stock transactions are created

### 5. Material Request Status

```
GET /api/material-requests
```

- [ ] Item statuses are returned correctly
- [ ] Header status is derived from item statuses
- [ ] Status updates work correctly

---

## 📝 Important Notes

1. **Only `wms-api.exe` needs to be updated** - All other files are optional
2. **Keep existing `.env` file** - Don't overwrite client's configuration
3. **Scripts are optional** - Client can keep existing batch files
4. **Database migrations** - Run only if database hasn't been updated
5. **Backup recommended** - Always backup before replacing executable

---

## 🆘 Troubleshooting

### Issue: API won't start

**Solution:**
- Check if port 3000 is available
- Verify `.env` file exists and has correct database credentials
- Check Windows Event Viewer for errors

### Issue: Database connection errors

**Solution:**
- Verify database credentials in `.env` file
- Check if MySQL service is running
- Verify network connectivity to database server

### Issue: Duplicate entry errors still occurring

**Solution:**
- Ensure `wms-api.exe` was replaced correctly
- Restart the API server
- Check logs for specific error details

### Issue: Stock not reducing after dispatch

**Solution:**
- Verify database migrations have been run
- Check `tabStockLedger` has `qty_before` and `qty_reduced` columns
- Verify dispatch endpoint is being called correctly

---

## 📞 Support

If you encounter any issues during deployment:

1. Check the API logs for error messages
2. Verify all database migrations have been run
3. Ensure the `.env` file has correct configuration
4. Contact support with:
   - Error messages from logs
   - API version from `VERSION.txt`
   - Database schema version

---

## 📦 Package Summary

| Component | Status | Action Required |
|-----------|--------|-----------------|
| `wms-api.exe` | ✅ Ready | Replace on client |
| `.env.template` | ✅ Ready | Optional |
| Scripts | ✅ Ready | Optional |
| Documentation | ✅ Ready | Optional |
| Database Migrations | ⚠️ Check | Run if needed |

---

**Deployment Package Created:** 2026-01-04  
**Package Location:** `wms-api/deployment/`  
**Status:** ✅ **READY FOR DEPLOYMENT**

---

## 🎯 Quick Deployment Command

For quick deployment, use the update script:

```batch
# On client machine, in API installation directory:
update.bat
```

This will:
1. Stop the API server
2. Backup existing executable
3. Replace with new executable
4. Start the API server

**Note:** Ensure the new `wms-api.exe` is in the same directory before running `update.bat`.

