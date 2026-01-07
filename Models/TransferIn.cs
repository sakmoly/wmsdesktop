using System;
using System.Collections.Generic;

namespace Wms.Desktop.Models;

public sealed class TransferIn
{
    public string Title { get; init; } = string.Empty;
    public string Status { get; init; } = "Draft";
    public string FromShowroom { get; init; } = string.Empty;
    public string ToWarehouse { get; init; } = string.Empty;
    public DateTime TransferDate { get; init; }
    public DateTime? ExpectedArrivalDate { get; init; }
    public string PreparedBy { get; init; } = string.Empty;
    public string? ReceivedBy { get; init; }
    public DateTime? ReceivedOn { get; init; }
    public double TotalQty { get; init; }
    
    public IReadOnlyList<TransferInItem> Items { get; init; } = Array.Empty<TransferInItem>();
}

public sealed class TransferInItem
{
    public string ItemCode { get; init; } = string.Empty;
    public double Qty { get; init; }
    public string? CartonId { get; init; }
    public double ReceivedQty { get; init; }
}

