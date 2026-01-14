using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Wms.Desktop.Models;

public sealed class ItemLocationStock
{
    public string ItemCode { get; init; } = string.Empty;
    public string ItemName { get; init; } = string.Empty;
    public string Warehouse { get; init; } = string.Empty;
    public string LocationId { get; init; } = string.Empty;
    public string? Zone { get; init; }
    public string? Aisle { get; init; }
    public string? Rack { get; init; }
    public string? Level { get; init; }
    public string? BinId { get; init; }
    public string? CartonId { get; init; } // For carton-level inventory
    
    // Quantity fields - standardized meaning
    public double TotalQty { get; init; } // Physical on-hand at bin (sum of carton.qty)
    public double ReservedQty { get; init; } // Reserved at same bin scope
    public double BlockedQty { get; init; } // Blocked (holds/staging/damaged/in-progress)
    public double AvailableQty { get; init; } // total_qty - reserved_qty - blocked_qty
    
    // For backward compatibility - Qty defaults to AvailableQty
    public double Qty => AvailableQty;
    
    // Calculation log for debugging
    public List<string>? CalculationLog { get; init; }
}


