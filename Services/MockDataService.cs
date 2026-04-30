using System;
using System.Collections.Generic;
using System.Linq;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class MockDataService
{
    private static readonly Random Random = new(42);

    // ASN Mock Data
    public static List<Asn> GetAsns()
    {
        return new List<Asn>
        {
            // Draft ASN - Not yet submitted
            new Asn
            {
                Title = "ASN-00001",
                Status = "Draft",
                PurchaseOrder = "PO-0001",
                Supplier = "ABC Suppliers",
                ShipmentDate = DateTime.Today.AddDays(2),
                ExpectedArrivalDate = DateTime.Today.AddDays(5),
                TotalShippedQty = 500,
                TotalCartonCount = 2, // CTN-0001, CTN-0002
                AirwayBillNo = null,
                ShipmentType = "Air",
                Details = new List<AsnItemDetails>
                {
                    new AsnItemDetails { ItemCode = "SKU-TSHIRT-001-BLK-S", ShippedQty = 200, CartonId = "CTN-0001", CartonAssignedStatus = "Assigned" },
                    new AsnItemDetails { ItemCode = "SKU-TSHIRT-001-BLK-M", ShippedQty = 300, CartonId = "CTN-0002", CartonAssignedStatus = "Assigned" }
                }
            },
            // Submitted ASN - Waiting for approval
            new Asn
            {
                Title = "ASN-00002",
                Status = "Submitted",
                PurchaseOrder = "PO-0002",
                Supplier = "XYZ Trading",
                ShipmentDate = DateTime.Today.AddDays(1),
                ExpectedArrivalDate = DateTime.Today.AddDays(4),
                TotalShippedQty = 800,
                TotalCartonCount = 2, // CTN-0101, CTN-0102
                AirwayBillNo = "AWB-12346",
                ShipmentType = "Sea",
                Details = new List<AsnItemDetails>
                {
                    new AsnItemDetails { ItemCode = "SKU-JEANS-021-BLU-32", ShippedQty = 400, CartonId = "CTN-0101", CartonAssignedStatus = "Assigned" },
                    new AsnItemDetails { ItemCode = "SKU-JEANS-021-BLU-34", ShippedQty = 400, CartonId = "CTN-0102", CartonAssignedStatus = "Assigned" }
                }
            },
            // Approved ASN - Ready for receiving
            new Asn
            {
                Title = "ASN-00003",
                Status = "Approved",
                PurchaseOrder = "PO-0003",
                Supplier = "ABC Suppliers",
                ShipmentDate = DateTime.Today.AddDays(-2),
                ExpectedArrivalDate = DateTime.Today,
                TotalShippedQty = 1200,
                TotalCartonCount = 4, // CTN-0001, CTN-0002, CTN-0003, CTN-0004
                AirwayBillNo = "AWB-12345",
                ShipmentType = "Air",
                Details = new List<AsnItemDetails>
                {
                    new AsnItemDetails { ItemCode = "SKU-TSHIRT-001-BLK-S", ShippedQty = 300, CartonId = "CTN-0001", CartonAssignedStatus = "Assigned" },
                    new AsnItemDetails { ItemCode = "SKU-TSHIRT-001-BLK-M", ShippedQty = 300, CartonId = "CTN-0001", CartonAssignedStatus = "Assigned" },
                    new AsnItemDetails { ItemCode = "SKU-TSHIRT-001-BLK-L", ShippedQty = 200, CartonId = "CTN-0002", CartonAssignedStatus = "Assigned" },
                    new AsnItemDetails { ItemCode = "SKU-JEANS-021-BLU-32", ShippedQty = 200, CartonId = "CTN-0003", CartonAssignedStatus = "Assigned" },
                    new AsnItemDetails { ItemCode = "SKU-JEANS-021-BLU-34", ShippedQty = 200, CartonId = "CTN-0004", CartonAssignedStatus = "Assigned" }
                }
            },
            // Receiving ASN - Currently being received
            new Asn
            {
                Title = "ASN-00004",
                Status = "Receiving",
                PurchaseOrder = "PO-0004",
                Supplier = "XYZ Trading",
                ShipmentDate = DateTime.Today.AddDays(-1),
                ExpectedArrivalDate = DateTime.Today,
                TotalShippedQty = 1500,
                TotalCartonCount = 4, // CTN-0201, CTN-0202, CTN-0203, CTN-0204
                AirwayBillNo = "AWB-12347",
                ShipmentType = "Road",
                Details = new List<AsnItemDetails>
                {
                    new AsnItemDetails { ItemCode = "SKU-SHOES-101-WHT-42", ShippedQty = 500, CartonId = "CTN-0201", CartonAssignedStatus = "Assigned" },
                    new AsnItemDetails { ItemCode = "SKU-SHOES-101-WHT-43", ShippedQty = 500, CartonId = "CTN-0202", CartonAssignedStatus = "Assigned" },
                    new AsnItemDetails { ItemCode = "SKU-SHOES-101-BLK-42", ShippedQty = 300, CartonId = "CTN-0203", CartonAssignedStatus = "Assigned" },
                    new AsnItemDetails { ItemCode = "SKU-SHOES-101-BLK-43", ShippedQty = 200, CartonId = "CTN-0204", CartonAssignedStatus = "Missing" }
                }
            },
            // Completed ASN - Fully received
            new Asn
            {
                Title = "ASN-00005",
                Status = "Completed",
                PurchaseOrder = "PO-0005",
                Supplier = "Fashion Plus",
                ShipmentDate = DateTime.Today.AddDays(-5),
                ExpectedArrivalDate = DateTime.Today.AddDays(-3),
                TotalShippedQty = 2000,
                TotalCartonCount = 3, // CTN-0301, CTN-0302, CTN-0303
                AirwayBillNo = "AWB-12348",
                ShipmentType = "Air",
                Details = new List<AsnItemDetails>
                {
                    new AsnItemDetails { ItemCode = "SKU-JACKET-201-BLK-M", ShippedQty = 800, CartonId = "CTN-0301", CartonAssignedStatus = "Assigned" },
                    new AsnItemDetails { ItemCode = "SKU-JACKET-201-BLK-L", ShippedQty = 600, CartonId = "CTN-0302", CartonAssignedStatus = "Assigned" },
                    new AsnItemDetails { ItemCode = "SKU-JACKET-201-BLK-XL", ShippedQty = 600, CartonId = "CTN-0303", CartonAssignedStatus = "Assigned" }
                }
            },
            // Another Receiving ASN - Partially received
            new Asn
            {
                Title = "ASN-00006",
                Status = "Receiving",
                PurchaseOrder = "PO-0006",
                Supplier = "Global Imports",
                ShipmentDate = DateTime.Today.AddDays(-1),
                ExpectedArrivalDate = DateTime.Today,
                TotalShippedQty = 900,
                TotalCartonCount = 3, // CTN-0401, CTN-0402, CTN-0403
                AirwayBillNo = "AWB-12349",
                ShipmentType = "Sea",
                Details = new List<AsnItemDetails>
                {
                    new AsnItemDetails { ItemCode = "SKU-HAT-301-RED-OS", ShippedQty = 300, CartonId = "CTN-0401", CartonAssignedStatus = "Assigned" },
                    new AsnItemDetails { ItemCode = "SKU-HAT-301-BLU-OS", ShippedQty = 300, CartonId = "CTN-0402", CartonAssignedStatus = "Assigned" },
                    new AsnItemDetails { ItemCode = "SKU-HAT-301-GRN-OS", ShippedQty = 300, CartonId = "CTN-0403", CartonAssignedStatus = "Assigned" }
                }
            }
        };
    }

    // Transfer Orders Mock Data
    public static List<TransferOrder> GetTransferOrders()
    {
        return new List<TransferOrder>
        {
            // Draft Transfer Order
            new TransferOrder
            {
                Title = "TO-0001",
                Status = "Draft",
                AdvanceShippingNotice = "ASN-00003",
                FromWarehouse = "WH-MAIN",
                PreparedBy = "admin",
                RequiredDate = DateTime.Today.AddDays(3),
                TotalAllocatedQty = 600,
                Items = new List<TransferOrderItem>
                {
                    new TransferOrderItem { Store = "STORE-001", ItemCode = "SKU-TSHIRT-001-BLK-S", AllocatedQty = 100, SortedQty = 0, PackedQty = 0, PendingQty = 100 },
                    new TransferOrderItem { Store = "STORE-001", ItemCode = "SKU-TSHIRT-001-BLK-M", AllocatedQty = 100, SortedQty = 0, PackedQty = 0, PendingQty = 100 },
                    new TransferOrderItem { Store = "STORE-002", ItemCode = "SKU-TSHIRT-001-BLK-S", AllocatedQty = 150, SortedQty = 0, PackedQty = 0, PendingQty = 150 },
                    new TransferOrderItem { Store = "STORE-002", ItemCode = "SKU-TSHIRT-001-BLK-M", AllocatedQty = 150, SortedQty = 0, PackedQty = 0, PendingQty = 150 },
                    new TransferOrderItem { Store = "STORE-003", ItemCode = "SKU-JEANS-021-BLU-32", AllocatedQty = 100, SortedQty = 0, PackedQty = 0, PendingQty = 100 }
                }
            },
            // Submitted Transfer Order
            new TransferOrder
            {
                Title = "TO-0002",
                Status = "Submitted",
                AdvanceShippingNotice = "ASN-00004",
                FromWarehouse = "WH-MAIN",
                PreparedBy = "manager1",
                RequiredDate = DateTime.Today.AddDays(2),
                TotalAllocatedQty = 800,
                Items = new List<TransferOrderItem>
                {
                    new TransferOrderItem { Store = "STORE-001", ItemCode = "SKU-SHOES-101-WHT-42", AllocatedQty = 200, SortedQty = 0, PackedQty = 0, PendingQty = 200 },
                    new TransferOrderItem { Store = "STORE-002", ItemCode = "SKU-SHOES-101-WHT-42", AllocatedQty = 200, SortedQty = 0, PackedQty = 0, PendingQty = 200 },
                    new TransferOrderItem { Store = "STORE-003", ItemCode = "SKU-SHOES-101-WHT-43", AllocatedQty = 200, SortedQty = 0, PackedQty = 0, PendingQty = 200 },
                    new TransferOrderItem { Store = "STORE-001", ItemCode = "SKU-SHOES-101-WHT-43", AllocatedQty = 200, SortedQty = 0, PackedQty = 0, PendingQty = 200 }
                }
            },
            // Approved Transfer Order - Ready for execution
            new TransferOrder
            {
                Title = "TO-0003",
                Status = "Approved",
                AdvanceShippingNotice = "ASN-00004",
                FromWarehouse = "WH-MAIN",
                PreparedBy = "admin",
                RequiredDate = DateTime.Today.AddDays(2),
                TotalAllocatedQty = 1000,
                Items = new List<TransferOrderItem>
                {
                    new TransferOrderItem { Store = "STORE-001", ItemCode = "SKU-SHOES-101-WHT-42", AllocatedQty = 250, SortedQty = 0, PackedQty = 0, PendingQty = 250 },
                    new TransferOrderItem { Store = "STORE-001", ItemCode = "SKU-SHOES-101-WHT-43", AllocatedQty = 250, SortedQty = 0, PackedQty = 0, PendingQty = 250 },
                    new TransferOrderItem { Store = "STORE-002", ItemCode = "SKU-SHOES-101-BLK-42", AllocatedQty = 250, SortedQty = 0, PackedQty = 0, PendingQty = 250 },
                    new TransferOrderItem { Store = "STORE-002", ItemCode = "SKU-SHOES-101-BLK-43", AllocatedQty = 250, SortedQty = 0, PackedQty = 0, PendingQty = 250 }
                }
            },
            // Executing Transfer Order - Currently being sorted
            new TransferOrder
            {
                Title = "TO-0004",
                Status = "Executing",
                AdvanceShippingNotice = "ASN-00005",
                FromWarehouse = "WH-MAIN",
                PreparedBy = "admin",
                RequiredDate = DateTime.Today.AddDays(1),
                TotalAllocatedQty = 1200,
                Items = new List<TransferOrderItem>
                {
                    new TransferOrderItem { Store = "STORE-001", ItemCode = "SKU-JACKET-201-BLK-M", AllocatedQty = 300, SortedQty = 200, PackedQty = 150, PendingQty = 100 },
                    new TransferOrderItem { Store = "STORE-001", ItemCode = "SKU-JACKET-201-BLK-L", AllocatedQty = 300, SortedQty = 250, PackedQty = 200, PendingQty = 50 },
                    new TransferOrderItem { Store = "STORE-002", ItemCode = "SKU-JACKET-201-BLK-M", AllocatedQty = 300, SortedQty = 300, PackedQty = 300, PendingQty = 0 },
                    new TransferOrderItem { Store = "STORE-003", ItemCode = "SKU-JACKET-201-BLK-XL", AllocatedQty = 300, SortedQty = 150, PackedQty = 100, PendingQty = 150 }
                }
            },
            // Completed Transfer Order
            new TransferOrder
            {
                Title = "TO-0005",
                Status = "Completed",
                AdvanceShippingNotice = "ASN-00005",
                FromWarehouse = "WH-MAIN",
                PreparedBy = "admin",
                RequiredDate = DateTime.Today.AddDays(-1),
                TotalAllocatedQty = 800,
                Items = new List<TransferOrderItem>
                {
                    new TransferOrderItem { Store = "STORE-001", ItemCode = "SKU-JACKET-201-BLK-M", AllocatedQty = 400, SortedQty = 400, PackedQty = 400, PendingQty = 0 },
                    new TransferOrderItem { Store = "STORE-002", ItemCode = "SKU-JACKET-201-BLK-L", AllocatedQty = 400, SortedQty = 400, PackedQty = 400, PendingQty = 0 }
                }
            },
            // Cancelled Transfer Order
            new TransferOrder
            {
                Title = "TO-0006",
                Status = "Cancelled",
                AdvanceShippingNotice = "ASN-00006",
                FromWarehouse = "WH-MAIN",
                PreparedBy = "admin",
                RequiredDate = DateTime.Today.AddDays(2),
                TotalAllocatedQty = 600,
                Items = new List<TransferOrderItem>
                {
                    new TransferOrderItem { Store = "STORE-001", ItemCode = "SKU-HAT-301-RED-OS", AllocatedQty = 200, SortedQty = 0, PackedQty = 0, PendingQty = 200 },
                    new TransferOrderItem { Store = "STORE-002", ItemCode = "SKU-HAT-301-BLU-OS", AllocatedQty = 200, SortedQty = 0, PackedQty = 0, PendingQty = 200 },
                    new TransferOrderItem { Store = "STORE-003", ItemCode = "SKU-HAT-301-GRN-OS", AllocatedQty = 200, SortedQty = 0, PackedQty = 0, PendingQty = 200 }
                }
            }
        };
    }

    // Inbound Sessions Mock Data
    public static List<InboundSession> GetInboundSessions()
    {
        return new List<InboundSession>
        {
            // Draft Session - Not started
            new InboundSession
            {
                Title = "INB-0001",
                Status = "Draft",
                AdvanceShippingNotice = "ASN-00003",
                TransferOrder = "TO-0001",
                Dock = "DOCK-01",
                StartedBy = "supervisor1",
                StartedOn = DateTime.Today.AddHours(-1),
                UnloadLines = new List<InboundUnloadLine>(),
                ReceiveLines = new List<InboundReceiveLine>()
            },
            // Unloading Session - Currently unloading
            new InboundSession
            {
                Title = "INB-0002",
                Status = "Unloading",
                AdvanceShippingNotice = "ASN-00003",
                TransferOrder = "TO-0001",
                Dock = "DOCK-02",
                StartedBy = "supervisor2",
                StartedOn = DateTime.Today.AddHours(-3),
                UnloadLines = new List<InboundUnloadLine>
                {
                    new InboundUnloadLine { UnitType = "Carton", UnitId = "CTN-0001", ScannedOn = DateTime.Today.AddHours(-2.5), ScannedBy = "unloader1" },
                    new InboundUnloadLine { UnitType = "Carton", UnitId = "CTN-0002", ScannedOn = DateTime.Today.AddHours(-2.5), ScannedBy = "unloader1" },
                    new InboundUnloadLine { UnitType = "Pallet", UnitId = "PLT-0001", ScannedOn = DateTime.Today.AddHours(-2), ScannedBy = "unloader2" },
                    new InboundUnloadLine { UnitType = "Carton", UnitId = "CTN-0003", ScannedOn = DateTime.Today.AddHours(-1.5), ScannedBy = "unloader2" }
                },
                ReceiveLines = new List<InboundReceiveLine>()
            },
            // Receiving Session - Currently receiving items
            new InboundSession
            {
                Title = "INB-0003",
                Status = "Receiving",
                AdvanceShippingNotice = "ASN-00004",
                TransferOrder = "TO-0003",
                Dock = "DOCK-01",
                StartedBy = "supervisor1",
                StartedOn = DateTime.Today.AddHours(-4),
                UnloadLines = new List<InboundUnloadLine>
                {
                    new InboundUnloadLine { UnitType = "Carton", UnitId = "CTN-0201", ScannedOn = DateTime.Today.AddHours(-3.5), ScannedBy = "unloader1" },
                    new InboundUnloadLine { UnitType = "Carton", UnitId = "CTN-0202", ScannedOn = DateTime.Today.AddHours(-3.5), ScannedBy = "unloader1" },
                    new InboundUnloadLine { UnitType = "Carton", UnitId = "CTN-0203", ScannedOn = DateTime.Today.AddHours(-3), ScannedBy = "unloader2" },
                    new InboundUnloadLine { UnitType = "Pallet", UnitId = "PLT-0002", ScannedOn = DateTime.Today.AddHours(-2.5), ScannedBy = "unloader3" }
                },
                ReceiveLines = new List<InboundReceiveLine>
                {
                    new InboundReceiveLine { CartonId = "CTN-0201", ItemCode = "SKU-SHOES-101-WHT-42", ExpectedQty = 500, ReceivedQty = 450, Condition = "Good", Remarks = "50 units damaged" },
                    new InboundReceiveLine { CartonId = "CTN-0201", ItemCode = "SKU-SHOES-101-WHT-42", ExpectedQty = 0, ReceivedQty = 50, Condition = "Damaged", Remarks = "Damaged during transit" },
                    new InboundReceiveLine { CartonId = "CTN-0202", ItemCode = "SKU-SHOES-101-WHT-43", ExpectedQty = 500, ReceivedQty = 500, Condition = "Good" },
                    new InboundReceiveLine { CartonId = "CTN-0203", ItemCode = "SKU-SHOES-101-BLK-42", ExpectedQty = 300, ReceivedQty = 280, Condition = "Good", Remarks = "20 units short" }
                }
            },
            // Sorting Session - Receiving done, now sorting to boxes
            new InboundSession
            {
                Title = "INB-0004",
                Status = "Sorting",
                AdvanceShippingNotice = "ASN-00004",
                TransferOrder = "TO-0003",
                Dock = "DOCK-03",
                StartedBy = "supervisor3",
                StartedOn = DateTime.Today.AddHours(-6),
                UnloadLines = new List<InboundUnloadLine>
                {
                    new InboundUnloadLine { UnitType = "Carton", UnitId = "CTN-0201", ScannedOn = DateTime.Today.AddHours(-5.5), ScannedBy = "unloader1" },
                    new InboundUnloadLine { UnitType = "Carton", UnitId = "CTN-0202", ScannedOn = DateTime.Today.AddHours(-5.5), ScannedBy = "unloader1" },
                    new InboundUnloadLine { UnitType = "Carton", UnitId = "CTN-0203", ScannedOn = DateTime.Today.AddHours(-5), ScannedBy = "unloader2" }
                },
                ReceiveLines = new List<InboundReceiveLine>
                {
                    new InboundReceiveLine { CartonId = "CTN-0201", ItemCode = "SKU-SHOES-101-WHT-42", ExpectedQty = 500, ReceivedQty = 500, Condition = "Good" },
                    new InboundReceiveLine { CartonId = "CTN-0202", ItemCode = "SKU-SHOES-101-WHT-43", ExpectedQty = 500, ReceivedQty = 500, Condition = "Good" },
                    new InboundReceiveLine { CartonId = "CTN-0203", ItemCode = "SKU-SHOES-101-BLK-42", ExpectedQty = 300, ReceivedQty = 300, Condition = "Good" }
                }
            },
            // Packing Session - Sorting done, packing boxes
            new InboundSession
            {
                Title = "INB-0005",
                Status = "Packing",
                AdvanceShippingNotice = "ASN-00005",
                TransferOrder = "TO-0004",
                Dock = "DOCK-02",
                StartedBy = "supervisor2",
                StartedOn = DateTime.Today.AddHours(-8),
                UnloadLines = new List<InboundUnloadLine>
                {
                    new InboundUnloadLine { UnitType = "Pallet", UnitId = "PLT-0003", ScannedOn = DateTime.Today.AddHours(-7.5), ScannedBy = "unloader1" },
                    new InboundUnloadLine { UnitType = "Pallet", UnitId = "PLT-0004", ScannedOn = DateTime.Today.AddHours(-7), ScannedBy = "unloader2" }
                },
                ReceiveLines = new List<InboundReceiveLine>
                {
                    new InboundReceiveLine { CartonId = "CTN-0301", ItemCode = "SKU-JACKET-201-BLK-M", ExpectedQty = 800, ReceivedQty = 800, Condition = "Good" },
                    new InboundReceiveLine { CartonId = "CTN-0302", ItemCode = "SKU-JACKET-201-BLK-L", ExpectedQty = 600, ReceivedQty = 600, Condition = "Good" },
                    new InboundReceiveLine { CartonId = "CTN-0303", ItemCode = "SKU-JACKET-201-BLK-XL", ExpectedQty = 600, ReceivedQty = 600, Condition = "Good" }
                }
            },
            // Putaway Session - Remaining items need putaway
            new InboundSession
            {
                Title = "INB-0006",
                Status = "Putaway",
                AdvanceShippingNotice = "ASN-00005",
                TransferOrder = "TO-0004",
                Dock = "DOCK-01",
                StartedBy = "supervisor1",
                StartedOn = DateTime.Today.AddHours(-10),
                UnloadLines = new List<InboundUnloadLine>
                {
                    new InboundUnloadLine { UnitType = "Pallet", UnitId = "PLT-0005", ScannedOn = DateTime.Today.AddHours(-9.5), ScannedBy = "unloader1" }
                },
                ReceiveLines = new List<InboundReceiveLine>
                {
                    new InboundReceiveLine { CartonId = "CTN-0301", ItemCode = "SKU-JACKET-201-BLK-M", ExpectedQty = 800, ReceivedQty = 800, Condition = "Good" },
                    new InboundReceiveLine { CartonId = "CTN-0302", ItemCode = "SKU-JACKET-201-BLK-L", ExpectedQty = 600, ReceivedQty = 600, Condition = "Good" }
                }
            },
            // Completed Session - All done
            new InboundSession
            {
                Title = "INB-0007",
                Status = "Completed",
                AdvanceShippingNotice = "ASN-00005",
                TransferOrder = "TO-0005",
                Dock = "DOCK-03",
                StartedBy = "supervisor3",
                StartedOn = DateTime.Today.AddDays(-2),
                CompletedOn = DateTime.Today.AddDays(-1),
                UnloadLines = new List<InboundUnloadLine>
                {
                    new InboundUnloadLine { UnitType = "Pallet", UnitId = "PLT-0006", ScannedOn = DateTime.Today.AddDays(-2).AddHours(-1), ScannedBy = "unloader1" },
                    new InboundUnloadLine { UnitType = "Pallet", UnitId = "PLT-0007", ScannedOn = DateTime.Today.AddDays(-2).AddHours(-0.5), ScannedBy = "unloader2" }
                },
                ReceiveLines = new List<InboundReceiveLine>
                {
                    new InboundReceiveLine { CartonId = "CTN-0301", ItemCode = "SKU-JACKET-201-BLK-M", ExpectedQty = 800, ReceivedQty = 800, Condition = "Good" },
                    new InboundReceiveLine { CartonId = "CTN-0302", ItemCode = "SKU-JACKET-201-BLK-L", ExpectedQty = 600, ReceivedQty = 600, Condition = "Good" }
                }
            }
        };
    }

    // Sort Boxes Mock Data
    public static List<SortBox> GetSortBoxes()
    {
        return new List<SortBox>
        {
            // Open Box - Just created
            new SortBox
            {
                BoxId = "BOX-STORE-001-001",
                Status = "Open",
                AdvanceShippingNotice = "ASN-00003",
                TransferOrder = "TO-0001",
                Store = "STORE-001",
                CreatedBy = "sorter1",
                CreatedOn = DateTime.Today.AddHours(-2),
                TotalScannedQty = 12
            },
            // Filling Box - Currently being filled
            new SortBox
            {
                BoxId = "BOX-STORE-002-001",
                Status = "Filling",
                AdvanceShippingNotice = "ASN-00003",
                TransferOrder = "TO-0001",
                Store = "STORE-002",
                CreatedBy = "sorter2",
                CreatedOn = DateTime.Today.AddHours(-1.5),
                TotalScannedQty = 48
            },
            // Another Filling Box
            new SortBox
            {
                BoxId = "BOX-STORE-001-002",
                Status = "Filling",
                AdvanceShippingNotice = "ASN-00004",
                TransferOrder = "TO-0003",
                Store = "STORE-001",
                CreatedBy = "sorter1",
                CreatedOn = DateTime.Today.AddHours(-3),
                TotalScannedQty = 120
            },
            // Closed Box - Ready for packing
            new SortBox
            {
                BoxId = "BOX-STORE-002-002",
                Status = "Closed",
                AdvanceShippingNotice = "ASN-00004",
                TransferOrder = "TO-0003",
                Store = "STORE-002",
                CreatedBy = "sorter2",
                CreatedOn = DateTime.Today.AddHours(-4),
                ClosedBy = "operator1",
                ClosedOn = DateTime.Today.AddHours(-2),
                TotalScannedQty = 200
            },
            // Packed Box - Ready for dispatch
            new SortBox
            {
                BoxId = "BOX-STORE-001-003",
                Status = "Packed",
                AdvanceShippingNotice = "ASN-00005",
                TransferOrder = "TO-0004",
                Store = "STORE-001",
                CreatedBy = "sorter1",
                CreatedOn = DateTime.Today.AddDays(-1),
                ClosedBy = "operator2",
                ClosedOn = DateTime.Today.AddDays(-1).AddHours(6),
                TotalScannedQty = 96
            },
            // Another Closed Box
            new SortBox
            {
                BoxId = "BOX-STORE-003-001",
                Status = "Closed",
                AdvanceShippingNotice = "ASN-00005",
                TransferOrder = "TO-0004",
                Store = "STORE-003",
                CreatedBy = "sorter3",
                CreatedOn = DateTime.Today.AddDays(-1),
                ClosedBy = "operator3",
                ClosedOn = DateTime.Today.AddDays(-1).AddHours(5),
                TotalScannedQty = 64
            },
            // Cancelled Box
            new SortBox
            {
                BoxId = "BOX-STORE-001-004",
                Status = "Cancelled",
                AdvanceShippingNotice = "ASN-00006",
                TransferOrder = "TO-0006",
                Store = "STORE-001",
                CreatedBy = "sorter1",
                CreatedOn = DateTime.Today.AddHours(-5),
                Remarks = "Order cancelled by store",
                TotalScannedQty = 0
            },
            // More Filling Boxes
            new SortBox
            {
                BoxId = "BOX-STORE-002-003",
                Status = "Filling",
                AdvanceShippingNotice = "ASN-00004",
                TransferOrder = "TO-0003",
                Store = "STORE-002",
                CreatedBy = "sorter2",
                CreatedOn = DateTime.Today.AddHours(-2),
                TotalScannedQty = 24
            },
            new SortBox
            {
                BoxId = "BOX-STORE-003-002",
                Status = "Filling",
                AdvanceShippingNotice = "ASN-00004",
                TransferOrder = "TO-0003",
                Store = "STORE-003",
                CreatedBy = "sorter3",
                CreatedOn = DateTime.Today.AddHours(-1),
                TotalScannedQty = 8
            }
        };
    }

    // Transfer Cartons Mock Data
    public static List<TransferCarton> GetTransferCartons()
    {
        return new List<TransferCarton>
        {
            // Created Transfer Carton - Just created
            new TransferCarton
            {
                TcId = "TC-0001",
                Status = "Created",
                AdvanceShippingNotice = "ASN-00003",
                TransferOrder = "TO-0001",
                Store = "STORE-001",
                CreatedBy = "operator1",
                CreatedOn = DateTime.Today.AddHours(-2)
            },
            // Filling Transfer Carton - Currently being filled
            new TransferCarton
            {
                TcId = "TC-0002",
                Status = "Filling",
                AdvanceShippingNotice = "ASN-00004",
                TransferOrder = "TO-0003",
                Store = "STORE-002",
                CreatedBy = "operator2",
                CreatedOn = DateTime.Today.AddHours(-3)
            },
            // Sealed Transfer Carton - Ready for dispatch
            new TransferCarton
            {
                TcId = "TC-0003",
                Status = "Sealed",
                AdvanceShippingNotice = "ASN-00004",
                TransferOrder = "TO-0003",
                Store = "STORE-001",
                CreatedBy = "operator1",
                CreatedOn = DateTime.Today.AddDays(-1),
                SealedBy = "operator1",
                SealedOn = DateTime.Today.AddDays(-1).AddHours(5)
            },
            // Dispatched Transfer Carton - Sent to store
            new TransferCarton
            {
                TcId = "TC-0004",
                Status = "Dispatched",
                AdvanceShippingNotice = "ASN-00005",
                TransferOrder = "TO-0004",
                Store = "STORE-001",
                CreatedBy = "operator2",
                CreatedOn = DateTime.Today.AddDays(-2),
                SealedBy = "operator2",
                SealedOn = DateTime.Today.AddDays(-2).AddHours(6),
                DispatchedOn = DateTime.Today.AddDays(-1)
            },
            // Received Transfer Carton - Received at store
            new TransferCarton
            {
                TcId = "TC-0005",
                Status = "Received",
                AdvanceShippingNotice = "ASN-00005",
                TransferOrder = "TO-0005",
                Store = "STORE-002",
                CreatedBy = "operator3",
                CreatedOn = DateTime.Today.AddDays(-3),
                SealedBy = "operator3",
                SealedOn = DateTime.Today.AddDays(-3).AddHours(4),
                DispatchedOn = DateTime.Today.AddDays(-2)
            },
            // Completed Transfer Carton - Full cycle complete
            new TransferCarton
            {
                TcId = "TC-0006",
                Status = "Completed",
                AdvanceShippingNotice = "ASN-00005",
                TransferOrder = "TO-0005",
                Store = "STORE-001",
                CreatedBy = "operator1",
                CreatedOn = DateTime.Today.AddDays(-4),
                SealedBy = "operator1",
                SealedOn = DateTime.Today.AddDays(-4).AddHours(5),
                DispatchedOn = DateTime.Today.AddDays(-3)
            },
            // Cancelled Transfer Carton
            new TransferCarton
            {
                TcId = "TC-0007",
                Status = "Cancelled",
                AdvanceShippingNotice = "ASN-00006",
                TransferOrder = "TO-0006",
                Store = "STORE-001",
                CreatedBy = "operator1",
                CreatedOn = DateTime.Today.AddHours(-4),
                Remarks = "Order cancelled"
            },
            // More Filling Cartons
            new TransferCarton
            {
                TcId = "TC-0008",
                Status = "Filling",
                AdvanceShippingNotice = "ASN-00004",
                TransferOrder = "TO-0003",
                Store = "STORE-003",
                CreatedBy = "operator3",
                CreatedOn = DateTime.Today.AddHours(-2)
            },
            new TransferCarton
            {
                TcId = "TC-0009",
                Status = "Sealed",
                AdvanceShippingNotice = "ASN-00004",
                TransferOrder = "TO-0003",
                Store = "STORE-002",
                CreatedBy = "operator2",
                CreatedOn = DateTime.Today.AddDays(-1),
                SealedBy = "operator2",
                SealedOn = DateTime.Today.AddDays(-1).AddHours(3)
            }
        };
    }

    // Putaway Tasks Mock Data
    public static List<PutawayTask> GetPutawayTasks()
    {
        return new List<PutawayTask>
        {
            // Draft Putaway Task
            new PutawayTask
            {
                Title = "PUT-0001",
                Status = "Draft",
                AdvanceShippingNotice = "ASN-00003",
                InboundSession = "INB-0001",
                CreatedBy = "supervisor1",
                Lines = new List<PutawayLine>
                {
                    new PutawayLine { CartonId = "CTN-0001", ItemCode = "SKU-TSHIRT-001-BLK-S", Qty = 50, Rack = "R-01", Bin = "B-01" },
                    new PutawayLine { CartonId = "CTN-0002", ItemCode = "SKU-TSHIRT-001-BLK-L", Qty = 200, Rack = "R-02", Bin = "B-05" }
                }
            },
            // In Progress Putaway Task
            new PutawayTask
            {
                Title = "PUT-0002",
                Status = "In Progress",
                AdvanceShippingNotice = "ASN-00004",
                InboundSession = "INB-0003",
                CreatedBy = "supervisor1",
                Lines = new List<PutawayLine>
                {
                    new PutawayLine { CartonId = "CTN-0201", ItemCode = "SKU-SHOES-101-WHT-42", Qty = 50, Rack = "R-03", Bin = "B-10" },
                    new PutawayLine { CartonId = "CTN-0203", ItemCode = "SKU-SHOES-101-BLK-42", Qty = 20, Rack = "R-03", Bin = "B-11" },
                    new PutawayLine { ItemCode = "SKU-SHOES-101-WHT-42", Qty = 100, Rack = "R-04", Bin = "B-15" }
                }
            },
            // Another In Progress Task
            new PutawayTask
            {
                Title = "PUT-0003",
                Status = "In Progress",
                AdvanceShippingNotice = "ASN-00005",
                InboundSession = "INB-0006",
                CreatedBy = "supervisor2",
                Lines = new List<PutawayLine>
                {
                    new PutawayLine { CartonId = "CTN-0301", ItemCode = "SKU-JACKET-201-BLK-M", Qty = 200, Rack = "R-05", Bin = "B-20" },
                    new PutawayLine { CartonId = "CTN-0302", ItemCode = "SKU-JACKET-201-BLK-L", Qty = 150, Rack = "R-05", Bin = "B-21" },
                    new PutawayLine { ItemCode = "SKU-JACKET-201-BLK-M", Qty = 300, Rack = "R-06", Bin = "B-25" }
                }
            },
            // Completed Putaway Task
            new PutawayTask
            {
                Title = "PUT-0004",
                Status = "Completed",
                AdvanceShippingNotice = "ASN-00005",
                InboundSession = "INB-0007",
                CreatedBy = "supervisor3",
                Lines = new List<PutawayLine>
                {
                    new PutawayLine { CartonId = "CTN-0301", ItemCode = "SKU-JACKET-201-BLK-M", Qty = 400, Rack = "R-07", Bin = "B-30" },
                    new PutawayLine { CartonId = "CTN-0302", ItemCode = "SKU-JACKET-201-BLK-L", Qty = 400, Rack = "R-07", Bin = "B-31" }
                }
            },
            // Cancelled Putaway Task
            new PutawayTask
            {
                Title = "PUT-0005",
                Status = "Cancelled",
                AdvanceShippingNotice = "ASN-00006",
                InboundSession = "INB-0001",
                CreatedBy = "supervisor1",
                Lines = new List<PutawayLine>
                {
                    new PutawayLine { ItemCode = "SKU-HAT-301-RED-OS", Qty = 200, Rack = "R-08", Bin = "B-35" }
                }
            },
            // More In Progress Tasks
            new PutawayTask
            {
                Title = "PUT-0006",
                Status = "In Progress",
                AdvanceShippingNotice = "ASN-00004",
                InboundSession = "INB-0004",
                CreatedBy = "supervisor2",
                Lines = new List<PutawayLine>
                {
                    new PutawayLine { ItemCode = "SKU-SHOES-101-WHT-43", Qty = 150, Rack = "R-09", Bin = "B-40" },
                    new PutawayLine { ItemCode = "SKU-SHOES-101-BLK-43", Qty = 100, Rack = "R-09", Bin = "B-41" }
                }
            }
        };
    }

    // Items Mock Data (for reference)
    public static List<Item> GetItems()
    {
        return new List<Item>
        {
            new Item { Code = "SKU-TSHIRT-001-BLK-S", Name = "Basic T-Shirt Black S", Barcode = "1234567890123", StockUom = "Nos" },
            new Item { Code = "SKU-TSHIRT-001-BLK-M", Name = "Basic T-Shirt Black M", Barcode = "1234567890124", StockUom = "Nos" },
            new Item { Code = "SKU-TSHIRT-001-BLK-L", Name = "Basic T-Shirt Black L", Barcode = "1234567890125", StockUom = "Nos" },
            new Item { Code = "SKU-JEANS-021-BLU-32", Name = "Slim Jeans Blue 32", Barcode = "1234567890126", StockUom = "Nos" },
            new Item { Code = "SKU-JEANS-021-BLU-34", Name = "Slim Jeans Blue 34", Barcode = "1234567890127", StockUom = "Nos" },
            new Item { Code = "SKU-SHOES-101-WHT-42", Name = "Running Shoes White 42", Barcode = "1234567890128", StockUom = "Nos" },
            new Item { Code = "SKU-SHOES-101-WHT-43", Name = "Running Shoes White 43", Barcode = "1234567890129", StockUom = "Nos" },
            new Item { Code = "SKU-SHOES-101-BLK-42", Name = "Running Shoes Black 42", Barcode = "1234567890130", StockUom = "Nos" },
            new Item { Code = "SKU-SHOES-101-BLK-43", Name = "Running Shoes Black 43", Barcode = "1234567890131", StockUom = "Nos" },
            new Item { Code = "SKU-JACKET-201-BLK-M", Name = "Winter Jacket Black M", Barcode = "1234567890132", StockUom = "Nos" },
            new Item { Code = "SKU-JACKET-201-BLK-L", Name = "Winter Jacket Black L", Barcode = "1234567890133", StockUom = "Nos" },
            new Item { Code = "SKU-JACKET-201-BLK-XL", Name = "Winter Jacket Black XL", Barcode = "1234567890134", StockUom = "Nos" },
            new Item { Code = "SKU-HAT-301-RED-OS", Name = "Baseball Cap Red One Size", Barcode = "1234567890135", StockUom = "Nos" },
            new Item { Code = "SKU-HAT-301-BLU-OS", Name = "Baseball Cap Blue One Size", Barcode = "1234567890136", StockUom = "Nos" },
            new Item { Code = "SKU-HAT-301-GRN-OS", Name = "Baseball Cap Green One Size", Barcode = "1234567890137", StockUom = "Nos" }
        };
    }

    // Warehouses Mock Data
    public static List<Warehouse> GetWarehouses()
    {
        return new List<Warehouse>
        {
            new Warehouse { Code = "WH-MAIN", Name = "Main Warehouse", IsStore = false },
            new Warehouse { Code = "STORE-001", Name = "Downtown Store", IsStore = true },
            new Warehouse { Code = "STORE-002", Name = "Mall Store", IsStore = true },
            new Warehouse { Code = "STORE-003", Name = "Airport Store", IsStore = true }
        };
    }

    // Get ASN by title
    public static Asn? GetAsnByTitle(string title)
    {
        return GetAsns().FirstOrDefault(a => a.Title == title);
    }

    // Get Transfer Order by ASN (Transfer Order references ASN for store allocations)
    public static TransferOrder? GetTransferOrderByAsn(string asnTitle)
    {
        return GetTransferOrders().FirstOrDefault(to => to.AdvanceShippingNotice == asnTitle);
    }

    // Get Transfer Order by title
    public static TransferOrder? GetTransferOrderByTitle(string title)
    {
        return GetTransferOrders().FirstOrDefault(to => to.Title == title);
    }
}

