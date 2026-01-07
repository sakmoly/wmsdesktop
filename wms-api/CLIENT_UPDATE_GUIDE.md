# Client Update Guide - Latest API Deployment

## ✅ Build Complete

The latest API deployment package has been built successfully with all recent changes.

## 📦 Deployment Package Location

**Path:** `wms-api/deployment/`

## 🆕 Latest Changes Included in This Build

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

### 2. Stock Ledger qty_before and qty_reduced ✅

- Added `qty_before` and `qty_reduced` fields to stock ledger responses
- These fields are populated during dispatch operations
- **File:** `wms-api/src/modules/stock-ledger/stockLedgerController.js`
- **File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

### 3. Material Request Status Management ✅

- Item-level status tracking in `tabMaterialRequestItem`
- Status updates: Pending → In Progress → Picked → Sealed
- Header status derived from item statuses
- **File:** `wms-api/src/modules/material-request/materialRequestController.js`

### 4. Transfer Carton Dispatch - Stock Reduction ✅

- Stock reduction occurs on dispatch (not seal)
- Updates `qty_before` and `qty_reduced` in stock ledger
- Creates stock transactions for audit trail
- **File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

### 5. Transfer Carton Sealed Validation ✅

- Prevents adding items to sealed/dispatched/completed transfer cartons
- **File:** `wms-api/src/modules/events/eventController.js`

### 6. Material Request Transfer Carton Support ✅

- Support for Material Request numbers in `to_no`/`transfer_order` field
- Fallback logic to find items when `tc_id` is missing
- Time window logic for event retrieval
- **File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

## 📋 Files to Update on Client Side

### **REQUIRED: Only ONE File Needs to be Updated**

#### 1. **wms-api.exe** ⚠️ **MUST UPDATE**

- **Location:** `deployment/wms-api.exe`
- **Action:** Replace the existing `wms-api.exe` on the client machine
- **Size:** ~50-70 MB (includes Node.js runtime)
- **Contains:** All latest API changes and bug fixes

### **OPTIONAL: Configuration Files (Only if Changed)**

#### 2. **.env.template** (Optional)

- **Location:** `deployment/.env.template`
- **Action:** Only update if new environment variables were added
- **Note:** Client's existing `.env` file should remain unchanged

#### 3. **README.txt** (Optional)

- **Location:** `deployment/README.txt`
- **Action:** Only update if you want the latest documentation
- **Note:** This is just documentation, not required for functionality

#### 4. **VERSION.txt** (Optional)

- **Location:** `deployment/VERSION.txt`
- **Action:** Only update if you want to track version numbers
- **Note:** This is informational only

### **NOT REQUIRED: Scripts (Keep Existing)**

The following files are **NOT** required to be updated (client can keep existing versions):

- `install.bat`
- `start-server.bat`
- `stop-server.bat`
- `setup-firewall.bat`
- `update.bat`
- `install-service.bat`
- `uninstall-service.bat`
- `start-hidden.vbs`

These scripts are utility files and don't affect API functionality.

## 🚀 Client Update Instructions

### **Method 1: Quick Update (Recommended)**

1. **Stop the API Server**

   ```batch
   # On client machine, run:
   stop-server.bat
   # Or close the running wms-api.exe process
   ```

2. **Backup Current Executable** (Optional but recommended)

   ```batch
   # Rename existing executable
   ren wms-api.exe wms-api.exe.backup
   ```

3. **Replace Executable**

   - Copy the new `wms-api.exe` from `deployment/` folder
   - Paste it into the client's API installation directory
   - Replace the existing `wms-api.exe`

4. **Start the API Server**

   ```batch
   start-server.bat
   # Or run wms-api.exe directly
   ```

5. **Verify Update**
   - Open browser: `http://localhost:3000/health`
   - Should see: `{"status":"ok","message":"WMS API Server is running"}`

### **Method 2: Using Update Script**

If the client has the `update.bat` script:

1. **Place new `wms-api.exe` in the same folder as `update.bat`**
2. **Run `update.bat`**
   - This script will:
     - Stop the current server
     - Backup the old executable
     - Replace with new executable
     - Start the server

## ⚠️ Important Notes

### **Database Changes**

Some features require database schema updates. Ensure the client has run these migrations:

1. **Stock Ledger qty_before and qty_reduced**

   - Migration: `wms-api/add-qty-before-reduced-to-stock-ledger.js`
   - Run: `node add-qty-before-reduced-to-stock-ledger.js`

2. **Material Request Item Status**

   - Migration: `wms-api/add-status-column-to-material-request-item.js`
   - Run: `node add-status-column-to-material-request-item.js`

3. **Transfer Carton dispatched_by**
   - Migration: `wms-api/add-dispatched-by-column.js`
   - Run: `node add-dispatched-by-column.js`

### **Configuration**

- **Keep existing `.env` file** - Don't overwrite it
- **No configuration changes required** for these updates
- **Database connection settings remain the same**

### **Backward Compatibility**

- ✅ API is backward compatible
- ✅ Existing mobile app will continue to work
- ✅ Desktop app will continue to work
- ✅ No breaking changes in API endpoints

## 🔍 Testing After Update

After updating, test these features:

1. **Stock Ledger Pagination**

   ```
   GET /api/stock-ledger?page=1&page_size=100&from_date=2026-01-01&to_date=2026-01-31&item_code=SKU
   ```

   - Should return paginated response with `data` and `pagination` objects

2. **Stock Ledger qty_before and qty_reduced**

   ```
   GET /api/stock-ledger
   ```

   - Check that responses include `qty_before` and `qty_reduced` fields

3. **Transfer Carton Dispatch**

   ```
   POST /api/transfer-cartons/:tc_id/dispatch
   ```

   - Stock should be reduced from stock ledger
   - `qty_before` and `qty_reduced` should be populated

4. **Material Request Status**
   ```
   GET /api/material-requests
   ```
   - Items should have `status` field (Pending, In Progress, Picked, Sealed)

## 📊 Summary

| File                   | Required?  | Action                          |
| ---------------------- | ---------- | ------------------------------- |
| `wms-api.exe`          | ✅ **YES** | Replace existing file           |
| `.env`                 | ❌ No      | Keep existing (don't overwrite) |
| Scripts (_.bat, _.vbs) | ❌ No      | Keep existing (optional update) |
| Documentation files    | ❌ No      | Optional update only            |

## 🎯 Quick Checklist

- [ ] Stop API server on client machine
- [ ] Backup existing `wms-api.exe` (optional)
- [ ] Copy new `wms-api.exe` to client machine
- [ ] Replace existing `wms-api.exe`
- [ ] Start API server
- [ ] Verify health endpoint: `http://localhost:3000/health`
- [ ] Test new features (pagination, stock ledger fields)

---

**Build Date:** 2026-01-04  
**Package Location:** `wms-api/deployment/`  
**Status:** ✅ Ready for Client Deployment
