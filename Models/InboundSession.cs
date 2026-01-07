using System;
using System.Collections.Generic;

namespace Wms.Desktop.Models;

public sealed class InboundSession
{
    public string Title { get; init; } = string.Empty;
    public string Status { get; init; } = "Draft"; // Draft, Unloading, Receiving, Sorting, Putaway, Completed
    public string AdvanceShippingNotice { get; init; } = string.Empty; // For ASN-based sessions
    public string? TransferIn { get; init; } // For Transfer In-based sessions
    public string? TransferOrder { get; init; }
    public string? Dock { get; init; }
    public string StartedBy { get; init; } = string.Empty;
    public DateTime StartedOn { get; init; }
    public DateTime? CompletedOn { get; init; }

    public IReadOnlyList<InboundUnloadLine> UnloadLines { get; init; } = Array.Empty<InboundUnloadLine>();
    public IReadOnlyList<InboundReceiveLine> ReceiveLines { get; init; } = Array.Empty<InboundReceiveLine>();
}

public sealed class InboundUnloadLine
{
    public string UnitType { get; init; } = string.Empty; // Carton, Pallet
    public string UnitId { get; init; } = string.Empty;
    public DateTime ScannedOn { get; init; }
    public string ScannedBy { get; init; } = string.Empty;
}

public sealed class InboundReceiveLine
{
    public string CartonId { get; init; } = string.Empty;
    public string ItemCode { get; init; } = string.Empty;
    public double ExpectedQty { get; init; }
    public double ReceivedQty { get; init; }
    public string Condition { get; init; } = "Good"; // Good, Damaged
    public string? Remarks { get; init; }
}

