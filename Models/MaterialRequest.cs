using System;
using System.Collections.Generic;

namespace Wms.Desktop.Models;

public sealed class MaterialRequest
{
    public string Title { get; init; } = string.Empty;
    public string Status { get; init; } = "Draft"; // Draft, Submitted, In Progress, Picked, Dispatched, Completed
    public string FromWarehouse { get; init; } = string.Empty;
    public string ToShowroom { get; init; } = string.Empty;
    public DateTime RequestedDate { get; init; }
    public DateTime? RequiredDate { get; init; }
    public string RequestedBy { get; init; } = string.Empty;
    public double TotalRequestedQty { get; init; }
    public double TotalPickedQty { get; init; }
    /// <summary>Stock Entry created in ERPNext by Push to ERP (add to transit).</summary>
    public string? StockEntryNo { get; init; }

    public IReadOnlyList<MaterialRequestItem> Items { get; init; } = Array.Empty<MaterialRequestItem>();
}

public sealed class MaterialRequestItem
{
    public string ItemCode { get; init; } = string.Empty;
    public double RequestedQty { get; init; }
    public double PickedQty { get; init; }
    public double PendingQty => RequestedQty - PickedQty;
    public string Status { get; init; } = "Pending"; // Pending, In Progress, Picked
}

