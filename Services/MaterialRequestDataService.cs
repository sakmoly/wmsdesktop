using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class MaterialRequestDataService
{
    /// <summary>
    /// Get all Material Requests from database
    /// </summary>
    public static async Task<List<MaterialRequest>> GetMaterialRequestsAsync(WmsSettings settings)
    {
        var materialRequests = new List<MaterialRequest>();
        
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Check if tables exist
            if (!await CheckTableExistsAsync(connection, "tabMaterialRequest"))
            {
                ErrorLogService.LogInfo("MaterialRequestDataService: tabMaterialRequest table does not exist, returning empty list");
                return materialRequests;
            }

            await DatabaseService.EnsureMaterialRequestStockEntryNoColumnAsync(settings);

            if (!await CheckTableExistsAsync(connection, "tabMaterialRequestItem"))
            {
                ErrorLogService.LogInfo("MaterialRequestDataService: tabMaterialRequestItem table does not exist, items will not be loaded");
            }

            // Get all Material Requests (stock_entry_no from Push to ERP)
            var mrSql = @"SELECT title, status, from_warehouse, to_showroom, requested_date, 
                                 required_date, requested_by, total_requested_qty, total_picked_qty, stock_entry_no
                          FROM tabMaterialRequest
                          ORDER BY requested_date DESC, title";
            
            await using var mrCmd = new MySqlCommand(mrSql, connection);
            await using var mrReader = await mrCmd.ExecuteReaderAsync();

            var mrTitles = new List<string>();
            while (await mrReader.ReadAsync())
            {
                var title = mrReader.GetString(0);
                mrTitles.Add(title);
                
                materialRequests.Add(new MaterialRequest
                {
                    Title = title,
                    Status = mrReader.GetString(1),
                    FromWarehouse = mrReader.GetString(2),
                    ToShowroom = mrReader.GetString(3),
                    RequestedDate = mrReader.GetDateTime(4),
                    RequiredDate = mrReader.IsDBNull(5) ? null : mrReader.GetDateTime(5),
                    RequestedBy = mrReader.GetString(6),
                    TotalRequestedQty = Convert.ToDouble(mrReader.GetDecimal(7)),
                    TotalPickedQty = Convert.ToDouble(mrReader.GetDecimal(8)),
                    StockEntryNo = mrReader.IsDBNull(9) ? null : mrReader.GetString(9)
                });
            }

            await mrReader.CloseAsync();

            // Get Material Request items for each Material Request
            if (mrTitles.Count > 0)
            {
                try
                {
                    if (await CheckTableExistsAsync(connection, "tabMaterialRequestItem"))
                    {
                        var placeholders = string.Join(",", mrTitles.Select((_, i) => $"@title{i}"));
                        var itemsSql = $@"SELECT parent_title, item_code, requested_qty, picked_qty, status
                                          FROM tabMaterialRequestItem
                                          WHERE parent_title IN ({placeholders})
                                          ORDER BY parent_title, item_code";
                        
                        await using var itemsCmd = new MySqlCommand(itemsSql, connection);
                        for (int i = 0; i < mrTitles.Count; i++)
                        {
                            itemsCmd.Parameters.AddWithValue($"@title{i}", mrTitles[i]);
                        }
                        
                        await using var itemsReader = await itemsCmd.ExecuteReaderAsync();

                        var itemsDict = new Dictionary<string, List<MaterialRequestItem>>();
                        
                        while (await itemsReader.ReadAsync())
                        {
                            var parentTitle = itemsReader.GetString(0);
                            if (!itemsDict.ContainsKey(parentTitle))
                            {
                                itemsDict[parentTitle] = new List<MaterialRequestItem>();
                            }

                            itemsDict[parentTitle].Add(new MaterialRequestItem
                            {
                                ItemCode = itemsReader.GetString(1),
                                RequestedQty = Convert.ToDouble(itemsReader.GetDecimal(2)),
                                PickedQty = Convert.ToDouble(itemsReader.GetDecimal(3)),
                                Status = itemsReader.IsDBNull(4) ? "Pending" : itemsReader.GetString(4)
                            });
                        }

                        // Assign items to Material Requests
                        for (int i = 0; i < materialRequests.Count; i++)
                        {
                            var mr = materialRequests[i];
                            var items = itemsDict.ContainsKey(mr.Title) ? itemsDict[mr.Title] : new List<MaterialRequestItem>();
                            
                            materialRequests[i] = new MaterialRequest
                            {
                                Title = mr.Title,
                                Status = mr.Status,
                                FromWarehouse = mr.FromWarehouse,
                                ToShowroom = mr.ToShowroom,
                                RequestedDate = mr.RequestedDate,
                                RequiredDate = mr.RequiredDate,
                                RequestedBy = mr.RequestedBy,
                                TotalRequestedQty = mr.TotalRequestedQty,
                                TotalPickedQty = mr.TotalPickedQty,
                                StockEntryNo = mr.StockEntryNo,
                                Items = items
                            };
                        }
                    }
                    else
                    {
                        // Table doesn't exist, assign empty items list
                        for (int i = 0; i < materialRequests.Count; i++)
                        {
                            var mr = materialRequests[i];
                        materialRequests[i] = new MaterialRequest
                        {
                            Title = mr.Title,
                            Status = mr.Status,
                            FromWarehouse = mr.FromWarehouse,
                            ToShowroom = mr.ToShowroom,
                            RequestedDate = mr.RequestedDate,
                            RequiredDate = mr.RequiredDate,
                            RequestedBy = mr.RequestedBy,
                            TotalRequestedQty = mr.TotalRequestedQty,
                            TotalPickedQty = mr.TotalPickedQty,
                            StockEntryNo = mr.StockEntryNo,
                            Items = new List<MaterialRequestItem>()
                        };
                    }
                }
            }
                catch (Exception ex)
                {
                    ErrorLogService.LogError("Error loading Material Request items", ex);
                    // Continue with empty items list
                    for (int i = 0; i < materialRequests.Count; i++)
                    {
                        var mr = materialRequests[i];
                            materialRequests[i] = new MaterialRequest
                            {
                                Title = mr.Title,
                                Status = mr.Status,
                                FromWarehouse = mr.FromWarehouse,
                                ToShowroom = mr.ToShowroom,
                                RequestedDate = mr.RequestedDate,
                                RequiredDate = mr.RequiredDate,
                                RequestedBy = mr.RequestedBy,
                                TotalRequestedQty = mr.TotalRequestedQty,
                                TotalPickedQty = mr.TotalPickedQty,
                                StockEntryNo = mr.StockEntryNo,
                                Items = new List<MaterialRequestItem>()
                            };
                        }
                    }
                }
            }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Material Requests from database", ex);
            // Return empty list on error
        }

        return materialRequests;
    }

    /// <summary>
    /// Get Material Request by title from database
    /// </summary>
    public static async Task<MaterialRequest?> GetMaterialRequestByTitleAsync(WmsSettings settings, string title)
    {
        var materialRequests = await GetMaterialRequestsAsync(settings);
        return materialRequests.FirstOrDefault(mr => mr.Title == title);
    }

    /// <summary>
    /// Update Material Request with Stock Entry number (after Push to ERP / add to transit).
    /// </summary>
    public static async Task<bool> UpdateMaterialRequestStockEntryNoAsync(WmsSettings settings, string title, string stockEntryNo)
    {
        if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(stockEntryNo)) return false;
        try
        {
            await DatabaseService.EnsureMaterialRequestStockEntryNoColumnAsync(settings);
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();
            await using var cmd = new MySqlCommand(
                "UPDATE tabMaterialRequest SET stock_entry_no = @no, updated_at = CURRENT_TIMESTAMP WHERE title = @title", connection);
            cmd.Parameters.AddWithValue("@no", stockEntryNo.Trim());
            cmd.Parameters.AddWithValue("@title", title);
            var rows = await cmd.ExecuteNonQueryAsync();
            return rows > 0;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("MaterialRequestDataService: UpdateMaterialRequestStockEntryNo failed", ex);
            return false;
        }
    }

    /// <summary>
    /// Check if a table exists in the database (case-insensitive)
    /// </summary>
    private static async Task<bool> CheckTableExistsAsync(MySqlConnection connection, string tableName)
    {
        try
        {
            var sql = @"
                SELECT COUNT(*) 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND LOWER(TABLE_NAME) = LOWER(@tableName)";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@tableName", tableName);
            var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            return count > 0;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Validate carton-level picking requirements (for carton-level inventory mode)
    /// Validates that carton exists, is in correct bin, and has sufficient stock
    /// </summary>
    public static async Task<(bool IsValid, string? ErrorMessage)> ValidateCartonLevelPickingAsync(
        WmsSettings settings,
        string cartonId,
        string itemCode,
        string sourceBin,
        string warehouse,
        double requestedQty)
    {
        try
        {
            // Check if carton-level mode is enabled
            if (settings.InventoryTrackingMode != "CartonLevel")
            {
                return (true, null); // Not needed in bin-level mode
            }

            // Get carton
            var carton = await CartonDataService.GetCartonAsync(settings, cartonId);
            if (carton == null)
            {
                return (false, $"Carton {cartonId} not found");
            }

            // Validate carton is in correct bin
            if (carton.CurrentBinId != sourceBin)
            {
                return (false, $"Carton {cartonId} is in bin {carton.CurrentBinId}, not {sourceBin}");
            }

            // Validate carton status allows picking
            if (carton.Status != "PUTAWAY")
            {
                return (false, $"Carton {cartonId} status is {carton.Status}, cannot pick");
            }

            // Get carton stock
            var cartonStock = await CartonDataService.GetCartonStockAsync(
                settings,
                cartonId: cartonId,
                itemCode: itemCode,
                warehouse: warehouse,
                binLocation: sourceBin);

            var availableQty = cartonStock.FirstOrDefault()?.Qty ?? 0;
            if (availableQty < requestedQty)
            {
                return (false, $"Insufficient stock in carton {cartonId}. Available: {availableQty}, Required: {requestedQty}");
            }

            return (true, null);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"MaterialRequestDataService: Error validating carton-level picking for {cartonId}", ex);
            return (false, $"Validation error: {ex.Message}");
        }
    }

    /// <summary>
    /// Get available cartons for picking (for carton-level inventory mode)
    /// Returns cartons in the specified bin that contain the requested item
    /// </summary>
    public static async Task<List<(string CartonId, double AvailableQty)>> GetAvailableCartonsForPickingAsync(
        WmsSettings settings,
        string itemCode,
        string sourceBin,
        string warehouse,
        double requestedQty)
    {
        var availableCartons = new List<(string CartonId, double AvailableQty)>();

        try
        {
            // Check if carton-level mode is enabled
            if (settings.InventoryTrackingMode != "CartonLevel")
            {
                return availableCartons; // Not applicable in bin-level mode
            }

            // Get cartons in bin
            var cartons = await CartonDataService.GetCartonsInBinAsync(settings, sourceBin, warehouse);

            foreach (var carton in cartons)
            {
                // Only consider cartons with PUTAWAY status
                if (carton.Status != "PUTAWAY")
                {
                    continue;
                }

                // Get carton stock for this item
                var cartonStock = await CartonDataService.GetCartonStockAsync(
                    settings,
                    cartonId: carton.CartonId,
                    itemCode: itemCode,
                    warehouse: warehouse,
                    binLocation: sourceBin);

                var stock = cartonStock.FirstOrDefault();
                if (stock != null && stock.Qty > 0)
                {
                    availableCartons.Add((carton.CartonId, stock.Qty));
                }
            }

            // Sort by available quantity (descending) for FEFO/FIFO
            return availableCartons.OrderByDescending(c => c.AvailableQty).ToList();
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"MaterialRequestDataService: Error getting available cartons for picking {itemCode}", ex);
            return availableCartons;
        }
    }
}

