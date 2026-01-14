# Postman Request Fix - Update Mode

## ❌ Current Error

```
SyntaxError: Unexpected token 'P', "POST /api/"... is not valid JSON
```

**Cause:** The request body contains the HTTP method line (`POST /api/events/batch`), which should NOT be in the body.

## ✅ How to Fix in Postman

### Step 1: Check Request Method
- **Method:** `POST` (in dropdown)
- **URL:** `http://localhost:3000/api/events/batch`

### Step 2: Check Headers
Go to **"Headers"** tab and ensure:
```
Content-Type: application/json
Authorization: Bearer {your_token}
```

### Step 3: Check Body Tab
1. Go to **"Body"** tab
2. Select **"raw"** radio button
3. Select **"JSON"** from dropdown (NOT "Text")
4. **Body should contain ONLY this:**

```json
{
  "update_mode": true,
  "events": [
    {
      "tc_id": "TC-MR-123459-1768157787512",
      "item_code": "SKU-HAT-301-BLU-OS",
      "carton_id": "PAW-ASN365425473-1768138301111",
      "qty": 61.0,
      "user_id": "USER-150526"
    }
  ]
}
```

### ❌ DO NOT Include This in Body:
```
POST /api/events/batch

{
  ...
}
```

The HTTP method line should **NOT** be in the body. The URL goes in the URL field, not in the body.

## Visual Guide

### ✅ Correct Postman Setup:

```
┌─────────────────────────────────────┐
│ POST  http://localhost:3000/api/   │ ← URL field
│       events/batch                  │
├─────────────────────────────────────┤
│ Headers (2)                         │
│ Content-Type: application/json      │
│ Authorization: Bearer {token}       │
├─────────────────────────────────────┤
│ Body                                │
│ ○ none  ○ form-data  ○ x-www...    │
│ ● raw   ○ binary     ○ GraphQL     │
│         ▼ JSON                      │ ← Select JSON
├─────────────────────────────────────┤
│ {                                   │
│   "update_mode": true,              │ ← ONLY JSON here
│   "events": [...]                   │
│ }                                   │
└─────────────────────────────────────┘
```

### ❌ Incorrect (What Causes Error):

```
┌─────────────────────────────────────┐
│ Body                                │
│ ● raw   ▼ Text                      │ ← Wrong: Text instead of JSON
├─────────────────────────────────────┤
│ POST /api/events/batch              │ ← Wrong: HTTP method in body
│                                     │
│ {                                   │
│   "update_mode": true,              │
│   ...                               │
│ }                                   │
└─────────────────────────────────────┘
```

## Quick Test

After fixing, you should see:
- ✅ Status: `200 OK`
- ✅ Response: `{"ok": true, "message": "Quantity updates processed", ...}`

If you still see the error:
1. Clear the body completely
2. Type the JSON again (don't copy-paste if it includes the method line)
3. Make sure "JSON" is selected, not "Text"

---

**Status:** Client-side configuration issue  
**Fix:** Update Postman request format as shown above
