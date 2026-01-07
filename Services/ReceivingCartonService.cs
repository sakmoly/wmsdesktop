using System.Collections.Generic;
using System.Linq;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

/// <summary>
/// Service for managing carton receiving status and concurrency
/// Tracks carton locking during receiving process
/// </summary>
public static class ReceivingCartonService
{
    private static readonly Dictionary<string, ReceivingCarton> CartonStatuses = new();

    /// <summary>
    /// Get carton status for a specific carton
    /// </summary>
    public static ReceivingCarton? GetCartonStatus(string cartonId, string asnTitle)
    {
        var key = $"{asnTitle}:{cartonId}";
        return CartonStatuses.TryGetValue(key, out var carton) ? carton : null;
    }

    /// <summary>
    /// Check if carton is available for receiving (not locked by another user)
    /// </summary>
    public static bool IsCartonAvailable(string cartonId, string asnTitle, string currentUserId)
    {
        var carton = GetCartonStatus(cartonId, asnTitle);
        if (carton == null)
            return true; // Not yet started, available

        // If in receiving and opened by different user, it's locked
        if (carton.Status == "Receiving" && carton.OpenedBy != currentUserId)
            return false;

        return carton.Status == "Pending" || carton.Status == "Unloaded";
    }

    /// <summary>
    /// Lock carton for receiving (set status to Receiving)
    /// </summary>
    public static bool LockCartonForReceiving(string cartonId, string asnTitle, string inboundSession, string userId)
    {
        var key = $"{asnTitle}:{cartonId}";
        
        if (CartonStatuses.TryGetValue(key, out var existing))
        {
            // If already locked by another user, cannot lock
            if (existing.Status == "Receiving" && existing.OpenedBy != userId)
                return false;
        }

        CartonStatuses[key] = new ReceivingCarton
        {
            CartonId = cartonId,
            AdvanceShippingNotice = asnTitle,
            InboundSession = inboundSession,
            Status = "Receiving",
            OpenedBy = userId,
            OpenedOn = System.DateTime.Now
        };

        return true;
    }

    /// <summary>
    /// Mark carton as received
    /// </summary>
    public static void MarkCartonAsReceived(string cartonId, string asnTitle, string userId)
    {
        var key = $"{asnTitle}:{cartonId}";
        if (CartonStatuses.TryGetValue(key, out var carton))
        {
            CartonStatuses[key] = new ReceivingCarton
            {
                CartonId = carton.CartonId,
                AdvanceShippingNotice = carton.AdvanceShippingNotice,
                InboundSession = carton.InboundSession,
                Status = "Received",
                OpenedBy = carton.OpenedBy,
                OpenedOn = carton.OpenedOn,
                ReceivedBy = userId,
                ReceivedOn = System.DateTime.Now
            };
        }
    }

    /// <summary>
    /// Get all cartons for an ASN
    /// </summary>
    public static List<ReceivingCarton> GetCartonsForAsn(string asnTitle)
    {
        return CartonStatuses.Values
            .Where(c => c.AdvanceShippingNotice == asnTitle)
            .ToList();
    }

    /// <summary>
    /// Initialize carton statuses from ASN details
    /// </summary>
    public static void InitializeCartonsFromAsn(Asn asn, string inboundSession)
    {
        var cartonIds = asn.Details
            .Where(d => !string.IsNullOrEmpty(d.CartonId))
            .Select(d => d.CartonId!)
            .Distinct();

        foreach (var cartonId in cartonIds)
        {
            var key = $"{asn.Title}:{cartonId}";
            if (!CartonStatuses.ContainsKey(key))
            {
                CartonStatuses[key] = new ReceivingCarton
                {
                    CartonId = cartonId,
                    AdvanceShippingNotice = asn.Title,
                    InboundSession = inboundSession,
                    Status = "Pending"
                };
            }
        }
    }
}

