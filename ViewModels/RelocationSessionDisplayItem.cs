using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

/// <summary>
/// Relocation session row for the list view. Exposes warehouse as code (e.g. WH-MAIN) for consistent display.
/// </summary>
public sealed class RelocationSessionDisplayItem
{
    public RelocationSession Session { get; init; } = null!;

    public string SessionId => Session.SessionId;
    public string Mode => Session.Mode;
    public string Policy => Session.Policy;
    /// <summary>Warehouse code for display (e.g. WH-MAIN). Resolved from name/code when loading the list.</summary>
    public string WarehouseCode { get; init; } = string.Empty;
    public string? FromBin => Session.FromBin;
    public string? FromCarton => Session.FromCarton;
    public string? ToBin => Session.ToBin;
    public string? ToCarton => Session.ToCarton;
    public string Status => Session.Status;
    public string? CreatedBy => Session.CreatedBy;
}
