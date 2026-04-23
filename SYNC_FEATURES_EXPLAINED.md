# Item Sync Features Explained

## ✅ What the Sync Does

### 1. **Updates Existing Items** ✅
The sync uses **UPSERT** (Update or Insert) logic:
- **If item exists** (by item code): **UPDATES** the item with latest data from ERPNext
- **If item is new**: **CREATES** a new item in the database

**SQL Logic:**
```sql
INSERT INTO tabItem (...) VALUES (...)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    item_group = VALUES(item_group),
    brand = VALUES(brand),
    ...
```

This means:
- ✅ Changes in ERPNext (name, brand, item_group, etc.) **will be updated** in local database
- ✅ New items from ERPNext **will be created** in local database
- ✅ Existing items **will be refreshed** with latest data

---

## 📊 User Feedback

### During Sync:
- **Status message** appears below buttons: "Syncing all items..." or "Syncing changed items..."
- **Buttons are disabled** to prevent multiple syncs
- **Visual indicator** shows sync is in progress

### After Sync:
**Success Message shows:**
```
✅ Sync completed successfully!

📥 Total fetched from ERPNext: 150

➕ New items created: 25
🔄 Existing items updated: 125
```

**Or if no changes:**
```
✅ Sync completed successfully!

📥 Total fetched from ERPNext: 150

ℹ️ No changes detected (items already up-to-date)
```

**If errors occur:**
```
✅ Sync completed successfully!

📥 Total fetched from ERPNext: 150

➕ New items created: 25
🔄 Existing items updated: 120

⚠️ Errors encountered: 5
(Check error log for details)
```

---

## 🔄 Sync Types

### Full Sync
- Syncs **all items** from ERPNext
- Use when:
  - First time syncing
  - Need to refresh all items
  - After a long time without sync

### Incremental Sync
- Syncs only items **modified since last sync**
- Faster and more efficient
- Use when:
  - Regular daily syncs
  - Only need latest changes
  - Large item database

**How it works:**
- Tracks `LastItemSyncTimestamp` in settings
- Only fetches items with `modified > LastItemSyncTimestamp`
- Updates timestamp after successful sync

---

## 📝 What Gets Synced

**Fields synced from ERPNext:**
- ✅ `item_code` (primary key)
- ✅ `item_name`
- ✅ `item_group`
- ✅ `brand`
- ✅ `stock_uom` (unit of measure)
- ✅ `is_stock` (maintain stock flag)
- ✅ `modified` (last modified date)

**Fields NOT synced:**
- ❌ Stock quantities (handled separately by WMS)
- ❌ Location assignments (WMS-specific)
- ❌ Bin assignments (WMS-specific)

---

## 🎯 Best Practices

1. **First Time:** Use Full Sync
2. **Regular Use:** Use Incremental Sync (faster)
3. **After ERPNext Changes:** Use Full Sync to ensure everything is updated
4. **Check Results:** Review the success message to see what changed
5. **Monitor Errors:** Check error logs if sync reports errors

---

## 🔍 Troubleshooting

### "No items found to sync"
- Check filter criteria (`custom_dcs = MENFOTSLP`)
- Verify items exist in ERPNext with correct filter value
- Check ERPNext API connection

### "No changes detected"
- Items are already up-to-date
- Last sync was recent
- No items were modified in ERPNext since last sync

### "Errors encountered"
- Check error log: `ErrorLogs/error_YYYY-MM-DD.log`
- Common issues:
  - Database connection problems
  - Invalid data format from ERPNext
  - Constraint violations

---

## ✅ Summary

**Sync Behavior:**
- ✅ **Updates** existing items when data changes in ERPNext
- ✅ **Creates** new items when they appear in ERPNext
- ✅ **Tracks** sync timestamp for incremental syncs
- ✅ **Shows** clear feedback about what was synced

**User Experience:**
- ✅ Status message during sync
- ✅ Detailed success message after sync
- ✅ Automatic item list refresh after sync
- ✅ Error reporting if issues occur
