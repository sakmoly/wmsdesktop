# ERPNext Filter Format Fix

## 🔍 Issue Found

**Error from logs:**
```
AttributeError: 'list' object has no attribute 'items'
File "apps/printechs_wms/printechs_wms/api/item.py", line 43
    for key, value in filters.items():
```

**Root Cause:** The ERPNext API method `get_items_compact` expects `filters` as a **dictionary** (so it can call `.items()`), but we were sending a **list of arrays**.

---

## ✅ Fix Applied

**Changed filters format from:**
```json
{
  "filters": [
    ["custom_dcs", "=", "MENFOTSLP"]
  ]
}
```

**To:**
```json
{
  "filters": {
    "custom_dcs": "MENFOTSLP"
  }
}
```

---

## 🧪 Testing

### Test 1: Use "Test Sync" Button

1. **Open Items view**
2. **Click "Test Sync" button** (new button added)
3. **Review test results:**
   - ✅ Check Settings
   - ✅ Test API Call
   - ✅ Validate Items
   - ✅ Test Database Connection
   - ✅ Test Sync Process

### Test 2: Manual Test with Postman

**Request:**
```http
POST http://192.168.103.187:88/api/method/printechs_wms.api.item.get_items_compact
Authorization: token 9c9cddef8b35474:8c32cc7ca4afbec
Content-Type: application/json
```

**Body (Dictionary format):**
```json
{
  "filters": {
    "custom_dcs": "MENFOTSLP"
  },
  "fields": ["item_code", "item_name"],
  "limit": 10,
  "offset": 0
}
```

**Expected Response:**
```json
{
  "message": {
    "data": [
      {
        "item_code": "ITEM-001",
        "item_name": "Item Name"
      }
    ]
  }
}
```

---

## 📝 Note on Filter Format

If the dictionary format doesn't work for complex filters (like date ranges), you may need to:

1. **Check ERPNext API documentation** for the exact format
2. **Contact ERPNext developer** to confirm expected format
3. **Try alternative formats:**
   - Dictionary: `{"custom_dcs": "MENFOTSLP"}`
   - Dictionary with operators: `{"custom_dcs": {"=": "MENFOTSLP"}}`
   - Mixed format (if API supports it)

---

## ✅ Status

**Fixed:** Changed filters from list to dictionary format
**Next:** Rebuild and test sync again
