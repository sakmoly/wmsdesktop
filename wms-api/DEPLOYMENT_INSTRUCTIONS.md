# WMS API Server - Deployment Instructions

## ✅ Deployment Package Created Successfully!

Your new deployment package is ready in: `wms-api/deployment/`

---

## 📦 What Was Created

The deployment package includes:

- ✅ **wms-api.exe** - Standalone executable (no Node.js required)
- ✅ **.env.template** - Configuration template
- ✅ **README.txt** - User documentation
- ✅ **install.bat** - First-time installation script
- ✅ **start-server.bat** - Start server script
- ✅ **stop-server.bat** - Stop server script
- ✅ **setup-firewall.bat** - Configure Windows Firewall
- ✅ **update.bat** - Update existing installation
- ✅ **install-service.bat** - Install as Windows Service
- ✅ **uninstall-service.bat** - Remove Windows Service
- ✅ **start-hidden.vbs** - Start in background (hidden window)
- ✅ **VERSION.txt** - Build version information

---

## 🚀 Quick Deployment Steps

### For New Installation:

1. **Copy the `deployment/` folder** to the target machine
2. **Run `install.bat`** - Creates `.env` file from template
3. **Edit `.env` file** with your database credentials
4. **Run `start-server.bat`** - Starts the server
5. **Verify:** Open http://localhost:3000/health

### For Update:

1. **Stop the server** (if running)
2. **Backup `.env` file** (important!)
3. **Replace `wms-api.exe`** with new version
4. **Keep existing `.env` file** (don't overwrite)
5. **Restart server**

---

## 📋 Configuration (.env file)

Required settings in `.env`:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_database_name

# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Security
JWT_SECRET=your_secure_jwt_secret_key_change_this

# Logging
Error_log=1          # Enable error logging (recommended: 1)
Detailed_log=0       # Production: 0, Debugging: 1
```

---

## 🌐 Network Access

The server binds to `0.0.0.0:3000` by default, making it accessible on your network.

**To allow network access:**
1. Run `setup-firewall.bat` as Administrator
2. Find server IP: `ipconfig` (Windows)
3. Access from other devices: `http://YOUR_IP:3000/health`

**Desktop App Configuration:**
- Update API Endpoint URL: `http://YOUR_IP:3000/api`

---

## 🔧 Running as Windows Service (Production)

For production environments:

1. Run `install-service.bat` as Administrator
2. Service name: `WMS-API`
3. Starts automatically on boot
4. Manage via Windows Services or:
   - Start: `net start WMS-API`
   - Stop: `net stop WMS-API`

---

## 📊 Logging

Logs are saved to `log/` directory:
- **Error logs:** `log/Error_log/error_YYYY-MM-DD.log`
- **Detailed logs:** `log/detailed_YYYY-MM-DD.log`

**Configuration:**
- `Error_log=1` - Always recommended (enabled)
- `Detailed_log=0` - Production (disabled)
- `Detailed_log=1` - Debugging (enabled)

---

## ✅ Verification

After deployment, verify the server is running:

1. **Health Check:**
   ```
   http://localhost:3000/health
   ```
   Expected: `{"status":"ok","message":"WMS API Server is running"}`

2. **API Endpoint:**
   ```
   http://localhost:3000/api
   ```
   Expected: API documentation or endpoint list

3. **Check Logs:**
   - Check `log/Error_log/` for any errors
   - Check console output for startup messages

---

## 🔍 Troubleshooting

### Server Won't Start
- Check `.env` file exists and is valid
- Run from command line to see error messages
- Verify database is running and accessible

### Port Already in Use
- Change `PORT` in `.env` file
- Or stop conflicting service

### Database Connection Failed
- Verify database credentials in `.env`
- Test connection from server machine
- Check database user permissions

### Network Access Denied
- Run `setup-firewall.bat` as Administrator
- Verify `HOST=0.0.0.0` in `.env`
- Check Windows Firewall settings

---

## 📝 Next Steps

1. ✅ Deployment package is ready in `wms-api/deployment/`
2. ✅ Copy to target machine
3. ✅ Run `install.bat` to configure
4. ✅ Edit `.env` with database settings
5. ✅ Start server with `start-server.bat`
6. ✅ Verify: http://localhost:3000/health

---

## 📦 Distribution

**To distribute to client:**
1. ZIP the `deployment/` folder
2. Send to client
3. Client extracts and runs `install.bat`
4. Client configures `.env` file
5. Client starts server

**Important:** Do NOT include `.env` file in distribution (contains sensitive data)

---

## 🎉 Deployment Complete!

Your API server deployment package is ready for distribution!

**Location:** `wms-api/deployment/`

**Next:** Copy this folder to your target machine and follow the installation steps above.
