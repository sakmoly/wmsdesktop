# Transfer In Excel Import Implementation

## ✅ Implementation Complete

### Overview

Transfer In (Inslip) Excel import functionality has been added to the WMS Settings page, following the same pattern as ASN, Transfer Order, and Material Request imports.

---

## 📋 Excel Format

### Column Layout

| Column | Field Name | Required | Data Type | Description | Example |
|--------|------------|----------|-----------|-------------|---------|
| A | TO Title | ✅ Yes | Text | Transfer In/Inslip number | INSLIP-0001 |
| B | From Warehouse | ✅ Yes | Text | Source showroom/store (note: column name says "From Warehouse" but contains showroom codes) | STORE-001 |
| C | To Showroom | ✅ Yes | Text | Destination warehouse (note: column name says "To Showroom" but contains warehouse code) | WH-MAIN |
| D | Requested Date | ✅ Yes | Date | Transfer date (YYYY-MM-DD format) | 2025-01-25 |
| E | Require Date | ❌ No | Date | Expected arrival date (YYYY-MM-DD format) | 2025-01-25 |
| F | Status | ❌ No | Text | Transfer In status (defaults to "Draft" if empty) | Submitted |
| G | Item Code | ✅ Yes | Text | Item code/SKU | SKU-HAT-301-BLU-OS |
| H | Barcode | ❌ No | Text | Item barcode (for reference only, not stored) | 1234567890123 |
| I | Qty | ✅ Yes | Decimal | Quantity for this item | 2.00 |

### Important Notes

1. **Column Name Mapping:**
   - Excel "From Warehouse" (Column B) → Transfer In `from_showroom` (source)
   - Excel "To Showroom" (Column C) → Transfer In `to_warehouse` (destination)
   - *Note: The Excel column names are from the showroom's perspective, but the data is correct*

2. **Data Format:**
   - One row per item
   - Header fields (A-F) are repeated in each row for the same Transfer In
   - Multiple rows can have the same "TO Title" - all items will be grouped under that Transfer In

3. **Carton ID:**
   - Carton ID is **not** in the Excel format
   - All imported items will have `carton_id = NULL` (loose items)
   - Carton ID can be added later via API or manual update

---

## 🔧 Implementation Details

### Files Modified

#### 1. `Services/ExcelImportService.cs`

**Added Methods:**
- `ImportTransferInFromExcelAsync(string filePath, WmsSettings settings)`
  - Reads Excel file
  - Groups rows by Transfer In title
  - Validates required fields
  - Inserts/updates Transfer In header
  - Inserts Transfer In items
  - Updates total quantity
  - Returns success status, message, and imported count

- `GenerateTransferInTemplate(string outputPath)`
  - Creates Excel template with headers
  - Includes 3 example data rows
  - Formats header row (bold, gray background)
  - Auto-fits columns

**Key Features:**
- ✅ Groups items by Transfer In title
- ✅ Validates required fields (title, from_showroom, to_warehouse, transfer_date, item_code, qty)
- ✅ Handles date parsing (YYYY-MM-DD format)
- ✅ Updates existing Transfer In if title exists
- ✅ Deletes and re-inserts items (replace strategy)
- ✅ Calculates and updates total_qty
- ✅ Error handling with detailed messages

#### 2. `ViewModels/ImportViewModel.cs`

**Added Properties:**
- `TransferInImportStatus` (string) - Status message for Transfer In import
- `IsImportingTransferIn` (bool) - Loading state during import

**Added Commands:**
- `DownloadTransferInTemplateCommand` - Downloads Transfer In Excel template
- `ImportTransferInCommand` - Imports Transfer In from Excel file

**Implementation:**
- Follows same pattern as ASN, Transfer Order, and Material Request imports
- Shows file dialog for template download
- Shows file dialog for Excel file selection
- Displays status messages
- Shows success/error message boxes

#### 3. `Views/SettingsView.xaml`

**Added Section:**
- "Import Transfer In (Inslip)" section in Import tab
- Two buttons: "Download TI Template" and "Import Transfer In"
- Status text block showing import status

**UI Layout:**
- Matches existing import sections (ASN, Transfer Order, Material Request)
- Consistent styling and spacing
- Disabled buttons during import

---

## 📊 Excel Template Example

The generated template includes:

**Header Row:**
- TO Title | From Warehouse | To Showroom | Requested Date (YYYY-MM-DD) | Require Date (YYYY-MM-DD) | Status | Item Code | Barcode | Qty

**Example Data:**
- Row 2: INSLIP-0001 | WH-MAIN | STORE-001 | 2025-01-25 | 2025-01-25 | Submitted | SKU-HAT-301-BLU-OS | 1234567890123 | 2
- Row 3: INSLIP-0001 | WH-MAIN | STORE-001 | 2025-01-25 | 2025-01-25 | Submitted | SKU-HAT-301-GRN-OS | 1234567890124 | 2
- Row 4: INSLIP-123456 | WH-MAIN | STORE-001 | 2025-01-25 | 2025-01-25 | Submitted | SKU-HAT-301-RED-OS | 1234567890125 | 2

---

## 🔄 Import Process

### Step 1: Download Template

1. Navigate to **Settings → Import** tab
2. Scroll to "Import Transfer In (Inslip)" section
3. Click **"Download TI Template"**
4. Choose location to save template
5. Template Excel file is generated with example data

### Step 2: Fill Data

1. Open downloaded template in Excel
2. Fill in your Transfer In data:
   - **TO Title**: Transfer In/Inslip number (e.g., INSLIP-0001)
   - **From Warehouse**: Source showroom/store code (e.g., STORE-001)
   - **To Showroom**: Destination warehouse code (e.g., WH-MAIN)
   - **Requested Date**: Transfer date (YYYY-MM-DD format)
   - **Require Date**: Expected arrival date (optional, YYYY-MM-DD format)
   - **Status**: Transfer In status (optional, defaults to "Draft")
   - **Item Code**: Item code/SKU
   - **Barcode**: Item barcode (optional, for reference only)
   - **Qty**: Quantity for this item
3. Add multiple rows for multiple items (same Transfer In title groups items together)
4. Save the Excel file

### Step 3: Import

1. In **Settings → Import** tab
2. Click **"Import Transfer In"**
3. Select your filled Excel file
4. Wait for import to complete
5. Review status message for success/errors

---

## ✅ Validation Rules

### Transfer In Header

- **TO Title**: Required, must be unique (if exists, will be updated)
- **From Warehouse**: Required (source showroom/store)
- **To Showroom**: Required (destination warehouse)
- **Requested Date**: Required, must be valid date (YYYY-MM-DD format)
- **Require Date**: Optional, must be valid date if provided
- **Status**: Optional, defaults to "Draft" if empty

### Transfer In Items

- **Item Code**: Required for each item row
- **Qty**: Required, must be valid decimal number
- **Barcode**: Optional (not stored in database)

---

## 🔍 Data Mapping

### Excel to Database Mapping

| Excel Column | Excel Field Name | Transfer In Field | Notes |
|--------------|------------------|-------------------|-------|
| A | TO Title | `title` | Transfer In number |
| B | From Warehouse | `from_showroom` | Source (showroom/store code) |
| C | To Showroom | `to_warehouse` | Destination (warehouse code) |
| D | Requested Date | `transfer_date` | Transfer date |
| E | Require Date | `expected_arrival_date` | Expected arrival date (optional) |
| F | Status | `status` | Transfer In status (defaults to "Draft") |
| G | Item Code | `item_code` | Item code/SKU |
| H | Barcode | *(not stored)* | For reference only |
| I | Qty | `qty` | Item quantity |

### Default Values

- `status`: "Draft" (if empty in Excel)
- `prepared_by`: "SYSTEM"
- `carton_id`: NULL (not in Excel format)
- `received_qty`: 0 (new Transfer In)
- `total_qty`: Calculated from sum of all item quantities

---

## 🧪 Testing

### Test Scenario 1: Import New Transfer In

1. Download template
2. Fill with new Transfer In data (new title)
3. Import
4. Verify Transfer In created in database
5. Verify items created correctly
6. Verify total_qty calculated correctly

### Test Scenario 2: Update Existing Transfer In

1. Import Transfer In with title "INSLIP-0001"
2. Import again with same title but different items
3. Verify Transfer In header updated
4. Verify old items deleted
5. Verify new items inserted

### Test Scenario 3: Multiple Items per Transfer In

1. Create Excel with same "TO Title" in multiple rows
2. Each row has different item
3. Import
4. Verify all items grouped under one Transfer In
5. Verify total_qty = sum of all item quantities

### Test Scenario 4: Error Handling

1. Test missing required fields
2. Test invalid date format
3. Test invalid quantity format
4. Test empty rows (should be skipped)
5. Verify error messages displayed correctly

---

## 📝 Usage Example

### Excel Data

```
TO Title      | From Warehouse | To Showroom | Requested Date | Require Date | Status    | Item Code          | Barcode      | Qty
INSLIP-0001   | STORE-001      | WH-MAIN     | 2025-01-25    | 2025-01-25   | Submitted | SKU-HAT-301-BLU-OS | 1234567890123| 2
INSLIP-0001   | STORE-001      | WH-MAIN     | 2025-01-25    | 2025-01-25   | Submitted | SKU-HAT-301-GRN-OS | 1234567890124| 2
```

### Result in Database

**tabTransferIn:**
- title: "INSLIP-0001"
- status: "Submitted"
- from_showroom: "STORE-001"
- to_warehouse: "WH-MAIN"
- transfer_date: 2025-01-25
- expected_arrival_date: 2025-01-25
- total_qty: 4.00
- prepared_by: "SYSTEM"

**tabTransferInItem:**
- Row 1: parent_title="INSLIP-0001", item_code="SKU-HAT-301-BLU-OS", qty=2.00, carton_id=NULL
- Row 2: parent_title="INSLIP-0001", item_code="SKU-HAT-301-GRN-OS", qty=2.00, carton_id=NULL

---

## 🔗 Related Documentation

- `MOBILE_APP_TRANSFER_IN_API_DOCUMENTATION.md` - Mobile app API documentation
- `CYCLE_COUNT_AND_TRANSFER_IN_DESIGN.md` - Complete design document
- `TRANSFER_IN_NO_CARTON_ID_HANDLING.md` - Carton ID handling guide

---

## ✅ Status

**Implementation:** ✅ Complete  
**Testing:** ⚠️ Ready for testing  
**Documentation:** ✅ Complete

---

**Document Version:** 1.0  
**Created:** 2026-01-05  
**Status:** Implementation Complete

