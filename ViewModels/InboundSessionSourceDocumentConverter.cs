using System;
using System.Globalization;
using System.Windows.Data;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public class InboundSessionSourceDocumentConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is InboundSession session)
        {
            // If TransferIn is set, show it; otherwise show ASN
            if (!string.IsNullOrEmpty(session.TransferIn))
            {
                return $"TI: {session.TransferIn}";
            }
            return session.AdvanceShippingNotice ?? string.Empty;
        }
        return string.Empty;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

