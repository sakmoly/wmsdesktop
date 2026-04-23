using System;

namespace Wms.Desktop.Models;

/// <summary>
/// Display wrapper for Transaction History so the Warehouse column shows warehouse code (e.g. WH-MAIN).
/// </summary>
public sealed class TransactionHistoryDisplay
{
    public TransactionHistory Source { get; }

    /// <summary>Warehouse code for display (resolved from API warehouse/warehouse_name).</summary>
    public string? Warehouse { get; }

    public TransactionHistoryDisplay(TransactionHistory source, string? warehouseCode)
    {
        Source = source;
        Warehouse = warehouseCode ?? source.Warehouse ?? source.WarehouseName ?? string.Empty;
    }

    public long Id => Source.Id;
    public long TransactionId => Source.TransactionId;
    public string? TransactionNumber => Source.TransactionNumber;
    public DateTime? TransactionDate => Source.TransactionDate;
    public string? TransactionType => Source.TransactionType;
    public string? ReferenceDocType => Source.ReferenceDocType;
    public string? ReferenceDoc => Source.ReferenceDoc;
    public string? WmsTransactionTitle => Source.WmsTransactionTitle;
    public string? ItemCode => Source.ItemCode;
    public string? ItemName => Source.ItemName;
    public string? BinLocation => Source.BinLocation;
    public string? LocationId => Source.LocationId;
    public string? CartonId => Source.CartonId;
    public string? BatchNo => Source.BatchNo;
    public string? SerialNo => Source.SerialNo;
    public double QtyChange => Source.QtyChange;
    public double QtyBefore => Source.QtyBefore;
    public double QtyAfter => Source.QtyAfter;
    public string? StockDirection => Source.StockDirection;
    public string? SourceBin => Source.SourceBin;
    public string? TargetBin => Source.TargetBin;
    public string? PerformedBy => Source.PerformedBy;
    public string? PerformedByName => Source.PerformedByName;
    public string? Notes => Source.Notes;
    public string? ReasonCode => Source.ReasonCode;
    public string? Status => Source.Status;
    public string? Uom => Source.Uom;
    public DateTime? CreatedAt => Source.CreatedAt;
}
