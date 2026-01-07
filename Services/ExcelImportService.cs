using System;
using System.Collections.Generic;
using System.Data;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using OfficeOpenXml;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.Services;

public static class ExcelImportService
{
    // Set EPPlus license context (required for non-commercial use)
    static ExcelImportService()
    {
        ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
    }

    /// <summary>
    /// Import ASN data from Excel file
    /// Format: One row per item, with header fields repeated in each row
    /// Columns A-K: ASN Title, Purchase Order, Supplier, Shipment Date, Expected Arrival Date, 
    ///              Total Shipped Qty, Airway Bill No, Shipment Type, Item Code, Shipped Qty, Carton ID
    /// </summary>
    public static async Task<(bool Success, string Message, int ImportedCount)> ImportAsnFromExcelAsync(
        string filePath, WmsSettings settings)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            using var package = new ExcelPackage(new FileInfo(filePath));
            var worksheet = package.Workbook.Worksheets.FirstOrDefault();
            
            if (worksheet == null)
            {
                return (false, "Excel file does not contain any worksheets.", 0);
            }

            var importedCount = 0;
            var errors = new List<string>();

            // Read data starting from row 2 (row 1 is headers)
            var startRow = 2;
            var maxRow = worksheet.Dimension?.End.Row ?? 0;

            // Group rows by ASN Title to process all items together
            var asnGroups = new Dictionary<string, List<int>>();
            
            for (int row = startRow; row <= maxRow; row++)
            {
                var title = worksheet.Cells[row, 1].Text?.Trim();
                if (string.IsNullOrEmpty(title))
                    continue; // Skip empty rows

                if (!asnGroups.ContainsKey(title))
                {
                    asnGroups[title] = new List<int>();
                }
                asnGroups[title].Add(row);
            }

            // Process each ASN group
            foreach (var asnGroup in asnGroups)
            {
                try
                {
                    var title = asnGroup.Key;
                    var rows = asnGroup.Value;
                    var firstRow = rows[0];

                    // Read ASN Header data from first row (all rows should have same header data)
                    var purchaseOrder = worksheet.Cells[firstRow, 2].Text?.Trim() ?? "";
                    var supplier = worksheet.Cells[firstRow, 3].Text?.Trim() ?? "";
                    var shipmentDateStr = worksheet.Cells[firstRow, 4].Text?.Trim();
                    var expectedArrivalDateStr = worksheet.Cells[firstRow, 5].Text?.Trim();
                    var totalShippedQtyStr = worksheet.Cells[firstRow, 6].Text?.Trim();
                    var airwayBillNo = worksheet.Cells[firstRow, 7].Text?.Trim();
                    var shipmentType = worksheet.Cells[firstRow, 8].Text?.Trim();

                    // Validate required fields
                    if (string.IsNullOrEmpty(supplier))
                    {
                        errors.Add($"ASN {title}: Supplier is required");
                        continue;
                    }

                    // Parse dates
                    if (!DateTime.TryParse(shipmentDateStr, out var shipmentDate))
                    {
                        errors.Add($"ASN {title}: Invalid shipment date format");
                        continue;
                    }

                    if (!DateTime.TryParse(expectedArrivalDateStr, out var expectedArrivalDate))
                    {
                        errors.Add($"ASN {title}: Invalid expected arrival date format");
                        continue;
                    }

                    // Parse total quantity (optional, can be calculated from items)
                    double totalShippedQty = 0;
                    if (!string.IsNullOrEmpty(totalShippedQtyStr))
                    {
                        if (!double.TryParse(totalShippedQtyStr, NumberStyles.Any, CultureInfo.InvariantCulture, out totalShippedQty))
                        {
                            errors.Add($"ASN {title}: Invalid total shipped quantity");
                            continue;
                        }
                    }

                    // Delete existing items for this ASN (will re-insert)
                    await using var deleteItemsCmd = new MySqlCommand(
                        "DELETE FROM tabAsnItemDetails WHERE parent_title = @title", connection);
                    deleteItemsCmd.Parameters.AddWithValue("@title", title);
                    await deleteItemsCmd.ExecuteNonQueryAsync();

                    // Insert or update ASN header
                    var asnSql = @"INSERT INTO tabAdvanceShippingNotice 
                        (title, status, purchase_order, supplier, shipment_date, expected_arrival_date, 
                         total_shipped_qty, airway_bill_no, shipment_type, created_at, updated_at)
                        VALUES (@title, 'Draft', @po, @supplier, @shipDate, @arrivalDate, @totalQty, 
                                @airwayBill, @shipmentType, NOW(), NOW())
                        ON DUPLICATE KEY UPDATE
                            purchase_order = VALUES(purchase_order),
                            supplier = VALUES(supplier),
                            shipment_date = VALUES(shipment_date),
                            expected_arrival_date = VALUES(expected_arrival_date),
                            total_shipped_qty = VALUES(total_shipped_qty),
                            airway_bill_no = VALUES(airway_bill_no),
                            shipment_type = VALUES(shipment_type),
                            updated_at = NOW()";

                    await using var asnCmd = new MySqlCommand(asnSql, connection);
                    asnCmd.Parameters.AddWithValue("@title", title);
                    asnCmd.Parameters.AddWithValue("@po", string.IsNullOrEmpty(purchaseOrder) ? DBNull.Value : purchaseOrder);
                    asnCmd.Parameters.AddWithValue("@supplier", supplier);
                    asnCmd.Parameters.AddWithValue("@shipDate", shipmentDate);
                    asnCmd.Parameters.AddWithValue("@arrivalDate", expectedArrivalDate);
                    asnCmd.Parameters.AddWithValue("@totalQty", totalShippedQty);
                    asnCmd.Parameters.AddWithValue("@airwayBill", string.IsNullOrEmpty(airwayBillNo) ? DBNull.Value : airwayBillNo);
                    asnCmd.Parameters.AddWithValue("@shipmentType", string.IsNullOrEmpty(shipmentType) ? DBNull.Value : shipmentType);
                    
                    await asnCmd.ExecuteNonQueryAsync();

                    // Process all items for this ASN
                    double calculatedTotalQty = 0;
                    foreach (var row in rows)
                    {
                        // Read item details from columns I, J, K
                        var itemCode = worksheet.Cells[row, 9].Text?.Trim();
                        if (string.IsNullOrEmpty(itemCode))
                        {
                            errors.Add($"Row {row}: Item Code is required");
                            continue;
                        }

                        var shippedQtyStr = worksheet.Cells[row, 10].Text?.Trim();
                        if (string.IsNullOrEmpty(shippedQtyStr))
                        {
                            errors.Add($"Row {row}, Item {itemCode}: Shipped Qty is required");
                            continue;
                        }

                        if (!double.TryParse(shippedQtyStr, NumberStyles.Any, CultureInfo.InvariantCulture, out var shippedQty))
                        {
                            errors.Add($"Row {row}, Item {itemCode}: Invalid shipped quantity");
                            continue;
                        }

                        var cartonId = worksheet.Cells[row, 11].Text?.Trim();

                        // Insert ASN item detail
                        var itemSql = @"INSERT INTO tabAsnItemDetails 
                            (parent_title, item_code, po_item_reference, shipped_qty, carton_id, carton_assigned_status, created_at, updated_at)
                            VALUES (@parent, @itemCode, @poRef, @qty, @cartonId, 'Assigned', NOW(), NOW())";

                        await using var itemCmd = new MySqlCommand(itemSql, connection);
                        itemCmd.Parameters.AddWithValue("@parent", title);
                        itemCmd.Parameters.AddWithValue("@itemCode", itemCode);
                        itemCmd.Parameters.AddWithValue("@poRef", DBNull.Value); // PO Item Ref not in new format
                        itemCmd.Parameters.AddWithValue("@qty", shippedQty);
                        itemCmd.Parameters.AddWithValue("@cartonId", string.IsNullOrEmpty(cartonId) ? DBNull.Value : cartonId);
                        
                        await itemCmd.ExecuteNonQueryAsync();
                        calculatedTotalQty += shippedQty;
                    }

                    // Update total shipped qty if it was empty or recalculate
                    if (totalShippedQty == 0 || string.IsNullOrEmpty(totalShippedQtyStr))
                    {
                        await using var updateQtyCmd = new MySqlCommand(
                            "UPDATE tabAdvanceShippingNotice SET total_shipped_qty = @qty WHERE title = @title", connection);
                        updateQtyCmd.Parameters.AddWithValue("@qty", calculatedTotalQty);
                        updateQtyCmd.Parameters.AddWithValue("@title", title);
                        await updateQtyCmd.ExecuteNonQueryAsync();
                    }

                    importedCount++;
                }
                catch (Exception ex)
                {
                    errors.Add($"ASN {asnGroup.Key}: {ex.Message}");
                }
            }

            var message = importedCount > 0
                ? $"Successfully imported {importedCount} ASN(s)." + (errors.Count > 0 ? $"\n\nErrors: {string.Join("\n", errors)}" : "")
                : "No ASN data imported." + (errors.Count > 0 ? $"\n\nErrors: {string.Join("\n", errors)}" : "");

            return (importedCount > 0, message, importedCount);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to import ASN from Excel", ex);
            return (false, $"Failed to import ASN from Excel: {ex.Message}", 0);
        }
    }

    /// <summary>
    /// Import Transfer Order data from Excel file
    /// Format: One row per item, with dynamic store/warehouse columns starting from column K
    /// Columns A-E: TO Header fields (repeated per row)
    /// Columns F-H: Item fields (Item Code, Barcode, Remarks)
    /// Column I: Total ASN Qty (reference only)
    /// Column J: Allocated Qty (reference only, calculated)
    /// Columns K+: Store/Warehouse allocations (one column per store/warehouse, name in header)
    /// </summary>
    public static async Task<(bool Success, string Message, int ImportedCount)> ImportTransferOrderFromExcelAsync(
        string filePath, WmsSettings settings)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            using var package = new ExcelPackage(new FileInfo(filePath));
            var worksheet = package.Workbook.Worksheets.FirstOrDefault();
            
            if (worksheet == null)
            {
                return (false, "Excel file does not contain any worksheets.", 0);
            }

            var importedCount = 0;
            var errors = new List<string>();

            // Read header row to identify store/warehouse columns (starting from column K = 11)
            var headerRow = 1;
            var storeColumns = new Dictionary<int, string>(); // Column index -> Store/Warehouse name
            var maxCol = worksheet.Dimension?.End.Column ?? 0;
            const int storeStartCol = 11; // Column K

            for (int col = storeStartCol; col <= maxCol; col++)
            {
                var storeName = worksheet.Cells[headerRow, col].Text?.Trim();
                if (!string.IsNullOrEmpty(storeName))
                {
                    storeColumns[col] = storeName;
                }
            }

            if (storeColumns.Count == 0)
            {
                return (false, "No store/warehouse columns found. Expected store/warehouse names in row 1 starting from column K.", 0);
            }

            // Track processed TOs to avoid duplicate header inserts
            var processedTOs = new HashSet<string>();

            // Read data starting from row 2 (row 1 is headers)
            var startRow = 2;
            var maxRow = worksheet.Dimension?.End.Row ?? 0;

            for (int row = startRow; row <= maxRow; row++)
            {
                try
                {
                    // Read Transfer Order Header data (columns A-E)
                    var title = worksheet.Cells[row, 1].Text?.Trim(); // Column A
                    if (string.IsNullOrEmpty(title))
                        continue; // Skip empty rows

                    var asnNo = worksheet.Cells[row, 2].Text?.Trim() ?? ""; // Column B
                    var fromWarehouse = worksheet.Cells[row, 3].Text?.Trim() ?? ""; // Column C
                    var preparedBy = worksheet.Cells[row, 4].Text?.Trim() ?? ""; // Column D
                    var requiredDateStr = worksheet.Cells[row, 5].Text?.Trim(); // Column E

                    // Read Item fields (columns F-H)
                    var itemCode = worksheet.Cells[row, 6].Text?.Trim() ?? ""; // Column F
                    var barcode = worksheet.Cells[row, 7].Text?.Trim(); // Column G (not stored, can be used for validation)
                    var remarks = worksheet.Cells[row, 8].Text?.Trim(); // Column H
                    var totalAsnQtyStr = worksheet.Cells[row, 9].Text?.Trim(); // Column I (Total ASN Qty - for reference only)
                    var allocatedQtyStr = worksheet.Cells[row, 10].Text?.Trim(); // Column J (Allocated Qty - for reference only, calculated)

                    if (string.IsNullOrEmpty(itemCode))
                    {
                        errors.Add($"Row {row}: Item Code is required");
                        continue;
                    }

                    // Parse date (optional)
                    DateTime? requiredDate = null;
                    if (!string.IsNullOrEmpty(requiredDateStr) && 
                        DateTime.TryParse(requiredDateStr, out var parsedDate))
                    {
                        requiredDate = parsedDate;
                    }

                    // Insert or update Transfer Order header (only once per TO)
                    if (!processedTOs.Contains(title))
                    {
                        // Delete existing items for this TO (will re-insert)
                        await using var deleteCmd = new MySqlCommand(
                            "DELETE FROM tabTransferOrderItem WHERE parent_title = @title", connection);
                        deleteCmd.Parameters.AddWithValue("@title", title);
                        await deleteCmd.ExecuteNonQueryAsync();

                        var toSql = @"INSERT INTO tabTransferOrder 
                            (title, status, advance_shipping_notice, from_warehouse, prepared_by, 
                             required_date, total_allocated_qty, created_at, updated_at)
                            VALUES (@title, 'Draft', @asn, @warehouse, @preparedBy, @reqDate, 0, NOW(), NOW())
                            ON DUPLICATE KEY UPDATE
                                advance_shipping_notice = VALUES(advance_shipping_notice),
                                from_warehouse = VALUES(from_warehouse),
                                prepared_by = VALUES(prepared_by),
                                required_date = VALUES(required_date),
                                updated_at = NOW()";

                        await using var toCmd = new MySqlCommand(toSql, connection);
                        toCmd.Parameters.AddWithValue("@title", title);
                        toCmd.Parameters.AddWithValue("@asn", asnNo);
                        toCmd.Parameters.AddWithValue("@warehouse", fromWarehouse);
                        toCmd.Parameters.AddWithValue("@preparedBy", preparedBy);
                        toCmd.Parameters.AddWithValue("@reqDate", requiredDate ?? (object)DBNull.Value);
                        
                        await toCmd.ExecuteNonQueryAsync();
                        processedTOs.Add(title);
                    }

                    // Read store/warehouse allocations (columns K+)
                    foreach (var kvp in storeColumns)
                    {
                        var storeCol = kvp.Key;
                        var storeName = kvp.Value;
                        
                        var storeQtyStr = worksheet.Cells[row, storeCol].Text?.Trim();
                        
                        // Skip if quantity is empty or zero
                        if (string.IsNullOrEmpty(storeQtyStr))
                            continue;

                        if (!double.TryParse(storeQtyStr, NumberStyles.Any, CultureInfo.InvariantCulture, out var storeQty) || storeQty <= 0)
                        {
                            errors.Add($"Row {row}, Store {storeName}: Invalid quantity '{storeQtyStr}'");
                            continue;
                        }

                        // Insert Transfer Order item (one record per store allocation)
                        var itemSql = @"INSERT INTO tabTransferOrderItem 
                            (parent_title, store, item_code, allocated_qty, sorted_qty, packed_qty, 
                             pending_qty, remarks, created_at, updated_at)
                            VALUES (@parent, @store, @itemCode, @qty, 0, 0, @qty, @remarks, NOW(), NOW())";

                        await using var itemCmd = new MySqlCommand(itemSql, connection);
                        itemCmd.Parameters.AddWithValue("@parent", title);
                        itemCmd.Parameters.AddWithValue("@store", storeName);
                        itemCmd.Parameters.AddWithValue("@itemCode", itemCode);
                        itemCmd.Parameters.AddWithValue("@qty", storeQty);
                        itemCmd.Parameters.AddWithValue("@remarks", string.IsNullOrEmpty(remarks) ? DBNull.Value : remarks);
                        
                        await itemCmd.ExecuteNonQueryAsync();
                    }
                }
                catch (Exception ex)
                {
                    errors.Add($"Row {row}: {ex.Message}");
                }
            }

            // Update total allocated quantity for each TO
            foreach (var toTitle in processedTOs)
            {
                await using var updateCmd = new MySqlCommand(
                    @"UPDATE tabTransferOrder 
                      SET total_allocated_qty = (
                          SELECT COALESCE(SUM(allocated_qty), 0) 
                          FROM tabTransferOrderItem 
                          WHERE parent_title = @title
                      ) WHERE title = @title", connection);
                updateCmd.Parameters.AddWithValue("@title", toTitle);
                await updateCmd.ExecuteNonQueryAsync();
            }

            importedCount = processedTOs.Count;

            var message = importedCount > 0
                ? $"Successfully imported {importedCount} Transfer Order(s) with {maxRow - startRow + 1} item row(s)." + (errors.Count > 0 ? $"\n\nErrors: {string.Join("\n", errors)}" : "")
                : "No Transfer Order data imported." + (errors.Count > 0 ? $"\n\nErrors: {string.Join("\n", errors)}" : "");

            return (importedCount > 0, message, importedCount);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to import Transfer Order from Excel", ex);
            return (false, $"Failed to import Transfer Order from Excel: {ex.Message}", 0);
        }
    }

    /// <summary>
    /// Generate ASN Excel template file
    /// Format: One row per item, with header fields repeated in each row
    /// Columns A-K: ASN Title, Purchase Order, Supplier, Shipment Date, Expected Arrival Date, 
    ///              Total Shipped Qty, Airway Bill No, Shipment Type, Item Code, Shipped Qty, Carton ID
    /// </summary>
    public static string GenerateAsnTemplate(string outputPath)
    {
        using var package = new ExcelPackage();
        var worksheet = package.Workbook.Worksheets.Add("ASN Import");

        // Header row
        worksheet.Cells[1, 1].Value = "ASN Title";
        worksheet.Cells[1, 2].Value = "Purchase Order";
        worksheet.Cells[1, 3].Value = "Supplier";
        worksheet.Cells[1, 4].Value = "Shipment Date (YYYY-MM-DD)";
        worksheet.Cells[1, 5].Value = "Expected Arrival Date (YYYY-MM-DD)";
        worksheet.Cells[1, 6].Value = "Total Shipped Qty";
        worksheet.Cells[1, 7].Value = "Airway Bill No";
        worksheet.Cells[1, 8].Value = "Shipment Type";
        worksheet.Cells[1, 9].Value = "Item Code";
        worksheet.Cells[1, 10].Value = "Shipped Qty";
        worksheet.Cells[1, 11].Value = "Carton ID";

        // Style header row
        using (var range = worksheet.Cells[1, 1, 1, 11])
        {
            range.Style.Font.Bold = true;
            range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
            range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
        }

        // Example data rows (one row per item, header fields repeated)
        // Row 2 - First item
        worksheet.Cells[2, 1].Value = "ASN-AAA";
        worksheet.Cells[2, 2].Value = ""; // Purchase Order (optional)
        worksheet.Cells[2, 3].Value = "XYZ Trading";
        worksheet.Cells[2, 4].Value = "2025-01-15";
        worksheet.Cells[2, 5].Value = "2025-01-20";
        worksheet.Cells[2, 6].Value = 100;
        worksheet.Cells[2, 7].Value = "AWB-12345555";
        worksheet.Cells[2, 8].Value = "Air";
        worksheet.Cells[2, 9].Value = "SKU-HAT-301-BLU-OS";
        worksheet.Cells[2, 10].Value = 50;
        worksheet.Cells[2, 11].Value = "CTN-001";

        // Row 3 - Second item (same ASN)
        worksheet.Cells[3, 1].Value = "ASN-AAA";
        worksheet.Cells[3, 2].Value = ""; // Purchase Order (optional)
        worksheet.Cells[3, 3].Value = "XYZ Trading";
        worksheet.Cells[3, 4].Value = "2025-01-15";
        worksheet.Cells[3, 5].Value = "2025-01-20";
        worksheet.Cells[3, 6].Value = 500;
        worksheet.Cells[3, 7].Value = "AWB-12345555";
        worksheet.Cells[3, 8].Value = "Air";
        worksheet.Cells[3, 9].Value = "SKU-HAT-301-GRN-OS";
        worksheet.Cells[3, 10].Value = 250;
        worksheet.Cells[3, 11].Value = "CTN-444";

        // Row 4 - Third item (same ASN)
        worksheet.Cells[4, 1].Value = "ASN-AAA";
        worksheet.Cells[4, 2].Value = ""; // Purchase Order (optional)
        worksheet.Cells[4, 3].Value = "XYZ Trading";
        worksheet.Cells[4, 4].Value = "2025-01-15";
        worksheet.Cells[4, 5].Value = "2025-01-20";
        worksheet.Cells[4, 6].Value = 500;
        worksheet.Cells[4, 7].Value = "AWB-12345555";
        worksheet.Cells[4, 8].Value = "Air";
        worksheet.Cells[4, 9].Value = "SKU-HAT-301-RED-OS";
        worksheet.Cells[4, 10].Value = 250;
        worksheet.Cells[4, 11].Value = "CTN-555";

        // Auto-fit columns
        worksheet.Cells.AutoFitColumns();

        // Save file
        var fileInfo = new FileInfo(outputPath);
        package.SaveAs(fileInfo);
        
        return outputPath;
    }

    /// <summary>
    /// Generate Transfer Order Excel template file
    /// Format: One row per item, with dynamic store/warehouse columns starting from column K
    /// Columns A-E: TO Header fields (repeated per row)
    /// Columns F-H: Item fields (Item Code, Barcode, Remarks)
    /// Column I: Total ASN Qty (reference only)
    /// Column J: Allocated Qty (reference only, calculated)
    /// Columns K+: Store/Warehouse allocations (one column per store/warehouse, name in header)
    /// </summary>
    public static string GenerateTransferOrderTemplate(string outputPath)
    {
        using var package = new ExcelPackage();
        var worksheet = package.Workbook.Worksheets.Add("Transfer Order Import");

        // Header row (Columns A-J are fixed, K+ are dynamic store/warehouse columns)
        worksheet.Cells[1, 1].Value = "TO Title";
        worksheet.Cells[1, 2].Value = "ASN No";
        worksheet.Cells[1, 3].Value = "From Warehouse";
        worksheet.Cells[1, 4].Value = "Prepared By";
        worksheet.Cells[1, 5].Value = "Required Date (YYYY-MM-DD)";
        worksheet.Cells[1, 6].Value = "Item Code";
        worksheet.Cells[1, 7].Value = "Barcode";
        worksheet.Cells[1, 8].Value = "Remarks";
        worksheet.Cells[1, 9].Value = "Total ASN Qty";
        worksheet.Cells[1, 10].Value = "Allocated Qty";
        // Column K+ are dynamic store/warehouse columns
        worksheet.Cells[1, 11].Value = "STORE-001";
        worksheet.Cells[1, 12].Value = "STORE-002";
        worksheet.Cells[1, 13].Value = "STORE-003";
        worksheet.Cells[1, 14].Value = "WH-MAIN";

        // Style header row (style all columns up to the last store/warehouse column)
        using (var range = worksheet.Cells[1, 1, 1, 14])
        {
            range.Style.Font.Bold = true;
            range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
            range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
        }

        // Example data row 1 (first item)
        worksheet.Cells[2, 1].Value = "TO-0001";
        worksheet.Cells[2, 2].Value = "ASN-00001";
        worksheet.Cells[2, 3].Value = "Main Warehouse";
        worksheet.Cells[2, 4].Value = "Admin User";
        worksheet.Cells[2, 5].Value = "2025-01-25";
        worksheet.Cells[2, 6].Value = "SKU-TSHIRT-001-BLK-M";
        worksheet.Cells[2, 7].Value = "1234567890124";
        worksheet.Cells[2, 8].Value = "Priority order";
        worksheet.Cells[2, 9].Value = 200;  // Total ASN Qty (reference)
        worksheet.Cells[2, 10].Value = 150;  // Allocated Qty (reference, calculated)
        worksheet.Cells[2, 11].Value = 50;   // STORE-001 quantity
        worksheet.Cells[2, 12].Value = 50;   // STORE-002 quantity
        worksheet.Cells[2, 13].Value = 50;   // STORE-003 quantity
        worksheet.Cells[2, 14].Value = 0;    // WH-MAIN quantity (example)

        // Example data row 2 (second item)
        worksheet.Cells[3, 1].Value = "TO-0001";
        worksheet.Cells[3, 2].Value = "ASN-00001";
        worksheet.Cells[3, 3].Value = "Main Warehouse";
        worksheet.Cells[3, 4].Value = "Admin User";
        worksheet.Cells[3, 5].Value = "2025-01-25";
        worksheet.Cells[3, 6].Value = "SKU-TSHIRT-001-BLK-S";
        worksheet.Cells[3, 7].Value = "1234567890123";
        worksheet.Cells[3, 8].Value = "Priority order";
        worksheet.Cells[3, 9].Value = 200;   // Total ASN Qty (reference)
        worksheet.Cells[3, 10].Value = 175;  // Allocated Qty (reference, calculated)
        worksheet.Cells[3, 11].Value = 75;   // STORE-001 quantity
        worksheet.Cells[3, 12].Value = 50;   // STORE-002 quantity
        worksheet.Cells[3, 13].Value = 50;   // STORE-003 quantity
        worksheet.Cells[3, 14].Value = 0;    // WH-MAIN quantity (example)

        // Auto-fit columns
        worksheet.Cells.AutoFitColumns();

        // Save file
        var fileInfo = new FileInfo(outputPath);
        package.SaveAs(fileInfo);
        
        return outputPath;
    }

    /// <summary>
    /// Import Material Request data from Excel file
    /// Format: One row per item, with header fields repeated in each row
    /// Columns A-I: TO Title, From Warehouse, To Showroom, Requested Date, Required Date, Status, Item Code, Barcode, Requested Qty
    /// </summary>
    public static async Task<(bool Success, string Message, int ImportedCount)> ImportMaterialRequestFromExcelAsync(
        string filePath, WmsSettings settings)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            using var package = new ExcelPackage(new FileInfo(filePath));
            var worksheet = package.Workbook.Worksheets.FirstOrDefault();
            
            if (worksheet == null)
            {
                return (false, "Excel file does not contain any worksheets.", 0);
            }

            var importedCount = 0;
            var errors = new List<string>();

            // Read data starting from row 2 (row 1 is headers)
            var startRow = 2;
            var maxRow = worksheet.Dimension?.End.Row ?? 0;

            // Group rows by TO Title (Material Request number) to process all items together
            var mrGroups = new Dictionary<string, List<int>>();
            
            for (int row = startRow; row <= maxRow; row++)
            {
                var title = worksheet.Cells[row, 1].Text?.Trim(); // Column A: TO Title
                if (string.IsNullOrEmpty(title))
                    continue; // Skip empty rows

                if (!mrGroups.ContainsKey(title))
                {
                    mrGroups[title] = new List<int>();
                }
                mrGroups[title].Add(row);
            }

            // Process each Material Request group
            foreach (var mrGroup in mrGroups)
            {
                try
                {
                    var title = mrGroup.Key;
                    var rows = mrGroup.Value;
                    var firstRow = rows[0];

                    // Read Material Request Header data from first row (all rows should have same header data)
                    var fromWarehouse = worksheet.Cells[firstRow, 2].Text?.Trim() ?? ""; // Column B
                    var toShowroom = worksheet.Cells[firstRow, 3].Text?.Trim() ?? ""; // Column C
                    var requestedDateStr = worksheet.Cells[firstRow, 4].Text?.Trim(); // Column D
                    var requiredDateStr = worksheet.Cells[firstRow, 5].Text?.Trim(); // Column E
                    var status = worksheet.Cells[firstRow, 6].Text?.Trim() ?? "Draft"; // Column F

                    // Validate required fields
                    if (string.IsNullOrEmpty(fromWarehouse))
                    {
                        errors.Add($"Material Request {title}: From Warehouse is required");
                        continue;
                    }

                    if (string.IsNullOrEmpty(toShowroom))
                    {
                        errors.Add($"Material Request {title}: To Showroom is required");
                        continue;
                    }

                    // Parse dates
                    if (!DateTime.TryParse(requestedDateStr, out var requestedDate))
                    {
                        errors.Add($"Material Request {title}: Invalid requested date format");
                        continue;
                    }

                    DateTime? requiredDate = null;
                    if (!string.IsNullOrEmpty(requiredDateStr) && 
                        DateTime.TryParse(requiredDateStr, out var parsedRequiredDate))
                    {
                        requiredDate = parsedRequiredDate;
                    }

                    // Delete existing items for this Material Request (will re-insert)
                    await using var deleteItemsCmd = new MySqlCommand(
                        "DELETE FROM tabMaterialRequestItem WHERE parent_title = @title", connection);
                    deleteItemsCmd.Parameters.AddWithValue("@title", title);
                    await deleteItemsCmd.ExecuteNonQueryAsync();

                    // Insert or update Material Request header
                    var mrSql = @"INSERT INTO tabMaterialRequest 
                        (title, status, from_warehouse, to_showroom, requested_date, required_date, 
                         requested_by, total_requested_qty, total_picked_qty, created_at, updated_at)
                        VALUES (@title, @status, @fromWarehouse, @toShowroom, @requestedDate, @requiredDate, 
                                'SYSTEM', 0, 0, NOW(), NOW())
                        ON DUPLICATE KEY UPDATE
                            status = VALUES(status),
                            from_warehouse = VALUES(from_warehouse),
                            to_showroom = VALUES(to_showroom),
                            requested_date = VALUES(requested_date),
                            required_date = VALUES(required_date),
                            updated_at = NOW()";

                    await using var mrCmd = new MySqlCommand(mrSql, connection);
                    mrCmd.Parameters.AddWithValue("@title", title);
                    mrCmd.Parameters.AddWithValue("@status", status);
                    mrCmd.Parameters.AddWithValue("@fromWarehouse", fromWarehouse);
                    mrCmd.Parameters.AddWithValue("@toShowroom", toShowroom);
                    mrCmd.Parameters.AddWithValue("@requestedDate", requestedDate);
                    mrCmd.Parameters.AddWithValue("@requiredDate", requiredDate ?? (object)DBNull.Value);
                    
                    await mrCmd.ExecuteNonQueryAsync();

                    // Process all items for this Material Request
                    double totalRequestedQty = 0;
                    foreach (var row in rows)
                    {
                        // Read item details from columns G, H, I
                        var itemCode = worksheet.Cells[row, 7].Text?.Trim(); // Column G: Item Code
                        if (string.IsNullOrEmpty(itemCode))
                        {
                            errors.Add($"Row {row}: Item Code is required");
                            continue;
                        }

                        var requestedQtyStr = worksheet.Cells[row, 9].Text?.Trim(); // Column I: Requested Qty
                        if (string.IsNullOrEmpty(requestedQtyStr))
                        {
                            errors.Add($"Row {row}, Item {itemCode}: Requested Qty is required");
                            continue;
                        }

                        if (!double.TryParse(requestedQtyStr, NumberStyles.Any, CultureInfo.InvariantCulture, out var requestedQty))
                        {
                            errors.Add($"Row {row}, Item {itemCode}: Invalid requested quantity");
                            continue;
                        }

                        // Column H: Barcode (optional, for reference only - not stored in database)

                        // Insert Material Request item
                        var itemSql = @"INSERT INTO tabMaterialRequestItem 
                            (parent_title, item_code, requested_qty, picked_qty, status, created_at, updated_at)
                            VALUES (@parent, @itemCode, @qty, 0, 'Pending', NOW(), NOW())";

                        await using var itemCmd = new MySqlCommand(itemSql, connection);
                        itemCmd.Parameters.AddWithValue("@parent", title);
                        itemCmd.Parameters.AddWithValue("@itemCode", itemCode);
                        itemCmd.Parameters.AddWithValue("@qty", requestedQty);
                        
                        await itemCmd.ExecuteNonQueryAsync();
                        totalRequestedQty += requestedQty;
                    }

                    // Update total requested quantity
                    await using var updateQtyCmd = new MySqlCommand(
                        "UPDATE tabMaterialRequest SET total_requested_qty = @qty WHERE title = @title", connection);
                    updateQtyCmd.Parameters.AddWithValue("@qty", totalRequestedQty);
                    updateQtyCmd.Parameters.AddWithValue("@title", title);
                    await updateQtyCmd.ExecuteNonQueryAsync();

                    importedCount++;
                }
                catch (Exception ex)
                {
                    errors.Add($"Material Request {mrGroup.Key}: {ex.Message}");
                }
            }

            var message = importedCount > 0
                ? $"Successfully imported {importedCount} Material Request(s)." + (errors.Count > 0 ? $"\n\nErrors: {string.Join("\n", errors)}" : "")
                : "No Material Request data imported." + (errors.Count > 0 ? $"\n\nErrors: {string.Join("\n", errors)}" : "");

            return (importedCount > 0, message, importedCount);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to import Material Request from Excel", ex);
            return (false, $"Failed to import Material Request from Excel: {ex.Message}", 0);
        }
    }

    /// <summary>
    /// Generate Material Request Excel template file
    /// Format: One row per item, with header fields repeated in each row
    /// Columns A-I: TO Title, From Warehouse, To Showroom, Requested Date, Required Date, Status, Item Code, Barcode, Requested Qty
    /// </summary>
    public static string GenerateMaterialRequestTemplate(string outputPath)
    {
        using var package = new ExcelPackage();
        var worksheet = package.Workbook.Worksheets.Add("Material Request Import");

        // Header row
        worksheet.Cells[1, 1].Value = "TO Title";
        worksheet.Cells[1, 2].Value = "From Warehouse";
        worksheet.Cells[1, 3].Value = "To Showroom";
        worksheet.Cells[1, 4].Value = "Requested Date (YYYY-MM-DD)";
        worksheet.Cells[1, 5].Value = "Require Date (YYYY-MM-DD)";
        worksheet.Cells[1, 6].Value = "Status";
        worksheet.Cells[1, 7].Value = "Item Code";
        worksheet.Cells[1, 8].Value = "Barcode";
        worksheet.Cells[1, 9].Value = "Requested Qty";

        // Style header row
        using (var range = worksheet.Cells[1, 1, 1, 9])
        {
            range.Style.Font.Bold = true;
            range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
            range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
        }

        // Example data rows (one row per item, header fields repeated)
        // Row 2 - First item
        worksheet.Cells[2, 1].Value = "MR-0001";
        worksheet.Cells[2, 2].Value = "WH-MAIN";
        worksheet.Cells[2, 3].Value = "STORE-001";
        worksheet.Cells[2, 4].Value = "2025-01-25";
        worksheet.Cells[2, 5].Value = "2025-01-25";
        worksheet.Cells[2, 6].Value = "Draft";
        worksheet.Cells[2, 7].Value = "SKU-HAT-301-BLU-OS";
        worksheet.Cells[2, 8].Value = "1234567890123";
        worksheet.Cells[2, 9].Value = 20;

        // Row 3 - Second item (same Material Request)
        worksheet.Cells[3, 1].Value = "MR-0001";
        worksheet.Cells[3, 2].Value = "WH-MAIN";
        worksheet.Cells[3, 3].Value = "STORE-001";
        worksheet.Cells[3, 4].Value = "2025-01-25";
        worksheet.Cells[3, 5].Value = "2025-01-25";
        worksheet.Cells[3, 6].Value = "Draft";
        worksheet.Cells[3, 7].Value = "SKU-HAT-301-GRN-OS";
        worksheet.Cells[3, 8].Value = "1234567890124";
        worksheet.Cells[3, 9].Value = 20;

        // Row 4 - Third item (same Material Request)
        worksheet.Cells[4, 1].Value = "MR-0001";
        worksheet.Cells[4, 2].Value = "WH-MAIN";
        worksheet.Cells[4, 3].Value = "STORE-001";
        worksheet.Cells[4, 4].Value = "2025-01-25";
        worksheet.Cells[4, 5].Value = "2025-01-25";
        worksheet.Cells[4, 6].Value = "Draft";
        worksheet.Cells[4, 7].Value = "SKU-HAT-301-RED-OS";
        worksheet.Cells[4, 8].Value = "1234567890125";
        worksheet.Cells[4, 9].Value = 20;

        // Auto-fit columns
        worksheet.Cells.AutoFitColumns();

        // Save file
        var fileInfo = new FileInfo(outputPath);
        package.SaveAs(fileInfo);
        
        return outputPath;
    }

    /// <summary>
    /// Import Transfer In data from Excel file
    /// Format: One row per item, with header fields repeated in each row
    /// Columns A-I: TO Title (Transfer In Title), From Warehouse, To Showroom, Requested Date, Require Date, Status, Item Code, Barcode, Qty
    /// Note: "From Warehouse" in Excel = to_warehouse in Transfer In (destination)
    ///       "To Showroom" in Excel = from_showroom in Transfer In (source)
    /// </summary>
    public static async Task<(bool Success, string Message, int ImportedCount)> ImportTransferInFromExcelAsync(
        string filePath, WmsSettings settings)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            using var package = new ExcelPackage(new FileInfo(filePath));
            var worksheet = package.Workbook.Worksheets.FirstOrDefault();
            
            if (worksheet == null)
            {
                return (false, "Excel file does not contain any worksheets.", 0);
            }

            var importedCount = 0;
            var errors = new List<string>();

            // Read data starting from row 2 (row 1 is headers)
            var startRow = 2;
            var maxRow = worksheet.Dimension?.End.Row ?? 0;

            // Group rows by TO Title (Transfer In number) to process all items together
            var tiGroups = new Dictionary<string, List<int>>();
            
            for (int row = startRow; row <= maxRow; row++)
            {
                var title = worksheet.Cells[row, 1].Text?.Trim(); // Column A: TO Title (Transfer In Title)
                if (string.IsNullOrEmpty(title))
                    continue; // Skip empty rows

                if (!tiGroups.ContainsKey(title))
                {
                    tiGroups[title] = new List<int>();
                }
                tiGroups[title].Add(row);
            }

            // Process each Transfer In group
            foreach (var tiGroup in tiGroups)
            {
                try
                {
                    var title = tiGroup.Key;
                    var rows = tiGroup.Value;
                    var firstRow = rows[0];

                    // Read Transfer In Header data from first row (all rows should have same header data)
                    // Note: Excel "From Warehouse" = Transfer In "to_warehouse" (destination)
                    //       Excel "To Showroom" = Transfer In "from_showroom" (source)
                    var toWarehouse = worksheet.Cells[firstRow, 2].Text?.Trim() ?? ""; // Column B: From Warehouse (destination)
                    var fromShowroom = worksheet.Cells[firstRow, 3].Text?.Trim() ?? ""; // Column C: To Showroom (source)
                    var requestedDateStr = worksheet.Cells[firstRow, 4].Text?.Trim(); // Column D: Requested Date
                    var requiredDateStr = worksheet.Cells[firstRow, 5].Text?.Trim(); // Column E: Require Date
                    var status = worksheet.Cells[firstRow, 6].Text?.Trim() ?? "Draft"; // Column F: Status

                    // Validate required fields
                    if (string.IsNullOrEmpty(toWarehouse))
                    {
                        errors.Add($"Transfer In {title}: From Warehouse (destination) is required");
                        continue;
                    }

                    if (string.IsNullOrEmpty(fromShowroom))
                    {
                        errors.Add($"Transfer In {title}: To Showroom (source) is required");
                        continue;
                    }

                    // Parse dates
                    if (!DateTime.TryParse(requestedDateStr, out var transferDate))
                    {
                        errors.Add($"Transfer In {title}: Invalid requested date format");
                        continue;
                    }

                    DateTime? expectedArrivalDate = null;
                    if (!string.IsNullOrEmpty(requiredDateStr) && 
                        DateTime.TryParse(requiredDateStr, out var parsedExpectedDate))
                    {
                        expectedArrivalDate = parsedExpectedDate;
                    }

                    // Delete existing items for this Transfer In (will re-insert)
                    await using var deleteItemsCmd = new MySqlCommand(
                        "DELETE FROM tabTransferInItem WHERE parent_title = @title", connection);
                    deleteItemsCmd.Parameters.AddWithValue("@title", title);
                    await deleteItemsCmd.ExecuteNonQueryAsync();

                    // Insert or update Transfer In header
                    var tiSql = @"INSERT INTO tabTransferIn 
                        (title, status, from_showroom, to_warehouse, transfer_date, expected_arrival_date, 
                         prepared_by, total_qty, created_at, updated_at)
                        VALUES (@title, @status, @fromShowroom, @toWarehouse, @transferDate, @expectedArrivalDate, 
                                'SYSTEM', 0, NOW(), NOW())
                        ON DUPLICATE KEY UPDATE
                            status = VALUES(status),
                            from_showroom = VALUES(from_showroom),
                            to_warehouse = VALUES(to_warehouse),
                            transfer_date = VALUES(transfer_date),
                            expected_arrival_date = VALUES(expected_arrival_date),
                            updated_at = NOW()";

                    await using var tiCmd = new MySqlCommand(tiSql, connection);
                    tiCmd.Parameters.AddWithValue("@title", title);
                    tiCmd.Parameters.AddWithValue("@status", status);
                    tiCmd.Parameters.AddWithValue("@fromShowroom", fromShowroom);
                    tiCmd.Parameters.AddWithValue("@toWarehouse", toWarehouse);
                    tiCmd.Parameters.AddWithValue("@transferDate", transferDate);
                    tiCmd.Parameters.AddWithValue("@expectedArrivalDate", expectedArrivalDate ?? (object)DBNull.Value);
                    
                    await tiCmd.ExecuteNonQueryAsync();

                    // Process all items for this Transfer In
                    double totalQty = 0;
                    foreach (var row in rows)
                    {
                        // Read item details from columns G, H, I
                        var itemCode = worksheet.Cells[row, 7].Text?.Trim(); // Column G: Item Code
                        if (string.IsNullOrEmpty(itemCode))
                        {
                            errors.Add($"Row {row}: Item Code is required");
                            continue;
                        }

                        var qtyStr = worksheet.Cells[row, 9].Text?.Trim(); // Column I: Qty
                        if (string.IsNullOrEmpty(qtyStr))
                        {
                            errors.Add($"Row {row}, Item {itemCode}: Qty is required");
                            continue;
                        }

                        if (!double.TryParse(qtyStr, NumberStyles.Any, CultureInfo.InvariantCulture, out var qty))
                        {
                            errors.Add($"Row {row}, Item {itemCode}: Invalid quantity");
                            continue;
                        }

                        // Column H: Barcode (optional, for reference only - not stored in database)
                        // Carton ID is not in Excel format, so it will be NULL

                        // Insert Transfer In item
                        var itemSql = @"INSERT INTO tabTransferInItem 
                            (parent_title, item_code, qty, carton_id, received_qty, created_at, updated_at)
                            VALUES (@parent, @itemCode, @qty, NULL, 0, NOW(), NOW())";

                        await using var itemCmd = new MySqlCommand(itemSql, connection);
                        itemCmd.Parameters.AddWithValue("@parent", title);
                        itemCmd.Parameters.AddWithValue("@itemCode", itemCode);
                        itemCmd.Parameters.AddWithValue("@qty", qty);
                        
                        await itemCmd.ExecuteNonQueryAsync();
                        totalQty += qty;
                    }

                    // Update total quantity
                    await using var updateQtyCmd = new MySqlCommand(
                        "UPDATE tabTransferIn SET total_qty = @qty WHERE title = @title", connection);
                    updateQtyCmd.Parameters.AddWithValue("@qty", totalQty);
                    updateQtyCmd.Parameters.AddWithValue("@title", title);
                    await updateQtyCmd.ExecuteNonQueryAsync();

                    importedCount++;
                }
                catch (Exception ex)
                {
                    errors.Add($"Transfer In {tiGroup.Key}: {ex.Message}");
                }
            }

            var message = importedCount > 0
                ? $"Successfully imported {importedCount} Transfer In(s)." + (errors.Count > 0 ? $"\n\nErrors: {string.Join("\n", errors)}" : "")
                : "No Transfer In data imported." + (errors.Count > 0 ? $"\n\nErrors: {string.Join("\n", errors)}" : "");

            return (importedCount > 0, message, importedCount);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to import Transfer In from Excel", ex);
            return (false, $"Failed to import Transfer In from Excel: {ex.Message}", 0);
        }
    }

    /// <summary>
    /// Generate Transfer In Excel template file
    /// Format: One row per item, with header fields repeated in each row
    /// Columns A-I: TO Title (Transfer In Title), From Warehouse, To Showroom, Requested Date, Require Date, Status, Item Code, Barcode, Qty
    /// Note: "From Warehouse" in Excel = to_warehouse in Transfer In (destination)
    ///       "To Showroom" in Excel = from_showroom in Transfer In (source)
    /// </summary>
    public static string GenerateTransferInTemplate(string outputPath)
    {
        using var package = new ExcelPackage();
        var worksheet = package.Workbook.Worksheets.Add("Transfer In Import");

        // Header row
        worksheet.Cells[1, 1].Value = "TO Title";
        worksheet.Cells[1, 2].Value = "From Warehouse";
        worksheet.Cells[1, 3].Value = "To Showroom";
        worksheet.Cells[1, 4].Value = "Requested Date (YYYY-MM-DD)";
        worksheet.Cells[1, 5].Value = "Require Date (YYYY-MM-DD)";
        worksheet.Cells[1, 6].Value = "Status";
        worksheet.Cells[1, 7].Value = "Item Code";
        worksheet.Cells[1, 8].Value = "Barcode";
        worksheet.Cells[1, 9].Value = "Qty";

        // Style header row
        using (var range = worksheet.Cells[1, 1, 1, 9])
        {
            range.Style.Font.Bold = true;
            range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
            range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
            range.Style.Border.BorderAround(OfficeOpenXml.Style.ExcelBorderStyle.Thin);
        }

        // Example data row 1
        worksheet.Cells[2, 1].Value = "INSLIP-0001";
        worksheet.Cells[2, 2].Value = "WH-MAIN";
        worksheet.Cells[2, 3].Value = "STORE-001";
        worksheet.Cells[2, 4].Value = "2025-01-25";
        worksheet.Cells[2, 5].Value = "2025-01-25";
        worksheet.Cells[2, 6].Value = "Submitted";
        worksheet.Cells[2, 7].Value = "SKU-HAT-301-BLU-OS";
        worksheet.Cells[2, 8].Value = "1234567890123";
        worksheet.Cells[2, 9].Value = 2;

        // Example data row 2 (same Transfer In, different item)
        worksheet.Cells[3, 1].Value = "INSLIP-0001";
        worksheet.Cells[3, 2].Value = "WH-MAIN";
        worksheet.Cells[3, 3].Value = "STORE-001";
        worksheet.Cells[3, 4].Value = "2025-01-25";
        worksheet.Cells[3, 5].Value = "2025-01-25";
        worksheet.Cells[3, 6].Value = "Submitted";
        worksheet.Cells[3, 7].Value = "SKU-HAT-301-GRN-OS";
        worksheet.Cells[3, 8].Value = "1234567890124";
        worksheet.Cells[3, 9].Value = 2;

        // Example data row 3 (different Transfer In)
        worksheet.Cells[4, 1].Value = "INSLIP-123456";
        worksheet.Cells[4, 2].Value = "WH-MAIN";
        worksheet.Cells[4, 3].Value = "STORE-001";
        worksheet.Cells[4, 4].Value = "2025-01-25";
        worksheet.Cells[4, 5].Value = "2025-01-25";
        worksheet.Cells[4, 6].Value = "Submitted";
        worksheet.Cells[4, 7].Value = "SKU-HAT-301-RED-OS";
        worksheet.Cells[4, 8].Value = "1234567890125";
        worksheet.Cells[4, 9].Value = 2;

        // Auto-fit columns
        worksheet.Cells.AutoFitColumns();

        // Save file
        var fileInfo = new FileInfo(outputPath);
        package.SaveAs(fileInfo);
        
        return outputPath;
    }
}

