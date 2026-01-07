using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.Services;

public static class DataImportService
{
    /// <summary>
    /// Import all mock data into database tables
    /// </summary>
    public static async Task<(bool Success, string Message)> ImportMockDataAsync(WmsSettings settings)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var importedCounts = new Dictionary<string, int>();

            // Import Warehouses first (referenced by other tables)
            importedCounts["Warehouses"] = await ImportWarehousesAsync(connection);
            
            // Import Items (referenced by other tables)
            importedCounts["Items"] = await ImportItemsAsync(connection);
            
            // Import ASNs (parent tables first)
            importedCounts["ASNs"] = await ImportAsnsAsync(connection);
            importedCounts["ASN Item Details"] = await ImportAsnItemDetailsAsync(connection);
            
            // Import Transfer Orders
            importedCounts["Transfer Orders"] = await ImportTransferOrdersAsync(connection);
            importedCounts["Transfer Order Items"] = await ImportTransferOrderItemsAsync(connection);
            
            // Import Inbound Sessions
            importedCounts["Inbound Sessions"] = await ImportInboundSessionsAsync(connection);
            importedCounts["Inbound Unload Lines"] = await ImportInboundUnloadLinesAsync(connection);
            importedCounts["Inbound Receive Lines"] = await ImportInboundReceiveLinesAsync(connection);
            
            // Import Sort Boxes
            importedCounts["Sort Boxes"] = await ImportSortBoxesAsync(connection);
            
            // Import Transfer Cartons
            importedCounts["Transfer Cartons"] = await ImportTransferCartonsAsync(connection);
            
            // Import Putaway Tasks
            importedCounts["Putaway Tasks"] = await ImportPutawayTasksAsync(connection);
            importedCounts["Putaway Lines"] = await ImportPutawayLinesAsync(connection);
            
            // Import Users
            importedCounts["Users"] = await ImportUsersAsync(connection);
            
            // Import Locations
            importedCounts["Locations"] = await ImportLocationsAsync(connection);

            var summary = string.Join(", ", importedCounts.Select(kvp => $"{kvp.Key}: {kvp.Value}"));
            ErrorLogService.LogInfo($"Data import completed: {summary}");
            return (true, $"Successfully imported mock data. {summary}");
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to import mock data", ex);
            return (false, $"Failed to import mock data: {ex.Message}");
        }
    }

    private static async Task<int> ImportWarehousesAsync(MySqlConnection connection)
    {
        var warehouses = MockDataService.GetWarehouses();
        int count = 0;

        foreach (var wh in warehouses)
        {
            var sql = @"INSERT INTO tabWarehouse (code, name, warehouse_type, is_group, parent_warehouse)
                        VALUES (@code, @name, @type, @isGroup, @parent)
                        ON DUPLICATE KEY UPDATE name = VALUES(name), warehouse_type = VALUES(warehouse_type), is_group = VALUES(is_group)";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@code", wh.Code);
            cmd.Parameters.AddWithValue("@name", wh.Name);
            cmd.Parameters.AddWithValue("@type", wh.IsStore ? "Store" : "Warehouse");
            cmd.Parameters.AddWithValue("@isGroup", false);
            cmd.Parameters.AddWithValue("@parent", DBNull.Value);
            
            await cmd.ExecuteNonQueryAsync();
            count++;
        }

        return count;
    }

    private static async Task<int> ImportItemsAsync(MySqlConnection connection)
    {
        var items = MockDataService.GetItems();
        int count = 0;

        foreach (var item in items)
        {
            var sql = @"INSERT INTO tabItem (code, name, item_group, brand, default_uom, stock_uom, barcode, maintain_stock, stock_qty, reserved_qty)
                        VALUES (@code, @name, @itemGroup, @brand, @defaultUom, @stockUom, @barcode, @maintainStock, @stockQty, @reservedQty)
                        ON DUPLICATE KEY UPDATE name = VALUES(name), item_group = VALUES(item_group), brand = VALUES(brand), barcode = VALUES(barcode)";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@code", item.Code);
            cmd.Parameters.AddWithValue("@name", item.Name);
            cmd.Parameters.AddWithValue("@itemGroup", (object?)item.ItemGroup ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@brand", (object?)item.Brand ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@defaultUom", (object?)item.DefaultUom ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@stockUom", (object?)item.StockUom ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@barcode", (object?)item.Barcode ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@maintainStock", item.MaintainStock);
            cmd.Parameters.AddWithValue("@stockQty", item.StockQty);
            cmd.Parameters.AddWithValue("@reservedQty", item.ReservedQty);
            
            await cmd.ExecuteNonQueryAsync();
            count++;
        }

        return count;
    }

    private static async Task<int> ImportAsnsAsync(MySqlConnection connection)
    {
        var asns = MockDataService.GetAsns();
        int count = 0;

        foreach (var asn in asns)
        {
            var sql = @"INSERT INTO tabAdvanceShippingNotice 
                        (title, status, purchase_order, supplier, shipment_date, expected_arrival_date, 
                         total_shipped_qty, airway_bill_no, shipment_type, updated_on)
                        VALUES (@title, @status, @po, @supplier, @shipmentDate, @expectedDate, 
                                @totalQty, @awb, @shipmentType, @updatedOn)
                        ON DUPLICATE KEY UPDATE status = VALUES(status), total_shipped_qty = VALUES(total_shipped_qty)";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@title", asn.Title);
            cmd.Parameters.AddWithValue("@status", asn.Status);
            cmd.Parameters.AddWithValue("@po", asn.PurchaseOrder);
            cmd.Parameters.AddWithValue("@supplier", asn.Supplier);
            cmd.Parameters.AddWithValue("@shipmentDate", asn.ShipmentDate);
            cmd.Parameters.AddWithValue("@expectedDate", asn.ExpectedArrivalDate);
            cmd.Parameters.AddWithValue("@totalQty", asn.TotalShippedQty);
            cmd.Parameters.AddWithValue("@awb", (object?)asn.AirwayBillNo ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@shipmentType", (object?)asn.ShipmentType ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@updatedOn", (object?)asn.UpdatedOn ?? DBNull.Value);
            
            await cmd.ExecuteNonQueryAsync();
            count++;
        }

        return count;
    }

    private static async Task<int> ImportAsnItemDetailsAsync(MySqlConnection connection)
    {
        var asns = MockDataService.GetAsns();
        int count = 0;

        // Clear existing details first to avoid duplicates
        await using var deleteCmd = new MySqlCommand("DELETE FROM tabAsnItemDetails", connection);
        await deleteCmd.ExecuteNonQueryAsync();

        foreach (var asn in asns)
        {
            if (asn.Details == null) continue;

            foreach (var detail in asn.Details)
            {
                var sql = @"INSERT INTO tabAsnItemDetails 
                            (parent_title, item_code, po_item_reference, shipped_qty, carton_id, carton_assigned_status)
                            VALUES (@parent, @itemCode, @poRef, @qty, @cartonId, @status)";
                
                await using var cmd = new MySqlCommand(sql, connection);
                cmd.Parameters.AddWithValue("@parent", asn.Title);
                cmd.Parameters.AddWithValue("@itemCode", detail.ItemCode);
                cmd.Parameters.AddWithValue("@poRef", (object?)detail.PoItemReference ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@qty", detail.ShippedQty);
                cmd.Parameters.AddWithValue("@cartonId", (object?)detail.CartonId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@status", detail.CartonAssignedStatus);
                
                await cmd.ExecuteNonQueryAsync();
                count++;
            }
        }

        return count;
    }

    private static async Task<int> ImportTransferOrdersAsync(MySqlConnection connection)
    {
        var tos = MockDataService.GetTransferOrders();
        int count = 0;

        foreach (var to in tos)
        {
            var sql = @"INSERT INTO tabTransferOrder 
                        (title, status, advance_shipping_notice, from_warehouse, prepared_by, required_date, total_allocated_qty)
                        VALUES (@title, @status, @asn, @warehouse, @preparedBy, @requiredDate, @totalQty)
                        ON DUPLICATE KEY UPDATE status = VALUES(status), total_allocated_qty = VALUES(total_allocated_qty)";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@title", to.Title);
            cmd.Parameters.AddWithValue("@status", to.Status);
            cmd.Parameters.AddWithValue("@asn", to.AdvanceShippingNotice);
            cmd.Parameters.AddWithValue("@warehouse", to.FromWarehouse);
            cmd.Parameters.AddWithValue("@preparedBy", to.PreparedBy);
            cmd.Parameters.AddWithValue("@requiredDate", (object?)to.RequiredDate ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@totalQty", to.TotalAllocatedQty);
            
            await cmd.ExecuteNonQueryAsync();
            count++;
        }

        return count;
    }

    private static async Task<int> ImportTransferOrderItemsAsync(MySqlConnection connection)
    {
        var tos = MockDataService.GetTransferOrders();
        int count = 0;

        // Clear existing items first
        await using var deleteCmd = new MySqlCommand("DELETE FROM tabTransferOrderItem", connection);
        await deleteCmd.ExecuteNonQueryAsync();

        foreach (var to in tos)
        {
            if (to.Items == null) continue;

            foreach (var item in to.Items)
            {
                var sql = @"INSERT INTO tabTransferOrderItem 
                            (parent_title, store, item_code, allocated_qty, sorted_qty, packed_qty, pending_qty, remarks)
                            VALUES (@parent, @store, @itemCode, @allocated, @sorted, @packed, @pending, @remarks)";
                
                await using var cmd = new MySqlCommand(sql, connection);
                cmd.Parameters.AddWithValue("@parent", to.Title);
                cmd.Parameters.AddWithValue("@store", item.Store);
                cmd.Parameters.AddWithValue("@itemCode", item.ItemCode);
                cmd.Parameters.AddWithValue("@allocated", item.AllocatedQty);
                cmd.Parameters.AddWithValue("@sorted", item.SortedQty);
                cmd.Parameters.AddWithValue("@packed", item.PackedQty);
                cmd.Parameters.AddWithValue("@pending", item.PendingQty);
                cmd.Parameters.AddWithValue("@remarks", (object?)item.Remarks ?? DBNull.Value);
                
                await cmd.ExecuteNonQueryAsync();
                count++;
            }
        }

        return count;
    }

    private static async Task<int> ImportInboundSessionsAsync(MySqlConnection connection)
    {
        var sessions = MockDataService.GetInboundSessions();
        int count = 0;

        // Detect which column names to use
        var hasInboundSession = await CheckColumnExistsAsync(connection, "tabInboundSession", "inbound_session");
        var hasTitle = await CheckColumnExistsAsync(connection, "tabInboundSession", "title");
        var hasAsnNo = await CheckColumnExistsAsync(connection, "tabInboundSession", "asn_no");
        var hasAdvanceShippingNotice = await CheckColumnExistsAsync(connection, "tabInboundSession", "advance_shipping_notice");
        var hasStartedAt = await CheckColumnExistsAsync(connection, "tabInboundSession", "started_at");
        var hasStartedOn = await CheckColumnExistsAsync(connection, "tabInboundSession", "started_on");

        string titleColumn = hasInboundSession ? "inbound_session" : (hasTitle ? "title" : "inbound_session");
        string asnColumn = hasAsnNo ? "asn_no" : (hasAdvanceShippingNotice ? "advance_shipping_notice" : "asn_no");
        string startedColumn = hasStartedAt ? "started_at" : (hasStartedOn ? "started_on" : "started_at");

        foreach (var session in sessions)
        {
            var sql = $@"INSERT INTO tabInboundSession 
                        ({titleColumn}, status, {asnColumn}, transfer_order, dock, started_by, {startedColumn}, completed_on)
                        VALUES (@title, @status, @asn, @to, @dock, @startedBy, @startedOn, @completedOn)
                        ON DUPLICATE KEY UPDATE status = VALUES(status)";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@title", session.Title);
            cmd.Parameters.AddWithValue("@status", session.Status);
            cmd.Parameters.AddWithValue("@asn", session.AdvanceShippingNotice);
            cmd.Parameters.AddWithValue("@to", (object?)session.TransferOrder ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@dock", (object?)session.Dock ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@startedBy", session.StartedBy);
            cmd.Parameters.AddWithValue("@startedOn", session.StartedOn);
            cmd.Parameters.AddWithValue("@completedOn", (object?)session.CompletedOn ?? DBNull.Value);
            
            await cmd.ExecuteNonQueryAsync();
            count++;
        }

        return count;
    }

    /// <summary>
    /// Check if a column exists in a table
    /// </summary>
    private static async Task<bool> CheckColumnExistsAsync(MySqlConnection connection, string tableName, string columnName)
    {
        try
        {
            var sql = @"
                SELECT COUNT(*) 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = @tableName 
                AND COLUMN_NAME = @columnName";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@tableName", tableName);
            cmd.Parameters.AddWithValue("@columnName", columnName);
            var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            return count > 0;
        }
        catch
        {
            return false;
        }
    }

    private static async Task<int> ImportInboundUnloadLinesAsync(MySqlConnection connection)
    {
        var sessions = MockDataService.GetInboundSessions();
        int count = 0;

        await using var deleteCmd = new MySqlCommand("DELETE FROM tabInboundUnloadLine", connection);
        await deleteCmd.ExecuteNonQueryAsync();

        foreach (var session in sessions)
        {
            if (session.UnloadLines == null) continue;

            foreach (var line in session.UnloadLines)
            {
                var sql = @"INSERT IGNORE INTO tabInboundUnloadLine 
                            (parent_title, unit_type, unit_id, scanned_on, scanned_by)
                            VALUES (@parent, @unitType, @unitId, @scannedOn, @scannedBy)";
                
                await using var cmd = new MySqlCommand(sql, connection);
                cmd.Parameters.AddWithValue("@parent", session.Title);
                cmd.Parameters.AddWithValue("@unitType", line.UnitType);
                cmd.Parameters.AddWithValue("@unitId", line.UnitId);
                cmd.Parameters.AddWithValue("@scannedOn", line.ScannedOn);
                cmd.Parameters.AddWithValue("@scannedBy", line.ScannedBy);
                
                try
                {
                    await cmd.ExecuteNonQueryAsync();
                    count++;
                }
                catch (Exception ex)
                {
                    // Log but continue - duplicate entries will be ignored
                    ErrorLogService.LogError($"DataImportService: Error inserting unload line {session.Title}-{line.UnitType}-{line.UnitId}: {ex.Message}", ex);
                }
            }
        }

        return count;
    }

    private static async Task<int> ImportInboundReceiveLinesAsync(MySqlConnection connection)
    {
        var sessions = MockDataService.GetInboundSessions();
        int count = 0;

        await using var deleteCmd = new MySqlCommand("DELETE FROM tabInboundReceiveLine", connection);
        await deleteCmd.ExecuteNonQueryAsync();

        foreach (var session in sessions)
        {
            if (session.ReceiveLines == null) continue;

            foreach (var line in session.ReceiveLines)
            {
                var sql = @"INSERT IGNORE INTO tabInboundReceiveLine 
                            (parent_title, carton_id, item_code, expected_qty, received_qty, `condition`, remarks)
                            VALUES (@parent, @cartonId, @itemCode, @expected, @received, @condition, @remarks)";
                
                await using var cmd = new MySqlCommand(sql, connection);
                cmd.Parameters.AddWithValue("@parent", session.Title);
                cmd.Parameters.AddWithValue("@cartonId", line.CartonId);
                cmd.Parameters.AddWithValue("@itemCode", line.ItemCode);
                cmd.Parameters.AddWithValue("@expected", line.ExpectedQty);
                cmd.Parameters.AddWithValue("@received", line.ReceivedQty);
                cmd.Parameters.AddWithValue("@condition", line.Condition ?? "Good");
                cmd.Parameters.AddWithValue("@remarks", (object?)line.Remarks ?? DBNull.Value);
                
                try
                {
                    await cmd.ExecuteNonQueryAsync();
                    count++;
                }
                catch (Exception ex)
                {
                    // Log but continue - duplicate entries will be ignored
                    ErrorLogService.LogError($"DataImportService: Error inserting receive line {session.Title}-{line.CartonId}-{line.ItemCode}: {ex.Message}", ex);
                }
            }
        }

        return count;
    }

    private static async Task<int> ImportSortBoxesAsync(MySqlConnection connection)
    {
        var boxes = MockDataService.GetSortBoxes();
        int count = 0;

        foreach (var box in boxes)
        {
            var sql = @"INSERT INTO tabSortBox 
                        (box_id, status, advance_shipping_notice, transfer_order, store, purpose, created_by, 
                         created_on, closed_by, closed_on, dispatched_on, received_at_store_on, remarks)
                        VALUES (@boxId, @status, @asn, @to, @store, @purpose, @createdBy, @createdOn, 
                                @closedBy, @closedOn, @dispatchedOn, @receivedOn, @remarks)
                        ON DUPLICATE KEY UPDATE status = VALUES(status)";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@boxId", box.BoxId);
            cmd.Parameters.AddWithValue("@status", box.Status);
            cmd.Parameters.AddWithValue("@asn", box.AdvanceShippingNotice);
            cmd.Parameters.AddWithValue("@to", box.TransferOrder);
            cmd.Parameters.AddWithValue("@store", box.Store);
            cmd.Parameters.AddWithValue("@purpose", box.Purpose ?? "STORE");
            cmd.Parameters.AddWithValue("@createdBy", box.CreatedBy);
            cmd.Parameters.AddWithValue("@createdOn", box.CreatedOn);
            cmd.Parameters.AddWithValue("@closedBy", (object?)box.ClosedBy ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@closedOn", (object?)box.ClosedOn ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@dispatchedOn", (object?)box.DispatchedOn ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@receivedOn", (object?)box.ReceivedAtStoreOn ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@remarks", (object?)box.Remarks ?? DBNull.Value);
            
            await cmd.ExecuteNonQueryAsync();
            count++;
        }

        return count;
    }

    private static async Task<int> ImportTransferCartonsAsync(MySqlConnection connection)
    {
        var cartons = MockDataService.GetTransferCartons();
        int count = 0;

        // Detect which column names to use (API format: asn_no/to_no, Desktop format: advance_shipping_notice/transfer_order)
        var hasAsnNo = await CheckColumnExistsAsync(connection, "tabTransferCarton", "asn_no");
        var hasAdvanceShippingNotice = await CheckColumnExistsAsync(connection, "tabTransferCarton", "advance_shipping_notice");
        var hasToNo = await CheckColumnExistsAsync(connection, "tabTransferCarton", "to_no");
        var hasTransferOrder = await CheckColumnExistsAsync(connection, "tabTransferCarton", "transfer_order");

        string asnColumn = hasAsnNo ? "asn_no" : (hasAdvanceShippingNotice ? "advance_shipping_notice" : "asn_no");
        string toColumn = hasToNo ? "to_no" : (hasTransferOrder ? "transfer_order" : "to_no");

        foreach (var carton in cartons)
        {
            var sql = $@"INSERT INTO tabTransferCarton 
                        (tc_id, status, {asnColumn}, {toColumn}, store, created_by, created_on, 
                         sealed_by, sealed_on, dispatched_on, remarks)
                        VALUES (@tcId, @status, @asn, @to, @store, @createdBy, @createdOn, 
                                @sealedBy, @sealedOn, @dispatchedOn, @remarks)
                        ON DUPLICATE KEY UPDATE status = VALUES(status)";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@tcId", carton.TcId);
            cmd.Parameters.AddWithValue("@status", carton.Status);
            cmd.Parameters.AddWithValue("@asn", carton.AdvanceShippingNotice);
            cmd.Parameters.AddWithValue("@to", carton.TransferOrder);
            cmd.Parameters.AddWithValue("@store", carton.Store);
            cmd.Parameters.AddWithValue("@createdBy", carton.CreatedBy);
            cmd.Parameters.AddWithValue("@createdOn", carton.CreatedOn);
            cmd.Parameters.AddWithValue("@sealedBy", (object?)carton.SealedBy ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@sealedOn", (object?)carton.SealedOn ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@dispatchedOn", (object?)carton.DispatchedOn ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@remarks", (object?)carton.Remarks ?? DBNull.Value);
            
            await cmd.ExecuteNonQueryAsync();
            count++;
        }

        return count;
    }

    private static async Task<int> ImportPutawayTasksAsync(MySqlConnection connection)
    {
        var tasks = MockDataService.GetPutawayTasks();
        int count = 0;

        foreach (var task in tasks)
        {
            var sql = @"INSERT INTO tabPutawayTask 
                        (title, status, advance_shipping_notice, inbound_session, created_by)
                        VALUES (@title, @status, @asn, @inboundSession, @createdBy)
                        ON DUPLICATE KEY UPDATE status = VALUES(status)";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@title", task.Title);
            cmd.Parameters.AddWithValue("@status", task.Status);
            cmd.Parameters.AddWithValue("@asn", task.AdvanceShippingNotice);
            cmd.Parameters.AddWithValue("@inboundSession", task.InboundSession);
            cmd.Parameters.AddWithValue("@createdBy", task.CreatedBy);
            
            await cmd.ExecuteNonQueryAsync();
            count++;
        }

        return count;
    }

    private static async Task<int> ImportPutawayLinesAsync(MySqlConnection connection)
    {
        var tasks = MockDataService.GetPutawayTasks();
        int count = 0;

        await using var deleteCmd = new MySqlCommand("DELETE FROM tabPutawayLine", connection);
        await deleteCmd.ExecuteNonQueryAsync();

        foreach (var task in tasks)
        {
            if (task.Lines == null) continue;

            foreach (var line in task.Lines)
            {
                var sql = @"INSERT INTO tabPutawayLine 
                            (parent_title, carton_id, item_code, qty, rack, bin)
                            VALUES (@parent, @cartonId, @itemCode, @qty, @rack, @bin)";
                
                await using var cmd = new MySqlCommand(sql, connection);
                cmd.Parameters.AddWithValue("@parent", task.Title);
                cmd.Parameters.AddWithValue("@cartonId", (object?)line.CartonId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@itemCode", line.ItemCode);
                cmd.Parameters.AddWithValue("@qty", line.Qty);
                cmd.Parameters.AddWithValue("@rack", line.Rack);
                cmd.Parameters.AddWithValue("@bin", line.Bin);
                
                await cmd.ExecuteNonQueryAsync();
                count++;
            }
        }

        return count;
    }

    private static async Task<int> ImportUsersAsync(MySqlConnection connection)
    {
        // Import the mock users (matching UserListViewModel mock data)
        // Note: password_hash is set to NULL - users must set passwords via API login/registration
        // The API seed.js creates USER-001 with password 'admin123' (hashed with bcrypt)
        // For other users, passwords should be set via API endpoints or admin interface
        var mockUsers = new[]
        {
            new { UserCode = "john.doe", Name = "John Doe", Role = "operator", Active = true },
            new { UserCode = "ahmed.ali", Name = "Ahmed Ali", Role = "operator", Active = true },
            new { UserCode = "brand.manager", Name = "Sara Khan", Role = "manager", Active = true },
            new { UserCode = "sysadmin", Name = "System Admin", Role = "admin", Active = true }
            // Note: USER-001 is created by API seed.js with password 'admin123'
        };
        
        int count = 0;

        foreach (var user in mockUsers)
        {
            // Insert users without password_hash - they need to set passwords via API
            // To set passwords, users should use the API login/registration or admin interface
            var sql = @"INSERT INTO tabUser (user_code, name, role, active, password_hash)
                        VALUES (@userCode, @name, @role, @active, @passwordHash)
                        ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role), active = VALUES(active)";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@userCode", user.UserCode);
            cmd.Parameters.AddWithValue("@name", user.Name);
            cmd.Parameters.AddWithValue("@role", user.Role);
            cmd.Parameters.AddWithValue("@active", user.Active);
            // Set password_hash to NULL - passwords must be set via API (bcrypt hashed)
            cmd.Parameters.AddWithValue("@passwordHash", DBNull.Value);
            
            await cmd.ExecuteNonQueryAsync();
            count++;
        }

        return count;
    }

    private static async Task<int> ImportLocationsAsync(MySqlConnection connection)
    {
        // Import locations matching LocationListViewModel mock data
        var mockLocations = new[]
        {
            new { 
                LocationId = "A1-R01-L1-B1", 
                Warehouse = "WH-MAIN", 
                Zone = "Zone A", 
                Aisle = "Aisle 01", 
                ParentRack = "Rack 01", 
                Level = "1", 
                BinId = "B1", 
                LocationType = "Picking", 
                IsAvailable = true, 
                CapacityVolumeWeight = 100.0, 
                LocationTypeDetailed = "Bin/Shelf" 
            },
            new { 
                LocationId = "A1-R01-L2-B1", 
                Warehouse = "WH-MAIN", 
                Zone = "Zone A", 
                Aisle = "Aisle 01", 
                ParentRack = "Rack 01", 
                Level = "2", 
                BinId = "B1", 
                LocationType = "Picking", 
                IsAvailable = true, 
                CapacityVolumeWeight = 120.0, 
                LocationTypeDetailed = "Bin/Shelf" 
            },
            new { 
                LocationId = "STAGE-01", 
                Warehouse = "WH-MAIN", 
                Zone = "Staging Area", 
                Aisle = "", 
                ParentRack = "", 
                Level = "", 
                BinId = "SL-01", 
                LocationType = "Bulk Storage", 
                IsAvailable = true, 
                CapacityVolumeWeight = 1000.0, 
                LocationTypeDetailed = "Staging Lane" 
            }
        };
        
        int count = 0;

        foreach (var location in mockLocations)
        {
            var sql = @"INSERT INTO tabLocation 
                        (location_id, warehouse, zone, aisle, parent_rack, level, bin_id, 
                         location_type, location_type_detailed, is_available, capacity_volume_weight)
                        VALUES (@locationId, @warehouse, @zone, @aisle, @parentRack, @level, @binId, 
                                @locationType, @locationTypeDetailed, @isAvailable, @capacityVolumeWeight)
                        ON DUPLICATE KEY UPDATE 
                            warehouse = VALUES(warehouse), 
                            zone = VALUES(zone), 
                            aisle = VALUES(aisle), 
                            parent_rack = VALUES(parent_rack), 
                            level = VALUES(level), 
                            bin_id = VALUES(bin_id),
                            location_type = VALUES(location_type),
                            location_type_detailed = VALUES(location_type_detailed),
                            is_available = VALUES(is_available),
                            capacity_volume_weight = VALUES(capacity_volume_weight)";
            
            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@locationId", location.LocationId);
            cmd.Parameters.AddWithValue("@warehouse", location.Warehouse);
            cmd.Parameters.AddWithValue("@zone", (object?)location.Zone ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@aisle", (object?)location.Aisle ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@parentRack", (object?)location.ParentRack ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@level", (object?)location.Level ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@binId", (object?)location.BinId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@locationType", (object?)location.LocationType ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@locationTypeDetailed", (object?)location.LocationTypeDetailed ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@isAvailable", location.IsAvailable);
            cmd.Parameters.AddWithValue("@capacityVolumeWeight", (object?)location.CapacityVolumeWeight ?? DBNull.Value);
            
            await cmd.ExecuteNonQueryAsync();
            count++;
        }

        return count;
    }
}

