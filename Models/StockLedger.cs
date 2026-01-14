using System;
using System.Text.Json.Serialization;

namespace Wms.Desktop.Models;

public sealed class StockLedger
{
    public string ItemCode { get; init; } = string.Empty;
    public string Warehouse { get; init; } = string.Empty;
    public string? BinLocation { get; init; }
    public string? CartonId { get; init; } // For carton-level inventory tracking
    public double Qty { get; init; } // Transaction Qty (calculated from qty_reduced or qty_before - remaining stock)
    public double ReservedQty { get; init; }
    public double RemainingStock { get; init; } // Remaining stock after transaction (from database qty column)
    public double AvailableQty => RemainingStock - ReservedQty; // Qty after Deduction of this Transaction
    public double? QtyBefore { get; init; } // Stock before deduction of this transaction
    public double? QtyReduced { get; init; } // Current transaction qty (negative for picking, positive for increase)
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

public sealed class TransactionHistory
{
    [JsonPropertyName("id")]
    public long Id { get; init; }
    
    [JsonPropertyName("transaction_id")]
    public long TransactionId { get; init; }
    
    [JsonPropertyName("transaction_number")]
    public string? TransactionNumber { get; init; }
    
    [JsonPropertyName("transaction_date")]
    public DateTime? TransactionDate { get; init; }
    
    [JsonPropertyName("transaction_type")]
    public string? TransactionType { get; init; }
    
    [JsonPropertyName("reference_doc_type")]
    public string? ReferenceDocType { get; init; }
    
    [JsonPropertyName("reference_doc")]
    public string? ReferenceDoc { get; init; }
    
    [JsonPropertyName("wms_transaction_title")]
    public string? WmsTransactionTitle { get; init; }
    
    [JsonPropertyName("item_code")]
    public string? ItemCode { get; init; }
    
    [JsonPropertyName("item_name")]
    public string? ItemName { get; init; }
    
    [JsonPropertyName("warehouse")]
    public string? Warehouse { get; init; }
    
    [JsonPropertyName("warehouse_name")]
    public string? WarehouseName { get; init; }
    
    [JsonPropertyName("bin_location")]
    public string? BinLocation { get; init; }
    
    [JsonPropertyName("location_id")]
    public string? LocationId { get; init; }
    
    [JsonPropertyName("carton_id")]
    public string? CartonId { get; init; }
    
    [JsonPropertyName("batch_no")]
    public string? BatchNo { get; init; }
    
    [JsonPropertyName("serial_no")]
    public string? SerialNo { get; init; }
    
    [JsonPropertyName("qty_change")]
    public double QtyChange { get; init; }
    
    [JsonPropertyName("qty_before")]
    public double QtyBefore { get; init; }
    
    [JsonPropertyName("qty_after")]
    public double QtyAfter { get; init; }
    
    [JsonPropertyName("stock_direction")]
    public string? StockDirection { get; init; }
    
    [JsonPropertyName("source_bin")]
    public string? SourceBin { get; init; }
    
    [JsonPropertyName("target_bin")]
    public string? TargetBin { get; init; }
    
    [JsonPropertyName("performed_by")]
    public string? PerformedBy { get; init; }
    
    [JsonPropertyName("performed_by_name")]
    public string? PerformedByName { get; init; }
    
    [JsonPropertyName("notes")]
    public string? Notes { get; init; }
    
    [JsonPropertyName("reason_code")]
    public string? ReasonCode { get; init; }
    
    [JsonPropertyName("status")]
    public string? Status { get; init; }
    
    [JsonPropertyName("uom")]
    public string? Uom { get; init; }
    
    [JsonPropertyName("created_at")]
    public DateTime? CreatedAt { get; init; }
}
