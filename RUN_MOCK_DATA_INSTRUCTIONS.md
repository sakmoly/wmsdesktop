# How to Run Material Request Mock Data Script

## ✅ Fixed Issues

The script has been fixed to use the correct column name `requested_date` (instead of `request_date`).

## Running the Script

### Option 1: Using PowerShell (Current Directory)
```powershell
cd "wms-api"
node run-material-request-mock-data-with-items.js
```

### Option 2: Using Command Prompt
```cmd
cd wms-api
node run-material-request-mock-data-with-items.js
```

### Option 3: Using Full Path (from any directory)
```powershell
node "wms-api\run-material-request-mock-data-with-items.js"
```

## What the Script Does

1. ✅ Connects to your database (using .env file settings)
2. ✅ Creates tables if they don't exist (tabMaterialRequest, tabMaterialRequestItem)
3. ✅ Fetches items from `tabItem` table
4. ✅ Fetches warehouses and showrooms from `tabWarehouse` table
5. ✅ Creates 5 Material Requests with different statuses:
   - MR-0001: Draft
   - MR-0002: Submitted  
   - MR-0003: In Progress
   - MR-0004: Picked
   - MR-0005: Draft
6. ✅ Each Material Request contains 2-4 items with random quantities (5-50)
7. ✅ Shows verification statistics

## Requirements

- Items must exist in `tabItem` table
- Warehouses must exist in `tabWarehouse` table (warehouse_type = 'Warehouse')
- Showrooms must exist in `tabWarehouse` table (warehouse_type = 'Store' or 'Showroom')
- Database connection configured in `.env` file

## Expected Output

```
==========================================
Material Request Mock Data Generation
(Using items from tabItem)
==========================================

✅ Connected to database: localhost:3306/wms_desktop

🔍 Checking if tables exist...
✅ Tables checked/created

📦 Fetching items from tabItem...
✅ Found X items in tabItem

✅ Using warehouse: WH-MAIN
✅ Using showroom: SHOWROOM-001

📝 Inserting Material Requests...
✅ Created: MR-0001 (Status: Draft, Items: 3, Total Qty: 45)
✅ Created: MR-0002 (Status: Submitted, Items: 2, Total Qty: 30)
...

==========================================
✅ Successfully created: 5 Material Requests
==========================================

📊 Verification:
✅ Material Request documents: 5
✅ Material Request items: 15
...
```

## Note on Controller Bug

⚠️ **Important:** The API controller (`materialRequestController.js`) currently uses `request_date` in SELECT queries, but the database column is `requested_date`. This is a separate issue that needs to be fixed in the controller code. The mock data script is now fixed and will work correctly.

