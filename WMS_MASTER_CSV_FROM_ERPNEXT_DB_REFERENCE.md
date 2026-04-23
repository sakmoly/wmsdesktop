# WMS Desktop – Master data CSV columns (for export from ERPNext database)

Use this to generate **CSV files** (or `SELECT ... INTO OUTFILE`) from the **ERPNext MariaDB/MySQL** database and load into the **WMS Desktop MySQL** database.

**Load order (recommended):**  
1) Item Group → 2) Warehouse → 3) Item → 4) Location (if you use it)

---

## 1. Item Group → `tabItemGroup`

### WMS table: `tabItemGroup`

| CSV column (header)   | WMS column        | Required | Type / notes |
|-----------------------|-------------------|----------|--------------|
| `name`                | `name`            | **Yes**  | PK, max 100  |
| `parent_item_group`   | `parent_item_group` | No    | Max 100; empty = root |
| `is_group`            | `is_group`        | No       | `0` or `1` (boolean) |

`created_at` / `updated_at` default on insert.

### ERPNext source (typical)

ERPNext table: **`tabItem Group`** (space in name in DB: often `` `tabItem Group` ``).

| ERPNext column        | → CSV / WMS column    |
|-----------------------|------------------------|
| `item_group_name`     | `name`                 |
| `parent_item_group`   | `parent_item_group`    |
| `is_group`            | `is_group`             |

**Example SQL (ERPNext DB):**

```sql
SELECT
  ig.item_group_name   AS name,
  NULLIF(TRIM(ig.parent_item_group), '') AS parent_item_group,
  ig.is_group
FROM `tabItem Group` ig
ORDER BY ig.lft;
```

---

## 2. Warehouse → `tabWarehouse`

### WMS table: `tabWarehouse`

| CSV column (header)   | WMS column         | Required | Type / notes |
|-----------------------|--------------------|----------|--------------|
| `code`                | `code`             | **Yes**  | PK, max 100 (ERPNext warehouse **name** is usually the code) |
| `name`                | `name`             | **Yes**  | Max 255 (use `warehouse_name`) |
| `warehouse_type`      | `warehouse_type`   | No       | e.g. Store, Warehouse |
| `is_group`            | `is_group`         | No       | `0` or `1` |
| `parent_warehouse`    | `parent_warehouse` | No       | Max 100 |

### ERPNext source

Table: **`tabWarehouse`**

| ERPNext column     | → CSV / WMS column   |
|--------------------|-----------------------|
| `name`             | `code` (and key)      |
| `warehouse_name`   | `name`                |
| `warehouse_type`   | `warehouse_type`     |
| `is_group`         | `is_group`           |
| `parent_warehouse` | `parent_warehouse`   |

**Example SQL (ERPNext DB):**

```sql
SELECT
  w.name              AS code,
  w.warehouse_name    AS name,
  w.warehouse_type,
  w.is_group,
  NULLIF(TRIM(w.parent_warehouse), '') AS parent_warehouse
FROM `tabWarehouse` w
WHERE IFNULL(w.disabled, 0) = 0;
```

*(Adjust `WHERE` if you only want leaf warehouses like the desktop API: `is_group = 0` and types Store/Warehouse.)*

---

## 3. Item → `tabItem` (main bulk: ~400k rows)

### WMS table: `tabItem`

Columns match **`DatabaseService`** / **`ItemSyncService`** upsert.

| CSV column (header)   | WMS column        | Required | Notes |
|-----------------------|-------------------|----------|--------|
| `code`                | `code`            | **Yes**  | PK; Item Code |
| `name`                | `name`            | **Yes**  | Item name |
| `item_group`          | `item_group`      | No       | Must exist in `tabItemGroup.name` if set |
| `color`               | `color`           | No       | Custom field in ERPNext if used |
| `size`                | `size`            | No       | Custom field |
| `year`                | `year`            | No       | Custom field |
| `season`              | `season`          | No       | Custom field |
| `brand`               | `brand`           | No       | Link or custom field |
| `default_uom`         | `default_uom`     | No       | Often same as `stock_uom` |
| `stock_uom`           | `stock_uom`       | No       | From `tabItem.stock_uom` |
| `barcode`             | `barcode`         | No       | |
| `maintain_stock`      | `maintain_stock`  | No       | `0` / `1` (ERPNext `is_stock_item`) |
| `stock_qty`           | `stock_qty`       | No       | Default `0` for bulk load; WMS may compute later |
| `reserved_qty`        | `reserved_qty`    | No       | Default `0` |
| `disabled`            | `disabled`        | No       | `0` / `1` |
| `wms_modified`        | `wms_modified`    | No       | Datetime; ERPNext `custom_wms_modified` or `modified` |
| `updated_on`          | `updated_on`      | No       | Often same as `modified` |

**Minimum practical CSV for bulk load:**  
`code`, `name`, `item_group`, `stock_uom`, `stock_uom` → `default_uom`, `barcode`, `maintain_stock`, `disabled`  
(leave `stock_qty`/`reserved_qty` as `0` unless you intentionally copy from ERPNext stock.)

### ERPNext source

Table: **`tabItem`**

Typical mapping:

| ERPNext (`tabItem`)   | → WMS CSV column     |
|-----------------------|----------------------|
| `name`                | `code`               |
| `item_name`           | `name`               |
| `item_group`          | `item_group`         |
| `stock_uom`           | `stock_uom` and `default_uom` |
| `barcode`             | `barcode`            |
| `is_stock_item`       | `maintain_stock` (0/1) |
| `disabled`            | `disabled` (0/1)     |
| `modified`            | `updated_on` / `wms_modified` (format as `YYYY-MM-DD HH:MM:SS`) |
| Custom: `color`, `size`, `year`, `season`, `brand` | same column names |

If your site uses **`custom_wms_modified`** on Item, add:

```sql
UNIX_TIMESTAMP(i.custom_wms_modified)  -- or export as datetime string
```

**Example SQL (ERPNext DB) – adjust custom field names to match your site:**

```sql
SELECT
  i.name                    AS code,
  i.item_name               AS name,
  NULLIF(TRIM(i.item_group), '')        AS item_group,
  NULLIF(TRIM(i.color), '')             AS color,
  NULLIF(TRIM(i.size), '')              AS size,
  NULLIF(TRIM(i.year), '')              AS year,
  NULLIF(TRIM(i.season), '')            AS season,
  NULLIF(TRIM(i.brand), '')             AS brand,
  i.stock_uom               AS default_uom,
  i.stock_uom               AS stock_uom,
  NULLIF(TRIM(i.barcode), '')           AS barcode,
  IFNULL(i.is_stock_item, 1)            AS maintain_stock,
  0                         AS stock_qty,
  0                         AS reserved_qty,
  IFNULL(i.disabled, 0)                 AS disabled,
  i.custom_wms_modified     AS wms_modified,
  i.modified                AS updated_on
FROM `tabItem` i
WHERE IFNULL(i.is_sales_item, 1) = 1 OR i.is_stock_item = 1;  -- optional filter; adjust to your policy
```

**Discover custom field column names on your site:**

```sql
SHOW COLUMNS FROM `tabItem` LIKE '%color%';
SHOW COLUMNS FROM `tabItem` LIKE 'custom%';
```

---

## 4. Location → `tabLocation` (optional)

WMS locations are often **bin-level IDs** built in WMS or from a **custom DocType**; ERPNext may not have a 1:1 “location” table. If you maintain locations in ERPNext (e.g. custom Bin master), map to:

| CSV column (header)      | WMS column              | Required |
|--------------------------|-------------------------|----------|
| `location_id`            | `location_id`           | **Yes**  |
| `warehouse`              | `warehouse`             | **Yes**  | Must match `tabWarehouse.code` |
| `zone`                   | `zone`                  | No       |
| `aisle`                  | `aisle`                 | No       |
| `parent_rack`            | `parent_rack`           | No       |
| `level`                  | `level`                 | No       |
| `bin_id`                 | `bin_id`                | No       |
| `location_type`          | `location_type`         | No       |
| `location_type_detailed` | `location_type_detailed`| No       |
| `is_available`           | `is_available`          | No       | `0` / `1` |
| `capacity_volume_weight` | `capacity_volume_weight`| No       | decimal |

---

## 5. Not in WMS MySQL schema (UI mock / other)

These appear in the **desktop UI** but are **not** defined as core master tables in `DatabaseService` in the same way:

- **Brand** – list view may use mock data; brand on **Item** is stored in `tabItem.brand`.
- **Zone / Aisle / Rack** – often **only** as part of `tabLocation` or separate imports; confirm your DB with `SHOW TABLES`.

---

## 6. CSV format tips

- **Encoding:** UTF-8 (`utf8mb4` on WMS DB).
- **Booleans:** `0` / `1` for MySQL.
- **Decimals:** `stock_qty`, `reserved_qty` use `.` as decimal separator.
- **Headers:** First row = column names exactly as in the first column of each table above (or match your `LOAD DATA` column list).
- **Chunks:** Export 50k–100k rows per file for large Item loads.

---

## 7. Quick reference – WMS column order for `tabItem` (matches `ItemSyncService` insert)

`code`, `name`, `item_group`, `color`, `size`, `year`, `season`, `brand`, `default_uom`, `stock_uom`, `barcode`, `maintain_stock`, `disabled`, `wms_modified`, `updated_on`  
*(plus `stock_qty`, `reserved_qty` if you include them in CSV; default 0 is fine.)*

Use **`INSERT ... ON DUPLICATE KEY UPDATE`** on `code` when loading from scripts, same as `ItemSyncService`.

---

*Generated from WMS Desktop `DatabaseService.cs` and `ItemSyncService.cs` / `ErpNextItem` fields. Adjust ERPNext custom field names per `SHOW COLUMNS FROM \`tabItem\`;` on your server.*
