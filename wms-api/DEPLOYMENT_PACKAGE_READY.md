# Deployment Package Ready

## ✅ Build Complete

The WMS API deployment package has been successfully created with all the latest changes.

## 📦 Package Location

**Directory:** `wms-api/deployment/`

## 📋 Package Contents

1. **wms-api.exe** - Main executable (includes all latest changes)
2. **.env.template** - Configuration template
3. **README.txt** - Documentation
4. **install.bat** - Installation script
5. **start-server.bat** - Start server script
6. **stop-server.bat** - Stop server script
7. **setup-firewall.bat** - Firewall setup script
8. **update.bat** - Update script
9. **VERSION.txt** - Version information
10. **install-service.bat** - Install as Windows Service
11. **uninstall-service.bat** - Remove Windows Service
12. **start-hidden.vbs** - Start in hidden window

## 🆕 Latest Changes Included

### 1. Transfer Carton Sealed Validation ✅
- Prevents adding items to sealed/dispatched/completed transfer cartons
- File: `wms-api/src/modules/events/eventController.js`

### 2. Mobile App Transfer Carton Contents Fix ✅
- Added Material Request fallback logic to `GET /api/transfer-cartons/:tc_id`
- Mobile app can now see items even when `tc_id` is not in events
- File: `wms-api/src/modules/transfer-cartons/transferCartonController.js`

### 3. Transfer Carton Dispatch - Stock Reduction ✅
- Stock is now reduced when Material Request transfer cartons are dispatched (not when sealed)
- File: `wms-api/src/modules/transfer-cartons/transferCartonController.js`

### 4. Time Window Fix for Material Request Events ✅
- Updated time window logic to look back 6 hours before TC creation
- Items packed before TC creation are now found correctly
- File: `wms-api/src/modules/transfer-cartons/transferCartonController.js`

## 🚀 Deployment Instructions

### For New Installation:

1. **Copy Deployment Folder**
   - Copy the entire `deployment/` folder to the target server
   
2. **Run Install Script**
   - Double-click `install.bat`
   - This will create `.env` file from template
   
3. **Configure Environment**
   - Edit `.env` file with your database credentials:
     - `DB_HOST` - Database host
     - `DB_PORT` - Database port (default: 3306)
     - `DB_USER` - Database user
     - `DB_PASSWORD` - Database password
     - `DB_NAME` - Database name
     - `JWT_SECRET` - JWT secret key (change from default)
   
4. **Setup Firewall** (Optional)
   - Run `setup-firewall.bat` as Administrator
   - This allows access from other devices on the network
   
5. **Start Server**
   - Double-click `start-server.bat`
   - Or run `wms-api.exe` directly
   
6. **Verify Installation**
   - Open browser: http://localhost:3000/health
   - Should see: `{"status":"ok","message":"WMS API Server is running"}`

### For Update/Upgrade:

1. **Stop Current Server**
   - Run `stop-server.bat`
   - Or close the running `wms-api.exe` process
   
2. **Backup Configuration**
   - Backup your `.env` file (if exists)
   
3. **Replace Executable**
   - Replace `wms-api.exe` with the new version
   - Keep your existing `.env` file
   
4. **Start Server**
   - Run `start-server.bat`
   - Or run `wms-api.exe` directly

## 📝 Configuration

Edit `.env` file to configure:

### Database Settings:
```
DB_HOST=192.168.103.219
DB_PORT=3306
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=wms_desktop
```

### Server Settings:
```
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
```

### Security:
```
JWT_SECRET=your_secret_key_change_this
```

### Logging:
```
Error_log=1          # Enable error logging (recommended)
Detailed_log=1       # Enable detailed logging (set to 0 for production)
```

## 🔍 Testing

After deployment, test the following:

1. **Health Check:**
   - GET http://localhost:3000/health
   - Expected: `{"status":"ok","message":"WMS API Server is running"}`

2. **Transfer Carton Contents:**
   - GET http://localhost:3000/api/transfer-cartons/:tc_id
   - Should return items even when `tc_id` not in events (Material Request)

3. **Sealed Carton Validation:**
   - Try to pack items into sealed transfer carton
   - Should be rejected with error message

4. **Dispatch Stock Reduction:**
   - Dispatch a Material Request transfer carton
   - Check Stock Ledger - stock should be reduced

## 📦 File Sizes

Check the deployment folder for file sizes. The executable is typically 40-60 MB (includes Node.js runtime).

## ⚠️ Important Notes

1. **Keep .env file secure** - Contains database credentials
2. **Change JWT_SECRET** - Don't use default in production
3. **Firewall** - Run `setup-firewall.bat` as Administrator if needed
4. **Backup** - Always backup `.env` before updating

## 📞 Support

For issues or questions, check the README.txt file in the deployment folder.

---

**Build Date:** 2026-01-04  
**Status:** ✅ Ready for Deployment

