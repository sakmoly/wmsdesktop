# Postman Troubleshooting - Putaway API

## Error: "Unexpected token 'P', \"POST /api/\"... is not valid JSON"

This error occurs when the request body is not being sent as JSON.

## ✅ Solution: Check Postman Settings

### Step 1: Verify Body Type
1. In Postman, make sure you're in the **Body** tab
2. Select **raw** (not form-data, x-www-form-urlencoded, or binary)
3. In the dropdown next to "raw", select **JSON** (not Text, JavaScript, etc.)

### Step 2: Verify Headers
1. Go to the **Headers** tab
2. Make sure `Content-Type` is set to `application/json`
3. If it's not there, add it:
   - Key: `Content-Type`
   - Value: `application/json`

### Step 3: Verify Authorization
1. Go to the **Authorization** tab
2. Select **Bearer Token**
3. Enter your token in the Token field

## ✅ Correct Postman Setup

### Request Configuration:
```
Method: POST
URL: http://localhost:3000/api/putaway/complete
```

### Headers Tab:
```
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN_HERE
```

### Body Tab:
- ✅ Select: **raw**
- ✅ Select: **JSON** (from dropdown)
- ✅ Paste your JSON:

```json
{
  "putaway_task": "PUT-TEST-101",
  "performed_by": "USER-001",
  "items": [
    {
      "item_code": "SKU-JEANS-021-BLU-32",
      "qty": 50.00,
      "source_bin": "DOCK-01",
      "target_bin": "A1-R01-L1-B1",
      "completed": true
    }
  ]
}
```

## Common Mistakes

### ❌ Wrong: Body Type = form-data
This sends data as form fields, not JSON

### ❌ Wrong: Body Type = x-www-form-urlencoded
This sends data as URL-encoded, not JSON

### ❌ Wrong: Body Type = raw, but dropdown = Text
This sends as plain text, not JSON

### ✅ Correct: Body Type = raw, dropdown = JSON
This sends as proper JSON

## Quick Test

Try this minimal request first:

**URL:** `POST http://localhost:3000/api/putaway/complete`

**Headers:**
```
Content-Type: application/json
```

**Body (raw, JSON):**
```json
{
  "putaway_task": "PUT-TEST-101"
}
```

If this works, then add the rest of the fields.

## Alternative: Use cURL

If Postman continues to have issues, use cURL:

```bash
curl -X POST http://localhost:3000/api/putaway/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "putaway_task": "PUT-TEST-101",
    "performed_by": "USER-001",
    "items": [
      {
        "item_code": "SKU-JEANS-021-BLU-32",
        "qty": 50.00,
        "source_bin": "DOCK-01",
        "target_bin": "A1-R01-L1-B1",
        "completed": true
      }
    ]
  }'
```

## Verify Server is Running

Make sure your API server is running:
```bash
cd wms-api
npm start
```

Check health endpoint:
```
GET http://localhost:3000/health
```

Should return: `{"status":"ok","message":"WMS API Server is running"}`

