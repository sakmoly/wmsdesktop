using System;

namespace Wms.Desktop.Models;

/// <summary>
/// Carton master - tracks carton lifecycle and current location
/// </summary>
public sealed class Carton
{
    public string CartonId { get; init; } = string.Empty;
    public string? AsnNo { get; init; }
    public string? SupplierCartonBarcode { get; init; }
    public string Status { get; init; } = "RECEIVED_NOT_PUTAWAY";
    // RECEIVED_NOT_PUTAWAY, PUTAWAY, PICKED, SHIPPED, ADJUSTED
    public string? CurrentBinId { get; init; }
    public string Warehouse { get; init; } = string.Empty;
    public DateTime? LastMovedOn { get; init; }
    public DateTime CreatedOn { get; init; }
    public DateTime UpdatedAt { get; init; }
    public string? Remarks { get; init; }
}

