using System;
using System.Collections.Generic;

namespace Wms.Desktop.Models;

public sealed class Asn
{
    public string Title { get; init; } = string.Empty;
    public string Status { get; init; } = "Draft"; // Draft, Submitted, Approved, Receiving, Completed
    public string? PurchaseOrder { get; init; }
    public string Supplier { get; init; } = string.Empty;
    public DateTime ShipmentDate { get; init; }
    public DateTime ExpectedArrivalDate { get; init; }
    public double TotalShippedQty { get; init; }
    public int TotalCartonCount { get; init; } // Total number of distinct cartons
    public string? AirwayBillNo { get; init; }
    public string? ShipmentType { get; init; } // Air, Sea, Road
    public DateTime? UpdatedOn { get; init; } // For sync operations
    public string? PayloadJson { get; init; } // Serialized ASN data for sync

    public IReadOnlyList<AsnItemDetails> Details { get; init; } = Array.Empty<AsnItemDetails>();
}

public sealed class AsnItemDetails
{
    public string ItemCode { get; init; } = string.Empty;
    public string? PoItemReference { get; init; }
    public double ShippedQty { get; init; }
    public double ReceivedQty { get; init; } // Received quantity from tabInboundReceiveLine
    public string? CartonId { get; init; }
    public string CartonAssignedStatus { get; init; } = "Assigned"; // Assigned, Missing
    
    // Receiving Carton fields from tabReceivingCarton
    public string? InboundSession { get; init; }
    public string? ReceivingStatus { get; init; } // Status from tabReceivingCarton
    public string? OpenedBy { get; init; }
    public DateTime? OpenedOn { get; init; }
    public string? LockedBy { get; init; }
    public DateTime? LockedOn { get; init; }
    public string? ReceivedBy { get; init; }
    public DateTime? ReceivedOn { get; init; }
    public string? VerifiedBy { get; init; }
    public DateTime? VerifiedOn { get; init; }
    public DateTime? UpdatedOn { get; init; }
    public string? Remarks { get; init; }
    public DateTime? CreatedAt { get; init; }
}

