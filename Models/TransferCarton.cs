using System;

namespace Wms.Desktop.Models;

public sealed class TransferCarton
{
    public string TcId { get; init; } = string.Empty;
    public string Status { get; init; } = "Created"; // Created, Filling, Sealed, Dispatched, Received, Completed, Cancelled
    public string? AdvanceShippingNotice { get; init; } // Nullable for Material Request transfer cartons
    public string? TransferOrder { get; init; } // Nullable for Material Request transfer cartons
    public string Store { get; init; } = string.Empty;
    public string? CreatedBy { get; init; } // Nullable in case it's missing
    public DateTime CreatedOn { get; init; }
    public string? SealedBy { get; init; }
    public DateTime? SealedOn { get; init; }
    public DateTime? DispatchedOn { get; init; }
    public DateTime? UpdatedOn { get; init; } // For sync operations
    public string? Remarks { get; init; }

    // ERPNext PR and Stock Entry integration
    public string? PurchaseReceiptNo { get; init; }
    public int? PurchaseReceiptDocstatus { get; init; }
    public bool? PurchaseReceiptCreated { get; init; }
    public bool? PurchaseReceiptSubmitted { get; init; }
    public string? WarehouseTransferNo { get; init; }
    public bool? WarehouseTransferCreated { get; init; }
}

