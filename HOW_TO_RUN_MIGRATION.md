# How to Run Migration 005: Bin + Carton Level Inventory

## Option 1: Using MySQL Command Line (Recommended)

If you have MySQL command line client installed:

```bash
mysql -h localhost -P 3306 -u root -proot -D wms_desktop < MIGRATION_005_BIN_CARTON_INVENTORY.sql
```

Or if password needs to be entered interactively:

```bash
mysql -h localhost -P 3306 -u root -p -D wms_desktop < MIGRATION_005_BIN_CARTON_INVENTORY.sql
```

## Option 2: Using MySQL Workbench

1. Open MySQL Workbench
2. Connect to your database (localhost:3306, user: root, database: wms_desktop)
3. File → Open SQL Script
4. Select `MIGRATION_005_BIN_CARTON_INVENTORY.sql`
5. Click the Execute button (⚡ icon) or press Ctrl+Shift+Enter

## Option 3: Using phpMyAdmin

1. Open phpMyAdmin in your browser
2. Select the `wms_desktop` database
3. Click on the "SQL" tab
4. Copy and paste the contents of `MIGRATION_005_BIN_CARTON_INVENTORY.sql`
5. Click "Go" to execute

## Option 4: Using Database Service (Programmatic)

You can also execute the migration programmatically using the DatabaseService. The migration script is safe to run multiple times (uses IF NOT EXISTS).

## Verification

After running the migration, verify the tables were created:

```sql
SELECT TABLE_NAME, TABLE_ROWS 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'wms_desktop' 
AND TABLE_NAME IN ('tabBin', 'tabCarton', 'tabCartonItem', 'tabCartonStock')
ORDER BY TABLE_NAME;
```

You should see:
- `tabBin` - Bin master table
- `tabCarton` - Carton master table  
- `tabCartonItem` - Carton items table
- `tabCartonStock` - Carton stock table

## What the Migration Does

1. **Creates `tabBin` table** - Master table for bin locations
2. **Creates `tabCarton` table** - Master table for cartons
3. **Creates `tabCartonItem` table** - Items within cartons
4. **Creates `tabCartonStock` table** - Carton-level inventory tracking
5. **Adds `carton_id` column** to `tabStockTransaction` table
6. **Creates default DOCK and STAGING bins** for each warehouse

## Notes

- The migration is **idempotent** - safe to run multiple times
- Uses `IF NOT EXISTS` to prevent errors if tables already exist
- Default bins are created only if they don't already exist
- No data is deleted or modified - only new tables/columns are added

## Troubleshooting

### Error: "Table already exists"
This is OK - the migration uses `IF NOT EXISTS` so it won't fail if tables already exist.

### Error: "Column already exists"
This is OK - the migration checks before adding the `carton_id` column.

### Error: "Access denied"
Make sure your database user has CREATE TABLE and ALTER TABLE permissions.

---

**Migration File:** `MIGRATION_005_BIN_CARTON_INVENTORY.sql`  
**Status:** Ready to execute

