using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class PurchaseOrderDataService
{
    /// <summary>
    /// Get all Purchase Orders from database
    /// </summary>
    public static async Task<List<PurchaseOrder>> GetPurchaseOrdersAsync(WmsSettings settings)
    {
        var purchaseOrders = new List<PurchaseOrder>();
        
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            ErrorLogService.LogInfo("Loading Purchase Orders from database...");

            // Get all Purchase Orders
            var sql = @"SELECT po_id, doc_status, transaction_date, expected_delivery_date, 
                              supplier_id, supplier_name, shipping_address, status
                       FROM tabPurchaseOrder
                       ORDER BY transaction_date DESC, po_id";
            
            await using var cmd = new MySqlCommand(sql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();

            var poData = new Dictionary<string, PurchaseOrder>();
            var poIds = new List<string>();
            
            while (await reader.ReadAsync())
            {
                var poId = reader.GetString(0);
                poIds.Add(poId);
                
                poData[poId] = new PurchaseOrder
                {
                    PoId = poId,
                    DocStatus = reader.GetInt32(1),
                    TransactionDate = reader.GetDateTime(2),
                    ExpectedDeliveryDate = reader.IsDBNull(3) ? null : reader.GetDateTime(3),
                    SupplierId = reader.GetString(4),
                    SupplierName = reader.GetString(5),
                    ShippingAddress = reader.IsDBNull(6) ? null : reader.GetString(6),
                    Status = reader.GetString(7),
                    Items = Array.Empty<PurchaseOrderItem>() // Will be populated below
                };
            }

            await reader.CloseAsync();

            // Get Purchase Order items for each PO
            if (poIds.Count > 0)
            {
                var placeholders = string.Join(",", poIds.Select((_, i) => $"@poId{i}"));
                var itemsSql = $@"SELECT parent_po_id, item_code, item_name, ordered_qty, 
                                         received_qty, uom, target_warehouse
                                  FROM tabPurchaseOrderItem
                                  WHERE parent_po_id IN ({placeholders})
                                  ORDER BY parent_po_id, item_code";
                
                await using var itemsCmd = new MySqlCommand(itemsSql, connection);
                for (int i = 0; i < poIds.Count; i++)
                {
                    itemsCmd.Parameters.AddWithValue($"@poId{i}", poIds[i]);
                }
                
                await using var itemsReader = await itemsCmd.ExecuteReaderAsync();
                
                var itemsByPoId = new Dictionary<string, List<PurchaseOrderItem>>();
                while (await itemsReader.ReadAsync())
                {
                    var parentPoId = itemsReader.GetString(0);
                    if (!itemsByPoId.ContainsKey(parentPoId))
                    {
                        itemsByPoId[parentPoId] = new List<PurchaseOrderItem>();
                    }
                    
                    itemsByPoId[parentPoId].Add(new PurchaseOrderItem
                    {
                        ParentPoId = parentPoId,
                        ItemCode = itemsReader.GetString(1),
                        ItemName = itemsReader.GetString(2),
                        OrderedQty = Convert.ToDouble(itemsReader.GetDecimal(3)),
                        ReceivedQty = Convert.ToDouble(itemsReader.GetDecimal(4)),
                        Uom = itemsReader.GetString(5),
                        TargetWarehouse = itemsReader.GetString(6)
                    });
                }
                
                await itemsReader.CloseAsync();

                // Rebuild Purchase Orders with their items
                foreach (var kvp in poData)
                {
                    var po = kvp.Value;
                    var items = itemsByPoId.TryGetValue(po.PoId, out var itemList) 
                        ? itemList 
                        : new List<PurchaseOrderItem>();
                    
                    // Create new PurchaseOrder with items since Items is init-only
                    purchaseOrders.Add(new PurchaseOrder
                    {
                        PoId = po.PoId,
                        DocStatus = po.DocStatus,
                        TransactionDate = po.TransactionDate,
                        ExpectedDeliveryDate = po.ExpectedDeliveryDate,
                        SupplierId = po.SupplierId,
                        SupplierName = po.SupplierName,
                        ShippingAddress = po.ShippingAddress,
                        Status = po.Status,
                        Items = items
                    });
                }
            }
            else
            {
                // No POs found, just add empty list
                purchaseOrders.AddRange(poData.Values);
            }

            ErrorLogService.LogInfo($"Loaded {purchaseOrders.Count} Purchase Orders from database");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Purchase Orders from database", ex);
        }

        return purchaseOrders;
    }

    /// <summary>
    /// Get Purchase Order by ID from database
    /// </summary>
    public static async Task<PurchaseOrder?> GetPurchaseOrderByIdAsync(WmsSettings settings, string poId)
    {
        var purchaseOrders = await GetPurchaseOrdersAsync(settings);
        return purchaseOrders.FirstOrDefault(po => po.PoId == poId);
    }

    /// <summary>
    /// Insert or update Purchase Order in database
    /// </summary>
    public static async Task<bool> SavePurchaseOrderAsync(WmsSettings settings, PurchaseOrder purchaseOrder)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Insert or update Purchase Order header
            var poSql = @"INSERT INTO tabPurchaseOrder 
                         (po_id, doc_status, transaction_date, expected_delivery_date, 
                          supplier_id, supplier_name, shipping_address, status)
                         VALUES 
                         (@po_id, @doc_status, @transaction_date, @expected_delivery_date, 
                          @supplier_id, @supplier_name, @shipping_address, @status)
                         ON DUPLICATE KEY UPDATE
                         doc_status = VALUES(doc_status),
                         transaction_date = VALUES(transaction_date),
                         expected_delivery_date = VALUES(expected_delivery_date),
                         supplier_id = VALUES(supplier_id),
                         supplier_name = VALUES(supplier_name),
                         shipping_address = VALUES(shipping_address),
                         status = VALUES(status),
                         updated_at = CURRENT_TIMESTAMP";
            
            await using var poCmd = new MySqlCommand(poSql, connection);
            poCmd.Parameters.AddWithValue("@po_id", purchaseOrder.PoId);
            poCmd.Parameters.AddWithValue("@doc_status", purchaseOrder.DocStatus);
            poCmd.Parameters.AddWithValue("@transaction_date", purchaseOrder.TransactionDate);
            poCmd.Parameters.AddWithValue("@expected_delivery_date", 
                purchaseOrder.ExpectedDeliveryDate.HasValue ? (object)purchaseOrder.ExpectedDeliveryDate.Value : DBNull.Value);
            poCmd.Parameters.AddWithValue("@supplier_id", purchaseOrder.SupplierId);
            poCmd.Parameters.AddWithValue("@supplier_name", purchaseOrder.SupplierName);
            poCmd.Parameters.AddWithValue("@shipping_address", 
                string.IsNullOrEmpty(purchaseOrder.ShippingAddress) ? (object)DBNull.Value : purchaseOrder.ShippingAddress);
            poCmd.Parameters.AddWithValue("@status", purchaseOrder.Status);
            
            await poCmd.ExecuteNonQueryAsync();

            // Delete existing items and insert new ones
            var deleteItemsSql = "DELETE FROM tabPurchaseOrderItem WHERE parent_po_id = @po_id";
            await using var deleteCmd = new MySqlCommand(deleteItemsSql, connection);
            deleteCmd.Parameters.AddWithValue("@po_id", purchaseOrder.PoId);
            await deleteCmd.ExecuteNonQueryAsync();

            // Insert Purchase Order items
            if (purchaseOrder.Items != null && purchaseOrder.Items.Count > 0)
            {
                var itemSql = @"INSERT INTO tabPurchaseOrderItem 
                               (parent_po_id, item_code, item_name, ordered_qty, received_qty, uom, target_warehouse)
                               VALUES 
                               (@parent_po_id, @item_code, @item_name, @ordered_qty, @received_qty, @uom, @target_warehouse)";
                
                foreach (var item in purchaseOrder.Items)
                {
                    await using var itemCmd = new MySqlCommand(itemSql, connection);
                    itemCmd.Parameters.AddWithValue("@parent_po_id", item.ParentPoId);
                    itemCmd.Parameters.AddWithValue("@item_code", item.ItemCode);
                    itemCmd.Parameters.AddWithValue("@item_name", item.ItemName);
                    itemCmd.Parameters.AddWithValue("@ordered_qty", item.OrderedQty);
                    itemCmd.Parameters.AddWithValue("@received_qty", item.ReceivedQty);
                    itemCmd.Parameters.AddWithValue("@uom", item.Uom);
                    itemCmd.Parameters.AddWithValue("@target_warehouse", item.TargetWarehouse);
                    await itemCmd.ExecuteNonQueryAsync();
                }
            }

            ErrorLogService.LogInfo($"Saved Purchase Order {purchaseOrder.PoId} to database");
            return true;
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"Error saving Purchase Order {purchaseOrder.PoId} to database", ex);
            return false;
        }
    }

    /// <summary>
    /// Delete Purchase Order from database
    /// </summary>
    public static async Task<bool> DeletePurchaseOrderAsync(WmsSettings settings, string poId)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Delete Purchase Order items first (foreign key constraint)
            var deleteItemsSql = "DELETE FROM tabPurchaseOrderItem WHERE parent_po_id = @po_id";
            await using var deleteItemsCmd = new MySqlCommand(deleteItemsSql, connection);
            deleteItemsCmd.Parameters.AddWithValue("@po_id", poId);
            await deleteItemsCmd.ExecuteNonQueryAsync();

            // Delete Purchase Order header
            var deletePoSql = "DELETE FROM tabPurchaseOrder WHERE po_id = @po_id";
            await using var deletePoCmd = new MySqlCommand(deletePoSql, connection);
            deletePoCmd.Parameters.AddWithValue("@po_id", poId);
            var rowsAffected = await deletePoCmd.ExecuteNonQueryAsync();

            if (rowsAffected > 0)
            {
                ErrorLogService.LogInfo($"Deleted Purchase Order {poId} from database");
                return true;
            }
            else
            {
                ErrorLogService.LogInfo($"Purchase Order {poId} not found in database");
                return false;
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"Error deleting Purchase Order {poId} from database", ex);
            return false;
        }
    }

    /// <summary>
    /// Insert mock Purchase Order data into database (for initial setup)
    /// Only inserts if database is completely empty - not if specific POs are missing
    /// </summary>
    public static async Task<bool> InsertMockPurchaseOrdersAsync(WmsSettings settings)
    {
        try
        {
            // Check if ANY data already exists - only insert if database is completely empty
            var existingPos = await GetPurchaseOrdersAsync(settings);
            if (existingPos.Any())
            {
                ErrorLogService.LogInfo("Purchase Orders already exist in database, skipping mock data insertion");
                return true;
            }

            // Create PO-0001
            var po1Items = new[]
            {
                new PurchaseOrderItem
                {
                    ParentPoId = "PO-0001",
                    ItemCode = "SKU-TSHIRT-001-BLK-S",
                    ItemName = "Basic T-Shirt Black S",
                    OrderedQty = 600,
                    ReceivedQty = 0,
                    Uom = "Nos",
                    TargetWarehouse = "WH-MAIN"
                },
                new PurchaseOrderItem
                {
                    ParentPoId = "PO-0001",
                    ItemCode = "SKU-TSHIRT-001-BLK-M",
                    ItemName = "Basic T-Shirt Black M",
                    OrderedQty = 600,
                    ReceivedQty = 0,
                    Uom = "Nos",
                    TargetWarehouse = "WH-MAIN"
                }
            };

            var po1 = new PurchaseOrder
            {
                PoId = "PO-0001",
                DocStatus = 1,
                TransactionDate = DateTime.Today.AddDays(-7),
                ExpectedDeliveryDate = DateTime.Today.AddDays(1),
                SupplierId = "VEND001",
                SupplierName = "ABC Suppliers",
                ShippingAddress = "123 Main Street, Riyadh",
                Status = "Open",
                Items = po1Items
            };

            // Create PO-0002
            var po2Items = new[]
            {
                new PurchaseOrderItem
                {
                    ParentPoId = "PO-0002",
                    ItemCode = "SKU-JEANS-021-BLU-32",
                    ItemName = "Slim Jeans Blue 32",
                    OrderedQty = 300,
                    ReceivedQty = 150,
                    Uom = "Nos",
                    TargetWarehouse = "WH-MAIN"
                },
                new PurchaseOrderItem
                {
                    ParentPoId = "PO-0002",
                    ItemCode = "SKU-JEANS-021-BLU-34",
                    ItemName = "Slim Jeans Blue 34",
                    OrderedQty = 200,
                    ReceivedQty = 0,
                    Uom = "Nos",
                    TargetWarehouse = "WH-MAIN"
                }
            };

            var po2 = new PurchaseOrder
            {
                PoId = "PO-0002",
                DocStatus = 1,
                TransactionDate = DateTime.Today.AddDays(-3),
                ExpectedDeliveryDate = DateTime.Today,
                SupplierId = "VEND002",
                SupplierName = "XYZ Trading",
                ShippingAddress = "456 Business District, Jeddah",
                Status = "Partial Received",
                Items = po2Items
            };

            // Save both Purchase Orders
            var result1 = await SavePurchaseOrderAsync(settings, po1);
            var result2 = await SavePurchaseOrderAsync(settings, po2);

            if (result1 && result2)
            {
                ErrorLogService.LogInfo("Successfully inserted mock Purchase Order data");
                return true;
            }
            else
            {
                ErrorLogService.LogError("Failed to insert some mock Purchase Order data");
                return false;
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error inserting mock Purchase Order data", ex);
            return false;
        }
    }
}

