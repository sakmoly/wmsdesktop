# Cycle Count API Troubleshooting Guide

## Issue: `/count` and `/submit` endpoints not working

### Common Causes & Solutions

## 1. ✅ Authentication Required

**Problem:** Both endpoints require a valid JWT token.

**Solution:**
- Include `Authorization: Bearer <token>` header in your request
- Get token from login endpoint first

**Example Request:**
```bash
curl -X POST http://localhost:3000/api/cycle-count/CC-A1-R01-L1-B1-MK6SK143/count \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "counted_by": "USER-001",
    "lines": [
      {
        "item_code": "SKU-001",
        "bin_location": "A1-R01-L1-B1",
        "actual_qty": 10
      }
    ]
  }'
```

**Error Response (if missing token):**
```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication token required"
}
```

---

## 2. ✅ Server Not Restarted

**Problem:** After building, the server needs to be restarted to load new code.

**Solution:**
1. Stop the current server (Ctrl+C)
2. Restart the server:
   ```bash
   cd wms-api
   npm start
   # or
   node dist/server.cjs
   ```

---

## 3. ✅ Route Order (Verified - Correct)

The routes are registered in the correct order:
- `/:title/start` (line 27)
- `/:title/count` (line 30) ✅
- `/:title/update-line` (line 33)
- `/:title/submit` (line 36) ✅
- `/:title/complete` (line 39)
- `/:title` DELETE (line 42)
- `/:title` GET (line 45)

**Status:** ✅ Routes are correctly ordered (specific routes before generic routes)

---

## 4. ✅ Check Server Logs

**Problem:** Errors might be logged but not visible.

**Solution:**
- Check server console for error messages
- Look for:
  - `[Cycle Count] 📥 Received count submission for task: ...`
  - Database connection errors
  - Validation errors

---

## 5. ✅ Verify Endpoint URLs

**Correct URLs:**
- ✅ `POST /api/cycle-count/:title/count`
- ✅ `POST /api/cycle-count/:title/submit`

**Incorrect URLs (will not work):**
- ❌ `POST /api/cycle-count/count/:title`
- ❌ `POST /cycle-count/:title/count`
- ❌ `GET /api/cycle-count/:title/count` (must be POST)

---

## 6. ✅ Request Body Format

### `/count` Endpoint

**Required Format:**
```json
{
  "counted_by": "USER-001",
  "lines": [
    {
      "item_code": "SKU-001",
      "bin_location": "A1-R01-L1-B1",
      "actual_qty": 10,
      "carton_id": "CARTON-001"  // optional
    }
  ]
}
```

**Common Mistakes:**
- ❌ Missing `lines` array
- ❌ Empty `lines` array
- ❌ Missing `item_code` in line
- ❌ Missing `actual_qty` in line

### `/submit` Endpoint

**Required Format:**
```json
{}
```

**Or no body at all** - just send empty POST request.

**Common Mistakes:**
- ❌ Sending `lines` array (wrong - that's for `/count`)
- ❌ Sending full task object (wrong)

---

## 7. ✅ Task Status Requirements

### `/count` Endpoint
- Task can be in any status (will auto-create if doesn't exist for ad-hoc counts)

### `/submit` Endpoint
- Task **must** be in `"In Progress"` status
- At least one item must be counted

**Error if wrong status:**
```json
{
  "ok": false,
  "error": {
    "code": "INVALID_STATUS",
    "message": "Cannot submit Cycle Count Task. Current status: Draft"
  }
}
```

**Solution:** Call `/start` endpoint first to change status to "In Progress"

---

## 8. ✅ Test Endpoints Manually

### Test `/count`:
```bash
POST http://localhost:3000/api/cycle-count/CC-A1-R01-L1-B1-MK6SK143/count
Headers:
  Authorization: Bearer YOUR_TOKEN
  Content-Type: application/json
Body:
{
  "counted_by": "TEST-USER",
  "lines": [
    {
      "item_code": "SKU-TEST-001",
      "bin_location": "A1-R01-L1-B1",
      "actual_qty": 5
    }
  ]
}
```

### Test `/submit`:
```bash
POST http://localhost:3000/api/cycle-count/CC-A1-R01-L1-B1-MK6MZ1UR/submit
Headers:
  Authorization: Bearer YOUR_TOKEN
  Content-Type: application/json
Body:
{}
```

---

## 9. ✅ Verify Database Connection

**Problem:** Database connection might be failing.

**Check:**
- Database server is running
- Connection credentials in `.env` are correct
- Tables `tabCycleCountTask` and `tabCycleCountLine` exist

---

## 10. ✅ Check for Syntax Errors

**Verify build succeeded:**
```bash
cd wms-api
npm run build
```

**Should see:**
```
✅ Build completed successfully!
📦 Output: dist/server.cjs
```

---

## Quick Diagnostic Checklist

- [ ] Server is running and accessible
- [ ] Authentication token is included in request headers
- [ ] Request method is POST (not GET)
- [ ] URL is correct: `/api/cycle-count/:title/count` or `/submit`
- [ ] Request body format is correct
- [ ] Task exists (for `/submit`, must be "In Progress")
- [ ] Server was restarted after build
- [ ] No errors in server console logs
- [ ] Database connection is working

---

## Expected Responses

### `/count` Success:
```json
{
  "ok": true,
  "message": "Successfully updated 1 lines",
  "data": {
    "title": "CC-A1-R01-L1-B1-MK6SK143",
    "updated_count": 1,
    "counted_items": 1,
    "items_with_discrepancy": 0,
    "total_items": 1
  }
}
```

### `/submit` Success:
```json
{
  "ok": true,
  "message": "Cycle Count Task submitted successfully. Status: Review",
  "data": {
    "title": "CC-A1-R01-L1-B1-MK6MZ1UR",
    "status": "Review",
    "items_with_discrepancy": 2,
    "stock_updated": false,
    "items_adjusted": 0
  }
}
```

---

## Still Not Working?

1. **Check server logs** - Look for error messages
2. **Test with Postman/curl** - Verify request format
3. **Verify authentication** - Get a fresh token
4. **Check database** - Ensure tables exist and task exists
5. **Restart server** - After any code changes
