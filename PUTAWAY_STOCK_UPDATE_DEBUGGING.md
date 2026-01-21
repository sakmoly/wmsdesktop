# Putaway Stock Update - Debugging Guide

**Date**: 2026-01-20  
**Status**: 🔍 **DEBUGGING**

---

## 🚨 Current Issue

**Problem**: Stock, ledger, and transaction history are not updating after Transfer In Putaway.

**User Logs Show**:
- ✅ Transfer In receiving happening
- ✅ Putaway tasks being created (`PUT-20260120-0001`)
- ✅ Boxes being validated
- ❌ **NO location scanning logs** (missing `[Putaway Scan]` or `[Putaway] Updating X line(s) with location`)
- ❌ **NO stock update logs** (missing `[Putaway Completion] Processing putaway task`)

---

## 🔍 Root Cause Analysis

### Stock Updates Only Trigger When:

1. **Location is scanned** via `POST /api/putaway/scan-transfer-carton` with `location_id`
2. **Location update code path executes** (updates putaway lines)
3. **Stock update trigger executes** (calls `processPutawayCompletionEvent`)

### Current Situation:

**The logs show NO location scanning happening!**

The user's logs only show:
- Receiving items (`TRANSFER_IN_RECEIVE` events)
- Creating putaway tasks
- Validating boxes

But they **don't show**:
- `[Putaway Scan] Entry: location_id=...` ← **MISSING**
- `[Putaway] Updating X line(s) with location...` ← **MISSING**
- `[Putaway] Triggering stock updates...` ← **MISSING**
- `[Putaway Completion] Processing putaway task...` ← **MISSING**

---

## ✅ Solution: Added Debug Logging

### Changes Made:

**File**: `wms-api/src/modules/putaway/putawayController.js`

1. **Entry Point Logging** (Line ~3890):
   ```javascript
   logger.info(`[Putaway Scan] Entry: location_id=${location_id || 'NULL'}, box_id=${box_id || 'NULL'}, ...`);
   ```

2. **Location Update Path Logging** (Line ~4368):
   ```javascript
   logger.info(`[Putaway Scan] Checking location update path: taskTitleToCheck=${taskTitleToCheck || 'NULL'}, location_id=${location_id || 'NULL'}`);
   if (taskTitleToCheck && location_id) {
     logger.info(`[Putaway Scan] ✅ Location update path triggered: task=${taskTitleToCheck}, location=${location_id}`);
   }
   ```

---

## 🧪 How to Debug

### Step 1: Check if Location Scan Endpoint is Being Called

**Look for this log**:
```
[Putaway Scan] Entry: location_id=A1-R02-L1-B2, box_id=CTN-TI-..., ...
```

**If this log is MISSING**:
- ❌ Mobile app is **NOT calling** `POST /api/putaway/scan-transfer-carton` with `location_id`
- ✅ **Fix**: Update mobile app to scan location and call the endpoint

**If this log EXISTS but location_id is NULL**:
- ❌ Mobile app is calling endpoint but **not sending `location_id`**
- ✅ **Fix**: Update mobile app to include `location_id` in request

---

### Step 2: Check if Location Update Path is Triggered

**Look for this log**:
```
[Putaway Scan] ✅ Location update path triggered: task=PUT-20260120-0001, location=A1-R02-L1-B2
```

**If this log is MISSING**:
- ❌ Either `taskTitleToCheck` is NULL or `location_id` is NULL
- ✅ **Check**: Verify putaway task is found and location_id is provided

---

### Step 3: Check if Stock Updates are Triggered

**Look for these logs**:
```
[Putaway] Updating 2 line(s) with location: location_id=A1-R02-L1-B2, ...
[Putaway] Triggering stock updates for putaway task PUT-20260120-0001 after location assignment
[Putaway Completion] Processing putaway task: PUT-20260120-0001
[Putaway Completion] ✅ Successfully completed putaway task PUT-20260120-0001
```

**If these logs are MISSING**:
- ❌ Stock update code path is not executing
- ✅ **Check**: Look for errors in logs

---

## 📋 Expected Flow

### Complete Flow (What Should Happen):

1. **Receive Items**:
   ```
   ✅ Inserted event: TRANSFER_IN_RECEIVE
   ✅ Created carton CTN-TI-123457-20260120-231212-575
   ✅ Updated carton line: SKU-HAT-301-BLU-OS
   ```

2. **Create Putaway Task**:
   ```
   ✅ Created Putaway Task PUT-20260120-0001 for Transfer In INSLIP-123457
   ```

3. **Validate Box** (Optional):
   ```
   [Validate Carton] ✅ Box CTN-TI-123457-20260120-231212-575 validated and ready for putaway
   ```

4. **Scan Location** (REQUIRED FOR STOCK UPDATES):
   ```
   [Putaway Scan] Entry: location_id=A1-R02-L1-B2, box_id=CTN-TI-123457-20260120-231212-575
   [Putaway Scan] ✅ Location update path triggered: task=PUT-20260120-0001, location=A1-R02-L1-B2
   [Putaway] Updating 2 line(s) with location: location_id=A1-R02-L1-B2
   [Putaway] Triggering stock updates for putaway task PUT-20260120-0001
   [Putaway Completion] Processing putaway task: PUT-20260120-0001
   [Putaway Completion] Found 2 putaway line(s) for task PUT-20260120-0001
   [Putaway Completion] Processing stock update for line: item=SKU-HAT-301-BLU-OS, qty=2, toLocation=A1-R02-L1-B2
   [Putaway Completion] ✅ Successfully completed putaway task PUT-20260120-0001
   [Putaway] ✅ Stock updates triggered for putaway task PUT-20260120-0001
   ```

---

## 🚨 Current User Logs Analysis

**What User Logs Show**:
- ✅ Steps 1-3 (Receiving, Creating Task, Validating)
- ❌ **Step 4 is MISSING** (No location scanning)

**Conclusion**:
- The user needs to **scan a location** for the putaway task
- Stock updates will only happen **after** location is scanned
- The mobile app may not be calling the location scan endpoint

---

## 🔧 Next Steps

1. **Restart Backend Server**: For new logging to take effect

2. **Test Location Scan**:
   - Open mobile app
   - Select putaway task `PUT-20260120-0001`
   - **Scan a location barcode** (e.g., `A1-R02-L1-B2`)
   - Check logs for:
     - `[Putaway Scan] Entry: location_id=...`
     - `[Putaway] Updating X line(s) with location...`
     - `[Putaway Completion] Processing putaway task...`

3. **If Location Scan Logs Don't Appear**:
   - Mobile app is not calling the endpoint
   - Check mobile app code to ensure it calls `POST /api/putaway/scan-transfer-carton` with `location_id`

4. **If Location Scan Logs Appear But Stock Updates Don't**:
   - Check for errors in logs
   - Verify `processPutawayCompletionEvent` is being called
   - Check database for stock ledger updates

---

## 📝 Summary

**Issue**: Stock updates not happening

**Root Cause**: Location scanning step is missing from the workflow

**Solution**: 
1. ✅ Added debug logging to track location scan calls
2. ⚠️ User needs to **scan location** for putaway task
3. ⚠️ Mobile app may need to be updated to call location scan endpoint

**Action Required**:
- Scan a location for putaway task `PUT-20260120-0001`
- Check logs for new debug messages
- Verify stock updates happen after location scan

---

**END**
