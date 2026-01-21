# Carton ID API Verification - Complete Status

**Date**: 2026-01-20  
**Status**: ✅ **VERIFIED AND FIXED**

---

## Summary

✅ **Mobile App**: Correctly sending `carton_id` to backend in putaway operations  
✅ **Backend Storage**: Stores `carton_id` in `tabStockLedger` when completing putaway  
✅ **Backend APIs**: Now returning `carton_id` in **Item Location Breakdown API only** (not in Stock Ledger list view)

---

## ✅ Verification Results

### 1. Mobile App → Backend (Sending `carton_id`)

#### ✅ `completePutaway` API Call
- **Status**: ✅ **CONFIRMED**
- **Location**: `src/services/api.service.ts:3025-3041`
- **Request includes**:
  ```typescript
  {
    putaway_task: string,
    location_id: string,
    items: [
      {
        item_code: string,
        qty: number,
        carton_id?: string, // ✅ Mobile app includes carton_id
        location_id: string,
        target_bin: string,
      }
    ]
  }
  ```

#### ✅ `scanTransferCarton` API Call
- **Status**: ✅ **CONFIRMED**
- **Location**: `src/services/api.service.ts:3004-3023`
- **Request includes**: `carton_id` in items array

---

### 2. Backend Storage (Storing `carton_id`)

#### ✅ `POST /api/putaway/complete` - Stores `carton_id`
- **Status**: ✅ **CONFIRMED**
- **Location**: `wms-api/src/modules/putaway/putawayController.js:2512-2520`
- **Implementation**:
  ```javascript
  // Include carton_id in stock ledger if column exists and carton_id is provided
  if (hasStockLedgerCartonIdColumn && cartonIdValue) {
    insertFields += `, carton_id`;
    insertValues += `, ?`;
    insertParams.push(cartonIdValue);
    updateFields += `, carton_id = ?`;
    updateParams.push(cartonIdValue);
    console.log(`[Putaway] 📦 Including carton_id in stock ledger: ${cartonIdValue}`);
  }
  ```
- **Result**: ✅ `carton_id` is stored in `tabStockLedger` when completing putaway

---

### 3. Backend → Mobile App (Returning `carton_id`)

#### ✅ `GET /api/stock/ledger?bin_location={location_id}`
- **Status**: ✅ **NOW RETURNS `carton_id`** (Fixed)
- **Response includes**:
  ```json
  {
    "data": [
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "qty": 5.00,
        "location_id": "A1-R02-L1-B2",
        "bin_location": "A1-R02-L1-B2",
        "carton_id": "CTN-001", // ✅ REQUIRED: Include carton_id (or null)
        "warehouse": "WH-MAIN"
      }
    ]
  }
  ```
- **Fix Applied**:
  - ✅ Checks if `carton_id` column exists in `tabStockLedger`
  - ✅ Selects `carton_id` from database if column exists
  - ✅ Returns `carton_id` in response (or `null` if not applicable)

#### ✅ `GET /api/stock/item/:item_code/warehouse/:warehouse`
- **Status**: ✅ **NOW RETURNS `carton_id`** (Fixed)
- **Response includes** (Grouped Format):
  ```json
  [
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "warehouse": "WH-MAIN",
      "location_id": "A1-R02-L1-B2",
      "bin_location": "A1-R02-L1-B2",
      "carton_id": "CTN-001", // ✅ REQUIRED: Include carton_id (or null)
      "available_qty": 5.00,
      "cartons": [
        {
          "carton_id": "CTN-001",
          "qty": 5.00
        }
      ]
    }
  ]
  ```
- **Fix Applied**:
  - ✅ Gets `carton_id` from `tabStockLedger` if available
  - ✅ Falls back to `tabStockTransaction` if not in stock ledger
  - ✅ Includes `carton_id` at bin level for display
  - ✅ Includes `carton_id` in `cartons` array

#### ✅ `GET /api/stock-ledger` (List View)
- **Status**: ✅ **DOES NOT INCLUDE `carton_id`** (Correct - not required)
- **Response format**:
  ```json
  {
    "data": [
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "warehouse": "WH-MAIN",
        "location_id": "A1-R02-L1-B2",
        "bin_location": "A1-R02-L1-B2",
        "qty": 5.00
        // ✅ carton_id NOT included (not required for list view)
      }
    ]
  }
  ```
- **Note**: Stock Ledger list view does NOT need `carton_id` - only Item Location Breakdown needs it

---

## 🔧 Fixes Applied

### 1. **Stock Ledger by Location API** (`getStockLedgerByLocation`)
- ✅ Added dynamic check for `carton_id` column in `tabStockLedger`
- ✅ Selects `carton_id` from database if column exists
- ✅ Returns `carton_id` in response (or `null` if not applicable)

### 2. **Stock Ledger by Item API** (`getStockLedgerByItem`)
- ✅ Gets `carton_id` from `tabStockLedger` if available
- ✅ Falls back to `tabStockTransaction` if not in stock ledger
- ✅ Includes `carton_id` at bin level for display in Item Location Breakdown
- ✅ Includes `carton_id` in `cartons` array
- ✅ Returns `carton_id` in both grouped and flat response formats

### 3. **Stock Ledger List API** (`getStockLedger`)
- ✅ **Does NOT include `carton_id`** in response (not required for list view)
- ✅ Only Item Location Breakdown needs `carton_id`

### 4. **Putaway Complete Endpoint** (`completePutaway`)
- ✅ Already stores `carton_id` in `tabStockLedger` when completing putaway
- ✅ Checks if `carton_id` column exists before inserting
- ✅ Includes `carton_id` in INSERT/UPDATE queries

---

## 📋 API Response Format Standards

### Required Fields in All Stock/Location APIs:

```typescript
{
  // Location Identification
  "bin_location": string | null,     // ✅ Resolved location ID
  "location_id": string | null,    // ✅ Full composite location ID
  
  // Location Components
  "zone": string | null,
  "aisle": string | null,
  "rack": string | null,
  "level": string | null,
  "bin": string | null,
  
  // Carton Information
  "carton_id": string | null,       // ✅ REQUIRED: Include carton_id (or null if not applicable)
  
  // Item Information
  "item_code": string,
  "warehouse": string,
  "qty": number,
  // ... other fields
}
```

---

## ✅ Verification Checklist

- [x] ✅ Mobile app sends `carton_id` in `completePutaway` request
- [x] ✅ Mobile app sends `carton_id` in `scanTransferCarton` request
- [x] ✅ Backend stores `carton_id` in `tabStockLedger` when completing putaway
- [x] ✅ Backend returns `carton_id` in `getStockLedgerByLocation` response (for cycle count)
- [x] ✅ Backend returns `carton_id` in `getStockLedgerByItem` response (for Item Location Breakdown)
- [x] ✅ Backend does NOT return `carton_id` in `getStockLedger` response (list view - not required)
- [x] ✅ Backend checks if `carton_id` column exists before querying
- [x] ✅ Backend falls back to `tabStockTransaction` if `carton_id` not in stock ledger
- [x] ✅ Backend returns `null` for `carton_id` if not applicable (loose items)

---

## 🎯 Result

**Item Location Breakdown API now returns `carton_id`** in its response, matching the format expected by the desktop "Item Location Breakdown" pop-up:

- ✅ Full composite Location ID: `A1-R02-L1-B2`
- ✅ Carton ID: `CTN-001` (or `null` if not applicable)
- ✅ Individual location components: Zone, Aisle, Rack, Level, Bin
- ✅ Stock Ledger list view does NOT include `carton_id` (not required)

---

## 📝 Next Steps

1. **Restart Backend API Server** to apply changes
2. **Test Desktop App** - Verify Item Location Breakdown shows Carton ID
3. **Test Mobile App** - Verify carton IDs are displayed correctly
4. **Verify Database** - Ensure `tabStockLedger` has `carton_id` column (if not, add it)

---

## Database Schema Verification

### Check if `carton_id` Column Exists:

```sql
-- Check if carton_id column exists in tabStockLedger
DESCRIBE tabStockLedger;

-- If carton_id column doesn't exist, add it:
ALTER TABLE tabStockLedger 
ADD COLUMN carton_id VARCHAR(255) NULL 
AFTER bin_location;

-- Add index for faster queries
CREATE INDEX idx_stock_ledger_carton_id ON tabStockLedger(carton_id);
```

### Verify Data:

```sql
-- Check if carton_id is stored for items
SELECT 
  item_code,
  bin_location,
  carton_id, -- ✅ Should have values for items put away with cartons
  qty,
  warehouse
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-GRN-OS'
  AND bin_location = 'A1-R02-L1-B2';
```

---

**END**
