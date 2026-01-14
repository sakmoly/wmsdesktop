# How to Add carton_id Column to tabCycleCountLine

## Error
```
Error Code: 1054
Unknown column 'carton_id' in 'field list'
```

This error occurs because the `carton_id` column doesn't exist in the `tabCycleCountLine` table yet.

## Solution

You need to run a SQL migration to add the `carton_id` column. Here are three ways to do it:

---

## Method 1: Run SQL Script Directly (Recommended)

### Option A: Using MySQL Command Line

```bash
# Navigate to your project directory
cd "D:\Development Project\Printechs WMS\Wms.Desktop"

# Run the SQL script (replace with your MySQL credentials)
mysql -u root -p wms_db < ADD_CARTON_ID_SIMPLE.sql
```

Or if you need to specify host and port:
```bash
mysql -h localhost -P 3306 -u root -p wms_db < ADD_CARTON_ID_SIMPLE.sql
```

### Option B: Using MySQL Workbench or phpMyAdmin

1. Open MySQL Workbench or phpMyAdmin
2. Connect to your database
3. Open the file `ADD_CARTON_ID_SIMPLE.sql`
4. Execute the script

### Option C: Copy and Paste SQL

1. Open `ADD_CARTON_ID_SIMPLE.sql`
2. Copy the SQL commands
3. Paste into your MySQL client
4. Execute

---

## Method 2: Run the Safe Script (Checks Before Adding)

If you want a script that checks if the column exists first:

```bash
mysql -u root -p wms_db < ADD_CARTON_ID_TO_CYCLE_COUNT_LINE.sql
```

This script will:
- ✅ Check if column exists before adding
- ✅ Check if index exists before adding
- ✅ Won't fail if column already exists

---

## Method 3: Run via Node.js Script

I can create a Node.js script that runs the migration automatically. Let me know if you want this option.

---

## Verify the Column Was Added

After running the script, verify the column exists:

```sql
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tabCycleCountLine'
  AND COLUMN_NAME = 'carton_id';
```

**Expected Result:**
```
COLUMN_NAME: carton_id
DATA_TYPE: varchar
IS_NULLABLE: YES
```

---

## Test the API Again

After adding the column, test your API request again:

```bash
POST http://localhost:3000/api/cycle-count/CC-A1-R01-L1-B1-2B364C8D/count
```

The `carton_id` should now be saved correctly!

---

## Troubleshooting

### If you get "Duplicate column name" error:
- The column already exists - you can ignore this error
- The API should work now

### If you get "Access denied" error:
- Check your MySQL username and password
- Make sure you have ALTER TABLE permissions

### If the column still doesn't exist after running:
- Check which database you're connected to
- Verify the table name is correct: `tabCycleCountLine` (case-sensitive in some systems)

---

## Quick SQL Command (Copy-Paste)

If you just want to run the commands directly:

```sql
ALTER TABLE tabCycleCountLine 
ADD COLUMN carton_id VARCHAR(100) NULL AFTER bin_location;

ALTER TABLE tabCycleCountLine 
ADD INDEX idx_carton_id (carton_id);
```

