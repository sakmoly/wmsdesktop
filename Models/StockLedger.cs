using System;

namespace Wms.Desktop.Models;

public sealed class StockLedger
{
    public string ItemCode { get; init; } = string.Empty;
    public string Warehouse { get; init; } = string.Empty;
    public string? BinLocation { get; init; }
    public double Qty { get; init; }
    public double ReservedQty { get; init; }
    public double AvailableQty => Qty - ReservedQty;
    public double? QtyBefore { get; init; }
    public double? QtyReduced { get; init; }
    public DateTime? LastTransactionDate { get; init; }
    public string? LastTransactionType { get; init; }
    public string? LastTransactionRef { get; init; }
    public DateTime UpdatedAt { get; init; }
    public DateTime CreatedAt { get; init; }
}

public sealed class StockTransaction
{
    public long Id { get; init; }
    public DateTime TransactionDate { get; init; }
    public string TransactionType { get; init; } = string.Empty;
    public string? ReferenceDocType { get; init; }
    public string? ReferenceDoc { get; init; }
    public string? WmsTransactionTitle { get; init; }
    public string ItemCode { get; init; } = string.Empty;
    public string Warehouse { get; init; } = string.Empty;
    public string? BinLocation { get; init; }
    public double QtyChange { get; init; }
    public double QtyBefore { get; init; }
    public double QtyAfter { get; init; }
    public string? SourceBin { get; init; }
    public string? TargetBin { get; init; }
    public string? PerformedBy { get; init; }
    public string? Notes { get; init; }
    public DateTime CreatedAt { get; init; }
}

