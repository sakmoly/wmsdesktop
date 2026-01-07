# Putaway API - Quick Start Guide

## ✅ Status
- API Server: Running on port 3000
- Backend Code: All fixes applied
- Postman Collection: Ready to import

---

## 📋 Step-by-Step Testing

### 1. Import Postman Collection
- File: `Putaway_API.postman_collection.json`
- Import into Postman
- Set `base_url` variable: `http://localhost:3000/api` (or your server IP)

### 2. Get Authentication Token
- Run **"Login (Get Token)"** request
- Token will be auto-saved to collection variable

### 3. Test Putaway Workflow

**Step 1: Close Box** (Creates Putaway Task)
```
POST /api/boxes/close
Body: { "box_id": "BOX-WHMAIN-383712", "closed_by": "USER-786249" }
```

**Step 2: Get Tasks** (Verify Task Created)
```
GET /api/putaway/tasks?status=Open
```

**Step 3: Scan Location** (Update Status to "In Progress")
```
POST /api/putaway/scan-transfer-carton
Body: { "box_id": "BOX-WHMAIN-383712", "location_id": "A1-R01-L1-B1", "user_id": "USER-786249" }
```

**Step 4: Complete Putaway** (Update Status to "Completed")
```
POST /api/putaway/complete
Body: {
  "putaway_task": "PUT-20260101-0001",
  "performed_by": "USER-786249",
  "location_id": "A1-R01-L1-B1",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 75,
      "location_id": "A1-R01-L1-B1",
      "completed": true
    }
  ]
}
```

---

## 🔍 All API Endpoints

1. **POST /api/boxes/close** - Close box (creates putaway task automatically)
2. **GET /api/putaway/tasks** - Get list of putaway tasks
3. **POST /api/putaway/scan-transfer-carton** - Scan location for putaway
4. **POST /api/putaway/complete** - Complete putaway task
5. **GET /api/putaway/remaining-items** - Get remaining items for ASN
6. **POST /api/putaway/create-task-for-remaining-items** - Create task manually
7. **POST /api/putaway/assign-rack** - Assign rack (legacy method)

---

## 📝 Important Notes

1. **Include location_id in items**: When completing putaway, include `location_id` in each item to avoid validation errors.

2. **Box must be closed first**: Putaway task is created automatically when a warehouse box is closed.

3. **Check database**: After each step, verify:
   - Task created in `tabPutawayTask`
   - Lines created in `tabPutawayLine` (lines_count > 0)
   - Stock updated in `tabStockLedger` after completion

---

## 📚 Documentation Files

- `PUTAWAY_TESTING_GUIDE.md` - Detailed testing guide with database queries
- `Putaway_API.postman_collection.json` - Complete Postman collection

---

## 🐛 Common Issues

**No lines created**: Check if `SORT_TO_BOX` events exist in `tabWmsScanEvent` for the box.

**Validation error**: Ensure `location_id` is included in each item when completing.

**Task not found**: Verify task exists using `GET /api/putaway/tasks`.

---

## ✨ Ready to Test!

All backend code is ready. Import the Postman collection and start testing!

