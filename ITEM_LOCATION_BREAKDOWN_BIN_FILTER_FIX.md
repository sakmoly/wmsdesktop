# Item Location Breakdown - Bin Location Filter Fix

## Issue

**Problem:** When scanning a bin location (e.g., `A1-R01-L4-B1`) in the relocation flow, the API returns ALL bin locations where the item has stock, not just the scanned bin. The log shows `sample_bin: "A1-R01-L3-B1"` (first bin in results) instead of the scanned bin.

**Root Cause:** The API endpoint `/api/stock-ledger/:item_code/:warehouse` returns all bin locations where the item exists, without filtering by the scanned bin location.

---

## Solution

Added optional `bin_location` query parameter to filter results to only the scanned bin location.

### API Endpoint

**Before:**
```
GET /api/stock-ledger/:item_code/:warehouse
GET /api/stock/item/:item_code/warehouse/:warehouse
```

**After (with filter):**
```
GET /api/stock-ledger/:item_code/:warehouse?bin_location=A1-R01-L4-B1
GET /api/stock/item/:item_code/warehouse/:warehouse?bin_location=A1-R01-L4-B1
```

---

## Changes Made

### 1. Added `bin_location` Query Parameter Support

**File:** `wms-api/src/modules/stock-ledger/stockLedgerController.js`

**Function:** `getStockLedgerByItem`

**Changes:**
1. Extract `bin_location` from `req.query`
2. Resolve `bin_location` to full location_id using `resolveFullLocationId` helper
3. Filter `tabStockLedger` query by `bin_location` if provided
4. Filter `tabCartonStock` query by `bin_location` if provided
5. Filter results after location resolution to handle format variations
6. Enhanced logging to include `bin_location_filter` and `normalized_bin_location`

---

## Usage

### Mobile App - Relocation Flow

**When user scans a bin location:**

```typescript
// User scans: A1-R01-L4-B1
const scannedBin = "A1-R01-L4-B1";

// Get items at this specific bin location
const response = await api.get(
  `/api/stock-ledger/${itemCode}/${warehouse}?bin_location=${scannedBin}`
);

// Response will only include items at A1-R01-L4-B1
```

**Example Request:**
```http
GET /api/stock-ledger/SKU-HAT-301-GRN-OS/WH-MAIN?bin_location=A1-R01-L4-B1
Authorization: Bearer <token>
```

**Example Response:**
```json
[
  {
    "item_code": "SKU-HAT-301-GRN-OS",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R01-L4-B1",
    "cartons": [
      {
        "carton_id": "CTN-001",
        "qty": 10.00
      }
    ],
    "total_qty": 10.00,
    "reserved_qty": 0.00,
    "available_qty": 10.00
  }
]
```

---

## Behavior

### Without `bin_location` Parameter (Default)

Returns ALL bin locations where the item has stock:
```http
GET /api/stock-ledger/SKU-HAT-301-GRN-OS/WH-MAIN
```

**Response:** All bins (e.g., `A1-R01-L3-B1`, `A1-R01-L4-B1`, `A1-R02-L1-B2`)

### With `bin_location` Parameter

Returns ONLY the specified bin location:
```http
GET /api/stock-ledger/SKU-HAT-301-GRN-OS/WH-MAIN?bin_location=A1-R01-L4-B1
```

**Response:** Only `A1-R01-L4-B1` (if item exists at that bin)

---

## Location Resolution

The API handles different bin location formats:

1. **Full Format:** `A1-R01-L4-B1` → Matches exactly
2. **Old Format:** `Rack 01-B1` → Resolved to full format
3. **Partial Match:** `R01-L4-B1` → Resolved to full format

The filter works with both the original scanned format and the resolved full location_id.

---

## Logging

Enhanced logging now includes:

```javascript
{
  "item_code": "SKU-HAT-301-GRN-OS",
  "warehouse": "WH-MAIN",
  "normalized_warehouse": "WH-MAIN",
  "bin_location_filter": "A1-R01-L4-B1",        // ✅ NEW: Scanned bin
  "normalized_bin_location": "A1-R01-L4-B1",    // ✅ NEW: Resolved location
  "format": "flat",
  "grouped_count": 1,
  "flat_count": 1,
  "sample_bin": "A1-R01-L4-B1"                  // ✅ Now matches scanned bin
}
```

---

## Mobile App Integration

### Relocation "Scan From Bin" Screen

**Current Flow:**
1. User scans bin location: `A1-R01-L4-B1`
2. Mobile app calls: `GET /api/stock-ledger/:item_code/:warehouse`
3. API returns ALL bins → Mobile app filters client-side

**Recommended Flow:**
1. User scans bin location: `A1-R01-L4-B1`
2. Mobile app calls: `GET /api/stock-ledger/:item_code/:warehouse?bin_location=A1-R01-L4-B1`
3. API returns ONLY scanned bin → No client-side filtering needed

**Code Example:**
```typescript
// RelocationScanFromBinScreen.tsx
const handleBinScanned = async (scannedBin: string) => {
  // Store scanned bin
  setFromBin(scannedBin);
  
  // Get items at this specific bin
  const response = await api.get(
    `/api/stock-ledger/${itemCode}/${warehouse}?bin_location=${scannedBin}`
  );
  
  if (response.ok && response.data) {
    // Response only contains items at scannedBin
    setItemsAtBin(response.data);
  }
};
```

---

## Testing

### Test 1: Without Filter (All Bins)
```bash
curl "http://192.168.1.2:3000/api/stock-ledger/SKU-HAT-301-GRN-OS/WH-MAIN" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Returns all bins where item exists

### Test 2: With Filter (Specific Bin)
```bash
curl "http://192.168.1.2:3000/api/stock-ledger/SKU-HAT-301-GRN-OS/WH-MAIN?bin_location=A1-R01-L4-B1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Returns only `A1-R01-L4-B1` if item exists there

### Test 3: With Filter (Non-Existent Bin)
```bash
curl "http://192.168.1.2:3000/api/stock-ledger/SKU-HAT-301-GRN-OS/WH-MAIN?bin_location=A1-R99-L9-B9" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** Returns empty array `[]`

---

## Backward Compatibility

✅ **Fully Backward Compatible**

- If `bin_location` parameter is not provided, API behaves exactly as before (returns all bins)
- Existing mobile app code will continue to work without changes
- New mobile app code can optionally use the filter for better performance

---

## Summary

**Problem:** API returned all bins, log showed first bin instead of scanned bin

**Solution:** Added optional `bin_location` query parameter to filter results

**Result:** 
- ✅ API can now filter by specific bin location
- ✅ Log shows correct scanned bin when filter is used
- ✅ Mobile app can get items at specific bin without client-side filtering
- ✅ Fully backward compatible
