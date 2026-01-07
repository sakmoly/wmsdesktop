using System;

namespace Wms.Desktop.Models;

/// <summary>
/// Store Box / Tote - dedicated to one showroom/store
/// Also serves as Transfer Carton (same ID can be used)
/// State: Open → In Filling → Closed → Dispatched → Received at Store (optional)
/// </summary>
public sealed class SortBox
{
    public string BoxId { get; init; } = string.Empty; // BOX-STORE-XXXX or TOTE-XXXX
    public string Status { get; init; } = "Open"; // Open, Filling, Closed, Dispatched, Received, Cancelled
    public string AdvanceShippingNotice { get; init; } = string.Empty;
    public string TransferOrder { get; init; } = string.Empty;
    public string Store { get; init; } = string.Empty; // One store per box
    public string Purpose { get; init; } = "STORE"; // STORE, PUTAWAY, etc.
    public string CreatedBy { get; init; } = string.Empty;
    public DateTime CreatedOn { get; init; }
    public string? ClosedBy { get; init; }
    public DateTime? ClosedOn { get; init; }
    public DateTime? DispatchedOn { get; init; }
    public DateTime? ReceivedAtStoreOn { get; init; }
    public DateTime? UpdatedOn { get; init; } // For sync operations
    public string? Remarks { get; init; }
    
    // Note: BoxId can be used as TransferCarton.TcId (same entity concept)
}

