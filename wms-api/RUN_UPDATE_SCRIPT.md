# Quick Guide: Running the Update Script

## The script is ready, but needs database credentials

The script `update-carton-merge-transactions.js` needs database connection information.

## Option 1: Create .env file (Recommended)

Create a file `wms-api/.env` with:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password_here
DB_NAME=wms_desktop
```

Replace `your_password_here` with your actual MySQL password.

## Option 2: Set Environment Variables

**Windows PowerShell:**
```powershell
$env:DB_HOST="localhost"
$env:DB_PORT="3306"
$env:DB_USER="root"
$env:DB_PASSWORD="your_password"
$env:DB_NAME="wms_desktop"
node wms-api/update-carton-merge-transactions.js --dry-run
```

**Windows CMD:**
```cmd
set DB_HOST=localhost
set DB_PORT=3306
set DB_USER=root
set DB_PASSWORD=your_password
set DB_NAME=wms_desktop
node wms-api/update-carton-merge-transactions.js --dry-run
```

## Option 3: Run with API Server Running

If your API server is already running and has database credentials configured, the script should use the same connection settings.

## Quick Test

1. **First, run with --dry-run to preview:**
   ```bash
   node wms-api/update-carton-merge-transactions.js --dry-run
   ```

2. **If preview looks good, run without --dry-run:**
   ```bash
   node wms-api/update-carton-merge-transactions.js
   ```

3. **Or update specific relocation session:**
   ```bash
   node wms-api/update-carton-merge-transactions.js --reference-doc=RL-20260124-123456
   ```

## What Database Name to Use?

Based on your system, the database name is likely: **`wms_desktop`**

You can verify by checking:
- Desktop app settings (WmsSettings.DatabaseName)
- API logs (shows "Database: wms_desktop")

## Need Help?

If you're not sure about your database credentials:
1. Check your desktop app database settings
2. Check if you have a `.env` file in `wms-api/` directory
3. Check your MySQL server configuration
