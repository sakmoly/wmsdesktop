# wms_modified and app_sync_state Implementation ✅

## ✅ Implementation Complete

Updated the code to properly handle `wms_modified` and `app_sync_state` according to the ERPNext API specification.

---

## 📋 Changes Made

### 1. Database Schema Updates

#### `tabItem` Table
**Added columns:**
- `wms_modified TIMESTAMP NULL` - Stores ERPNext `custom_wms_modified` value
- `disabled BOOLEAN DEFAULT FALSE` - Stores item disabled status
- `INDEX idx_wms_modified (wms_modified)` - Index for cursor queries

#### `app_sync_state` Table (NEW)
**Created table:**
```sql
CREATE TABLE IF NOT EXISTS app_sync_state (
  `key` VARCHAR(100) PRIMARY KEY,
  `value` TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Purpose:** Stores sync cursors (e.g., `items_last_custom_wms_modified`)

---

### 2. ItemSyncService Updates

#### Mapping: ERPNext → Desktop

**Field Mapping:**
- ERPNext `custom_wms_modified` → Desktop `tabitem.wms_modified`
- ERPNext `disabled` → Desktop `tabitem.disabled`
- ERPNext `max_custom_wms_modified` → Desktop `app_sync_state.value` (key: `items_last_custom_wms_modified`)

#### UPSERT SQL Updated

**Before:**
```sql
INSERT INTO tabItem (code, name, item_group, brand, stock_uom, maintain_stock, updated_on, ...)
VALUES (@code, @name, @item_group, @brand, @stock_uom, @maintain_stock, @updated_on, ...)
ON DUPLICATE KEY UPDATE
    name = @name,
    ...
```

**After:**
```sql
INSERT INTO tabItem (code, name, item_group, brand, stock_uom, maintain_stock, disabled, wms_modified, updated_on, ...)
VALUES (@code, @name, @item_group, @brand, @stock_uom, @maintain_stock, @disabled, @wms_modified, @updated_on, ...)
ON DUPLICATE KEY UPDATE
    name = @name,
    ...
    disabled = @disabled,
    wms_modified = @wms_modified,
    ...
```

#### Incremental Sync Cursor

**Before:**
- Used `settings.LastItemSyncTimestamp` from settings file

**After:**
- **Primary:** Reads from `app_sync_state` table (key: `items_last_custom_wms_modified`)
- **Fallback:** Uses `settings.LastItemSyncTimestamp` if `app_sync_state` doesn't exist

#### Cursor Update Logic

**After successful sync:**
1. Extract `max_custom_wms_modified` from ERPNext API response
2. Update `app_sync_state` table:
   ```sql
   INSERT INTO app_sync_state (`key`, `value`)
   VALUES ('items_last_custom_wms_modified', ?)
   ON DUPLICATE KEY UPDATE
       `value` = VALUES(`value`),
       updated_at = CURRENT_TIMESTAMP
   ```
3. Also update `settings.LastItemSyncTimestamp` for backward compatibility

---

## 🔄 Sync Flow

### Full Sync
1. **Read cursor:** None (or from `app_sync_state` if exists)
2. **Call ERPNext API:** Without `custom_wms_modified_after` parameter
3. **Process items:** UPSERT with `wms_modified = custom_wms_modified`
4. **Update cursor:** Save `max_custom_wms_modified` to `app_sync_state`

### Incremental Sync
1. **Read cursor:** From `app_sync_state` (key: `items_last_custom_wms_modified`)
2. **Call ERPNext API:** With `custom_wms_modified_after = cursor_value`
3. **Process items:** UPSERT with `wms_modified = custom_wms_modified`
4. **Update cursor:** Save `max_custom_wms_modified` to `app_sync_state`

---

## ✅ When Each Field Updates

### `tabitem.wms_modified`
**Updates when:**
- ✅ Item is UPSERTed during sync from ERPNext
- ✅ Value comes from ERPNext `custom_wms_modified` field

**Does NOT update when:**
- ❌ Desktop application starts
- ❌ User opens item screen
- ❌ Without receiving ERP data

### `app_sync_state`
**Updates when:**
- ✅ After successful UPSERT transaction
- ✅ ERPNext response includes `max_custom_wms_modified`
- ✅ Sync completes successfully

**Does NOT update when:**
- ❌ Sync fails
- ❌ No items returned
- ❌ `max_custom_wms_modified` is null/empty

---

## 📝 Helper Methods Added

### `GetLastSyncCursorAsync`
- Reads cursor from `app_sync_state` table
- Returns `null` if not found or error

### `UpdateSyncCursorAsync`
- Updates/inserts cursor in `app_sync_state` table
- Uses UPSERT pattern
- Logs errors but doesn't throw (non-critical)

---

## 🧪 Testing Checklist

### Test A: Full Sync (First Time)
1. **Delete `app_sync_state` row** (if exists)
2. **Run Full Sync**
3. **Expected:**
   - ✅ Items inserted/updated
   - ✅ `tabitem.wms_modified` populated for all synced items
   - ✅ `app_sync_state` row created with `items_last_custom_wms_modified`

### Test B: Incremental Sync
1. **Change an item in ERPNext** (so `custom_wms_modified` changes)
2. **Run Incremental Sync**
3. **Expected:**
   - ✅ Only changed items returned
   - ✅ `app_sync_state.value` updated to new `max_custom_wms_modified`
   - ✅ `tabitem.wms_modified` updated for changed items

### Test C: Verify Database
```sql
-- Check wms_modified is populated
SELECT code, name, wms_modified, disabled 
FROM tabItem 
WHERE wms_modified IS NOT NULL 
LIMIT 10;

-- Check app_sync_state cursor
SELECT `key`, `value`, updated_at 
FROM app_sync_state 
WHERE `key` = 'items_last_custom_wms_modified';
```

---

## ✅ Summary

**Status:** ✅ Implementation complete

**Key Features:**
- ✅ `tabitem.wms_modified` stores ERPNext `custom_wms_modified`
- ✅ `tabitem.disabled` stores item disabled status
- ✅ `app_sync_state` stores sync cursor (`items_last_custom_wms_modified`)
- ✅ Incremental sync uses cursor from `app_sync_state`
- ✅ Cursor updated after successful sync

**Next Steps:**
1. Rebuild application
2. Run Full Sync to populate `wms_modified` and create `app_sync_state`
3. Test Incremental Sync to verify cursor updates

The implementation now follows the ERPNext API specification! 🎉
