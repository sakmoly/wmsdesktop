# Excel Import Format Documentation

## Overview

The WMS Desktop application supports importing ASN (Advance Shipping Notice) and Transfer Order data from Excel files. This document describes the required Excel format for each import type.

---

## ASN Import Format

### Excel Structure

**One row = One item** (header fields repeated, similar to Transfer Order format)

### Column Layout

| Column | Field Name            | Required | Data Type         | Description                                               | Example      |
| ------ | --------------------- | -------- | ----------------- | --------------------------------------------------------- | ------------ |
| A      | ASN Title             | ✅ Yes   | Text              | Unique ASN identifier (repeated per row)                 | ASN-AAA      |
| B      | Purchase Order        | ❌ No    | Text              | Purchase order number (optional, can be empty)           | PO-001       |
| C      | Supplier              | ✅ Yes   | Text              | Supplier name (repeated per row)                         | XYZ Trading  |
| D      | Shipment Date         | ✅ Yes   | Date (YYYY-MM-DD) | Date when shipment was sent (repeated per row)            | 2025-01-15   |
| E      | Expected Arrival Date | ✅ Yes   | Date (YYYY-MM-DD) | Expected arrival date (repeated per row)                 | 2025-01-20   |
| F      | Total Shipped Qty     | ❌ No    | Decimal           | Total quantity across all items (repeated per row)        | 100.00       |
| G      | Airway Bill No        | ❌ No    | Text              | Airway bill number (for Air shipments, repeated per row) | AWB-12345555 |
| H      | Shipment Type         | ❌ No    | Text              | Shipment type: Air, Sea, Road (repeated per row)          | Air          |
| I      | Item Code             | ✅ Yes   | Text              | Item code/SKU                                             | SKU-HAT-301-BLU-OS |
| J      | Shipped Qty           | ✅ Yes   | Decimal           | Quantity for this item                                    | 50.00        |
| K      | Carton ID             | ❌ No    | Text              | Carton ID for this item                                   | CTN-001      |

### Notes

- **Row 1 must contain headers** (column names)
- **Data starts from Row 2** (one row per item)
- **Header fields (A-H) are repeated** in each row for the same ASN
- **Multiple rows can have the same ASN Title** - all items will be grouped under that ASN
- If an ASN already exists, it will be updated (header and items)
- Empty rows are skipped
- **Total Shipped Qty (Column F)** is optional - if empty, it will be calculated from the sum of all item quantities
- **Purchase Order (Column B)** is optional and can be left empty

### Example Excel Layout

```
| A         | B      | C           | D           | E           | F     | G           | H    | I                  | J     | K       |
|-----------|--------|-------------|-------------|-------------|-------|-------------|------|--------------------|-------|---------|
| ASN Title | PO     | Supplier    | Ship Date   | Arrival Date| Total | Airway Bill | Type | Item Code          | Qty   | Carton  |
| ASN-AAA   |        | XYZ Trading | 2025-01-15  | 2025-01-20  | 100   | AWB-12345555| Air  | SKU-HAT-301-BLU-OS | 50    | CTN-001 |
| ASN-AAA   |        | XYZ Trading | 2025-01-15  | 2025-01-20  | 500   | AWB-12345555| Air  | SKU-HAT-301-GRN-OS | 250   | CTN-444 |
| ASN-AAA   |        | XYZ Trading | 2025-01-15  | 2025-01-20  | 500   | AWB-12345555| Air  | SKU-HAT-301-RED-OS | 250   | CTN-555 |
```

**Note**: The same ASN can have multiple rows (one per item). Header fields (A-H) are repeated for each item row.

---

## Transfer Order Import Format

### Excel Structure

**One row = One item in the Transfer Order** (header fields repeated, dynamic store columns)

### Column Layout

| Column | Field Name     | Required | Data Type         | Description                                         | Example                    |
| ------ | -------------- | -------- | ----------------- | --------------------------------------------------- | -------------------------- |
| A      | TO Title       | ✅ Yes   | Text              | Unique Transfer Order identifier (repeated per row) | TO-0001                    |
| B      | ASN No         | ✅ Yes   | Text              | Reference to ASN (repeated per row)                 | ASN-00001                  |
| C      | From Warehouse | ✅ Yes   | Text              | Source warehouse name (repeated per row)            | Main Warehouse             |
| D      | Prepared By    | ✅ Yes   | Text              | User who prepared the TO (repeated per row)         | Admin User                 |
| E      | Required Date  | ❌ No    | Date (YYYY-MM-DD) | Required date for transfer (repeated per row)       | 2025-01-25                 |
| F      | Item Code      | ✅ Yes   | Text              | Item code/SKU                                       | SKU-TSHIRT-001-BLK-M       |
| G      | Barcode        | ❌ No    | Text              | Barcode for the item                                | 1234567890124              |
| H      | Remarks        | ❌ No    | Text              | Remarks for this item                               | Priority order             |
| I      | Total ASN Qty  | ❌ No    | Decimal           | Total ASN quantity (reference only)                 | 200.00                     |
| J      | Allocated Qty  | ❌ No    | Decimal           | Total allocated qty (reference only, calculated)    | 150.00                     |
| K+     | Store/Warehouse Columns | ✅ Yes | Decimal | **Dynamic columns** - One column per store/warehouse | STORE-001, STORE-002, WH-MAIN, etc. |

### Store/Warehouse Columns (Starting from Column K)

- **Dynamic**: Store/Warehouse columns start from **Column K (11)** and continue to the right
- **Column Name**: The store or warehouse name is written as the **column header** in Row 1 (e.g., "STORE-001", "STORE-002", "STORE-003", "WH-MAIN")
- **Quantity**: The cell value represents the quantity allocated to that store/warehouse for the item in that row
- **Mixed Types**: You can have both stores and warehouses in the same row (e.g., STORE-001, STORE-002, WH-MAIN)
- **Example**: If you have 3 stores and 1 warehouse, columns K, L, M, N will be used for STORE-001, STORE-002, STORE-003, WH-MAIN respectively

### Notes

- **Row 1 must contain headers** (column names, including store/warehouse names)
- **Data starts from Row 2** (one row per item)
- **Header fields (A-E) are repeated** in each row for the same Transfer Order
- **Store/Warehouse columns are dynamic** - Add as many store/warehouse columns as needed, starting from column K
- **Total ASN Qty (Column I)** and **Allocated Qty (Column J)** are for reference only - they are not used during import
- When importing, existing items for the TO are deleted and replaced with new items from the Excel file
- Total allocated quantity is automatically calculated from all store/warehouse allocations
- Empty rows are skipped
- If a store/warehouse quantity is empty or zero, that allocation is skipped for that item

### Example Excel Layout

```
| A      | B        | C              | D          | E           | F                      | G             | H            | I     | J     | K        | L        | M        | N        |
|--------|----------|----------------|------------|-------------|------------------------|---------------|--------------|-------|-------|----------|----------|----------|----------|
| TO Title| ASN No  | From Warehouse | Prepared By| Required Date| Item Code              | Barcode       | Remarks      | Total ASN Qty| Alloc Qty| STORE-001| STORE-002| STORE-003| WH-MAIN  |
| TO-0001| ASN-00001| Main Warehouse | Admin User | 2025-01-25  | SKU-TSHIRT-001-BLK-M   | 1234567890124 | Priority     | 200   | 150   | 50       | 50       | 50       | 0        |
| TO-0001| ASN-00001| Main Warehouse | Admin User | 2025-01-25  | SKU-TSHIRT-001-BLK-S   | 1234567890123 | Priority     | 200   | 175   | 75       | 50       | 50       | 0        |
```

**Note**: The same TO can have multiple rows (one per item). Header fields (A-E) are repeated for each item row. Both stores and warehouses can be included in the dynamic columns.

---

## Import Process

### Step 1: Download Template

1. Navigate to **Settings → Import** tab
2. Click **"Download ASN Template"** or **"Download TO Template"**
3. Choose a location to save the template Excel file
4. The template will be created with:
   - Header row with column names
   - One example data row showing the format

### Step 2: Fill Data

1. Open the downloaded template in Excel
2. Fill in your data following the format:
   - **ASN**: One row per item, header fields repeated (11 columns total)
   - **Transfer Order**: One row per item, multiple allocations in columns (dynamic store/warehouse columns)
3. Save the Excel file

### Step 3: Import

1. In the **Settings → Import** tab:
2. Click **"Import ASN"** or **"Import Transfer Order"**
3. Select your filled Excel file
4. Wait for import to complete
5. Review the status message for success/errors

---

## Data Validation Rules

### ASN Import

- ASN Title must be unique (if exists, will be updated)
- Supplier, Shipment Date, Expected Arrival Date are required
- Purchase Order is optional (can be empty)
- Total Shipped Qty is optional (will be calculated from items if empty)
- Item Code and Shipped Qty are required for each item row
- Dates must be in YYYY-MM-DD format or Excel date format
- Multiple rows can have the same ASN Title (all items will be grouped)

### Transfer Order Import

- TO Title must be unique (if exists, will be updated)
- ASN No, From Warehouse, Prepared By are required
- Each allocation must have Store, Item Code, and Allocated Qty
- Allocated Qty must be a valid decimal number
- Required Date is optional (can be empty)

---

## Error Handling

- **Invalid date format**: Import will fail for that row with error message
- **Invalid quantity**: Import will fail for that item with error message
- **Missing required fields**: Import will skip that row/item with error message
- **Database errors**: Will be logged and displayed in the import status message

---

## Alternative Format Considerations

### Alternative 1: Separate Sheets for Header and Items

Instead of having items in columns, use:

- **Sheet 1**: ASN/TO Headers (one row per document)
- **Sheet 2**: ASN Items / TO Items (one row per item/allocation)

**Pros:**

- Cleaner format
- Easier to handle many items
- More intuitive for users

**Cons:**

- Requires linking items to headers (need ASN/TO Title in item sheet)

### Alternative 2: One Row Per Item

Instead of multiple items per row, use:

- **One row per item/allocation**
- Repeat header fields in each row

**Pros:**

- Very simple format
- Unlimited items per document
- Easy to fill manually

**Cons:**

- Header fields repeated many times
- More rows in Excel file

---

## Current Implementation

The current implementation uses:
- **ASN Import**: One row per item format (Alternative 2) - unlimited items per ASN, header fields repeated
- **Transfer Order Import**: One row per item format with dynamic store/warehouse columns

This format works well for:
- Documents with many items (unlimited items per document)
- Easy to fill manually
- Simple template structure
- Clear data organization

---

**Last Updated:** 2025-12-27  
**Version:** 1.0
