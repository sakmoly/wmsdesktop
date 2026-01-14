# Cycle Count Warehouse Validation Fix

## 🐛 Issue

The cycle count creation endpoint was not validating the warehouse against master data (`tabWarehouse`). This allowed invalid warehouse codes (like "DEFAULT-WH") to be used, which should not be allowed. The warehouse must exist in the master data table before a cycle count can be created/synced.

## 🔍 Root Cause

The `createCycleCountTask` function in `cycleCountController.js` was:
1. ✅ Checking if warehouse was provided (required field)
2. ❌ NOT validating that the warehouse exists in `tabWarehouse` master data
3. ❌ Allowing any warehouse code to be inserted, even if it doesn't exist in master data

## ✅ Fix Applied

### 1. **Added Warehouse Validation Helper Function**

**File:** `wms-api/src/modules/cycle-count/cycleCountController.js`

**Changes:**
- Added `validateWarehouseFromMasterData` helper function (lines ~64-99)
- Function checks if warehouse exists in `tabWarehouse` master data table
- Returns `true` if warehouse exists, `false` otherwise
- Includes error handling and logging

```javascript
/**
 * Helper function to validate warehouse exists in master data (tabWarehouse)
 * @param {Object} connection - Database connection
 * @param {string} warehouseCode - Warehouse code to validate
 * @returns {Promise<boolean>} - True if warehouse exists in master data, false otherwise
 */
async function validateWarehouseFromMasterData(connection, warehouseCode) {
  if (!warehouseCode || (typeof warehouseCode === 'string' && warehouseCode.trim() === '')) {
    return false;
  }
  
  const normalizedWarehouse = typeof warehouseCode === 'string' ? warehouseCode.trim() : String(warehouseCode);
  
  try {
    // Check if warehouse exists in tabWarehouse master data
    const [rows] = await connection.execute(`
      SELECT code
      FROM tabWarehouse
      WHERE code = ?
      LIMIT 1
    `, [normalizedWarehouse]);
    
    if (rows.length > 0) {
      console.log(`[Cycle Count] ✅ Warehouse validated in master data: "${normalizedWarehouse}"`);
      return true;
    } else {
      console.log(`[Cycle Count] ❌ Warehouse not found in master data: "${normalizedWarehouse}"`);
      return false;
    }
  } catch (error) {
    console.error(`[Cycle Count] ❌ Error validating warehouse in master data: ${error.message}`);
    // On error, return false to prevent sync
    return false;
  }
}
```

### 2. **Added Warehouse Validation in Create Endpoint**

**File:** `wms-api/src/modules/cycle-count/cycleCountController.js`

**Changes:**
- Added warehouse validation in `createCycleCountTask` function (lines ~944-953)
- Validation happens after required field checks but before inserting into database
- Returns 400 error if warehouse is not found in master data
- Prevents cycle count creation if warehouse is invalid

```javascript
// Validate warehouse exists in master data (tabWarehouse)
const warehouseValid = await validateWarehouseFromMasterData(connection, warehouse);
if (!warehouseValid) {
  return res.status(400).json({
    ok: false,
    error: {
      code: 'INVALID_WAREHOUSE',
      message: `Warehouse "${warehouse}" not found in master data. Please use a valid warehouse code from tabWarehouse.`
    }
  });
}
```

## 🧪 Testing

To verify the fix:

1. **Test with valid warehouse:**
   ```json
   POST /api/cycle-count
   {
     "title": "CC-TEST-001",
     "count_type": "Adhoc",
     "warehouse": "WH-MAIN",
     "count_date": "2026-01-11",
     "created_by": "USER-001"
   }
   ```
   **Expected:** ✅ Success (if "WH-MAIN" exists in `tabWarehouse`)

2. **Test with invalid warehouse:**
   ```json
   POST /api/cycle-count
   {
     "title": "CC-TEST-002",
     "count_type": "Adhoc",
     "warehouse": "DEFAULT-WH",
     "count_date": "2026-01-11",
     "created_by": "USER-001"
   }
   ```
   **Expected:** ❌ 400 Error: `INVALID_WAREHOUSE - Warehouse "DEFAULT-WH" not found in master data`

3. **Check warehouse master data:**
   ```sql
   SELECT code, name, warehouse_type
   FROM tabWarehouse
   ORDER BY code;
   ```

## 📋 Warehouse Master Data Structure

**Table:** `tabWarehouse`

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS tabWarehouse (
  code VARCHAR(100) PRIMARY KEY,        -- Warehouse code (e.g., "WH-MAIN")
  name VARCHAR(255) NOT NULL,           -- Warehouse name (e.g., "Main Warehouse")
  warehouse_type VARCHAR(50) NULL,      -- 'Warehouse' or 'Store'
  is_group BOOLEAN DEFAULT FALSE,
  parent_warehouse VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_warehouse)
);
```

**Validation:**
- Warehouse code must exist in `tabWarehouse.code`
- Case-sensitive match (exact match required)
- Empty/null warehouse codes are rejected

## 🎯 Expected Behavior

After this fix:
1. ✅ Cycle count creation validates warehouse against `tabWarehouse` master data
2. ✅ Invalid warehouse codes (e.g., "DEFAULT-WH") are rejected
3. ✅ 400 error returned if warehouse not found in master data
4. ✅ Cycle count is NOT created if warehouse is invalid
5. ✅ Error message clearly indicates which warehouse code is invalid
6. ✅ Logs include validation results for debugging

## ⚠️ Notes

- The validation is case-sensitive - warehouse code must match exactly
- Warehouse validation happens before any database insertion
- If validation fails, the transaction is not started (no rollback needed)
- The error response includes the invalid warehouse code for debugging
- To see available warehouses, use `GET /api/master/warehouses`

## 🔄 Next Steps

1. ✅ Warehouse validation added to `createCycleCountTask`
2. ⚠️ Consider adding validation to other endpoints that accept warehouse:
   - `updateCountLines` - Gets warehouse from task, but task warehouse should already be validated
   - `submitCycleCount` - Gets warehouse from task, but task warehouse should already be validated
   - `completeCycleCount` - Gets warehouse from task, but task warehouse should already be validated

**Note:** Other endpoints get warehouse from existing task, which should already be validated. However, if warehouse master data changes (warehouse deleted), existing tasks might have invalid warehouses. This is a data consistency issue that should be handled separately (e.g., data migration or warehouse deletion restrictions).

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-11  
**Files Modified:** `wms-api/src/modules/cycle-count/cycleCountController.js`
