# How to Use Postman Collection for WMS API Testing

## 📋 Overview

This guide explains how to import and use the Postman collection to test all WMS API endpoints with carton_id support.

---

## 🚀 Quick Start

### Step 1: Import Collection

1. **Open Postman**
2. **Click "Import"** button (top left)
3. **Select File** → Choose `WMS_API_CARTON_ID_POSTMAN_COLLECTION.json`
4. **Click "Import"**

### Step 2: Import Environment (Optional but Recommended)

1. **Click "Import"** again
2. **Select File** → Choose `POSTMAN_ENVIRONMENT_TEMPLATE.json`
3. **Click "Import"**
4. **Select the environment** from dropdown (top right): "WMS API - Local"

### Step 3: Configure Environment Variables

1. **Click the eye icon** (top right) next to environment dropdown
2. **Click "Edit"** next to "WMS API - Local"
3. **Update values:**
   - `base_url`: Your API server URL (default: `http://localhost:3000`)
   - `auth_token`: Will be auto-filled after login
   - Update test values as needed (putaway_task, material_request, etc.)

### Step 4: Login First

1. **Expand "Authentication" folder**
2. **Click "Login" request**
3. **Update username/password** in request body if needed
4. **Click "Send"**
5. **Token will be automatically saved** to environment variable

### Step 5: Test Endpoints

Now you can test any endpoint in the collection. The auth token will be automatically included in all requests.

---

## 📁 Collection Structure

### 1. Authentication
- **Login**: Get authentication token (auto-saves to environment)

### 2. Putaway Operations
- **Get Putaway Tasks**: List all putaway tasks (includes carton_id in lines)
- **Complete Putaway (with Carton ID)**: Complete putaway with carton_id
- **Assign Rack (with Carton ID)**: Assign location with carton_id

### 3. Picking Operations (Material Request)
- **Get Material Requests**: List all material requests
- **Get Material Request by Title**: Get single MR details
- **Pick Items (with Carton ID)**: Pick items with carton_id validation
- **Pick Items (Bin Level)**: Pick items without carton_id (bin-level mode)

### 4. Cycle Count Operations
- **Get Cycle Count Tasks**: List all cycle count tasks
- **Get Cycle Count Task by Title**: Get single task with lines (includes carton_id)
- **Submit Count Lines (with Carton ID)**: Submit counts with carton_id
- **Submit Count Lines (Bin Level)**: Submit counts without carton_id

### 5. Stock Transactions
- **Get Stock Transactions (All)**: Get all transactions (includes carton_id)
- **Get Stock Transactions (Filter by Item)**: Filter by item_code
- **Get Stock Transactions (Filter by Transaction Type)**: Filter by type
- **Get Stock Transactions (Filter by Date Range)**: Filter by date

### 6. Error Testing
- **Pick Items - Carton Not Found**: Test error handling
- **Pick Items - Carton Bin Mismatch**: Test validation
- **Pick Items - Insufficient Carton Stock**: Test stock validation

---

## 🔧 Environment Variables

### Required Variables

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `base_url` | API server base URL | `http://localhost:3000` |
| `auth_token` | Authentication token | (Auto-filled after login) |

### Test Data Variables

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `test_putaway_task` | Putaway task ID for testing | `PUT-20250120-0001` |
| `test_material_request` | Material Request ID for testing | `MR-0001` |
| `test_cycle_count_task` | Cycle Count Task ID for testing | `CC-0001` |
| `test_carton_id` | Carton ID for testing | `CARTON-001` |
| `test_item_code` | Item code for testing | `SKU-001` |
| `test_bin_location` | Bin location for testing | `A1-R01-L1-B1` |
| `test_warehouse` | Warehouse for testing | `WH-MAIN` |

---

## ✅ Test Scripts

The collection includes automated test scripts that:

1. **Validate Response Status**: Check if status code is 200/400/etc.
2. **Validate Response Structure**: Check if response has expected fields
3. **Validate Carton ID**: Check if carton_id is present in responses
4. **Log Results**: Console logs for debugging

### View Test Results

1. **Click on any request**
2. **Click "Send"**
3. **Click "Test Results" tab** (below response)
4. **View test results** and console logs

---

## 🧪 Testing Workflow

### Test Putaway with Carton ID

1. **Get Putaway Tasks** → Verify tasks exist
2. **Complete Putaway (with Carton ID)** → Update request body with actual task ID
3. **Check response** → Verify `carton_id` in stock_updates

### Test Picking with Carton ID

1. **Get Material Requests** → Find a Material Request to test
2. **Get Material Request by Title** → Verify MR exists
3. **Pick Items (with Carton ID)** → Update request with actual MR title and carton_id
4. **Check response** → Verify `carton_stock_updated: true`

### Test Cycle Count with Carton ID

1. **Get Cycle Count Tasks** → Find a task to test
2. **Get Cycle Count Task by Title** → Verify task exists
3. **Submit Count Lines (with Carton ID)** → Update request with actual task title
4. **Check response** → Verify `carton_id` in lines

### Test Stock Transactions

1. **Get Stock Transactions (All)** → View all transactions
2. **Check response** → Verify `carton_id` field exists
3. **Filter by Item** → Test filtering
4. **Filter by Date Range** → Test date filtering

---

## 🐛 Troubleshooting

### Issue: "401 Unauthorized"

**Solution:**
1. Run **Login** request first
2. Verify token is saved in environment
3. Check if token is expired (login again)

### Issue: "404 Not Found"

**Solution:**
1. Verify `base_url` is correct
2. Check if API server is running
3. Verify endpoint path is correct

### Issue: "400 Bad Request - Carton Not Found"

**Solution:**
1. Verify carton exists in database
2. Check carton_id spelling
3. Run migration 005 if carton tables don't exist

### Issue: "400 Bad Request - Carton Bin Mismatch"

**Solution:**
1. Verify carton is in the specified bin
2. Check carton's current_bin_id
3. Move carton to correct bin first

---

## 📝 Customizing Requests

### Update Request Body

1. **Click on any request**
2. **Click "Body" tab**
3. **Update JSON** with your test data
4. **Use environment variables**: `{{test_carton_id}}`, `{{test_item_code}}`, etc.

### Add New Requests

1. **Right-click on folder**
2. **Click "Add Request"**
3. **Configure request** (method, URL, headers, body)
4. **Add test scripts** (optional)

---

## 🔄 Running Collection

### Run All Requests

1. **Click on collection name** (top level)
2. **Click "Run" button** (top right)
3. **Select requests** to run
4. **Click "Run WMS API - Carton ID Support"**
5. **View results** in Runner window

### Run Folder

1. **Right-click on folder** (e.g., "Putaway Operations")
2. **Click "Run folder"**
3. **Select requests** to run
4. **Click "Run"**

---

## 📊 Viewing Results

### Response View

- **Pretty**: Formatted JSON response
- **Raw**: Raw response text
- **Preview**: HTML preview (if applicable)

### Test Results

- **Pass/Fail**: Green checkmark or red X
- **Test Name**: Name of test
- **Assertion**: What was tested

### Console Logs

- **Click "Console"** (bottom of Postman)
- **View logs** from test scripts
- **Debug issues** with detailed logs

---

## 🎯 Best Practices

1. **Always login first** before testing other endpoints
2. **Use environment variables** for easy configuration
3. **Update test data** in request bodies with actual IDs
4. **Check test results** after each request
5. **Review console logs** for debugging
6. **Save successful requests** as examples

---

## 📞 Support

If you encounter issues:

1. **Check API server logs** for errors
2. **Verify database** has required data
3. **Check environment variables** are set correctly
4. **Review test scripts** for validation logic
5. **Check API documentation** for endpoint details

---

**Last Updated:** 2026-01-07  
**Postman Version:** 10.0+  
**Collection Version:** 1.0

