# Putaway Carton ID Flow Analysis

**Date**: 2026-01-20  
**Issue**: Carton ID missing in Item Location Breakdown after putaway

---

## User's Description

> "Basically, while create or submit Putaway, the user scanning Putaway Cartoon ID, and inside the Carton Items and location ID then where is the issue?"

**Flow:**
1. User scans **Putaway Carton ID** (e.g., "CTN-001")
2. Inside the carton, there are **Items** (e.g., "SKU-HAT-301-GRN-OS")
3. User scans **Location ID** (e.g., "A1-R02-L1-B2")
4. User completes putaway
5. **Issue**: Carton ID not showing in Item Location Breakdown

---

## Complete Putaway Flow

### 1. **Mobile App → Backend: Scan Transfer Carton**

**Endpoint**: `POST /api/putaway/scan-transfer-carton`

**Request:**
```json
{
  "tc_id": "CTN-001",
  "carton_id": "CTN-001",
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-037007"
}
```

**Backend Action:**
- Creates/updates putaway task
- Creates/updates putaway lines with `carton_id`
- **✅ Stores `carton_id` in `tabPutawayLine`**

**Location**: `wms-api/src/modules/putaway/putawayController.js:3052-4475`

---

### 2. **Mobile App → Backend: Complete Putaway**

**Endpoint**: `POST /api/putaway/complete`

**Request:**
```json
{
  "putaway_task": "PUT-20250120-0001",
  "location_id": "A1-R02-L1-B2",
  "items": [
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "qty": 5.00,
      "carton_id": "CTN-001",  // ✅ Mobile app sends carton_id
      "location_id": "A1-R02-L1-B2"
    }
  ]
}
```

**Backend Processing Steps:**

#### Step 2.1: Query Putaway Lines from Database
**Location**: `putawayController.js:1353-1360`

```javascript
const [putawayLines] = await connection.execute(`
  SELECT 
    pl.item_code,
    pl.qty,
    pl.rack,
    pl.bin,
    pl.carton_id,  // ✅ carton_id is selected from database
    ${locationIdSelect}
  FROM tabPutawayLine pl
  WHERE pl.parent_title = ?
`, [actualPutawayTask]);
```

**✅ Result**: `putawayLines` includes `carton_id` from database

---

#### Step 2.2: Process Request Items (if provided)
**Location**: `putawayController.js:1430-1900`

**Action:**
- If `items` array is provided in request, create/update putaway lines
- Extract `carton_id` from request items: `item.box_id || item.carton_id`
- **✅ Store `carton_id` in `tabPutawayLine`** (INSERT or UPDATE)

**Key Code** (line 1633):
```javascript
let itemCartonId = item.box_id || item.carton_id || null;
```

**Key Code** (line 1723):
```javascript
updateQuery += `, carton_id = COALESCE(?, carton_id)`;
updateParams.push(itemCartonId);
```

**✅ Result**: `carton_id` is stored in `tabPutawayLine`

---

#### Step 2.3: Refresh Putaway Lines (if items provided)
**Location**: `putawayController.js:1967-2001`

**Action:**
- Re-query `tabPutawayLine` to get latest `carton_id` values
- Update `putawayLines` array with refreshed `carton_id`

**Key Code** (line 1977):
```javascript
SELECT 
  pl.item_code,
  pl.qty,
  pl.rack,
  pl.bin,
  pl.carton_id,  // ✅ Refreshed carton_id
  ${locationIdSelect}
FROM tabPutawayLine pl
WHERE pl.parent_title = ?
```

**✅ Result**: `putawayLines` has latest `carton_id` from database

---

#### Step 2.4: Process Stock Updates
**Location**: `putawayController.js:2233-2546`

**Action:**
- Loop through `linesToProcess` (copy of `putawayLines`)
- Extract `carton_id` from each line
- Store `carton_id` in `tabStockLedger` when updating stock

**Key Code** (line 2280):
```javascript
const cartonId = line.carton_id || null;
const cartonIdValue = cartonId && cartonId.trim() !== '' ? cartonId.trim() : null;
```

**Key Code** (line 2512-2520):
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

**✅ Result**: `carton_id` is stored in `tabStockLedger` (if column exists)

---

### 3. **Desktop App → Backend: Item Location Breakdown**

**Endpoint**: `GET /api/stock/item/:item_code/warehouse/:warehouse`

**Backend Processing:**
- Query `tabStockLedger` for item stock
- Query `tabCartonStock` for carton-level inventory
- **✅ Return `carton_id` in response** (if available)

**Location**: `wms-api/src/modules/stock-ledger/stockLedgerController.js:632-1280`

**Key Code** (line 889):
```javascript
const stockLedgerCartonId = hasStockLedgerCartonIdColumn ? (row.carton_id || null) : null;
```

**Key Code** (line 1027):
```javascript
carton_id: displayCartonId, // ✅ REQUIRED: Include carton_id for display
```

**✅ Result**: `carton_id` is returned in API response

---

## Potential Issues & Verification Steps

### Issue 1: `carton_id` Column Missing in `tabStockLedger`

**Symptom**: `carton_id` not stored during putaway completion

**Verification:**
```sql
-- Check if carton_id column exists
DESCRIBE tabStockLedger;

-- If column doesn't exist, add it:
ALTER TABLE tabStockLedger 
ADD COLUMN carton_id VARCHAR(255) NULL 
AFTER bin_location;

-- Add index for faster queries
CREATE INDEX idx_stock_ledger_carton_id ON tabStockLedger(carton_id);
```

**Fix**: Add `carton_id` column to `tabStockLedger` table

---

### Issue 2: `carton_id` Not in Putaway Lines

**Symptom**: `carton_id` is NULL in `tabPutawayLine` after putaway

**Verification:**
```sql
-- Check putaway lines for carton_id
SELECT 
  parent_title,
  item_code,
  carton_id,  -- ✅ Should have values
  rack,
  bin,
  location_id,
  qty
FROM tabPutawayLine
WHERE parent_title = 'PUT-20250120-0001'
ORDER BY item_code;
```

**Expected Result**: All lines should have `carton_id` values

**If NULL**: Check if mobile app is sending `carton_id` in request

---

### Issue 3: `carton_id` Not Stored in Stock Ledger

**Symptom**: `carton_id` exists in putaway lines but not in stock ledger

**Verification:**
```sql
-- Check stock ledger for carton_id
SELECT 
  item_code,
  bin_location,
  carton_id,  -- ✅ Should have values
  qty,
  warehouse
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-GRN-OS'
  AND bin_location = 'A1-R02-L1-B2';
```

**Expected Result**: `carton_id` should match the carton used in putaway

**If NULL**: Check backend logs for:
```
[Putaway] 📦 Including carton_id in stock ledger: CTN-001
```

**If log not present**: `carton_id` column might not exist or `cartonIdValue` is null

---

### Issue 4: `carton_id` Not Returned in API Response

**Symptom**: `carton_id` exists in database but not in API response

**Verification:**
```bash
# Test API directly
curl -X GET "http://your-api/api/stock/item/SKU-HAT-301-GRN-OS/warehouse/WH-MAIN?format=grouped" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
[
  {
    "item_code": "SKU-HAT-301-GRN-OS",
    "location_id": "A1-R02-L1-B2",
    "carton_id": "CTN-001",  // ✅ Should be present
    "available_qty": 5.00
  }
]
```

**If missing**: Check backend code at `stockLedgerController.js:1027`

---

## Debugging Checklist

### ✅ Step 1: Verify Database Schema

```sql
-- Check tabPutawayLine has carton_id
DESCRIBE tabPutawayLine;

-- Check tabStockLedger has carton_id
DESCRIBE tabStockLedger;
```

**Action**: Add `carton_id` column if missing

---

### ✅ Step 2: Verify Putaway Lines Have Carton ID

```sql
-- After putaway completion, check putaway lines
SELECT 
  parent_title,
  item_code,
  carton_id,
  rack,
  bin,
  location_id
FROM tabPutawayLine
WHERE parent_title LIKE 'PUT-%'
ORDER BY parent_title DESC, item_code
LIMIT 20;
```

**Expected**: All lines should have `carton_id` values

---

### ✅ Step 3: Verify Stock Ledger Has Carton ID

```sql
-- After putaway completion, check stock ledger
SELECT 
  item_code,
  bin_location,
  carton_id,
  qty,
  warehouse,
  last_transaction_type,
  last_transaction_ref
FROM tabStockLedger
WHERE last_transaction_type = 'Putaway'
  AND last_transaction_date >= DATE_SUB(NOW(), INTERVAL 1 DAY)
ORDER BY last_transaction_date DESC
LIMIT 20;
```

**Expected**: Recent putaway entries should have `carton_id` values

---

### ✅ Step 4: Check Backend Logs

**Look for these log messages:**

1. **During putaway completion:**
   ```
   [Putaway] 📦 Including carton_id in stock ledger: CTN-001
   ```

2. **During Item Location Breakdown query:**
   ```
   [Stock Ledger] Found carton_id CTN-001 from tabStockTransaction for SKU-HAT-301-GRN-OS @ A1-R02-L1-B2
   ```

**If logs missing**: `carton_id` might not be reaching the stock update code

---

### ✅ Step 5: Test API Response

```bash
# Test Item Location Breakdown API
curl -X GET "http://localhost:3000/api/stock/item/SKU-HAT-301-GRN-OS/warehouse/WH-MAIN?format=grouped" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.[0] | {item_code, location_id, carton_id, available_qty}'
```

**Expected Output:**
```json
{
  "item_code": "SKU-HAT-301-GRN-OS",
  "location_id": "A1-R02-L1-B2",
  "carton_id": "CTN-001",
  "available_qty": 5.00
}
```

---

## Root Cause Analysis

### Most Likely Issues:

1. **`carton_id` column missing in `tabStockLedger`**
   - **Impact**: `carton_id` cannot be stored during putaway
   - **Fix**: Add column using SQL above

2. **Mobile app not sending `carton_id` in complete request**
   - **Impact**: `carton_id` is NULL in putaway lines
   - **Fix**: Verify mobile app includes `carton_id` in items array

3. **`carton_id` is NULL in putaway lines**
   - **Impact**: `cartonIdValue` is null, so not stored in stock ledger
   - **Fix**: Check why `carton_id` is not being saved to `tabPutawayLine`

---

## Summary

**Flow is Correct:**
- ✅ Mobile app sends `carton_id` in putaway complete request
- ✅ Backend stores `carton_id` in `tabPutawayLine`
- ✅ Backend extracts `carton_id` from putaway lines
- ✅ Backend stores `carton_id` in `tabStockLedger` (if column exists)
- ✅ Backend returns `carton_id` in Item Location Breakdown API

**Most Likely Issue:**
- ❌ `carton_id` column missing in `tabStockLedger` table
- ❌ `carton_id` is NULL in putaway lines (mobile app not sending it)

**Next Steps:**
1. Verify database schema (add `carton_id` column if missing)
2. Verify putaway lines have `carton_id` after putaway completion
3. Verify stock ledger has `carton_id` after putaway completion
4. Test API response to confirm `carton_id` is returned

---

**END**
