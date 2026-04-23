# Item Master Sync Implementation - ERPNext to Desktop

## ✅ Implementation Complete

This document describes the implementation of the Item Master sync service that syncs items from ERPNext to the local desktop database.

---

## 📋 Overview

The sync service:
- ✅ Calls ERPNext API: `printechs_wms.api.item.get_items_compact`
- ✅ Uses filter: `custom_dcs = MENFOTSLP`
- ✅ Supports **paged results** (limit/offset, 100 items per page)
- ✅ Saves to local MySQL database using **UPSERT** (INSERT ... ON DUPLICATE KEY UPDATE)
- ✅ Supports **incremental sync** using `max_modified` timestamp
- ✅ Manual "Sync Items" button in Items view
- ⏳ Scheduling support (Timer/Task Scheduler/Windows Service) - **Future enhancement**

---

## 🏗️ Architecture

### Files Created/Modified

1. **`Services/ErpNextItemApiService.cs`** (NEW)
   - Calls ERPNext API endpoint
   - Handles paging (limit/offset)
   - Supports incremental sync with `max_modified` filter
   - Parses ERPNext API response format

2. **`Services/ItemSyncService.cs`** (NEW)
   - Orchestrates the sync process
   - Fetches items page by page
   - Performs UPSERT operations
   - Tracks sync timestamp for incremental sync

3. **`Models/WmsSettings.cs`** (MODIFIED)
   - Added `LastItemSyncTimestamp` property
   - Stores timestamp of last successful sync

4. **`Services/SettingsService.cs`** (MODIFIED)
   - Added `LastItemSyncTimestamp` to save/load operations

5. **`Views/ItemListView.xaml`** (MODIFIED)
   - Added "Sync Items" button

6. **`ViewModels/ItemListViewModel.cs`** (MODIFIED)
   - Added `SyncItemsCommand`
   - Added `IsSyncing` and `IsNotSyncing` properties
   - Implemented sync logic with user feedback

---

## 🔌 ERPNext API Integration

### API Endpoint

```
POST http://192.168.103.187:88/api/method/printechs_wms.api.item.get_items_compact
```

### Request Format

```json
{
  "filters": [
    ["custom_dcs", "=", "MENFOTSLP"],
    ["modified", ">", "2024-01-01 00:00:00"]  // Optional, for incremental sync
  ],
  "fields": [
    "item_code",
    "item_name",
    "item_group",
    "brand",
    "stock_uom",
    "is_stock_item",
    "barcode",
    "modified"
  ],
  "limit": 100,
  "offset": 0
}
```

### Response Format

ERPNext returns:
```json
{
  "message": {
    "data": [
      {
        "item_code": "SKU-001",
        "item_name": "Product Name",
        "item_group": "Group A",
        "brand": "Brand X",
        "stock_uom": "Nos",
        "is_stock_item": 1,
        "modified": "2024-01-15 10:30:00"
      }
    ]
  }
}
```

---

## 💾 Database Schema

### Table: `tabItem`

The sync service uses UPSERT to insert or update items:

```sql
INSERT INTO tabItem 
  (code, name, item_group, brand, stock_uom, maintain_stock, updated_on, created_at, updated_at)
VALUES 
  (@code, @name, @item_group, @brand, @stock_uom, @maintain_stock, @updated_on,
   COALESCE(@created_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  item_group = VALUES(item_group),
  brand = VALUES(brand),
  stock_uom = VALUES(stock_uom),
  maintain_stock = VALUES(maintain_stock),
  updated_on = VALUES(updated_on),
  updated_at = CURRENT_TIMESTAMP
```

**Key Fields:**
- `code` (PRIMARY KEY) - Item code from ERPNext
- `name` - Item name
- `item_group` - Item group
- `brand` - Brand
- `stock_uom` - Stock unit of measure
- `maintain_stock` - Boolean (converted from `is_stock_item` 0/1)
- `updated_on` - Last modified date from ERPNext (for incremental sync)

---

## 🔄 Sync Process Flow

### Full Sync

1. User clicks "Sync Items" button
2. System checks if incremental sync is available (asks user)
3. User chooses "Full Sync" (No)
4. System fetches all items from ERPNext (page by page)
5. For each page:
   - Fetch items from ERPNext API
   - For each item: UPSERT into `tabItem`
   - Track latest `modified` date
6. Update `LastItemSyncTimestamp` in settings
7. Reload items list in UI
8. Show success message with counts

### Incremental Sync

1. User clicks "Sync Items" button
2. System detects `LastItemSyncTimestamp` exists
3. User chooses "Incremental Sync" (Yes)
4. System adds filter: `["modified", ">", lastSyncTimestamp]`
5. Only items modified since last sync are fetched
6. Process same as full sync (but fewer items)
7. Update `LastItemSyncTimestamp` to latest modified date
8. Reload items list

---

## 🎯 Usage

### Manual Sync

1. Open **Items** view in desktop app
2. Click **"Sync Items"** button
3. If previous sync exists, choose:
   - **Yes** = Incremental sync (only modified items)
   - **No** = Full sync (all items)
   - **Cancel** = Abort
4. Wait for sync to complete
5. View results:
   - Total fetched
   - Inserted (new items)
   - Updated (existing items)
   - Errors (if any)

### Sync Status

- Button is **disabled** during sync (`IsNotSyncing = false`)
- Button shows "Sync Items" text
- Progress can be monitored via error logs

---

## ⚙️ Configuration

### Settings

The sync uses settings from `WmsSettings`:

- **`ApiEndpointUrl`**: ERPNext base URL (e.g., `http://192.168.103.187:88`)
- **`ApiKey`**: Authentication token/key for ERPNext
- **`LastItemSyncTimestamp`**: Automatically updated after successful sync

### Filter Configuration

Currently hardcoded in `ErpNextItemApiService.cs`:
- Filter: `custom_dcs = MENFOTSLP`

To change filter, modify:
```csharp
// In ErpNextItemApiService.cs
var filters = new List<object>
{
    new[] { "custom_dcs", "=", "MENFOTSLP" }  // Change filter here
};
```

---

## 🔍 Error Handling

### API Errors

- **Connection errors**: Logged, sync fails gracefully
- **Timeout errors**: 30-second timeout, logged
- **Invalid response**: Logged, sync fails gracefully
- **HTTP errors**: Status code and error message logged

### Database Errors

- **Individual item errors**: Logged, but sync continues with other items
- **Connection errors**: Sync fails, error shown to user
- **SQL errors**: Logged, error shown to user

### User Feedback

- Success: MessageBox with counts
- Errors: MessageBox with error details
- Errors logged to error log file

---

## 📊 Performance Considerations

### Paging

- **Page size**: 100 items per page
- **Memory efficient**: Processes one page at a time
- **Network efficient**: Reduces large payloads

### Incremental Sync

- **Faster**: Only fetches modified items
- **Reduces load**: Less data transfer
- **Recommended**: Use incremental sync for regular updates

### Database UPSERT

- **Efficient**: Single query per item (INSERT or UPDATE)
- **Atomic**: No race conditions
- **Idempotent**: Can run multiple times safely

---

## 🚀 Future Enhancements

### Scheduled Sync

1. **Timer-based** (in-app):
   - Add `System.Timers.Timer` to sync periodically
   - Use `SyncFrequencyMinutes` from settings

2. **Task Scheduler** (Windows):
   - Create scheduled task to run sync
   - Run desktop app with sync flag

3. **Windows Service**:
   - Create background service
   - Sync without UI

### Additional Features

- [ ] Sync progress indicator (progress bar)
- [ ] Sync history/log
- [ ] Sync conflict resolution
- [ ] Custom filter configuration in UI
- [ ] Batch size configuration
- [ ] Retry logic for failed items
- [ ] Sync statistics dashboard

---

## 🧪 Testing

### Test Scenarios

1. **Full Sync (First Time)**
   - No `LastItemSyncTimestamp` exists
   - Should fetch all items
   - Should insert all items

2. **Incremental Sync**
   - `LastItemSyncTimestamp` exists
   - Should only fetch modified items
   - Should update existing items

3. **Error Handling**
   - Test with invalid API endpoint
   - Test with invalid API key
   - Test with database connection error
   - Test with network timeout

4. **Edge Cases**
   - Empty response from ERPNext
   - Items with null values
   - Very large item lists (multiple pages)

---

## 📝 Notes

### ERPNext API Authentication

The service uses `Bearer` token authentication:
```csharp
httpClient.DefaultRequestHeaders.Authorization = 
    new AuthenticationHeaderValue("Bearer", settings.ApiKey);
```

Ensure `ApiKey` in settings contains a valid ERPNext API key/token.

### Date Format

ERPNext returns dates in format: `"yyyy-MM-dd HH:mm:ss"` (e.g., `"2024-01-15 10:30:00"`)

The service parses this format and stores in `updated_on` field.

### Filter Format

ERPNext filters use array format:
```json
["field_name", "operator", "value"]
```

Supported operators: `=`, `>`, `<`, `>=`, `<=`, `!=`, `like`, etc.

---

## ✅ Status

**Implementation Status:** ✅ **COMPLETE**

All features from the implementation guide have been implemented:
- ✅ ERPNext API integration
- ✅ Paging support
- ✅ UPSERT logic
- ✅ Incremental sync with `max_modified`
- ✅ Manual sync button
- ⏳ Scheduling (future enhancement)

---

## 🔄 ERPNext ASN/TO status push (update WMS status in ERPNext)

After updating ASN or TO in WMS (e.g. receiving completed, or marking as Exported), the desktop can notify ERPNext by calling:

- **ASN:** `POST {base}/api/method/printechs_wms.api.wms_sync.update_asn_wms_status`  
  Form: `asn_name`, `status`, `wms_ref`
- **TO:** `POST {base}/api/method/printechs_wms.api.wms_sync.update_transfer_order_wms_status`  
  Form: `to_name`, `status`, `wms_ref`

**Configuration:** No new settings. The **base URL** comes from existing desktop configuration: **ErpNext API URL** (or **API Endpoint URL** if not set) in Settings. The **path** (`/api/method/printechs_wms.api.wms_sync.update_...`) is **hardcoded** in `ErpNextWmsSyncApiService` because it is part of the ERPNext app contract.

**WMS ref:** Auto-generated as `BATCH-{yyyyMMdd}-{HHmmss}` (e.g. `BATCH-20260201-013045`) unless you pass a custom value when calling the service.

**When to call:** From your app flow after ASN/TO is updated (e.g. after receiving completes for an ASN, or after marking a TO as exported). Use:
- `ErpNextWmsSyncApiService.UpdateAsnWmsStatusAsync(settings, asnName, "Exported", wmsRef?)`
- `ErpNextWmsSyncApiService.UpdateTransferOrderWmsStatusAsync(settings, toName, "Exported", wmsRef?)`

---

## 📞 Support

For issues or questions:
1. Check error logs: `ErrorLogs/error_YYYY-MM-DD.log`
2. Verify ERPNext API endpoint is accessible
3. Verify API key is valid
4. Check database connection settings
