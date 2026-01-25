namespace Wms.Desktop.Models;

/// <summary>
/// Represents stock at a location/carton level, calculated from transaction history
/// </summary>
public sealed class ItemLocationStock
{
    public string ItemCode { get; init; } = string.Empty;
    public string ItemName { get; init; } = string.Empty;
    public string Warehouse { get; init; } = string.Empty;
    public string LocationId { get; init; } = string.Empty;
    public string? CartonId { get; init; }
    
    // Transaction-based quantity fields
    public double InQty { get; init; }      // Sum of IN transactions
    public double OutQty { get; init; }     // Sum of OUT transactions (absolute)
    public double BalanceQty { get; init; } // Net balance (InQty - OutQty)
}
