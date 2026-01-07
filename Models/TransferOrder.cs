using System;
using System.Collections.Generic;

namespace Wms.Desktop.Models;

public sealed class TransferOrder
{
    public string Title { get; init; } = string.Empty;
    public string Status { get; init; } = "Draft"; // Draft, Submitted, Approved, Executing, Completed, Cancelled
    public string AdvanceShippingNotice { get; init; } = string.Empty;
    public string FromWarehouse { get; init; } = string.Empty;
    public string PreparedBy { get; init; } = string.Empty;
    public DateTime? RequiredDate { get; init; }
    public double TotalAllocatedQty { get; init; }

    public IReadOnlyList<TransferOrderItem> Items { get; init; } = Array.Empty<TransferOrderItem>();
}


