# Postman Login Guide - Step by Step

## 🎯 Goal
Login to get an authentication token, then use it to test the ASN endpoint.

---

## 📋 Step 1: Login to Get Token

### Setup Request

1. **Open Postman**
2. **Create New Request:**
   - Click "New" → "HTTP Request"
   - Or press `Ctrl + N` (Windows) / `Cmd + N` (Mac)

3. **Configure Request:**
   - **Method:** Select `POST` from dropdown
   - **URL:** Enter your backend API URL:
     ```
     http://localhost:3000/api/auth/login
     ```
     *(Replace `localhost:3000` with your actual backend server URL if different)*

4. **Set Headers:**
   - Click "Headers" tab
   - Add header:
     - **Key:** `Content-Type`
     - **Value:** `application/json`
     *(Postman may add this automatically)*

5. **Set Body:**
   - Click "Body" tab
   - Select `raw` radio button
   - Select `JSON` from dropdown (right side)
   - Enter JSON body:
     ```json
     {
       "user_code": "your_username",
       "password": "your_password"
     }
     ```
     *(Replace with your actual user_code and password)*
     
     **⚠️ IMPORTANT:** Use `user_code` (not `username`) - this is what the backend expects!

6. **Send Request:**
   - Click "Send" button
   - Wait for response

### Expected Response

**Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJVU0VSLTE3MjE4OCIsImlhdCI6MTczNTA0ODQ4NCwiZXhwIjoxNzM1MDUyMDg0fQ.xxxxxxxxxxxxx",
    "user": {
      "user_id": "USER-172188",
      "username": "your_username",
      ...
    }
  }
}
```

**Error (400 Bad Request - Validation):**
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "user_code and password are required",
    "details": null
  }
}
```
*(This means you used `username` instead of `user_code`)*

**Error (401 Unauthorized):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid user_code or password"
  }
}
```

### Save the Token

**Copy the token from the response:**
- Look for `"token"` field in the response
- Copy the entire token string (it's long, starts with `eyJ...`)
- Save it somewhere safe (you'll need it for next step)

---

## 📋 Step 2: Test ASN Endpoint with Token

### Setup Request

1. **Create New Request:**
   - Click "New" → "HTTP Request"
   - Or press `Ctrl + N` / `Cmd + N`

2. **Configure Request:**
   - **Method:** Select `GET` from dropdown
   - **URL:** Enter:
     ```
     http://localhost:3000/api/master/asns
     ```
     *(Replace `localhost:3000` with your actual backend server URL)*

3. **Set Authorization Header:**
   - Click "Authorization" tab
   - **Type:** Select `Bearer Token` from dropdown
   - **Token:** Paste the token you copied from Step 1
     *(The token you got from login response)*

   **OR manually set in Headers:**
   - Click "Headers" tab
   - Add header:
     - **Key:** `Authorization`
     - **Value:** `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
       *(Replace with your actual token)*

4. **Send Request:**
   - Click "Send" button
   - Wait for response

### Expected Response

**Success (200 OK):**
```json
[
  {
    "asn_no": "ASN-0001",  // ✅ 4-digit format (matches database)
    "status": "Submitted",
    "purchase_order": "PO-2024-001",
    "supplier": "Supplier ABC",
    "shipment_date": "2024-12-20",
    "expected_arrival_date": "2024-12-25",
    "total_shipped_qty": 150.00,
    "airway_bill_no": null,
    "shipment_type": "Road",
    "updated_on": "2024-12-24T16:14:04.000Z",
    "total_carton_count": 2
  },
  {
    "asn_no": "ASN-0002",  // ✅ 4-digit format
    "status": "Submitted",
    ...
  }
]
```

**Error (401 Unauthorized):**
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authentication token required"
  }
}
```
*(This means token is missing or invalid - check Step 1)*

---

## 🔍 Verify ASN Format

### Check the Response

Look at the `asn_no` field in the response:

**✅ CORRECT (4-digit format):**
```json
"asn_no": "ASN-0001"  // ✅ Correct - 4 digits
"asn_no": "ASN-0002"  // ✅ Correct - 4 digits
```

**❌ WRONG (5-digit format):**
```json
"asn_no": "ASN-00001"  // ❌ Wrong - 5 digits (still normalizing)
"asn_no": "ASN-00002"  // ❌ Wrong - 5 digits
```

### What This Means

- **If 4-digit format** → Backend is correct! ✅
- **If 5-digit format** → Backend is still normalizing ❌

---

## 💡 Postman Tips

### Tip 1: Save Token as Environment Variable

1. **Create Environment:**
   - Click gear icon (⚙️) top right
   - Click "Add" to create new environment
   - Name it "WMS API"

2. **Add Variables:**
   - `base_url`: `http://localhost:3000`
   - `token`: (leave empty, will be set after login)

3. **Use in Requests:**
   - URL: `{{base_url}}/api/auth/login`
   - Authorization: `{{token}}`

4. **Set Token After Login:**
   - After login, copy token
   - Go to environment variables
   - Set `token` value
   - Now all requests use `{{token}}` automatically

### Tip 2: Create Collection

1. **Create Collection:**
   - Click "New" → "Collection"
   - Name it "WMS API"

2. **Add Requests:**
   - Add "Login" request
   - Add "Get ASNs" request

3. **Set Collection Authorization:**
   - Click collection → "Authorization" tab
   - Set Bearer Token: `{{token}}`
   - All requests in collection inherit this

### Tip 3: Use Tests Tab (Auto-save Token)

In Login request, add this in "Tests" tab:

```javascript
// Auto-save token to environment variable
if (pm.response.code === 200) {
    var jsonData = pm.response.json();
    if (jsonData.success && jsonData.data.token) {
        pm.environment.set("token", jsonData.data.token);
        console.log("Token saved:", jsonData.data.token);
    }
}
```

Now token is automatically saved after login!

---

## 📋 Quick Checklist

### Login Request
- [ ] Method: `POST`
- [ ] URL: `http://localhost:3000/api/auth/login`
- [ ] Header: `Content-Type: application/json`
- [ ] Body: JSON with username and password
- [ ] Response: Copy token from response

### ASN Request
- [ ] Method: `GET`
- [ ] URL: `http://localhost:3000/api/master/asns`
- [ ] Authorization: `Bearer {your_token}`
- [ ] Response: Check `asn_no` format (should be 4-digit)

---

## 🚨 Troubleshooting

### Issue: "Authentication token required"

**Solution:**
- Make sure you copied the entire token (it's long)
- Check token starts with `eyJ...`
- Verify "Bearer " prefix is included (with space)
- Try logging in again to get fresh token

### Issue: "Invalid username or password"

**Solution:**
- Check username and password are correct
- Verify backend server is running
- Check if login endpoint is correct

### Issue: "Route not found"

**Solution:**
- Verify backend server is running
- Check URL is correct: `http://localhost:3000/api/master/asns`
- Verify route is registered in backend

### Issue: Connection Error

**Solution:**
- Check backend server is running
- Verify URL is correct
- Check firewall/network settings

---

## 🎯 Summary

1. **Login:** `POST /api/auth/login` with username/password
2. **Get Token:** Copy token from response
3. **Test ASN:** `GET /api/master/asns` with `Bearer {token}`
4. **Verify Format:** Check `asn_no` is 4-digit (ASN-0001)

---

**Ready to test!** Follow these steps and you'll be able to verify the ASN format from the backend API.

