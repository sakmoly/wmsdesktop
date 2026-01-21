using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class TransferOrderSyncService
{
    /// <summary>
    /// Sync transfer orders from API to local database
    /// Only updates if connection is available, keeps existing data if not
    /// </summary>
    public static async Task<bool> SyncTransferOrdersFromApiAsync(WmsSettings settings)
    {
        try
        {
            // Fetch transfer orders from API
            var apiTransferOrders = await TransferOrderApiService.FetchTransferOrdersFromApiAsync(settings);
            
            if (apiTransferOrders == null || apiTransferOrders.Count == 0)
            {
                ErrorLogService.LogInfo("TransferOrderSyncService: No transfer orders from API or API not available - keeping existing data");
                return false; // API not available, but that's OK - keep existing data
            }

            // Sync to database
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            int updatedCount = 0;
            int insertedCount = 0;

            // Track which transfer orders we're processing to detect duplicates
            var processedTOs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            
            foreach (var apiTO in apiTransferOrders)
            {
                try
                {
                    // Skip if we've already processed this TO (duplicate in API response)
                    if (processedTOs.Contains(apiTO.TransferOrder))
                    {
                        ErrorLogService.LogInfo($"TransferOrderSyncService: Skipping duplicate TO in API response: {apiTO.TransferOrder}");
                        continue;
                    }
                    processedTOs.Add(apiTO.TransferOrder);
                    
                    // Parse required_date
                    DateTime? requiredDate = null;
                    if (!string.IsNullOrWhiteSpace(apiTO.RequiredDate))
                    {
                        if (DateTime.TryParse(apiTO.RequiredDate, out var parsedDate))
                        {
                            requiredDate = parsedDate;
                        }
                    }
                    
                    // Use INSERT ... ON DUPLICATE KEY UPDATE to upsert
                    var sql = @"INSERT INTO tabTransferOrder 
                                (title, status, advance_shipping_notice, from_warehouse, 
                                 prepared_by, required_date, total_allocated_qty, created_at, updated_at)
                                VALUES 
                                (@title, @status, @advance_shipping_notice, @from_warehouse,
                                 @prepared_by, @required_date, @total_allocated_qty, 
                                 COALESCE(@created_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
                                ON DUPLICATE KEY UPDATE
                                    status = VALUES(status),
                                    advance_shipping_notice = VALUES(advance_shipping_notice),
                                    from_warehouse = VALUES(from_warehouse),
                                    prepared_by = VALUES(prepared_by),
                                    required_date = VALUES(required_date),
                                    total_allocated_qty = VALUES(total_allocated_qty),
                                    updated_at = CURRENT_TIMESTAMP";

                    await using var cmd = new MySqlCommand(sql, connection);
                    cmd.Parameters.AddWithValue("@title", apiTO.TransferOrder);
                    cmd.Parameters.AddWithValue("@status", apiTO.Status);
                    cmd.Parameters.AddWithValue("@advance_shipping_notice", apiTO.AsnNo ?? (object)DBNull.Value);
                    cmd.Parameters.AddWithValue("@from_warehouse", apiTO.FromWarehouse ?? (object)DBNull.Value);
                    cmd.Parameters.AddWithValue("@prepared_by", apiTO.PreparedBy ?? (object)DBNull.Value);
                    cmd.Parameters.AddWithValue("@required_date", requiredDate ?? (object)DBNull.Value);
                    cmd.Parameters.AddWithValue("@total_allocated_qty", apiTO.TotalAllocatedQty);
                    
                    // Parse created_at if available
                    if (!string.IsNullOrWhiteSpace(apiTO.CreatedAt) && DateTime.TryParse(apiTO.CreatedAt, out var createdAt))
                    {
                        cmd.Parameters.AddWithValue("@created_at", createdAt);
                    }
                    else
                    {
                        cmd.Parameters.AddWithValue("@created_at", DBNull.Value);
                    }

                    var rowsAffected = await cmd.ExecuteNonQueryAsync();
                    
                    if (rowsAffected == 1)
                    {
                        insertedCount++;
                    }
                    else if (rowsAffected == 2)
                    {
                        updatedCount++;
                    }
                }
                catch (Exception ex)
                {
                    ErrorLogService.LogError($"TransferOrderSyncService: Error syncing transfer order {apiTO.TransferOrder}", ex);
                }
            }

            ErrorLogService.LogInfo($"TransferOrderSyncService: Synced {insertedCount} new, {updatedCount} updated transfer order(s) from API");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("TransferOrderSyncService: Error syncing transfer orders from API", ex);
            return false;
        }
    }
}
