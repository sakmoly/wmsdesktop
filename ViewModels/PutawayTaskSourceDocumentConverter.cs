using System;
using System.Globalization;
using System.Windows.Data;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public class PutawayTaskSourceDocumentConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is PutawayTask task)
        {
            return task.SourceType == "ASN" 
                ? task.AdvanceShippingNotice ?? string.Empty
                : task.TransferIn ?? string.Empty;
        }
        return string.Empty;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

