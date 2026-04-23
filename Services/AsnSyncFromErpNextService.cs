using System;
using System.Globalization;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Result of ASN sync from ERPNext get_asns_for_wms
/// </summary>
public class AsnSyncResult
{
    public bool Success { get; set; }
    public int TotalFetched { get; set; }
    public int AsnsInserted { get; set; }
    public int AsnsUpdated { get; set; }
    public int ItemsInserted { get; set; }
    public List<string> Errors { get; set; } = new();
}

/// <summary>
/// Syncs ASNs from ERPNext get_asns_for_wms to tabAdvanceShippingNotice and tabAsnItemDetails.
/// Uses same endpoint resolution as warehouse sync (SyncEndpoints with All or default ErpNext URL).
/// </summary>
public static class AsnSyncFromErpNextService
{
    public static async Task<AsnSyncResult> SyncAsnsFromErpNextAsync(WmsSettings settings)
    {
        var result = new AsnSyncResult { Success = false, Errors = new List<string>() };
        ErrorLogService.LogInfo("ASN sync from ERPNext started.");

        try
        {
            await DatabaseService.EnsureTabAsnTablesExistAsync(settings);

            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var endpoints = GetEndpoints(settings);
            if (endpoints.Count == 0)
            {
                ErrorLogService.LogInfo("AsnSyncFromErpNextService: No sync endpoints configured. Sync skipped.");
                result.Success = true;
                return result;
            }

            var allAsns = new List<ErpNextAsnDto>();
            foreach (var (epName, epUrl, epKey) in endpoints)
            {
                var list = await ErpNextWmsSyncApiService.FetchAsnsFromErpNextAsync(settings, epUrl, epKey, epName);
                if (list != null)
                    allAsns.AddRange(list);
            }

            var byTitle = new Dictionary<string, ErpNextAsnDto>(StringComparer.OrdinalIgnoreCase);
            foreach (var asn in allAsns)
            {
                var title = (asn.Title ?? asn.Name ?? "").Trim();
                if (string.IsNullOrWhiteSpace(title)) continue;
                if (!byTitle.ContainsKey(title))
                    byTitle[title] = asn;
            }

            result.TotalFetched = byTitle.Count;
            ErrorLogService.LogInfo($"AsnSyncFromErpNextService: Syncing {result.TotalFetched} ASN(s) with items.");

            // Resolve default_receiving_warehouse_code (e.g. WH-MAIN) for tabAdvanceShippingNotice.warehouse
            var defaultWarehouseCode = (settings.DefaultReceivingWarehouseForPr ?? settings.DefaultPickingWarehouse ?? "").Trim();
            var warehouses = await WarehouseDataService.GetWarehousesAsync(settings);
            var matchedWh = warehouses.FirstOrDefault(w =>
                string.Equals(w.Code, defaultWarehouseCode, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(w.Name, defaultWarehouseCode, StringComparison.OrdinalIgnoreCase));
            if (matchedWh != null)
                defaultWarehouseCode = matchedWh.Code;
            else if (string.IsNullOrEmpty(defaultWarehouseCode))
                defaultWarehouseCode = "WH-MAIN";

            foreach (var kv in byTitle)
            {
                var asn = kv.Value;
                var title = kv.Key;
                try
                {
                    DateTime? shipmentDate = ParseDate(asn.ShipmentDate) ?? ParseDate(asn.PostingDate);
                    DateTime? expectedArrival = ParseDate(asn.ExpectedArrivalDate) ?? ParseDate(asn.ExpectedArrival) ?? ParseDate(asn.DeliveryDate);
                    if (!shipmentDate.HasValue || !expectedArrival.HasValue)
                    {
                        var fallback = DateTime.UtcNow.Date;
                        if (!shipmentDate.HasValue) shipmentDate = fallback;
                        if (!expectedArrival.HasValue) expectedArrival = fallback;
                        ErrorLogService.LogInfo($"ASN {title}: Missing dates from API; using fallback {fallback:yyyy-MM-dd} for sync.");
                    }

                    double totalQty = asn.TotalShippedQty;
                    var items = asn.Items ?? new List<ErpNextAsnItemDto>();
                    if (totalQty == 0 && items.Count > 0)
                        totalQty = items.Sum(i => i.ShippedQty);

                    var asnSql = @"INSERT INTO tabAdvanceShippingNotice 
                        (title, status, purchase_order, supplier, shipment_date, expected_arrival_date, 
                         total_shipped_qty, airway_bill_no, shipment_type, wms_export_status, warehouse, updated_at)
                        VALUES (@title, @status, @po, @supplier, @shipDate, @arrivalDate, @totalQty, @airwayBill, @shipmentType, @wmsExportStatus, @warehouse, CURRENT_TIMESTAMP)
                        ON DUPLICATE KEY UPDATE
                            status = VALUES(status),
                            purchase_order = VALUES(purchase_order),
                            supplier = VALUES(supplier),
                            shipment_date = VALUES(shipment_date),
                            expected_arrival_date = VALUES(expected_arrival_date),
                            total_shipped_qty = VALUES(total_shipped_qty),
                            airway_bill_no = VALUES(airway_bill_no),
                            shipment_type = VALUES(shipment_type),
                            wms_export_status = VALUES(wms_export_status),
                            warehouse = VALUES(warehouse),
                            updated_at = CURRENT_TIMESTAMP";

                    var wmsExportStatus = asn.WmsExportStatus ?? "Pending";
                    var shipmentType = asn.ResolvedShipmentType;
                    if (string.IsNullOrWhiteSpace(shipmentType))
                        ErrorLogService.LogInfo($"ASN {title}: shipment_type not in API response (check get_asns_for_wms returns shipment_type or shipmentType).");
                    await using (var cmd = new MySqlCommand(asnSql, connection))
                    {
                        cmd.Parameters.AddWithValue("@title", title);
                        cmd.Parameters.AddWithValue("@status", asn.Status ?? "Draft");
                        cmd.Parameters.AddWithValue("@po", (object?)asn.PurchaseOrder ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@supplier", asn.Supplier ?? "");
                        cmd.Parameters.AddWithValue("@shipDate", shipmentDate.Value);
                        cmd.Parameters.AddWithValue("@arrivalDate", expectedArrival.Value);
                        cmd.Parameters.AddWithValue("@totalQty", totalQty);
                        cmd.Parameters.AddWithValue("@airwayBill", (object?)asn.AirwayBillNo ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@shipmentType", (object?)shipmentType ?? DBNull.Value);
                        cmd.Parameters.AddWithValue("@wmsExportStatus", wmsExportStatus);
                        cmd.Parameters.AddWithValue("@warehouse", string.IsNullOrEmpty(defaultWarehouseCode) ? (object)DBNull.Value : defaultWarehouseCode);
                        var rows = await cmd.ExecuteNonQueryAsync();
                        if (rows == 1) result.AsnsInserted++;
                        else if (rows == 2) result.AsnsUpdated++;
                    }

                    await using (var delCmd = new MySqlCommand("DELETE FROM tabAsnItemDetails WHERE parent_title = @title", connection))
                    {
                        delCmd.Parameters.AddWithValue("@title", title);
                        await delCmd.ExecuteNonQueryAsync();
                    }

                    var itemSql = @"INSERT INTO tabAsnItemDetails 
                        (parent_title, item_code, po_item_reference, shipped_qty, carton_id, carton_assigned_status)
                        VALUES (@parent, @itemCode, @poRef, @qty, @cartonId, 'Assigned')";
                    foreach (var it in items)
                    {
                        var itemCode = (it.ItemCode ?? "").Trim();
                        if (string.IsNullOrWhiteSpace(itemCode)) continue;
                        await using var itemCmd = new MySqlCommand(itemSql, connection);
                        itemCmd.Parameters.AddWithValue("@parent", title);
                        itemCmd.Parameters.AddWithValue("@itemCode", itemCode);
                        itemCmd.Parameters.AddWithValue("@poRef", (object?)it.PoItemReference ?? DBNull.Value);
                        itemCmd.Parameters.AddWithValue("@qty", it.ShippedQty);
                        itemCmd.Parameters.AddWithValue("@cartonId", (object?)it.CartonId ?? DBNull.Value);
                        await itemCmd.ExecuteNonQueryAsync();
                        result.ItemsInserted++;
                    }
                }
                catch (Exception ex)
                {
                    var err = $"ASN {title}: {ex.Message}";
                    result.Errors.Add(err);
                    ErrorLogService.LogError(err, ex);
                }
            }

            result.Success = true;
            ErrorLogService.LogInfo($"ASN sync from ERPNext completed. Fetched: {result.TotalFetched}, ASNs inserted: {result.AsnsInserted}, updated: {result.AsnsUpdated}, items: {result.ItemsInserted}, errors: {result.Errors.Count}");

            var asnNamesJustSynced = byTitle.Keys.ToList();
            if (asnNamesJustSynced.Count > 0 && endpoints.Count > 0)
            {
                var (_, pushBaseUrl, pushApiKey) = endpoints[0];
                var wmsRef = ErpNextWmsSyncApiService.GenerateWmsRef();
                var updated = 0;
                foreach (var asnTitle in asnNamesJustSynced)
                {
                    var (pushSuccess, pushError) = await ErpNextWmsSyncApiService.UpdateAsnWmsStatusAsync(settings, asnTitle, "Exported", wmsRef, pushBaseUrl, pushApiKey);
                    if (pushSuccess)
                    {
                        updated++;
                        await AsnDataService.SetAsnWmsExportStatusAsync(settings, asnTitle, "Exported");
                    }
                    else
                        ErrorLogService.LogError($"AsnSyncFromErpNextService: Failed to post ASN {asnTitle} status to ERPNext: {pushError}", null);
                }
                ErrorLogService.LogInfo($"AsnSyncFromErpNextService: ASN status posted to ERPNext: {updated}/{asnNamesJustSynced.Count} updated (update_asn_wms_status per ASN)");
            }
            else if (asnNamesJustSynced.Count > 0 && endpoints.Count == 0)
                ErrorLogService.LogInfo("AsnSyncFromErpNextService: Skipped posting ASN status to ERPNext (no endpoints; cannot determine push URL)");
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Errors.Add(ex.Message);
            ErrorLogService.LogError("AsnSyncFromErpNextService: Error syncing ASNs from ERPNext", ex);
        }

        return result;
    }

    private static List<(string Name, string BaseUrl, string ApiKey)> GetEndpoints(WmsSettings settings)
    {
        var list = new List<(string, string, string)>();
        if (settings.SyncEndpoints != null && settings.SyncEndpoints.Count > 0)
        {
            foreach (var ep in settings.SyncEndpoints.Where(e => e.Enabled && !string.IsNullOrWhiteSpace(e.BaseUrl) && !string.IsNullOrWhiteSpace(e.ApiKey) &&
                (string.Equals(e.SyncType, SyncTypeNames.All, StringComparison.OrdinalIgnoreCase) || string.Equals(e.SyncType, SyncTypeNames.Asn, StringComparison.OrdinalIgnoreCase))))
            {
                list.Add((ep.Name, ep.BaseUrl.Trim(), ep.ApiKey));
            }
        }
        if (list.Count == 0 && (settings.SyncEndpoints == null || settings.SyncEndpoints.Count == 0))
        {
            var url = !string.IsNullOrWhiteSpace(settings.ErpNextApiUrl) ? settings.ErpNextApiUrl : settings.ApiEndpointUrl;
            var key = !string.IsNullOrWhiteSpace(settings.ErpNextApiKey) ? settings.ErpNextApiKey : settings.ApiKey;
            if (!string.IsNullOrWhiteSpace(url) && !string.IsNullOrWhiteSpace(key))
                list.Add(("Default", url.Trim(), key));
        }
        return list;
    }

    private static DateTime? ParseDate(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var trimmed = s.Trim();
        if (DateTime.TryParse(trimmed, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
            return d;
        if (DateTime.TryParse(trimmed, out d))
            return d;
        return null;
    }
}
