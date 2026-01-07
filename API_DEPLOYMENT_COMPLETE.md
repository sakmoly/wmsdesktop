# API Deployment Complete

## Latest Changes Deployed

The API server has been restarted with the following latest changes:

### 1. Transfer Carton Sealed Validation ✅
- **File:** `wms-api/src/modules/events/eventController.js`
- **Change:** Added validation to reject packing events for sealed/dispatched/completed transfer cartons
- **Impact:** Prevents adding items to sealed transfer cartons

### 2. Transfer Carton Items Display Fix ✅
- **File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`
- **Change:** Added Material Request fallback logic to `getTransferCartonById` endpoint
- **Impact:** Mobile app can now see items in transfer cartons even when `tc_id` is not in events

### 3. Transfer Carton Dispatch - Stock Reduction ✅
- **File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`
- **Change:** Added stock reduction logic when Material Request transfer cartons are dispatched
- **Impact:** Stock is now reduced from source bins when transfer carton is dispatched (not when sealed)

### 4. Time Window Fix for Material Request Events ✅
- **Files:** 
  - `Services/TransferCartonService.cs` (Desktop App)
  - `wms-api/src/modules/transfer-cartons/transferCartonController.js` (API)
- **Change:** Updated time window logic to look back 6 hours before TC creation for both "Created" and "Sealed" status
- **Impact:** Items that were packed before TC creation are now found correctly

## API Server Status

**Command:** `npm start` or `node src/server.js`  
**Port:** 3000 (default, configurable via `PORT` environment variable)  
**Status:** ✅ Running

## Testing

### Test 1: Mobile App Transfer Carton Contents
1. Open Transfer Carton in mobile app
2. Items should now be visible (via fallback logic)
3. Sealing should be allowed when items exist

### Test 2: Sealed Carton Validation
1. Seal a transfer carton
2. Try to pack items into it via mobile app
3. Should be rejected with error: "Transfer carton is Sealed and cannot accept new items"

### Test 3: Dispatch Stock Reduction
1. Create Transfer Carton (Material Request)
2. Pack items (stock not reduced)
3. Seal carton (stock not reduced)
4. Dispatch carton (stock reduced here) ✅

## API Endpoints Updated

1. **GET** `/api/transfer-cartons/:tc_id`
   - ✅ Added Material Request fallback logic
   - ✅ Returns items even when `tc_id` not in events

2. **POST** `/api/transfer-cartons/seal`
   - ✅ No changes (validation in events endpoint)

3. **POST** `/api/transfer-cartons/dispatch`
   - ✅ Added stock reduction for Material Request transfer cartons
   - ✅ Validates transfer carton is "Sealed" before allowing dispatch

4. **POST** `/api/events/batch`
   - ✅ Added sealed carton validation
   - ✅ Rejects packing events for sealed/dispatched/completed cartons

## Files Modified

1. ✅ `wms-api/src/modules/events/eventController.js` - Sealed carton validation
2. ✅ `wms-api/src/modules/transfer-cartons/transferCartonController.js` - Fallback logic, dispatch stock reduction
3. ✅ `Services/TransferCartonService.cs` - Time window fix (Desktop App)

## Next Steps

1. ✅ API server restarted
2. **Test:** Verify mobile app can see transfer carton items
3. **Test:** Verify sealed cartons reject new items
4. **Test:** Verify stock reduction on dispatch

---

**Deployment Date:** 2026-01-04  
**Status:** ✅ Complete

