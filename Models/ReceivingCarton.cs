using System;

namespace Wms.Desktop.Models;

/// <summary>
/// Tracks carton status during receiving process for concurrency control
/// State: Pending → Unloaded → Receiving → Received → Verified/Closed
/// </summary>
public sealed class ReceivingCarton
{
    public string CartonId { get; init; } = string.Empty;
    public string AdvanceShippingNotice { get; init; } = string.Empty;
    public string? InboundSession { get; init; }
    public string Status { get; init; } = "Pending"; // Pending, Unloaded, Receiving, Received, Verified, Closed
    public string? OpenedBy { get; init; } // User who started receiving (for locking)
    public DateTime? OpenedOn { get; init; } // When carton was opened for receiving
    public string? LockedBy { get; init; } // API field name (maps to OpenedBy)
    public DateTime? LockedOn { get; init; } // API field name (maps to OpenedOn)
    public string? ReceivedBy { get; init; }
    public DateTime? ReceivedOn { get; init; }
    public string? VerifiedBy { get; init; }
    public DateTime? VerifiedOn { get; init; }
    public DateTime? UpdatedOn { get; init; } // For sync operations
    public string? Remarks { get; init; }
}

