using System;
using System.Collections.Generic;

namespace Wms.Desktop.Models;

public sealed class PutawayTask
{
    public string Title { get; init; } = string.Empty;
    public string Status { get; init; } = "Draft"; // Draft, In Progress, Completed, Cancelled
    public string SourceType { get; init; } = "ASN"; // "ASN" or "TransferIn"
    
    // For ASN-based putaway
    public string? AdvanceShippingNotice { get; init; }
    
    // For Transfer In-based putaway
    public string? TransferIn { get; init; }
    
    public string InboundSession { get; init; } = string.Empty;
    public string CreatedBy { get; init; } = string.Empty;
    
    // Location ID (from tabPutawayTask.location_id if available, otherwise constructed from rack+bin)
    public string? LocationId { get; init; }

    public IReadOnlyList<PutawayLine> Lines { get; init; } = Array.Empty<PutawayLine>();
}

public sealed class PutawayLine
{
    public string? CartonId { get; init; }
    public string ItemCode { get; init; } = string.Empty;
    public double Qty { get; init; }
    public string Rack { get; init; } = string.Empty;
    public string Bin { get; init; } = string.Empty;
    public string? LocationId { get; init; } // Location ID (from tabPutawayLine.location_id if available, otherwise constructed from rack+bin)
}

