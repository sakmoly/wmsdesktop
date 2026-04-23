using System;
using System.Linq;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class AsnDetailViewModel : BaseViewModel
{
    public Asn Asn { get; }

    // Calculate total from carton details for display purposes
    public double TotalQtyExpected => Asn.Details.Sum(d => d.ShippedQty);

    // Calculate total received quantity from receive lines
    public double TotalQtyReceived => Asn.Details.Sum(d => d.ReceivedQty);

    /// <summary>When this ASN was last successfully sent to ERPNext (UTC). Null if never sent.</summary>
    public DateTime? LastSentToErpNextAt { get; set; }

    /// <summary>True after ERP <c>update_asn_received_qty</c> response indicated ASN status Received, until a Purchase Receipt is saved or cleared.</summary>
    public bool ErpNextAwaitingPurchaseReceipt { get; }

    /// <summary>Display text for "Last sent to ERPNext" (e.g. "26-Jan-2026 14:30" or "Not sent yet").</summary>
    public string LastSentToErpNextText => LastSentToErpNextAt.HasValue
        ? LastSentToErpNextAt.Value.ToLocalTime().ToString("dd-MMM-yyyy HH:mm")
        : "Not sent yet";

    public bool HasPurchaseReceipt => !string.IsNullOrWhiteSpace(Asn.PurchaseReceiptNo);

    /// <summary>Single footer button: update qty until ERP is Received, then generate PR; label stays Generate PR when PR already exists (disabled).</summary>
    public string PrimaryErpAsnActionButtonContent =>
        HasPurchaseReceipt || ErpNextAwaitingPurchaseReceipt
            ? "Generate Purchase Receipt"
            : "Update Received Qty to ERPNext";

    public string PrimaryErpAsnActionButtonToolTip
    {
        get
        {
            if (HasPurchaseReceipt)
                return "Purchase Receipt is already linked to this ASN. This action is disabled.";
            if (ErpNextAwaitingPurchaseReceipt)
                return "ERPNext reported ASN status Received. Click to create the Purchase Receipt in ERPNext and save the document number to WMS.";
            return "Send received quantities to ERPNext. When ERP returns status Received, this button will switch to Generate Purchase Receipt.";
        }
    }

    /// <summary>Enabled only when ASN is Received and no Purchase Receipt is stored yet (update qty or create PR). Disabled when PR already exists.</summary>
    public bool CanUsePrimaryErpAsnAction =>
        string.Equals(Asn?.Status, "Received", StringComparison.OrdinalIgnoreCase)
        && !HasPurchaseReceipt;

    /// <summary>True when status is not yet "Received" — enables "Mark as Received" to set it manually.</summary>
    public bool CanMarkAsReceived => Asn != null && !string.Equals(Asn.Status, "Received", StringComparison.OrdinalIgnoreCase);

    /// <summary>Legacy binding name kept for XAML compatibility if referenced.</summary>
    public bool CanUpdateReceivedQtyToErpNext => CanUsePrimaryErpAsnAction;

    public AsnDetailViewModel(Asn asn, DateTime? lastSentToErpNextAt = null, bool erpNextAwaitingPurchaseReceipt = false)
    {
        Asn = asn;
        LastSentToErpNextAt = lastSentToErpNextAt;
        ErpNextAwaitingPurchaseReceipt = erpNextAwaitingPurchaseReceipt;
    }
}
