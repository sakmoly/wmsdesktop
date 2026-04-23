# How to Configure Item Sync Filter

## ✅ Filter is Now Configurable!

The item sync filter is now configurable through the `wms_settings.json` file. You can change it from the default `custom_dcs = MENFOTSLP` to any filter you need.

---

## 📝 Configuration Location

**File:** `bin/Debug/net8.0-windows/wms_settings.json`

**Property:** `ItemSyncFilters` (JSON string)

---

## 🔧 How to Change the Filter

### Step 1: Open Settings File

Open `bin/Debug/net8.0-windows/wms_settings.json` in a text editor.

### Step 2: Add or Update ItemSyncFilters

Add the `ItemSyncFilters` property with your desired filter as a JSON string.

**Example 1: Filter by item_name**
```json
{
  "Company": "Your Company",
  "ApiEndpointUrl": "http://192.168.103.219:3000",
  "ErpNextApiUrl": "http://printechsdammam.dyndns.org:88",
  "ErpNextApiKey": "9c9cddef8b35474:8c32cc7ca4afbec",
  "ItemSyncFilters": "{\"item_name\":\"COLN WMN WST\"}",
  ...
}
```

**Example 2: Filter by custom_dcs (default)**
```json
{
  "ItemSyncFilters": "{\"custom_dcs\":\"MENFOTSLP\"}",
  ...
}
```

**Example 3: Multiple filters**
```json
{
  "ItemSyncFilters": "{\"item_name\":\"COLN WMN WST\",\"item_group\":\"SALEABLE\"}",
  ...
}
```

**Example 4: No filter (sync all items)**
```json
{
  "ItemSyncFilters": "{}",
  ...
}
```

---

## 📋 Filter Format

The `ItemSyncFilters` must be a **valid JSON string** representing a dictionary/object.

**Format:**
```json
"ItemSyncFilters": "{\"field_name\":\"field_value\"}"
```

**Important:**
- Use double quotes for the JSON string
- Escape inner quotes with backslash: `\"`
- Field names must match ERPNext field names (e.g., `item_name`, `item_code`, `custom_dcs`, `item_group`, `brand`)

---

## 🎯 Your Specific Request

You wanted to filter by:
```json
{
  "filters": {
    "item_name": "COLN WMN WST"
  }
}
```

**Configuration:**
```json
{
  "ItemSyncFilters": "{\"item_name\":\"COLN WMN WST\"}"
}
```

---

## ✅ Steps to Apply

1. **Stop the desktop application** (if running)

2. **Edit `wms_settings.json`:**
   - Open: `bin/Debug/net8.0-windows/wms_settings.json`
   - Add or update: `"ItemSyncFilters": "{\"item_name\":\"COLN WMN WST\"}"`
   - Save the file

3. **Restart the desktop application**

4. **Run Sync:**
   - Click "Sync Items"
   - Choose Full Sync or Incremental Sync
   - The sync will now use your configured filter

---

## 🔍 Verify Filter is Applied

After running sync, check the logs:
```
ErrorLogs/error_YYYY-MM-DD.log
```

Look for:
```
ErpNextItemApiService: Using filters: {"item_name":"COLN WMN WST"}
```

---

## ⚠️ Common Issues

### Issue 1: Invalid JSON Format

**Error:** Filter not applied, using default filter

**Solution:** Ensure the JSON string is valid:
- ✅ Correct: `"{\"item_name\":\"COLN WMN WST\"}"`
- ❌ Wrong: `"{item_name:COLN WMN WST}"` (missing quotes)
- ❌ Wrong: `"{\"item_name\":\"COLN WMN WST\""` (missing closing brace)

### Issue 2: Filter Not Working

**Check:**
1. Verify the field name matches ERPNext field names
2. Verify the value exists in ERPNext
3. Check logs to see what filter is actually being used

### Issue 3: No Items Synced

**Possible causes:**
- Filter value doesn't match any items in ERPNext
- Field name is incorrect
- Check ERPNext API response in logs

---

## 📝 Complete Example Settings File

```json
{
  "Company": "Printechs",
  "ApiEndpointUrl": "http://192.168.103.219:3000",
  "ErpNextApiUrl": "http://printechsdammam.dyndns.org:88",
  "ErpNextApiKey": "9c9cddef8b35474:8c32cc7ca4afbec",
  "ItemSyncFilters": "{\"item_name\":\"COLN WMN WST\"}",
  "SyncFrequencyMinutes": 15,
  "DatabaseType": "MySQL",
  "DatabaseHost": "localhost",
  "DatabaseName": "wms_desktop",
  "DatabaseUserName": "root",
  "EncryptedPassword": "...",
  "DatabasePort": 3306,
  "LastItemSyncTimestamp": "2025-11-30T01:07:44"
}
```

---

## ✅ Summary

**To change the filter:**

1. Edit `wms_settings.json`
2. Set `ItemSyncFilters` to your desired filter as JSON string
3. Restart application
4. Run sync

**Your specific case:**
```json
"ItemSyncFilters": "{\"item_name\":\"COLN WMN WST\"}"
```

The filter is now configurable without code changes! 🎉
