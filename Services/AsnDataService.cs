using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.Services;

public static class AsnDataService
{
    /// <summary>
    /// Get all ASNs from database
    /// </summary>
    public static async Task<List<Asn>> GetAsnsAsync(WmsSettings settings)
    {
        var asns = new List<Asn>();
        
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Get all ASNs with carton count and calculated total shipped qty
            // Calculate total_shipped_qty dynamically from item details to ensure accuracy
            var asnSql = @"SELECT a.title, a.status, a.purchase_order, a.supplier, a.shipment_date, 
                                  a.expected_arrival_date, 
                                  COALESCE(SUM(d.shipped_qty), 0) as total_shipped_qty, 
                                  a.airway_bill_no, 
                                  a.shipment_type, COALESCE(a.wms_export_status, 'Pending') as wms_export_status,
                                  a.purchase_receipt_no, a.updated_on,
                                  COALESCE(COUNT(DISTINCT CASE WHEN d.carton_id IS NOT NULL THEN d.carton_id END), 0) as total_carton_count
                           FROM tabAdvanceShippingNotice a
                           LEFT JOIN tabAsnItemDetails d ON a.title = d.parent_title
                           GROUP BY a.title, a.status, a.purchase_order, a.supplier, a.shipment_date, 
                                    a.expected_arrival_date, a.airway_bill_no, 
                                    a.shipment_type, a.wms_export_status, a.purchase_receipt_no, a.updated_on
                           ORDER BY a.shipment_date DESC, a.title";
            
            await using var asnCmd = new MySqlCommand(asnSql, connection);
            await using var asnReader = await asnCmd.ExecuteReaderAsync();

            // Column order in SELECT: 0 title, 1 status, 2 purchase_order, 3 supplier, 4 shipment_date, 5 expected_arrival_date,
            // 6 total_shipped_qty, 7 airway_bill_no, 8 shipment_type, 9 wms_export_status, 10 purchase_receipt_no, 11 updated_on, 12 total_carton_count
            const int idxShipmentType = 8;
            const int idxPurchaseReceiptNoByOrder = 10;
            int idxPurchaseReceiptNo = idxPurchaseReceiptNoByOrder;
            try
            {
                idxPurchaseReceiptNo = asnReader.GetOrdinal("purchase_receipt_no");
            }
            catch
            {
                idxPurchaseReceiptNo = idxPurchaseReceiptNoByOrder;
            }
            var fieldCount = asnReader.FieldCount;
            if (fieldCount != 13)
                ErrorLogService.LogInfo($"AsnDataService: GetAsns FieldCount={fieldCount} (expected 13), purchase_receipt_no ordinal={idxPurchaseReceiptNo}.");
            var asnTitles = new List<string>();
            while (await asnReader.ReadAsync())
            {
                var title = asnReader.GetString(0);
                asnTitles.Add(title);
                var shipmentType = ReadString(asnReader, idxShipmentType);
                string? purchaseReceiptNo = null;
                try
                {
                    if (idxPurchaseReceiptNo >= 0 && idxPurchaseReceiptNo < fieldCount && !asnReader.IsDBNull(idxPurchaseReceiptNo))
                        purchaseReceiptNo = (asnReader.GetString(idxPurchaseReceiptNo) ?? "").Trim();
                }
                catch (Exception ex)
                {
                    ErrorLogService.LogError($"AsnDataService: ASN {title} read purchase_receipt_no at {idxPurchaseReceiptNo}: {ex.Message}", ex);
                }
                if (string.IsNullOrEmpty(purchaseReceiptNo))
                    purchaseReceiptNo = null;
                asns.Add(new Asn
                {
                    Title = title,
                    Status = asnReader.GetString(1),
                    PurchaseOrder = asnReader.IsDBNull(2) ? null : asnReader.GetString(2),
                    Supplier = asnReader.GetString(3),
                    ShipmentDate = asnReader.GetDateTime(4),
                    ExpectedArrivalDate = asnReader.GetDateTime(5),
                    TotalShippedQty = Convert.ToDouble(asnReader.GetDecimal(6)),
                    AirwayBillNo = asnReader.IsDBNull(7) ? null : asnReader.GetString(7),
                    ShipmentType = shipmentType,
                    WmsExportStatus = asnReader.IsDBNull(9) ? "Pending" : asnReader.GetString(9),
                    PurchaseReceiptNo = purchaseReceiptNo,
                    UpdatedOn = asnReader.IsDBNull(11) ? null : asnReader.GetDateTime(11),
                    TotalCartonCount = Convert.ToInt32(asnReader.GetInt64(12))
                });
            }

            await asnReader.CloseAsync();

            // Get ASN item details for each ASN
            // Join with tabReceivingCarton to get actual carton status (Unloaded, Receiving, etc.)
            if (asnTitles.Count > 0)
            {
                var placeholders = string.Join(",", asnTitles.Select((_, i) => $"@title{i}"));
                // Use subquery to get latest carton status for each carton+asn combination
                // Note: Handle ASN format differences (4-digit vs 5-digit) by using LIKE pattern matching
                // Backend normalizes to 5-digit (ASN-00002), desktop may use 4-digit (ASN-0002)
                var detailsSql = $@"SELECT DISTINCT d.parent_title, d.item_code, d.po_item_reference, d.shipped_qty, 
                                           d.carton_id, d.carton_assigned_status,
                                           COALESCE(rc_latest.status, d.carton_assigned_status) as actual_carton_status,
                                           rc_latest.inbound_session, rc_latest.opened_by, rc_latest.opened_on,
                                           rc_latest.locked_by, rc_latest.locked_on, rc_latest.received_by, rc_latest.received_on,
                                           rc_latest.verified_by, rc_latest.verified_on, rc_latest.updated_on, rc_latest.remarks,
                                           rc_latest.created_at,
                                           COALESCE(SUM(rl.received_qty), 0) as received_qty
                                    FROM tabAsnItemDetails d
                                    LEFT JOIN (
                                        SELECT rc1.carton_id, rc1.advance_shipping_notice, rc1.status, rc1.inbound_session,
                                               rc1.opened_by, rc1.opened_on, rc1.locked_by, rc1.locked_on,
                                               rc1.received_by, rc1.received_on, rc1.verified_by, rc1.verified_on,
                                               rc1.updated_on, rc1.remarks, rc1.created_at
                                        FROM tabReceivingCarton rc1
                                        INNER JOIN (
                                            SELECT carton_id, advance_shipping_notice, 
                                                   MAX(COALESCE(updated_on, created_at)) as latest_update
                                            FROM tabReceivingCarton
                                            GROUP BY carton_id, advance_shipping_notice
                                        ) rc2 ON rc1.carton_id = rc2.carton_id 
                                            AND rc1.advance_shipping_notice = rc2.advance_shipping_notice
                                            AND COALESCE(rc1.updated_on, rc1.created_at) = rc2.latest_update
                                    ) rc_latest ON d.carton_id = rc_latest.carton_id 
                                       AND (
                                           d.parent_title = rc_latest.advance_shipping_notice
                                           OR CONCAT(SUBSTRING_INDEX(rc_latest.advance_shipping_notice, '-', 1), '-', 
                                                     LPAD(SUBSTRING_INDEX(rc_latest.advance_shipping_notice, '-', -1), 4, '0')) = d.parent_title
                                           OR CONCAT(SUBSTRING_INDEX(d.parent_title, '-', 1), '-', 
                                                     LPAD(SUBSTRING_INDEX(d.parent_title, '-', -1), 5, '0')) = rc_latest.advance_shipping_notice
                                       )
                                    LEFT JOIN tabInboundReceiveLine rl ON rl.carton_id = d.carton_id 
                                       AND rl.item_code = d.item_code
                                       AND rl.parent_title IN (
                                           SELECT inbound_session 
                                           FROM tabInboundSession 
                                           WHERE asn_no = d.parent_title
                                              OR CONCAT(SUBSTRING_INDEX(asn_no, '-', 1), '-', 
                                                        LPAD(SUBSTRING_INDEX(asn_no, '-', -1), 4, '0')) = d.parent_title
                                              OR CONCAT(SUBSTRING_INDEX(d.parent_title, '-', 1), '-', 
                                                        LPAD(SUBSTRING_INDEX(d.parent_title, '-', -1), 5, '0')) = asn_no
                                       )
                                    WHERE d.parent_title IN ({placeholders})
                                    GROUP BY d.parent_title, d.item_code, d.po_item_reference, d.shipped_qty, 
                                             d.carton_id, d.carton_assigned_status, actual_carton_status,
                                             rc_latest.inbound_session, rc_latest.opened_by, rc_latest.opened_on,
                                             rc_latest.locked_by, rc_latest.locked_on, rc_latest.received_by, rc_latest.received_on,
                                             rc_latest.verified_by, rc_latest.verified_on, rc_latest.updated_on, rc_latest.remarks,
                                             rc_latest.created_at
                                    ORDER BY d.parent_title, d.item_code, d.carton_id, d.po_item_reference, d.shipped_qty";
                
                await using var detailsCmd = new MySqlCommand(detailsSql, connection);
                for (int i = 0; i < asnTitles.Count; i++)
                {
                    detailsCmd.Parameters.AddWithValue($"@title{i}", asnTitles[i]);
                }
                
                await using var detailsReader = await detailsCmd.ExecuteReaderAsync();

                var detailsDict = new Dictionary<string, List<AsnItemDetails>>();
                // De-dupe reader rows only when every identifying field matches (same item on different cartons must stay separate).
                var processedItems = new HashSet<string>();
                
                while (await detailsReader.ReadAsync())
                {
                    var parentTitle = detailsReader.GetString(0);
                    var itemCode = detailsReader.GetString(1);
                    var poKey = detailsReader.IsDBNull(2) ? "NULL" : (detailsReader.GetString(2) ?? "").Trim();
                    var shippedKey = detailsReader.GetDecimal(3).ToString(CultureInfo.InvariantCulture);
                    var cartonId = detailsReader.IsDBNull(4) ? null : detailsReader.GetString(4);
                    
                    var itemKey = $"{parentTitle}|{itemCode}|{cartonId ?? "NULL"}|{poKey}|{shippedKey}";
                    
                    // Skip if we've already processed this item
                    if (processedItems.Contains(itemKey))
                    {
                        ErrorLogService.LogInfo($"Skipping duplicate item: {itemKey}");
                        continue;
                    }
                    processedItems.Add(itemKey);
                    
                    if (!detailsDict.ContainsKey(parentTitle))
                    {
                        detailsDict[parentTitle] = new List<AsnItemDetails>();
                    }

                    // Use actual_carton_status if available (from tabReceivingCarton), otherwise use carton_assigned_status
                    var assignedStatus = detailsReader.GetString(5);
                    var actualStatus = detailsReader.IsDBNull(6) 
                        ? assignedStatus  // Fallback to carton_assigned_status
                        : detailsReader.GetString(6); // Use actual status from tabReceivingCarton

                    // Read all receiving carton fields (columns 7-18)
                    var inboundSession = detailsReader.IsDBNull(7) ? null : detailsReader.GetString(7);
                    var openedBy = detailsReader.IsDBNull(8) ? null : detailsReader.GetString(8);
                    DateTime? openedOn = detailsReader.IsDBNull(9) ? (DateTime?)null : detailsReader.GetDateTime(9);
                    var lockedBy = detailsReader.IsDBNull(10) ? null : detailsReader.GetString(10);
                    DateTime? lockedOn = detailsReader.IsDBNull(11) ? (DateTime?)null : detailsReader.GetDateTime(11);
                    var receivedBy = detailsReader.IsDBNull(12) ? null : detailsReader.GetString(12);
                    DateTime? receivedOn = detailsReader.IsDBNull(13) ? (DateTime?)null : detailsReader.GetDateTime(13);
                    var verifiedBy = detailsReader.IsDBNull(14) ? null : detailsReader.GetString(14);
                    DateTime? verifiedOn = detailsReader.IsDBNull(15) ? (DateTime?)null : detailsReader.GetDateTime(15);
                    DateTime? updatedOn = detailsReader.IsDBNull(16) ? (DateTime?)null : detailsReader.GetDateTime(16);
                    var remarks = detailsReader.IsDBNull(17) ? null : detailsReader.GetString(17);
                    DateTime? createdAt = detailsReader.IsDBNull(18) ? (DateTime?)null : detailsReader.GetDateTime(18);
                    
                    // Read received quantity (column 19)
                    var receivedQty = detailsReader.IsDBNull(19) ? 0.0 : Convert.ToDouble(detailsReader.GetDecimal(19));

                    // Log for debugging
                    if (!string.IsNullOrEmpty(cartonId))
                    {
                        ErrorLogService.LogInfo($"ASN {parentTitle} Carton {cartonId}: Assigned={assignedStatus}, Actual={actualStatus}, ReceivedQty={receivedQty}");
                    }

                    detailsDict[parentTitle].Add(new AsnItemDetails
                    {
                        ItemCode = itemCode,
                        PoItemReference = detailsReader.IsDBNull(2) ? null : detailsReader.GetString(2),
                        ShippedQty = Convert.ToDouble(detailsReader.GetDecimal(3)),
                        ReceivedQty = receivedQty,
                        CartonId = cartonId,
                        CartonAssignedStatus = actualStatus, // Now shows actual receiving status (Unloaded, etc.)
                        // Receiving Carton fields
                        InboundSession = inboundSession,
                        ReceivingStatus = actualStatus,
                        OpenedBy = openedBy,
                        OpenedOn = openedOn,
                        LockedBy = lockedBy,
                        LockedOn = lockedOn,
                        ReceivedBy = receivedBy,
                        ReceivedOn = receivedOn,
                        VerifiedBy = verifiedBy,
                        VerifiedOn = verifiedOn,
                        UpdatedOn = updatedOn,
                        Remarks = remarks,
                        CreatedAt = createdAt
                    });
                }

                // Assign details to ASNs - need to recreate ASN instances since it's not a record
                for (int i = 0; i < asns.Count; i++)
                {
                    var asn = asns[i];
                    var details = detailsDict.ContainsKey(asn.Title) ? detailsDict[asn.Title] : new List<AsnItemDetails>();
                    // Create new ASN with details (preserve TotalCartonCount, TotalShippedQty, PurchaseReceiptNo from database)
                    asns[i] = new Asn
                    {
                        Title = asn.Title,
                        Status = asn.Status,
                        PurchaseOrder = asn.PurchaseOrder,
                        Supplier = asn.Supplier,
                        ShipmentDate = asn.ShipmentDate,
                        ExpectedArrivalDate = asn.ExpectedArrivalDate,
                        TotalShippedQty = asn.TotalShippedQty, // Use database value directly
                        TotalCartonCount = asn.TotalCartonCount,
                        AirwayBillNo = asn.AirwayBillNo,
                        ShipmentType = asn.ShipmentType,
                        WmsExportStatus = asn.WmsExportStatus,
                        PurchaseReceiptNo = asn.PurchaseReceiptNo,
                        UpdatedOn = asn.UpdatedOn,
                        Details = details
                    };
                }
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading ASNs from database", ex);
            // Return empty list on error
        }

        return asns;
    }

    /// <summary>
    /// Get ASN by title from database. Tries exact match then alternate format (ASN-0003 / ASN-00003).
    /// </summary>
    public static async Task<Asn?> GetAsnByTitleAsync(WmsSettings settings, string title)
    {
        if (string.IsNullOrWhiteSpace(title)) return null;
        var asns = await GetAsnsAsync(settings);
        var exact = asns.FirstOrDefault(a => string.Equals(a.Title, title, StringComparison.Ordinal));
        if (exact != null) return exact;
        var altTitle = NormalizeAsnTitleAlternate(title);
        return altTitle != null ? asns.FirstOrDefault(a => string.Equals(a.Title, altTitle, StringComparison.Ordinal)) : null;
    }

    /// <summary>
    /// Update Purchase Receipt number for an ASN (after creating PR in ERPNext).
    /// Ensures purchase_receipt_no column exists, then tries exact title and alternate format (ASN-0003 / ASN-00003).
    /// </summary>
    public static async Task<bool> SetAsnPurchaseReceiptNoAsync(WmsSettings settings, string asnTitle, string purchaseReceiptNo)
    {
        if (string.IsNullOrWhiteSpace(asnTitle)) return false;
        try
        {
            await DatabaseService.EnsureTabAdvanceShippingNoticePurchaseReceiptNoColumnAsync(settings);
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();
            var prNo = (purchaseReceiptNo ?? "").Trim();
            var title = asnTitle.Trim();
            await using var cmd = new MySqlCommand("UPDATE tabAdvanceShippingNotice SET purchase_receipt_no = @prNo, updated_at = NOW() WHERE title = @title", connection);
            cmd.Parameters.AddWithValue("@prNo", prNo);
            cmd.Parameters.AddWithValue("@title", title);
            var rows = await cmd.ExecuteNonQueryAsync();
            if (rows > 0)
            {
                ErrorLogService.LogInfo($"AsnDataService: SetAsnPurchaseReceiptNo saved {prNo} for ASN {title}.");
                return true;
            }
            // Try alternate title format (ASN-0003 vs ASN-00003)
            var altTitle = NormalizeAsnTitleAlternate(title);
            if (altTitle != null)
            {
                cmd.Parameters["@title"].Value = altTitle;
                rows = await cmd.ExecuteNonQueryAsync();
                if (rows > 0)
                {
                    ErrorLogService.LogInfo($"AsnDataService: SetAsnPurchaseReceiptNo saved {prNo} for ASN {altTitle} (alternate title).");
                    return true;
                }
            }
            ErrorLogService.LogError($"AsnDataService: SetAsnPurchaseReceiptNo affected 0 rows for title '{title}'. No ASN row found.", null);
            return false;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"AsnDataService: SetAsnPurchaseReceiptNo failed for {asnTitle}", ex);
            return false;
        }
    }

    /// <summary>Read string from reader at given column index (0-based); return trimmed or null.</summary>
    private static string? ReadString(DbDataReader reader, int columnIndex)
    {
        if (columnIndex < 0 || columnIndex >= reader.FieldCount) return null;
        try
        {
            if (reader.IsDBNull(columnIndex)) return null;
            var s = reader.GetString(columnIndex);
            return string.IsNullOrWhiteSpace(s) ? null : s.Trim();
        }
        catch
        {
            return null;
        }
    }

    /// <summary>Returns the other common format for ASN title (e.g. ASN-0003 -> ASN-00003, ASN-00003 -> ASN-0003).</summary>
    private static string? NormalizeAsnTitleAlternate(string title)
    {
        if (string.IsNullOrWhiteSpace(title)) return null;
        var parts = title.Split('-', 2, StringSplitOptions.None);
        if (parts.Length != 2) return null;
        var prefix = parts[0].Trim();
        var numPart = parts[1].Trim();
        if (numPart.Length == 0 || !numPart.All(char.IsDigit)) return null;
        var num = int.TryParse(numPart, out var n) ? n : (int?)null;
        if (num == null) return null;
        return numPart.Length == 4
            ? $"{prefix}-{num:D5}"
            : $"{prefix}-{num:D4}";
    }

    /// <summary>
    /// Update default receiving warehouse code for an ASN (e.g. after pushing received qty or creating PR).
    /// Ensures warehouse column exists, then tries exact title and alternate format (ASN-0003 / ASN-00003).
    /// </summary>
    public static async Task<bool> SetAsnWarehouseAsync(WmsSettings settings, string asnTitle, string warehouseCode)
    {
        if (string.IsNullOrWhiteSpace(asnTitle)) return false;
        try
        {
            await DatabaseService.EnsureTabAdvanceShippingNoticeWarehouseColumnAsync(settings);
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();
            var wh = (warehouseCode ?? "").Trim();
            var title = asnTitle.Trim();
            await using var cmd = new MySqlCommand("UPDATE tabAdvanceShippingNotice SET warehouse = @wh, updated_at = NOW() WHERE title = @title", connection);
            cmd.Parameters.AddWithValue("@wh", string.IsNullOrEmpty(wh) ? (object)DBNull.Value : wh);
            cmd.Parameters.AddWithValue("@title", title);
            var rows = await cmd.ExecuteNonQueryAsync();
            if (rows > 0) return true;
            var altTitle = NormalizeAsnTitleAlternate(title);
            if (altTitle != null)
            {
                cmd.Parameters["@title"].Value = altTitle;
                rows = await cmd.ExecuteNonQueryAsync();
                if (rows > 0) return true;
            }
            return false;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"AsnDataService: SetAsnWarehouse failed for {asnTitle}", ex);
            return false;
        }
    }

    /// <summary>
    /// Update ASN status (e.g. Draft, Received). Used to mark ASN as Received so "Update Received Qty to ERPNext" is enabled.
    /// </summary>
    public static async Task<bool> SetAsnStatusAsync(WmsSettings settings, string asnTitle, string status)
    {
        if (string.IsNullOrWhiteSpace(asnTitle) || string.IsNullOrWhiteSpace(status)) return false;
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();
            await using var cmd = new MySqlCommand("UPDATE tabAdvanceShippingNotice SET status = @status, updated_at = NOW() WHERE title = @title", connection);
            cmd.Parameters.AddWithValue("@status", status.Trim());
            cmd.Parameters.AddWithValue("@title", asnTitle.Trim());
            var rows = await cmd.ExecuteNonQueryAsync();
            return rows > 0;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"AsnDataService: SetAsnStatus failed for {asnTitle}", ex);
            return false;
        }
    }

    /// <summary>
    /// If ASN is fully received (every detail has ReceivedQty >= ShippedQty) and status is not already "Received",
    /// sets status to "Received" so the user can use "Update Received Qty to ERPNext". Returns true if status was updated.
    /// </summary>
    public static async Task<bool> TrySetAsnStatusToReceivedWhenFullyReceivedAsync(WmsSettings settings, Asn asn)
    {
        if (asn == null || string.IsNullOrWhiteSpace(asn.Title)) return false;
        if (string.Equals(asn.Status, "Received", StringComparison.OrdinalIgnoreCase)) return false;
        if (asn.Details == null || asn.Details.Count == 0) return false;
        const double tolerance = 0.0001;
        bool fullyReceived = asn.Details.All(d => d.ReceivedQty >= d.ShippedQty - tolerance);
        if (!fullyReceived) return false;
        var updated = await SetAsnStatusAsync(settings, asn.Title, "Received");
        if (updated)
            ErrorLogService.LogInfo($"AsnDataService: ASN {asn.Title} marked as Received (fully received: {asn.Details.Count} lines).");
        return updated;
    }

    /// <summary>
    /// Update WMS Export Status for an ASN (e.g. after pushing status to ERPNext).
    /// </summary>
    public static async Task<bool> SetAsnWmsExportStatusAsync(WmsSettings settings, string asnTitle, string status)
    {
        if (string.IsNullOrWhiteSpace(asnTitle)) return false;
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();
            await using var cmd = new MySqlCommand("UPDATE tabAdvanceShippingNotice SET wms_export_status = @status, updated_at = NOW() WHERE title = @title", connection);
            cmd.Parameters.AddWithValue("@status", (status ?? "Pending").Trim());
            cmd.Parameters.AddWithValue("@title", asnTitle.Trim());
            var rows = await cmd.ExecuteNonQueryAsync();
            return rows > 0;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"AsnDataService: SetAsnWmsExportStatus failed for {asnTitle}", ex);
            return false;
        }
    }

    /// <summary>
    /// Sync total_shipped_qty in database with calculated sum from carton details
    /// This fixes discrepancies where the database value doesn't match the actual carton totals
    /// </summary>
    public static async Task<bool> SyncAsnTotalShippedQtyAsync(WmsSettings settings, string asnTitle)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Calculate total from carton details
            var sumSql = @"SELECT COALESCE(SUM(shipped_qty), 0) as total_qty
                           FROM tabAsnItemDetails
                           WHERE parent_title = @title";
            
            await using var sumCmd = new MySqlCommand(sumSql, connection);
            sumCmd.Parameters.AddWithValue("@title", asnTitle);
            var calculatedTotal = Convert.ToDouble(await sumCmd.ExecuteScalarAsync() ?? 0.0);

            // Update the ASN header with calculated total
            var updateSql = @"UPDATE tabAdvanceShippingNotice 
                              SET total_shipped_qty = @qty, updated_at = NOW()
                              WHERE title = @title";
            
            await using var updateCmd = new MySqlCommand(updateSql, connection);
            updateCmd.Parameters.AddWithValue("@qty", calculatedTotal);
            updateCmd.Parameters.AddWithValue("@title", asnTitle);
            var rowsAffected = await updateCmd.ExecuteNonQueryAsync();

            if (rowsAffected > 0)
            {
                ErrorLogService.LogInfo($"Synced ASN {asnTitle} total_shipped_qty to {calculatedTotal}");
                return true;
            }

            return false;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"Error syncing ASN {asnTitle} total_shipped_qty", ex);
            return false;
        }
    }

    /// <summary>
    /// Sync total_shipped_qty for all ASNs in the database
    /// </summary>
    public static async Task<int> SyncAllAsnTotalShippedQtyAsync(WmsSettings settings)
    {
        var syncedCount = 0;
        try
        {
            var asns = await GetAsnsAsync(settings);
            foreach (var asn in asns)
            {
                if (await SyncAsnTotalShippedQtyAsync(settings, asn.Title))
                {
                    syncedCount++;
                }
            }
            ErrorLogService.LogInfo($"Synced total_shipped_qty for {syncedCount} ASN(s)");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error syncing all ASN total_shipped_qty", ex);
        }
        return syncedCount;
    }
}

