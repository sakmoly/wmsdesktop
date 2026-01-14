# Expected Qty & Bin Master Data Fix

## 🔍 Issue Summary

1. **Mobile app shows "Exp: 2"** (expected quantity) in UI
2. **Backend shows `expected_qty = 0`** in database
3. **Mobile app error: "No Bin Master Data"** - prevents proper bin validation

## ✅ Root Causes

### Issue 1: Backend Not Accepting expected_qty from Mobile App
- **Problem**: Backend was ignoring `expected_qty` from mobile app request
- **Location**: `wms-api/src/modules/cycle-count/cycleCountController.js` (line 1263)
- **Fix**: Modified `/count` endpoint to accept `expected_qty` from request with priority fallback

### Issue 2: Missing Bin Master Data in Mobile App
- **Problem**: Mobile app doesn't have bin/location master data in local database
- **Impact**: Without bin master data, mobile app cannot:
  - Validate bin codes when scanning
  - Properly send `bin_location` in requests
  - Associate items with correct locations
- **Solution**: Mobile app needs to sync bin master data using `/api/master/bin-master` endpoint

## 🔧 Fixes Applied

### Fix 1: Backend Accepts expected_qty from Mobile App

**Changed Logic:**
```javascript
// OLD (Line 1263):
const expectedQty = 0; // Always 0 - don't accept from request

// NEW:
// Priority 1: Accept expected_qty from request if provided
if (line.expected_qty !== undefined && line.expected_qty !== null) {
  const parsedExpectedQty = parseFloat(line.expected_qty);
  if (!isNaN(parsedExpectedQty) && parsedExpectedQty >= 0) {
    expectedQty = parsedExpectedQty;
  }
}

// Priority 2: Use existing line's expected_qty if not provided
// Priority 3: Lookup from stock ledger/carton stock
// Priority 4: Default to 0 (opening stock scenario)
```

**Added Helper Function:**
```javascript
async function lookupExpectedQtyFromStock(connection, itemCode, binLocation, cartonId = null, warehouse = null)
```
- Looks up `expected_qty` from `tabCartonStock` (carton-level) or `tabStockLedger` (bin-level)
- Returns 0 if not found (opening stock scenario)

**Updated INSERT Query:**
```javascript
// Now uses expectedQty value instead of always 0
INSERT INTO tabCycleCountLine 
  (parent_title, item_code, bin_location, carton_id, expected_qty, status)
VALUES (?, ?, ?, ?, ?, 'Pending')
//                           ↑ Uses actual expectedQty value
```

**Updated UPDATE Query:**
```javascript
// Updates expected_qty if existing value is 0 or NULL and we have a value
if (shouldUpdateExpectedQty) {
  updateQuery += `, expected_qty = ?`;
  updateParams.push(expectedQty);
}
```

### Fix 2: Bin Master Data Sync Endpoint

**Backend Endpoint:** `GET /api/master/bin-master`
- **Source**: `tabLocation` table (single source of truth)
- **Response Format**:
```json
[
  {
    "location_id": "A1-R01-L1-B1",
    "bin_code": "A1-R01-L1-B1",
    "warehouse": "WH-MAIN",
    "zone": "ZONE-A",
    "aisle": "A1",
    "parent_rack": "R01",
    "rack": "R01",
    "level": "L1",
    "bin_id": "B1",
    "location_type": "Storage",
    "is_available": true,
    "capacity_volume_weight": 1000.00,
    "created_at": "2025-01-20T10:30:00.000Z",
    "updated_at": "2025-01-20T10:30:00.000Z"
  }
]
```

## 📋 Priority Order for expected_qty

1. **From Mobile App Request** (if `expected_qty` is provided in request body)
2. **From Existing Line** (if line already exists and has `expected_qty > 0`)
3. **Lookup from Stock Ledger** (if `bin_location` and `item_code` are available)
   - Checks `tabCartonStock` first (if `carton_id` provided)
   - Falls back to `tabStockLedger` (bin-level)
4. **Default to 0** (opening stock scenario)

## 🧪 Testing Steps

### Step 1: Verify Bin Master Data Sync
```bash
# Test the endpoint (requires authentication)
GET /api/master/bin-master
Authorization: Bearer <token>

# Expected: Returns array of all bin/location master data from tabLocation
```

### Step 2: Mobile App Should Sync Bin Master Data
1. Open mobile app
2. Tap "Sync" button (top right)
3. Select "Sync Bin Master Data" or similar option
4. Verify all bins are synced to local database
5. Check that error "No Bin Master Data" disappears

### Step 3: Test expected_qty with Bin Master Data Synced
1. Create a cycle count task
2. Scan a bin code (should validate against synced bin master data)
3. Scan an item barcode
4. Mobile app should show "Exp: 2" (from stock ledger lookup)
5. Enter actual quantity: 3
6. Submit count data

**Expected Request:**
```json
{
  "counted_by": "USER-001",
  "lines": [
    {
      "item_code": "SKU-SHIRT-001-WHT-M",
      "barcode": "SKU-SHIRT-001-WHT-M",
      "bin_location": "A1-R01-L2-B1",
      "carton_id": "CTN-001",
      "expected_qty": 2,  // ← Should be sent from mobile app
      "actual_qty": 3,
      "counted_qty": 3
    }
  ]
}
```

**Expected Backend Behavior:**
- Accepts `expected_qty: 2` from request ✅
- Saves to database: `expected_qty = 2` ✅
- Calculates discrepancy: `discrepancy = 3 - 2 = 1` ✅
- Desktop app shows: `Expected Qty: 2.00`, `Discrepancy: 1.00` ✅

## 🔗 Related Issues

- **Without bin master data**: Mobile app cannot validate bin codes, leading to:
  - Invalid `bin_location` values
  - Backend unable to lookup `expected_qty` from stock ledger
  - Incorrect cycle count data

## 📝 Files Modified

1. `wms-api/src/modules/cycle-count/cycleCountController.js`
   - Added `lookupExpectedQtyFromStock()` helper function
   - Modified `/count` endpoint to accept `expected_qty` from request
   - Updated INSERT query to use `expectedQty` value
   - Updated UPDATE query to update `expected_qty` when needed

2. `wms-api/src/modules/master/masterController.js` (already exists)
   - `getBinMaster()` - Returns all bin/location master data from `tabLocation`
   - `getBinByCode()` - Returns specific bin by code

## ✅ Verification Checklist

- [x] Backend accepts `expected_qty` from mobile app request
- [x] Backend looks up `expected_qty` from stock ledger if not provided
- [x] Backend uses existing line's `expected_qty` if available
- [x] Backend defaults to 0 if no `expected_qty` found (opening stock)
- [x] Bin master data endpoint exists and returns data from `tabLocation`
- [ ] Mobile app syncs bin master data successfully (needs mobile app testing)
- [ ] Mobile app sends `expected_qty` in count request (needs mobile app testing)
- [ ] Desktop app displays correct `expected_qty` values (needs testing)

## 🚀 Next Steps

1. **Restart API Server** to apply changes
2. **Mobile App**: Sync bin master data using Sync button
3. **Test Cycle Count**: Verify `expected_qty` is saved correctly
4. **Desktop App**: Verify `expected_qty` displays correctly

---

**Status**: ✅ Backend fixes completed. Mobile app needs to sync bin master data.
