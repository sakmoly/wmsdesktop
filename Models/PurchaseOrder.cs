using System;
using System.Collections.Generic;

namespace Wms.Desktop.Models;

public sealed class PurchaseOrder
{
    public string PoId { get; init; } = string.Empty;
    public int DocStatus { get; init; }
    public DateTime TransactionDate { get; init; }
    public DateTime? ExpectedDeliveryDate { get; init; }
    public string SupplierId { get; init; } = string.Empty;
    public string SupplierName { get; init; } = string.Empty;
    public string? ShippingAddress { get; init; }
    public string Status { get; init; } = "Open";

    public IReadOnlyList<PurchaseOrderItem> Items { get; init; } = Array.Empty<PurchaseOrderItem>();
}


