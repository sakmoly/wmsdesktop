# Bin Location Scan Fix

## 🔍 Issue

**Problem:** When scanning a location barcode (e.g., "A1-R01-L1-B1"), the exact location ID is not being stored correctly. The system stores `rack` and `bin` separately, and when completing putaway, it combines them which may not match the exact scanned location.

**Symptom:** Stock Ledger shows incorrect bin location (e.g., "TBD-TBD", "Rack 01-B3", "A1-R01-L2-B1") instead of the exact scanned location ("A1-R01-L1-B1").

---

## ✅ Solution

Updated the putaway completion logic to:
1. **Store `location_id` in `tabPutawayLine`** when scanning a location barcode
2. **Use the stored `location_id` directly** as `bin_location` in stock ledger (instead of combining rack+bin)
3. **Check for `location_id` column existence** dynamically to support both old and new database schemas

---

## 🔧 Changes Made

### File: `wms-api/src/modules/putaway/putawayController.js`

### 1. Store `location_id` in `tabPutawayLine` (INSERT)

**Before:**
```javascript
INSERT INTO tabPutawayLine 
  (parent_title, carton_id, item_code, qty, rack, bin, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
```

**After:**
```javascript
// Check if location_id column exists
const hasLineLocationIdColumn = lineLocationColumns.length > 0;

// Include location_id in INSERT if column exists
let insertQuery = `INSERT INTO tabPutawayLine 
  (parent_title, carton_id, item_code, qty, rack, bin`;
if (hasLineLocationIdColumn && itemLocationId) {
  insertQuery += `, location_id`;
  insertParams.push(itemLocationId);
}
insertQuery += `, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?`;
if (hasLineLocationIdColumn && itemLocationId) {
  insertQuery += `, ?`;
}
insertQuery += `, NOW(), NOW())`;
```

### 2. Store `location_id` in `tabPutawayLine` (UPDATE)

**Before:**
```javascript
UPDATE tabPutawayLine 
SET qty = ?, rack = ?, bin = ?, 
    carton_id = COALESCE(?, carton_id),
    updated_at = NOW()
WHERE id = ?
```

**After:**
```javascript
let updateQuery = `UPDATE tabPutawayLine 
  SET qty = ?, rack = ?, bin = ?, 
      carton_id = COALESCE(?, carton_id)`;
if (hasLineLocationIdColumn && itemLocationId) {
  updateQuery += `, location_id = ?`;
  updateParams.push(itemLocationId);
}
updateQuery += `, updated_at = NOW() WHERE id = ?`;
```

### 3. Use `location_id` as `bin_location` in Stock Ledger

**Code (already correct):**
```javascript
// Use location_id as bin_location (preferred) or combine rack and bin
let binLocation = line.location_id || null;
if (!binLocation) {
  // Fallback: combine rack and bin if location_id not available
  if (rack && bin) {
    binLocation = `${rack}-${bin}`;
  } else if (rack) {
    binLocation = rack;
  } else if (bin) {
    binLocation = bin;
  }
}
```

**Now:** Since `location_id` is stored in `tabPutawayLine`, it will be used directly as `bin_location` in stock ledger.

### 4. Check for Existing Lines by `location_id`

**Before:**
```javascript
// Only checked by rack+bin
WHERE parent_title = ? 
  AND item_code = ? 
  AND (rack = ? OR ...)
  AND (bin = ? OR ...)
```

**After:**
```javascript
// Check by location_id if available, otherwise by rack+bin
if (hasLineLocationIdColumn && itemLocationId) {
  existingLineQuery += ` AND (location_id = ? OR (location_id IS NULL AND ? IS NULL))`;
} else {
  existingLineQuery += ` AND (rack = ? OR ...) AND (bin = ? OR ...)`;
}
```

---

## 📊 Database Schema

### `tabPutawayLine` Table

**If `location_id` column exists:**
```sql
CREATE TABLE tabPutawayLine (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  carton_id VARCHAR(100) NULL,
  item_code VARCHAR(100) NOT NULL,
  qty DECIMAL(10,2) NOT NULL,
  rack VARCHAR(100) NOT NULL,
  bin VARCHAR(100) NOT NULL,
  location_id VARCHAR(100) NULL,  -- ✅ NEW: Stores exact scanned location
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Note:** The code dynamically checks if `location_id` column exists, so it works with both old and new schemas.

---

## 🔄 Workflow

### When Scanning Location Barcode:

1. **User scans location barcode:** "A1-R01-L1-B1"
2. **API looks up location:** `lookupLocationFromId()` returns:
   - `location_id`: "A1-R01-L1-B1"
   - `rack`: "A1-R01-L1" (from `parent_rack`)
   - `bin`: "B1" (from `bin_id`)
3. **Store in `tabPutawayLine`:**
   - `rack`: "A1-R01-L1"
   - `bin`: "B1"
   - `location_id`: "A1-R01-L1-B1" ✅ **NEW: Exact scanned location**

### When Completing Putaway:

1. **Read from `tabPutawayLine`:**
   - `location_id`: "A1-R01-L1-B1" ✅
   - `rack`: "A1-R01-L1"
   - `bin`: "B1"
2. **Use `location_id` as `bin_location`:**
   - `bin_location` = "A1-R01-L1-B1" ✅ **Exact scanned location**
3. **Store in Stock Ledger:**
   - `tabStockLedger.bin_location` = "A1-R01-L1-B1" ✅

---

## ✅ Benefits

1. **Exact Location Storage:** The exact scanned location ID is stored and used
2. **Backward Compatible:** Works with databases that don't have `location_id` column yet
3. **No Data Loss:** Still stores `rack` and `bin` for backward compatibility
4. **Correct Stock Ledger:** Stock Ledger now shows the exact scanned location

---

## 🧪 Testing

### Test Case 1: Scan Location Barcode

**Input:**
- Location barcode: "A1-R01-L1-B1"
- Item: "SKU-001"
- Quantity: 10

**Expected Result:**
- `tabPutawayLine.location_id` = "A1-R01-L1-B1"
- `tabPutawayLine.rack` = "A1-R01-L1"
- `tabPutawayLine.bin` = "B1"

### Test Case 2: Complete Putaway

**Input:**
- Putaway task with location_id = "A1-R01-L1-B1"

**Expected Result:**
- `tabStockLedger.bin_location` = "A1-R01-L1-B1" ✅
- Stock Ledger shows exact scanned location

---

## 📝 Notes

- The fix is **backward compatible** - works with databases that don't have `location_id` column
- If `location_id` column doesn't exist, the system falls back to combining `rack` and `bin`
- The exact scanned location is now preserved throughout the putaway process

---

**Status:** ✅ Fixed  
**Date:** 2026-01-06  
**Requires:** API server restart

