# Mobile App Location Validation Error - Troubleshooting Guide

## 🔍 Issues Identified

Based on the error screenshots, there are **two separate issues**:

1. **Location Validation Error**: "Unable to validate location 'A1-R02-L2-B2' against backend"
2. **Bundle Loading Error**: "Error syncing locations: LoadBundleFromServerRequestError: Could not load bundle"

---

## Issue 1: Location Validation Error

### Error Message
```
Validation Error
Unable to validate location "A1-R02-L2-B2" against backend.
Please ensure the location exists in the location master data (tablocation table).
```

### Root Cause

The location `A1-R02-L2-B2` **does not exist** in the `tabLocation` table in the backend database.

### How Location Validation Works

1. **Mobile app** calls `POST /api/putaway/scan-transfer-carton` with `location_id: "A1-R02-L2-B2"`
2. **Backend** validates the location using `lookupLocationFromId()` function
3. **Backend** queries `tabLocation` table:
   ```sql
   SELECT location_id, parent_rack, bin_id, is_available, zone, aisle, level
   FROM tabLocation 
   WHERE location_id = 'A1-R02-L2-B2'
   ```
4. **If location not found**, backend returns:
   ```json
   {
     "ok": false,
     "error": {
       "code": "LOCATION_NOT_FOUND",
       "message": "Location ID \"A1-R02-L2-B2\" not found or not available"
     }
   }
   ```

### Solutions

#### Solution 1: Verify Location Exists in Database

**Check if location exists:**
```sql
SELECT * FROM tabLocation WHERE location_id = 'A1-R02-L2-B2';
```

**If location doesn't exist, create it:**
```sql
INSERT INTO tabLocation (
  location_id,
  warehouse,
  zone,
  aisle,
  parent_rack,
  level,
  bin_id,
  location_type,
  is_available,
  created_at,
  updated_at
) VALUES (
  'A1-R02-L2-B2',
  'WH-MAIN',  -- Adjust warehouse as needed
  'A1',       -- Zone
  NULL,       -- Aisle (optional)
  'R02',      -- Parent rack
  'L2',       -- Level
  'B2',       -- Bin ID
  'STORAGE',  -- Location type
  TRUE,       -- Is available
  NOW(),
  NOW()
);
```

#### Solution 2: Check Location Sync Status

The mobile app should sync locations from the backend using:
- **Endpoint**: `GET /api/master/bin-master`
- **Purpose**: Fetches all locations from `tabLocation` table

**Verify backend returns the location:**
```bash
curl -X GET "http://your-api-url/api/master/bin-master" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.[] | select(.location_id == "A1-R02-L2-B2")'
```

**If location is missing from sync:**
1. Check if location exists in database (Solution 1)
2. Verify mobile app successfully synced locations
3. Check mobile app's local database/cache for synced locations

#### Solution 3: Check Location Availability

Even if the location exists, it might be marked as unavailable:

```sql
SELECT location_id, is_available 
FROM tabLocation 
WHERE location_id = 'A1-R02-L2-B2';
```

**If `is_available = FALSE`, update it:**
```sql
UPDATE tabLocation 
SET is_available = TRUE 
WHERE location_id = 'A1-R02-L2-B2';
```

---

## Issue 2: Bundle Loading Error

### Error Message
```
Error syncing locations: LoadBundleFromServerRequestError: Could not load bundle
```

### Root Cause

This is a **React Native/Metro bundler error**, NOT a backend API issue. The mobile app is trying to load JavaScript code from a development server, but the bundle cannot be loaded.

### Common Causes

1. **Metro bundler not running**
   - Development server is not started
   - Server crashed or stopped

2. **Network connectivity issues**
   - Device cannot reach the Metro bundler server
   - Firewall blocking connection
   - Wrong IP address/port configured

3. **Bundle build failure**
   - JavaScript syntax errors
   - Missing dependencies
   - Build process failed

4. **Cache issues**
   - Stale bundle cache
   - Corrupted cache files

### Solutions

#### Solution 1: Restart Metro Bundler

**For React Native:**
```bash
# Stop current Metro bundler (Ctrl+C)
# Clear cache and restart
npx react-native start --reset-cache
```

**For Expo:**
```bash
# Stop current Expo server
# Clear cache and restart
npx expo start --clear
```

#### Solution 2: Check Metro Bundler Connection

**Verify Metro bundler is running:**
- Check terminal for Metro bundler output
- Verify it's listening on the correct port (usually 8081)

**Check device can reach Metro server:**
- Ensure device and development machine are on same network
- Verify IP address in Metro bundler matches device configuration
- Test connection: Open `http://YOUR_IP:8081` in device browser

#### Solution 3: Clear App Cache

**Android:**
```bash
adb shell pm clear com.yourapp.package
# Or manually: Settings > Apps > Your App > Clear Data
```

**iOS:**
```bash
# Delete app and reinstall, or
# Xcode: Product > Clean Build Folder (Cmd+Shift+K)
```

#### Solution 4: Check Network Configuration

**Verify Metro bundler IP:**
```bash
# On development machine, find IP address
# Windows:
ipconfig
# Mac/Linux:
ifconfig
```

**Update Metro bundler to use correct IP:**
```bash
# Start Metro with specific IP
npx react-native start --host YOUR_IP_ADDRESS
```

**Or configure in `metro.config.js`:**
```javascript
module.exports = {
  server: {
    enhanceMiddleware: (middleware) => {
      return (req, res, next) => {
        // Allow connections from your network
        res.setHeader('Access-Control-Allow-Origin', '*');
        return middleware(req, res, next);
      };
    },
  },
};
```

#### Solution 5: Rebuild Bundle

**Clear all caches and rebuild:**
```bash
# React Native
rm -rf node_modules
npm install
npx react-native start --reset-cache

# In another terminal
npx react-native run-android
# or
npx react-native run-ios
```

---

## Diagnostic Steps

### Step 1: Verify Backend Location Data

```sql
-- Check if location exists
SELECT location_id, warehouse, is_available 
FROM tabLocation 
WHERE location_id = 'A1-R02-L2-B2';

-- List all locations in A1-R02 rack
SELECT location_id, level, bin_id, is_available
FROM tabLocation 
WHERE location_id LIKE 'A1-R02-%'
ORDER BY level, bin_id;
```

### Step 2: Test Backend API

```bash
# Test location validation endpoint
curl -X POST "http://your-api-url/api/putaway/scan-transfer-carton" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "location_id": "A1-R02-L2-B2",
    "putaway_task": "PUT-20260126-0001",
    "user_id": "sysadmin"
  }'
```

**Expected response if location exists:**
```json
{
  "ok": true,
  "message": "Validation successful",
  "validated": {
    "location_id": "A1-R02-L2-B2",
    "location": {
      "location_id": "A1-R02-L2-B2",
      "zone": "A1",
      "rack": "R02",
      "level": "L2",
      "bin": "B2"
    }
  }
}
```

**Expected response if location doesn't exist:**
```json
{
  "ok": false,
  "error": {
    "code": "LOCATION_NOT_FOUND",
    "message": "Location ID \"A1-R02-L2-B2\" not found or not available"
  }
}
```

### Step 3: Check Mobile App Sync

**Verify mobile app synced locations:**
1. Check mobile app's sync logs
2. Verify `GET /api/master/bin-master` was called successfully
3. Check mobile app's local database for synced locations

**Test sync endpoint:**
```bash
curl -X GET "http://your-api-url/api/master/bin-master" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq 'length'  # Should return number of locations
```

### Step 4: Check Metro Bundler Status

**Verify Metro bundler is running:**
- Check terminal for Metro output
- Look for "Metro waiting on port 8081" message
- Verify no errors in Metro bundler logs

**Test Metro bundler connection:**
```bash
# From device or emulator
curl http://YOUR_IP:8081/status
# Should return Metro bundler status
```

---

## Prevention

### For Location Validation Errors

1. **Ensure all locations are created in `tabLocation` table**
   - Use location master data import
   - Verify locations before use

2. **Regular location sync**
   - Mobile app should sync locations on startup
   - Implement periodic sync for new locations

3. **Location validation before use**
   - Validate location exists before allowing putaway
   - Show user-friendly error messages

### For Bundle Loading Errors

1. **Development environment setup**
   - Document Metro bundler startup process
   - Configure network settings properly
   - Use consistent IP addresses

2. **Error handling**
   - Implement retry logic for bundle loading
   - Show user-friendly error messages
   - Provide fallback to cached bundle

3. **Production builds**
   - Use production builds for testing
   - Avoid relying on Metro bundler in production

---

## Quick Fix Checklist

- [ ] **Location exists in database?**
  - [ ] Run SQL query to check
  - [ ] Create location if missing
  - [ ] Verify `is_available = TRUE`

- [ ] **Backend API working?**
  - [ ] Test `/api/putaway/scan-transfer-carton` endpoint
  - [ ] Test `/api/master/bin-master` endpoint
  - [ ] Check backend logs for errors

- [ ] **Mobile app synced locations?**
  - [ ] Check sync logs
  - [ ] Verify local database has locations
  - [ ] Re-sync if needed

- [ ] **Metro bundler running?**
  - [ ] Check Metro bundler terminal
  - [ ] Verify port 8081 is listening
  - [ ] Restart Metro with `--reset-cache`

- [ ] **Network connectivity?**
  - [ ] Device and dev machine on same network
  - [ ] IP address configured correctly
  - [ ] Firewall not blocking connection

---

## Related Files

- **Backend Location Validation**: `wms-api/src/modules/putaway/putawayController.js` (lines 5105-5155)
- **Location Master Endpoint**: `wms-api/src/modules/master/masterController.js` (lines 1260-1347)
- **API Reference**: `MOBILE_APP_API_REFERENCE.md`

---

## Support

If issues persist:
1. Check backend logs: `wms-api/log/detailed_*.log`
2. Check mobile app logs (React Native debugger or device logs)
3. Verify database state: `SELECT * FROM tabLocation WHERE location_id = 'A1-R02-L2-B2'`
4. Test API endpoints directly using curl or Postman
